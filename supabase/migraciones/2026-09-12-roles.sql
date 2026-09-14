-- ============================================================
--  Cajita de Bendicion - Roles del personal (admin y voluntario)
--
--  Requiere haber corrido antes, en orden:
--    2026-09-12-autorizacion-otra-fecha.sql
--    2026-09-12-busqueda-por-codigo.sql
--  Se puede repetir.
--
--  IMPORTANTE: despues de correrla, una cuenta sin rol no puede entrar
--  al panel. Asigna los roles de inmediato:
--    select definir_personal('pastor@correo.com', 'admin');
--    select definir_personal('voluntario@correo.com', 'voluntario');
--  Y el codigo que usan los voluntarios para entregas de otra fecha:
--    select definir_autorizador('pastor@correo.com', 'codigo-personal');
-- ============================================================

-- ============================================================
--  20. ROLES DEL PERSONAL
-- ============================================================
--  Tres roles:
--    admin      -> el pastor. Ve todo el panel y las estadisticas,
--                  registra personas desde el panel sin limite por
--                  dispositivo, y autoriza entregas de otra fecha sin codigo.
--    voluntario -> solo escanea. Entrega las citas del dia; para una de
--                  otra fecha necesita el codigo de autorizacion de un admin.
--    usuario    -> el publico. En la V1 no tiene cuenta y no aparece aqui.
--
--  Una cuenta de Authentication que no este en esta tabla no puede hacer
--  nada en el panel. Los permisos se revisan DENTRO de cada funcion: una
--  pantalla escondida se esquiva escribiendo la direccion, una funcion no.
--
--  Varias funciones de secciones anteriores (8, 17, 18 y 19) llaman a
--  exigir_rol(). PL/pgSQL resuelve esas llamadas al ejecutarse, no al
--  crearse, por eso pueden estar definidas antes que esta seccion.

create table if not exists personal (
  usuario_id     uuid primary key references auth.users(id) on delete cascade,
  rol            text not null check (rol in ('admin', 'voluntario')),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table personal enable row level security;


--  Revisa que quien llama tenga uno de los roles pedidos. Devuelve su rol.
--  El codigo de error 42501 es "permiso denegado": la aplicacion ya sabe
--  mostrarlo como tal.
create or replace function exigir_rol(p_roles text[])
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol text;
begin
  if auth.uid() is null then
    raise exception 'SIN_SESION' using errcode = '42501';
  end if;

  select rol into v_rol
    from personal
   where usuario_id = auth.uid()
     and activo;

  if v_rol is null or not (v_rol = any (p_roles)) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  return v_rol;
end;
$$;

revoke execute on function exigir_rol(text[]) from public, anon, authenticated;


--  El rol de la cuenta con sesion, para que la aplicacion sepa que
--  pantallas mostrar. Devuelve null si la cuenta no es del personal.
create or replace function mi_rol()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rol from personal where usuario_id = auth.uid() and activo;
$$;

revoke execute on function mi_rol() from public;
grant  execute on function mi_rol() to authenticated;


--  Da de alta o cambia el rol de una cuenta del personal.
--
--  Uso, en el SQL Editor (la cuenta debe existir en Authentication):
--    select definir_personal('pastor@correo.com', 'admin');
--    select definir_personal('voluntario@correo.com', 'voluntario');
--
--  Para quitarle el acceso:
--    update personal set activo = false
--     where usuario_id = (select id from auth.users where email = 'voluntario@correo.com');
create or replace function definir_personal(p_correo text, p_rol text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_usuario uuid;
begin
  if p_rol not in ('admin', 'voluntario') then
    raise exception 'ROL_INVALIDO: usa admin o voluntario';
  end if;

  select id into v_usuario
    from auth.users
   where lower(email) = lower(trim(p_correo));

  if v_usuario is null then
    raise exception 'USUARIO_NO_EXISTE: primero crea la cuenta en Authentication';
  end if;

  insert into personal (usuario_id, rol, activo)
  values (v_usuario, p_rol, true)
  on conflict (usuario_id) do update
     set rol            = excluded.rol,
         activo         = true,
         actualizado_en = now();

  return 'PERSONAL_LISTO: ' || p_rol;
end;
$$;

--  Solo desde el SQL Editor.
revoke execute on function definir_personal(text, text) from public, anon, authenticated;


--  Quien del personal hizo cada registro desde el panel. Nulo en los
--  registros que las familias hacen por su cuenta.
alter table citas add column if not exists registrado_por uuid;


--  Registro desde el panel, para quien no puede registrarse por su cuenta.
--
--  Solo admin. A diferencia del formulario publico:
--    * no aplica el limite por dispositivo: la computadora de la oficina
--      registra a muchas personas;
--    * el correo es opcional: muchos adultos mayores no tienen.
--  El corte de cupo y la regla de una cita por semana siguen igual, porque
--  la cita la aparta reservar_cita().
create or replace function registrar_desde_panel(
  p_nombre    text,
  p_telefono  text,
  p_bloque_id uuid,
  p_email     text default null,
  p_ciudad    text default null
)
returns table (
  codigo_corto text,
  token_qr     text,
  fecha        date,
  hora         time
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario  uuid := auth.uid();
  v_bloque   bloques;
  v_persona  personas;
  v_cita     citas;
  v_codigo   text;
  v_intentos int := 0;
begin
  perform exigir_rol(array['admin']);

  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if coalesce(trim(p_telefono), '') = '' then
    raise exception 'TELEFONO_REQUERIDO';
  end if;

  if coalesce(trim(p_email), '') <> ''
     and trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'EMAIL_INVALIDO';
  end if;

  select * into v_bloque from bloques where id = p_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  loop
    v_codigo := 'CB-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into personas (codigo_corto, nombre, telefono, email, ciudad)
      values (v_codigo,
              trim(p_nombre),
              nullif(trim(p_telefono), ''),
              nullif(trim(p_email), ''),
              nullif(trim(p_ciudad), ''))
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_desde_panel(text, text, uuid, text, text) from public;
grant  execute on function registrar_desde_panel(text, text, uuid, text, text) to authenticated;


-- ============================================================
--  Funciones existentes que ahora revisan el rol
-- ============================================================

--  La busqueda se borra antes: si la migracion anterior no se corrio,
--  la version vieja tiene otras columnas de salida.
drop function if exists buscar_para_escaneo(text);

create or replace function registrar_entrega(p_token text)
returns table (
  resultado    text,
  nombre       text,
  codigo_corto text,
  hora         time
)
language plpgsql
-- Los atributos van aqui explicitos: "create or replace" sin ellos
-- regresaria la funcion a security invoker y a la zona UTC.
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita    citas;
  v_persona personas;
  v_bloque  bloques;
  -- El voluntario sale de la sesion, no de un parametro. Si viniera
  -- como argumento, cualquiera podria firmar un escaneo con el id de
  -- otro y la bitacora de auditoria dejaria de servir para responder
  -- "quien entrego esta caja".
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  -- Escanean voluntarios y administradores. Una cuenta sin rol no entrega.
  perform exigir_rol(array['admin', 'voluntario']);

  select * into v_cita
    from citas
   where token_qr = p_token
     for update;

  if not found then
    return query select 'NO_EXISTE'::text, null::text, null::text, null::time;
    return;
  end if;

  select * into v_persona from personas where id = v_cita.persona_id;
  select * into v_bloque  from bloques  where id = v_cita.bloque_id;

  if v_bloque.fecha <> current_date then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'OTRA_FECHA');

    return query select 'OTRA_FECHA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  if v_cita.estado = 'entregada' then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'YA_USADO');

    return query select 'YA_USADO'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  if v_cita.estado = 'cancelada' then
    return query select 'CANCELADA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  update citas
     set estado   = 'entregada',
         usado_en = now()
   where id = v_cita.id;

  insert into escaneos (cita_id, usuario_id, resultado)
  values (v_cita.id, v_usuario, 'VALIDO');

  return query select 'VALIDO'::text, v_persona.nombre,
                      v_persona.codigo_corto, v_bloque.hora;
end;
$$;

revoke execute on function registrar_entrega(text) from public;
grant  execute on function registrar_entrega(text) to authenticated;

create or replace function resumen_del_dia(p_fecha date default null)
returns table (
  fecha              date,
  con_cita           int,
  ya_recibieron      int,
  faltan_por_llegar  int,
  sin_cita           int,
  intentos_repetidos int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_fecha date := coalesce(p_fecha, current_date);
begin
  -- Las estadisticas son solo del administrador.
  perform exigir_rol(array['admin']);

  return query
  select
    v_fecha,
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha
        and c.estado in ('reservada','llego','entregada')),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and c.estado = 'entregada'),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and c.estado = 'reservada'),
    (select count(*)::int from entradas_sin_cita s where s.fecha = v_fecha),
    --  Intentos repetidos: alguien trato de usar dos veces el mismo
    --  codigo. Es la senal de que el corte esta funcionando y de que
    --  hay quien lo esta intentando.
    (select count(*)::int from escaneos e
       join citas   c on c.id = e.cita_id
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and e.resultado = 'YA_USADO');
end;
$$;

revoke execute on function resumen_del_dia(date) from public;
grant  execute on function resumen_del_dia(date) to authenticated;

create or replace function citas_del_dia(p_fecha date default null)
returns table (
  nombre       text,
  codigo_corto text,
  ciudad       text,
  hora         time,
  estado       text,
  usado_en     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  -- La lista de personas es solo del administrador: un voluntario no ve
  -- el padron, solo lo necesario para escanear.
  perform exigir_rol(array['admin']);

  return query
  select p.nombre, p.codigo_corto, p.ciudad, b.hora, c.estado, c.usado_en
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where b.fecha = coalesce(p_fecha, current_date)
     and c.estado <> 'cancelada'
   order by b.hora, p.nombre;
end;
$$;

revoke execute on function citas_del_dia(date) from public;
grant  execute on function citas_del_dia(date) to authenticated;

create or replace function bloques_del_dia(p_fecha date default null)
returns table (
  bloque_id uuid,
  hora      time,
  capacidad int,
  ocupados  int,
  libres    int,
  cerrado   boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  return query
  select b.id,
         b.hora,
         b.capacidad,
         count(c.id) filter (where c.estado <> 'cancelada')::int,
         greatest(b.capacidad - count(c.id) filter (where c.estado <> 'cancelada'), 0)::int,
         b.cerrado
    from bloques b
    left join citas c on c.bloque_id = b.id
   where b.fecha = coalesce(p_fecha, current_date)
   group by b.id, b.hora, b.capacidad, b.cerrado
   order by b.hora;
end;
$$;

revoke execute on function bloques_del_dia(date) from public;
grant  execute on function bloques_del_dia(date) to authenticated;

create or replace function buscar_para_escaneo(p_texto text)
returns table (
  nombre       text,
  codigo_corto text,
  fecha        date,
  hora         time,
  estado       text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if v_texto = '' then
    return;
  end if;

  return query
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and (
       (b.fecha = current_date
        and (p.codigo_corto ilike '%' || v_texto || '%'
             or p.nombre ilike '%' || v_texto || '%'))
       or
       (upper(p.codigo_corto) = upper(v_texto)
        and b.fecha between current_date - 7 and current_date + 14)
     )
   order by (b.fecha = current_date) desc,
            abs(b.fecha - current_date),
            p.nombre
   limit 20;
end;
$$;

revoke execute on function buscar_para_escaneo(text) from public;
grant  execute on function buscar_para_escaneo(text) to authenticated;

create or replace function definir_autorizador(p_correo text, p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_usuario uuid;
begin
  if length(coalesce(p_codigo, '')) < 6 then
    raise exception 'CODIGO_MUY_CORTO: el codigo debe tener al menos 6 caracteres';
  end if;

  select id into v_usuario
    from auth.users
   where lower(email) = lower(trim(p_correo));

  if v_usuario is null then
    raise exception 'USUARIO_NO_EXISTE: primero crea la cuenta en Authentication';
  end if;

  -- El codigo es "la contrasena del admin" que el voluntario pide para una
  -- entrega de otra fecha. Solo un administrador puede tenerlo.
  if not exists (select 1 from personal
                  where usuario_id = v_usuario and rol = 'admin' and activo) then
    raise exception 'NO_ES_ADMIN: primero corre definir_personal(correo, ''admin'')';
  end if;

  insert into autorizadores (usuario_id, codigo_hash, activo, actualizado_en)
  values (v_usuario, crypt(p_codigo, gen_salt('bf')), true, now())
  on conflict (usuario_id) do update
     set codigo_hash    = excluded.codigo_hash,
         activo         = true,
         actualizado_en = now();

  return 'AUTORIZADOR_LISTO';
end;
$$;

revoke execute on function definir_autorizador(text, text) from public, anon, authenticated;

create or replace function registrar_entrega_autorizada(p_token text, p_codigo text)
returns table (
  resultado    text,
  nombre       text,
  codigo_corto text,
  hora         time
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario     uuid := auth.uid();
  v_rol         text;
  v_autorizador uuid;
  v_fallidos    int;
  v_cita        citas;
  v_persona     personas;
  v_bloque      bloques;
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  v_rol := exigir_rol(array['admin', 'voluntario']);

  if v_rol = 'admin' then
    -- El administrador autoriza con su propia sesion: no necesita codigo.
    -- Queda registrado a su nombre igual.
    v_autorizador := v_usuario;
  else
    -- Freno contra adivinar: 5 intentos fallidos en 15 minutos dejan a
    -- esa cuenta sin poder intentar durante otros 15.
    select count(*) into v_fallidos
      from intentos_autorizacion
     where usuario_id = v_usuario
       and not exitoso
       and creado_en > now() - interval '15 minutes';

    if v_fallidos >= 5 then
      return query select 'BLOQUEADO'::text, null::text, null::text, null::time;
      return;
    end if;

    -- El codigo tiene que ser de un administrador activo.
    select a.usuario_id into v_autorizador
      from autorizadores a
      join personal pe on pe.usuario_id = a.usuario_id
                      and pe.rol = 'admin'
                      and pe.activo
     where a.activo
       and a.codigo_hash = crypt(coalesce(p_codigo, ''), a.codigo_hash)
     limit 1;

    if v_autorizador is null then
      -- Se registra y se RESPONDE (no se lanza error): un error desharia
      -- el registro del intento fallido y el freno nunca se activaria.
      insert into intentos_autorizacion (usuario_id, exitoso) values (v_usuario, false);
      return query select 'CODIGO_INVALIDO'::text, null::text, null::text, null::time;
      return;
    end if;

    insert into intentos_autorizacion (usuario_id, exitoso) values (v_usuario, true);
  end if;

  -- Mismo candado de fila que registrar_entrega(): dos escaneos
  -- simultaneos del mismo codigo no pueden entregar dos cajas.
  select * into v_cita
    from citas
   where token_qr = p_token
     for update;

  if not found then
    return query select 'NO_EXISTE'::text, null::text, null::text, null::time;
    return;
  end if;

  select * into v_persona from personas where id = v_cita.persona_id;
  select * into v_bloque  from bloques  where id = v_cita.bloque_id;

  if v_cita.estado = 'entregada' then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'YA_USADO');

    return query select 'YA_USADO'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  if v_cita.estado = 'cancelada' then
    return query select 'CANCELADA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  update citas
     set estado   = 'entregada',
         usado_en = now()
   where id = v_cita.id;

  insert into escaneos (cita_id, usuario_id, resultado, autorizado_por)
  values (v_cita.id, v_usuario, 'VALIDO_AUTORIZADO', v_autorizador);

  return query select 'VALIDO_AUTORIZADO'::text, v_persona.nombre,
                      v_persona.codigo_corto, v_bloque.hora;
end;
$$;

revoke execute on function registrar_entrega_autorizada(text, text) from public;
grant  execute on function registrar_entrega_autorizada(text, text) to authenticated;

