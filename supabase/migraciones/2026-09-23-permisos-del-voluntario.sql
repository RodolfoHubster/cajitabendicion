-- ============================================================
--  Cajita de Bendicion - Permisos del voluntario
--
--  El rol dejaba al voluntario en "solo escanea". Esto agrega una lista
--  de palomitas que el administrador prende desde "Permisos": ver las
--  citas del dia, anotar a alguien sin cita, dar pases, ver reportes,
--  editar los textos, y demas.
--
--  Arrancan TODAS apagadas: el dia que esto se aplica, el voluntario
--  puede exactamente lo mismo que antes. Se abre lo que se quiera abrir.
--
--  Tres cosas no se pueden prender nunca, y se quedan en solo admin:
--  Equipo y accesos, Horarios y cupos, y autorizar una segunda caja.
--
--  Cambia 21 funciones, que pasan de exigir_rol(admin) a
--  exigir_permiso(clave). Requiere 2026-09-23-preguntas-y-quienes-somos.sql.
--  Se puede repetir.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  Que puede hacer un voluntario
-- ------------------------------------------------------------
--  Hasta ahora el rol decidia todo: el voluntario escaneaba y nada mas,
--  y cualquier cosa que se le quisiera abrir habia que programarla. Esto
--  lo vuelve una lista de palomitas que el administrador prende y apaga.
--
--  Lo que NO se puede prender nunca, ni con una palomita:
--
--   * Equipo y accesos. Un voluntario que pueda dar roles se hace
--     administrador solo, y entonces la lista de permisos no sirve de nada.
--   * Horarios y cupos. Crear o borrar una fecha mueve el cupo de toda la
--     comunidad.
--   * Autorizar una segunda caja en la semana. Es la excepcion que por
--     definicion autoriza el pastor.
--
--  Esas tres siguen con exigir_rol(array['admin']) a secas, y asi deben
--  quedarse.
create table if not exists permisos (
  clave           text primary key,
  activo          boolean not null default false,
  actualizado_por uuid,
  actualizado_en  timestamptz not null default now()
);

alter table permisos enable row level security;

--  Arrancan todos apagados: el dia que esto se aplica, el voluntario
--  sigue pudiendo exactamente lo mismo que antes. Se prende a mano lo
--  que se quiera abrir.
insert into permisos (clave) values
  ('ver_citas_del_dia'),
  ('anotar_sin_cita'),
  ('registrar_personas'),
  ('mover_citas'),
  ('cancelar_citas'),
  ('ver_personas'),
  ('ver_reportes'),
  ('dar_pases'),
  ('editar_textos')
on conflict (clave) do nothing;


-- ------------------------------------------------------------
--  El candado
-- ------------------------------------------------------------
--  Igual que exigir_rol, pero preguntando por una palomita. El
--  administrador pasa siempre: la lista es para el voluntario.
--
--  Que esto viva en la base y no en la pantalla es lo que lo hace un
--  permiso de verdad. Esconder un boton no le impide a nadie escribir la
--  direccion a mano.
create or replace function exigir_permiso(p_clave text)
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

  if v_rol = 'admin' then
    return v_rol;
  end if;

  if v_rol = 'voluntario'
     and exists (select 1 from permisos p where p.clave = p_clave and p.activo) then
    return v_rol;
  end if;

  raise exception 'SIN_PERMISO' using errcode = '42501';
end;
$$;

revoke execute on function exigir_permiso(text) from public, anon, authenticated;


--  Lo que puede hacer quien tiene la sesion abierta. La usa el panel para
--  decidir que secciones ensenar; el permiso de verdad lo revisa cada
--  funcion por su cuenta.
create or replace function mis_permisos()
returns table (
  clave  text,
  activo boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_rol text;
begin
  v_rol := exigir_rol(array['admin', 'voluntario']);

  return query
  select p.clave, case when v_rol = 'admin' then true else p.activo end
    from permisos p
   order by p.clave;
end;
$$;

revoke execute on function mis_permisos() from public;
grant  execute on function mis_permisos() to authenticated;


--  La lista para la pantalla que los administra.
create or replace function listar_permisos()
returns table (
  clave           text,
  activo          boolean,
  actualizado_en  timestamptz,
  actualizado_por text
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
  select p.clave, p.activo, p.actualizado_en, u.email::text
    from permisos p
    left join auth.users u on u.id = p.actualizado_por
   order by p.clave;
end;
$$;

revoke execute on function listar_permisos() from public;
grant  execute on function listar_permisos() to authenticated;


--  Prender o apagar una palomita. Solo el administrador, y a proposito no
--  se puede crear una clave nueva desde aqui: las claves las define el
--  codigo, no el panel.
create or replace function guardar_permiso(p_clave text, p_activo boolean)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_clave text;
begin
  perform exigir_rol(array['admin']);

  update permisos
     set activo          = coalesce(p_activo, false),
         actualizado_por = auth.uid(),
         actualizado_en  = now()
   where clave = p_clave
  returning clave into v_clave;

  if v_clave is null then
    raise exception 'PERMISO_NO_EXISTE';
  end if;

  return v_clave;
end;
$$;

revoke execute on function guardar_permiso(text, boolean) from public;
grant  execute on function guardar_permiso(text, boolean) to authenticated;


-- ------------------------------------------------------------
--  Las funciones que ahora dependen de una palomita
-- ------------------------------------------------------------
create or replace function citas_del_dia(p_fecha date default null)
returns table (
  nombre             text,
  codigo_corto       text,
  ciudad             text,
  hora               time,
  estado             text,
  usado_en           timestamptz,
  cancelada_en       timestamptz,
  cancelada_por      text,
  motivo_cancelacion text
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
  perform exigir_permiso('ver_citas_del_dia');

  return query
  select p.nombre,
         p.codigo_corto,
         p.ciudad,
         b.hora,
         case when c.estado in ('reservada', 'llego') and b.fecha < current_date
              then 'no_asistio'
              else c.estado
         end,
         c.usado_en,
         c.cancelada_en,
         u.email::text,
         c.motivo_cancelacion
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.cancelada_por
   where b.fecha = coalesce(p_fecha, current_date)
   order by b.hora, p.nombre;
end;
$$;


create or replace function resumen_del_dia(p_fecha date default null)
returns table (
  fecha              date,
  con_cita           int,
  ya_recibieron      int,
  faltan_por_llegar  int,
  no_asistieron      int,
  canceladas         int,
  sin_cita           int,
  con_pase           int,
  intentos_repetidos int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_fecha  date    := coalesce(p_fecha, current_date);
  v_pasado boolean := coalesce(p_fecha, current_date) < current_date;
begin
  -- Las estadisticas son solo del administrador.
  perform exigir_permiso('ver_citas_del_dia');

  return query
  select
    v_fecha,
    x.n_con_cita,
    x.n_recibieron,
    case when v_pasado then 0 else x.n_sin_escanear end,
    x.n_no_asistio + case when v_pasado then x.n_sin_escanear else 0 end,
    x.n_canceladas,
    --  Las anotadas por error se anulan y ya no cuentan (seccion 22).
    (select count(*)::int from entradas_sin_cita s where s.fecha = v_fecha and s.anulada_en is null),
    --  Las cajas de los pases permanentes (seccion 29). No tienen
    --  cita: no apartan lugar, pero si cuentan como caja entregada.
    (select count(*)::int from entregas_pase e where e.fecha = v_fecha),
    --  Intentos repetidos: alguien trato de usar dos veces el mismo
    --  codigo. Es la senal de que el corte esta funcionando y de que
    --  hay quien lo esta intentando.
    (select count(*)::int from escaneos e
       join citas   c on c.id = e.cita_id
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and e.resultado = 'YA_USADO')
  from (
    select count(*) filter (where c.estado <> 'cancelada')::int             as n_con_cita,
           count(*) filter (where c.estado = 'entregada')::int             as n_recibieron,
           count(*) filter (where c.estado in ('reservada', 'llego'))::int as n_sin_escanear,
           count(*) filter (where c.estado = 'no_asistio')::int            as n_no_asistio,
           count(*) filter (where c.estado = 'cancelada')::int             as n_canceladas
      from citas c
      join bloques b on b.id = c.bloque_id
     where b.fecha = v_fecha
  ) x;
end;
$$;


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
  perform exigir_permiso('ver_citas_del_dia');

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


create or replace function registrar_entrada_sin_cita(p_nombre text)
returns table (
  codigo text,
  total  int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario  uuid := auth.uid();
  v_nombre   text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_codigo   text;
  v_intentos int := 0;
begin
  perform exigir_permiso('anotar_sin_cita');

  if v_nombre = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if v_nombre ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  --  Se reintenta si dos anotaciones del mismo dia sacan el mismo numero.
  loop
    v_codigo := 'SC-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into entradas_sin_cita (fecha, nombre, codigo, registrado_por)
      values (current_date, v_nombre, v_codigo, v_usuario);
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  return query
    select v_codigo,
           (select count(*)::int from entradas_sin_cita s
             where s.fecha = current_date and s.anulada_en is null);
end;
$$;


create or replace function anular_entrada_sin_cita(p_codigo text, p_fecha date default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_fecha   date := coalesce(p_fecha, current_date);
  v_id      uuid;
  v_anulada timestamptz;
begin
  perform exigir_permiso('anotar_sin_cita');

  select s.id, s.anulada_en into v_id, v_anulada
    from entradas_sin_cita s
   where s.fecha = v_fecha
     and upper(s.codigo) = upper(trim(coalesce(p_codigo, '')))
     for update;

  if v_id is null then
    raise exception 'ENTRADA_NO_EXISTE';
  end if;

  if v_anulada is not null then
    raise exception 'ENTRADA_YA_ANULADA';
  end if;

  update entradas_sin_cita
     set anulada_en  = now(),
         anulada_por = v_usuario
   where id = v_id;

  return (select count(*)::int from entradas_sin_cita s
           where s.fecha = v_fecha and s.anulada_en is null);
end;
$$;


create or replace function entradas_sin_cita_del_dia(p_fecha date default null)
returns table (
  codigo        text,
  nombre        text,
  registrado_en timestamptz,
  anotado_por   text,
  anulada       boolean,
  anulada_en    timestamptz,
  anulada_por   text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('anotar_sin_cita');

  return query
  select s.codigo,
         s.nombre,
         s.registrado_en,
         u.email::text,
         s.anulada_en is not null,
         s.anulada_en,
         ua.email::text
    from entradas_sin_cita s
    left join auth.users u  on u.id  = s.registrado_por
    left join auth.users ua on ua.id = s.anulada_por
   where s.fecha = coalesce(p_fecha, current_date)
   order by s.registrado_en desc;
end;
$$;


create or replace function registrar_desde_panel(
  p_nombre            text,
  p_apellidos         text,
  p_telefono          text,
  p_bloque_id         uuid,
  p_email             text    default null,
  p_pais              text    default null,
  p_codigo_postal     text    default null,
  p_colonia           text    default null,
  p_calle             text    default null,
  p_numero            text    default null,
  p_numero_interior   text    default null,
  p_sin_domicilio     boolean default false,
  p_acepto_privacidad boolean default false
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
  v_usuario   uuid := auth.uid();
  v_nombres   text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_apellidos text := regexp_replace(trim(coalesce(p_apellidos, '')), '\s+', ' ', 'g');
  v_telefono  text := trim(coalesce(p_telefono, ''));
  v_domicilio record;
  v_bloque    bloques;
  v_persona   personas;
  v_cita      citas;
  v_codigo    text;
  v_intentos  int := 0;
begin
  perform exigir_permiso('registrar_personas');

  if v_nombres = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if v_apellidos = '' then
    raise exception 'APELLIDOS_REQUERIDOS';
  end if;

  if v_nombres ~ '[0-9]' or v_apellidos ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  if v_telefono = '' then
    raise exception 'TELEFONO_REQUERIDO';
  end if;

  if v_telefono !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  if coalesce(trim(p_email), '') <> ''
     and trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'EMAIL_INVALIDO';
  end if;

  select * into v_domicilio
    from validar_domicilio(p_pais, p_codigo_postal, p_colonia, p_calle,
                           p_numero, p_numero_interior, p_sin_domicilio);

  if not coalesce(p_acepto_privacidad, false) then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
  end if;

  --  Sin horario se da de alta a la persona y ya: es lo que hace falta
  --  para darle un pase permanente (seccion 29), que no aparta lugar.
  if p_bloque_id is not null then
    select * into v_bloque from bloques where id = p_bloque_id;
    if not found then
      raise exception 'BLOQUE_NO_EXISTE';
    end if;

    --  El admin puede registrar aunque el dia no se haya abierto al publico,
    --  pero no en un dia cerrado (dia festivo, entrega cancelada).
    --  "d.fecha" calificado: sin prefijo chocaria con la columna "fecha" que
    --  devuelve esta funcion.
    if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
      raise exception 'DIA_CERRADO';
    end if;
  end if;

  loop
    v_codigo := 'CB-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, email,
                            pais, codigo_postal, ciudad, colonia, municipio, estado,
                            calle, numero_exterior, numero_interior, direccion,
                            sin_domicilio, acepto_privacidad_en)
      values (v_codigo,
              v_nombres || ' ' || v_apellidos,
              v_nombres,
              v_apellidos,
              v_telefono,
              nullif(trim(p_email), ''),
              v_domicilio.o_pais,
              v_domicilio.o_codigo_postal,
              v_domicilio.o_ciudad,
              v_domicilio.o_colonia,
              v_domicilio.o_municipio,
              v_domicilio.o_estado,
              v_domicilio.o_calle,
              v_domicilio.o_numero,
              v_domicilio.o_numero_interior,
              v_domicilio.o_direccion,
              coalesce(p_sin_domicilio, false),
              now())
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  if p_bloque_id is null then
    return query select v_persona.codigo_corto, null::text, null::date, null::time;
    return;
  end if;

  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;


create or replace function mover_cita_panel(p_cita_id uuid, p_bloque_id uuid)
returns table (
  fecha        date,
  hora         time,
  codigo_corto text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita citas;
begin
  perform exigir_permiso('mover_citas');

  v_cita := mover_cita(p_cita_id, p_bloque_id, 'panel');

  return query
    select b.fecha, b.hora, p.codigo_corto
      from bloques b
      join personas p on p.id = v_cita.persona_id
     where b.id = v_cita.bloque_id;
end;
$$;


create or replace function cancelar_cita_panel(
  p_codigo text,
  p_fecha  date,
  p_hora   time,
  p_motivo text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_cita    citas;
begin
  perform exigir_permiso('cancelar_citas');

  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
     and b.fecha = p_fecha
     and b.hora  = p_hora
     and c.estado <> 'cancelada'
   limit 1
     for update of c;

  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado in ('entregada', 'llego') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  update citas
     set estado             = 'cancelada',
         cancelada_en       = now(),
         cancelada_por      = v_usuario,
         motivo_cancelacion = nullif(trim(p_motivo), '')
   where id = v_cita.id;

  return 'CANCELADA';
end;
$$;


create or replace function detalle_de_persona(p_codigo text)
returns table (
  codigo_corto         text,
  nombre               text,
  nombres              text,
  apellidos            text,
  telefono             text,
  email                text,
  pais                 text,
  direccion            text,
  calle                text,
  numero_exterior      text,
  numero_interior      text,
  colonia              text,
  ciudad               text,
  municipio            text,
  estado               text,
  codigo_postal        text,
  sin_domicilio        boolean,
  acepto_privacidad_en timestamptz,
  registrada_en        timestamptz,
  citas_totales        int,
  cajas_recibidas      int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  perform exigir_permiso('ver_personas');

  if v_codigo = '' then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  return query
  select p.codigo_corto,
         p.nombre,
         p.nombres,
         p.apellidos,
         p.telefono,
         p.email,
         p.pais,
         p.direccion,
         p.calle,
         p.numero_exterior,
         p.numero_interior,
         p.colonia,
         p.ciudad,
         p.municipio,
         p.estado,
         p.codigo_postal,
         p.sin_domicilio,
         p.acepto_privacidad_en,
         p.creado_en,
         (select count(*)::int from citas c
           where c.persona_id = p.id and c.estado <> 'cancelada'),
         (select count(*)::int from citas c
           where c.persona_id = p.id and c.estado = 'entregada')
    from personas p
   where upper(p.codigo_corto) = v_codigo;

  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;
end;
$$;


create or replace function citas_de_persona(p_codigo text)
returns table (
  fecha    date,
  hora     time,
  estado   text,
  usado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('ver_personas');

  return query
  select b.fecha,
         b.hora,
         case
           when c.estado = 'reservada' and b.fecha < current_date then 'no_asistio'
           else c.estado
         end,
         c.usado_en
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
   order by b.fecha desc, b.hora desc
   limit 30;
end;
$$;


create or replace function reporte_por_dias(p_desde date, p_hasta date)
returns table (
  fecha              date,
  capacidad          int,
  con_cita           int,
  recibieron         int,
  no_asistieron      int,
  pendientes         int,
  canceladas         int,
  con_excepcion      int,
  sin_cita           int,
  con_pase           int,
  cajas              int,
  intentos_repetidos int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('ver_reportes');

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'RANGO_MUY_LARGO';
  end if;

  --  Con la zona de San Diego puesta, usado_en::date es la fecha de San Diego.
  return query
  with dias as (
    select b.fecha as dia from bloques b where b.fecha between p_desde and p_hasta
    union
    select s.fecha from entradas_sin_cita s where s.fecha between p_desde and p_hasta
    union
    select c.usado_en::date from citas c
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
    union
    select e.fecha from entregas_pase e where e.fecha between p_desde and p_hasta
  ),
  cupos as (
    select b.fecha as dia, sum(b.capacidad)::int as n
      from bloques b
     where b.fecha between p_desde and p_hasta
     group by b.fecha
  ),
  agenda as (
    select b.fecha as dia,
           count(*) filter (where c.estado <> 'cancelada')::int as n_con_cita,
           count(*) filter (where c.estado = 'no_asistio'
                              or (c.estado in ('reservada', 'llego') and b.fecha < current_date))::int as n_no_asistieron,
           count(*) filter (where c.estado in ('reservada', 'llego') and b.fecha >= current_date)::int as n_pendientes,
           count(*) filter (where c.estado = 'cancelada')::int as n_canceladas,
           count(*) filter (where c.estado <> 'cancelada' and c.excepcion_id is not null)::int as n_excepcion
      from citas c
      join bloques b on b.id = c.bloque_id
     where b.fecha between p_desde and p_hasta
     group by b.fecha
  ),
  entregas as (
    select c.usado_en::date as dia, count(*)::int as n
      from citas c
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
     group by c.usado_en::date
  ),
  sin_cita_dia as (
    select s.fecha as dia, count(*)::int as n
      from entradas_sin_cita s
     where s.fecha between p_desde and p_hasta and s.anulada_en is null
     group by s.fecha
  ),
  pases_dia as (
    select e.fecha as dia, count(*)::int as n
      from entregas_pase e
     where e.fecha between p_desde and p_hasta
     group by e.fecha
  ),
  repetidos as (
    select e.escaneado_en::date as dia, count(*)::int as n
      from escaneos e
     where e.resultado = 'YA_USADO' and e.escaneado_en::date between p_desde and p_hasta
     group by e.escaneado_en::date
  )
  select d.dia,
         coalesce(cu.n, 0),
         coalesce(ag.n_con_cita, 0),
         coalesce(en.n, 0),
         coalesce(ag.n_no_asistieron, 0),
         coalesce(ag.n_pendientes, 0),
         coalesce(ag.n_canceladas, 0),
         coalesce(ag.n_excepcion, 0),
         coalesce(sc.n, 0),
         coalesce(pa.n, 0),
         --  Cajas del dia: las de cita, las de "entro sin cita" y las de
         --  los pases permanentes. Es el numero que se le reporta al
         --  banco de alimentos.
         coalesce(en.n, 0) + coalesce(sc.n, 0) + coalesce(pa.n, 0),
         coalesce(re.n, 0)
    from dias d
    left join cupos        cu on cu.dia = d.dia
    left join agenda       ag on ag.dia = d.dia
    left join entregas     en on en.dia = d.dia
    left join sin_cita_dia sc on sc.dia = d.dia
    left join pases_dia    pa on pa.dia = d.dia
    left join repetidos    re on re.dia = d.dia
   order by d.dia;
end;
$$;


create or replace function crear_pase(
  p_codigo text,
  p_motivo text default null
)
returns table (
  codigo_corto text,
  nombre       text,
  token        text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_persona personas;
  v_pase    pases;
begin
  perform exigir_permiso('dar_pases');

  select * into v_persona
    from personas p
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')));

  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  insert into pases (persona_id, token, motivo, creado_por)
  values (v_persona.id,
          encode(gen_random_bytes(24), 'hex'),
          nullif(trim(coalesce(p_motivo, '')), ''),
          auth.uid())
  on conflict (persona_id) do update
     set motivo            = excluded.motivo,
         --  Uno que sigue activo conserva su codigo, para que el papel
         --  que ya trae la persona siga sirviendo. Para cambiarselo esta
         --  renovar_pase(). Uno revocado empieza de cero: asi las copias
         --  del viejo no reviven.
         token             = case when pases.activo then pases.token else excluded.token end,
         activo            = true,
         creado_por        = excluded.creado_por,
         creado_en         = now(),
         revocado_por      = null,
         revocado_en       = null,
         motivo_revocacion = null
  returning * into v_pase;

  return query select v_persona.codigo_corto, v_persona.nombre, v_pase.token;
end;
$$;


create or replace function renovar_pase(p_codigo text)
returns table (
  codigo_corto text,
  nombre       text,
  token        text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  --  Todo escalar: un 'select ... into' con varios destinos no admite
  --  una variable de fila en medio.
  v_pase_id uuid;
  v_activo  boolean;
  v_token   text;
  v_codigo  text;
  v_nombre  text;
begin
  perform exigir_permiso('dar_pases');

  select pa.id, pa.activo, p.codigo_corto, p.nombre
    into v_pase_id, v_activo, v_codigo, v_nombre
    from pases pa
    join personas p on p.id = pa.persona_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
     for update of pa;

  if not found then
    raise exception 'PASE_NO_EXISTE';
  end if;

  if not v_activo then
    raise exception 'PASE_YA_REVOCADO';
  end if;

  --  Todo calificado con el alias: 'token' tambien es el nombre de una
  --  de las columnas que devuelve esta funcion, y sin el alias Postgres
  --  no sabe a cual se refiere.
  update pases pa
     set token = encode(gen_random_bytes(24), 'hex')
   where pa.id = v_pase_id
  returning pa.token into v_token;

  return query select v_codigo, v_nombre, v_token;
end;
$$;


create or replace function revocar_pase(p_codigo text, p_motivo text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pase_id uuid;
begin
  perform exigir_permiso('dar_pases');

  select pa.id into v_pase_id
    from pases pa
    join personas p on p.id = pa.persona_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
     for update;

  if not found then
    raise exception 'PASE_NO_EXISTE';
  end if;

  update pases
     set activo            = false,
         revocado_por      = auth.uid(),
         revocado_en       = now(),
         motivo_revocacion = nullif(trim(coalesce(p_motivo, '')), '')
   where id = v_pase_id
     and activo;

  if not found then
    raise exception 'PASE_YA_REVOCADO';
  end if;

  return 'PASE_REVOCADO';
end;
$$;


create or replace function listar_pases()
returns table (
  codigo_corto      text,
  nombre            text,
  telefono          text,
  token             text,
  motivo            text,
  activo            boolean,
  creado_en         timestamptz,
  creado_por        text,
  revocado_en       timestamptz,
  motivo_revocacion text,
  cajas_entregadas  int,
  ultima_entrega    date
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('dar_pases');

  return query
  select p.codigo_corto,
         p.nombre,
         p.telefono,
         --  Lo necesita el panel para volver a mostrar su QR si lo perdio.
         pa.token,
         pa.motivo,
         pa.activo,
         pa.creado_en,
         u.email::text,
         pa.revocado_en,
         pa.motivo_revocacion,
         (select count(*)::int from entregas_pase e where e.pase_id = pa.id),
         (select max(e.fecha) from entregas_pase e where e.pase_id = pa.id)
    from pases pa
    join personas p on p.id = pa.persona_id
    left join auth.users u on u.id = pa.creado_por
   order by pa.activo desc, p.nombre;
end;
$$;


create or replace function entregas_pase_del_dia(p_fecha date default null)
returns table (
  nombre       text,
  codigo_corto text,
  entregada_en timestamptz,
  entregada_por text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('dar_pases');

  return query
  select p.nombre,
         p.codigo_corto,
         e.entregada_en,
         u.email::text
    from entregas_pase e
    join pases    pa on pa.id = e.pase_id
    join personas p  on p.id = pa.persona_id
    left join auth.users u on u.id = e.usuario_id
   where e.fecha = coalesce(p_fecha, current_date)
   order by e.entregada_en;
end;
$$;


create or replace function listar_avisos()
returns table (
  id              uuid,
  seccion         text,
  orden           int,
  titulo_es       text,
  titulo_en       text,
  titulo_vi       text,
  texto_es        text,
  texto_en        text,
  texto_vi        text,
  activo          boolean,
  actualizado_en  timestamptz,
  actualizado_por text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('editar_textos');

  return query
  select a.id, a.seccion, a.orden, a.titulo_es, a.titulo_en, a.titulo_vi,
         a.texto_es, a.texto_en, a.texto_vi,
         a.activo, a.actualizado_en, u.email::text
    from avisos a
    left join auth.users u on u.id = a.actualizado_por
   order by a.seccion, a.orden, a.actualizado_en;
end;
$$;


create or replace function guardar_aviso(
  p_seccion   text,
  p_texto_es  text,
  p_id        uuid    default null,
  p_texto_en  text    default null,
  p_texto_vi  text    default null,
  p_activo    boolean default true,
  p_titulo_es text    default null,
  p_titulo_en text    default null,
  p_titulo_vi text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id     uuid;
  v_texto  text := regexp_replace(trim(coalesce(p_texto_es, '')), '\s+', ' ', 'g');
  v_titulo text := nullif(regexp_replace(trim(coalesce(p_titulo_es, '')), '\s+', ' ', 'g'), '');
begin
  perform exigir_permiso('editar_textos');

  if p_seccion not in ('inicio', 'registro', 'preguntas', 'quienes') then
    raise exception 'SECCION_INVALIDA';
  end if;

  if v_texto = '' then
    raise exception 'TEXTO_REQUERIDO';
  end if;

  --  Las respuestas de las preguntas frecuentes son mas largas que un
  --  aviso de una linea, por eso el tope sube.
  if length(v_texto) > 1200 then
    raise exception 'TEXTO_LARGO';
  end if;

  --  Una pregunta sin pregunta no se entiende.
  if p_seccion = 'preguntas' and v_titulo is null then
    raise exception 'TITULO_REQUERIDO';
  end if;

  if p_id is null then
    insert into avisos (seccion, orden, titulo_es, titulo_en, titulo_vi,
                        texto_es, texto_en, texto_vi, activo, actualizado_por)
    values (p_seccion,
            coalesce((select max(a.orden) + 1 from avisos a where a.seccion = p_seccion), 1),
            v_titulo,
            nullif(trim(coalesce(p_titulo_en, '')), ''),
            nullif(trim(coalesce(p_titulo_vi, '')), ''),
            v_texto,
            nullif(trim(coalesce(p_texto_en, '')), ''),
            nullif(trim(coalesce(p_texto_vi, '')), ''),
            coalesce(p_activo, true),
            auth.uid())
    returning id into v_id;

    return v_id;
  end if;

  update avisos
     set seccion         = p_seccion,
         titulo_es       = v_titulo,
         titulo_en       = nullif(trim(coalesce(p_titulo_en, '')), ''),
         titulo_vi       = nullif(trim(coalesce(p_titulo_vi, '')), ''),
         texto_es        = v_texto,
         texto_en        = nullif(trim(coalesce(p_texto_en, '')), ''),
         texto_vi        = nullif(trim(coalesce(p_texto_vi, '')), ''),
         activo          = coalesce(p_activo, true),
         actualizado_por = auth.uid(),
         actualizado_en  = now()
   where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'AVISO_NO_EXISTE';
  end if;

  return v_id;
end;
$$;


create or replace function mover_aviso(p_id uuid, p_hacia text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_aviso  avisos;
  v_vecino avisos;
begin
  perform exigir_permiso('editar_textos');

  if p_hacia not in ('arriba', 'abajo') then
    raise exception 'DIRECCION_INVALIDA';
  end if;

  select * into v_aviso from avisos where id = p_id;
  if not found then
    raise exception 'AVISO_NO_EXISTE';
  end if;

  if p_hacia = 'arriba' then
    select * into v_vecino
      from avisos a
     where a.seccion = v_aviso.seccion and a.orden < v_aviso.orden
     order by a.orden desc
     limit 1;
  else
    select * into v_vecino
      from avisos a
     where a.seccion = v_aviso.seccion and a.orden > v_aviso.orden
     order by a.orden
     limit 1;
  end if;

  --  Ya esta en la punta: no es un error, simplemente no se mueve.
  if not found then
    return 'SIN_CAMBIO';
  end if;

  update avisos set orden = v_vecino.orden where id = v_aviso.id;
  update avisos set orden = v_aviso.orden  where id = v_vecino.id;

  return 'MOVIDO';
end;
$$;


create or replace function eliminar_aviso(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_permiso('editar_textos');

  delete from avisos where id = p_id;

  if not found then
    raise exception 'AVISO_NO_EXISTE';
  end if;

  return 'ELIMINADO';
end;
$$;


commit;
