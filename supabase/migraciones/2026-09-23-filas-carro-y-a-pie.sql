-- ============================================================
--  Cajita de Bendicion - Dos filas: carro y a pie
--
--  Fase 2, primer paso. Cada horario es de una fila; cada persona del
--  equipo escanea en la suya; las cuentas del dia se pueden ver por fila
--  o juntas.
--
--  Lo que cambia HOY: nada que se vea. Todo lo que ya existe queda como
--  fila de carros, todo el equipo queda en "las dos filas", y la reserva
--  a pie sigue cerrada hasta que a_pie_abierto diga 'si'.
--
--  Toca registrar_entrega() y registrar_entrega_autorizada() solo para
--  agregar la respuesta OTRA_FILA, DESPUES del candado de fila y ANTES de
--  quemar el codigo. El candado no cambia.
--
--  Requiere 2026-09-23-permisos-del-voluntario.sql. Se puede repetir.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  Dos filas: carro y a pie
-- ------------------------------------------------------------
--  Fase 2 (CLAUDE.md > Alcance). La entrega tiene dos filas con su propio
--  cupo, sus propios horarios y su propia gente escaneando. Esto pone la
--  base; la reserva publica a pie sigue cerrada ("Proximamente") hasta que
--  el pastor la abra con la configuracion a_pie_abierto.
--
--  La fila vive en el HORARIO, no en la cita: una cita es de la fila de su
--  bloque. Asi el candado de reservar_cita() sobre la fila del bloque sigue
--  siendo el unico que decide el cupo, igual en las dos filas.

alter table bloques add column if not exists fila text not null default 'carro';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bloques_fila_valida') then
    alter table bloques add constraint bloques_fila_valida check (fila in ('carro', 'a_pie'));
  end if;

  --  A la misma hora caben un horario de carro y uno a pie. El unico viejo
  --  era por fecha y hora; ahora es por fecha, hora y fila.
  if exists (select 1 from pg_constraint where conname = 'bloques_fecha_hora_key') then
    alter table bloques drop constraint bloques_fecha_hora_key;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'bloques_fecha_hora_fila_key') then
    alter table bloques add constraint bloques_fecha_hora_fila_key unique (fecha, hora, fila);
  end if;
end;
$$;

--  En que fila escanea cada quien. 'ambas' deja todo como estaba: hoy
--  solo existe la fila de carros. El administrador escanea en las dos,
--  diga lo que diga aqui.
alter table personal add column if not exists fila text not null default 'ambas';

--  "Entro sin cita" y los pases no tienen horario: se anotan en la fila de
--  quien los registra.
alter table entradas_sin_cita add column if not exists fila text not null default 'carro';
alter table entregas_pase     add column if not exists fila text not null default 'carro';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personal_fila_valida') then
    alter table personal add constraint personal_fila_valida check (fila in ('carro', 'a_pie', 'ambas'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entradas_sin_cita_fila_valida') then
    alter table entradas_sin_cita add constraint entradas_sin_cita_fila_valida check (fila in ('carro', 'a_pie'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entregas_pase_fila_valida') then
    alter table entregas_pase add constraint entregas_pase_fila_valida check (fila in ('carro', 'a_pie'));
  end if;
end;
$$;

create index if not exists idx_bloques_fecha_fila on bloques (fecha, fila);

insert into configuracion (clave, valor, nota) values
  ('a_pie_abierto', 'no',
   'Si la gente ya puede hacer cita en la fila a pie: si o no. Mientras diga ' ||
   'no, el inicio muestra "Proximamente", los horarios a pie no salen al ' ||
   'publico y nadie puede apartar lugar en ellos.')
on conflict (clave) do nothing;


--  Si la fila a pie ya recibe citas.
create or replace function a_pie_abierto()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select lower(trim(valor)) in ('si', 'sí', 'true', '1') from configuracion where clave = 'a_pie_abierto'),
    false);
$$;

revoke execute on function a_pie_abierto() from public, anon, authenticated;


--  Si quien tiene la sesion puede entregar en esa fila. El administrador,
--  en las dos; el voluntario, en la suya o en las dos si asi lo dejaron.
create or replace function puede_escanear_fila(p_fila text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select pe.rol = 'admin' or pe.fila = 'ambas' or pe.fila = p_fila
       from personal pe
      where pe.usuario_id = auth.uid() and pe.activo),
    false);
$$;

revoke execute on function puede_escanear_fila(text) from public, anon, authenticated;


--  En que fila se cuenta un pase o una entrada sin cita: la de quien la
--  registra. Quien escanea en las dos se cuenta en la de carros, que hoy
--  es la unica abierta; cuando abra la fila a pie, la pantalla de escaneo
--  le preguntara en cual esta.
create or replace function fila_de_entrega()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case when pe.fila = 'a_pie' then 'a_pie' else 'carro' end
       from personal pe
      where pe.usuario_id = auth.uid() and pe.activo and pe.rol <> 'admin'),
    'carro');
$$;

revoke execute on function fila_de_entrega() from public, anon, authenticated;


--  La fila de quien tiene la sesion, para la pantalla de escaneo. El
--  administrador siempre 'ambas'. Null si la cuenta no es del personal.
create or replace function mi_fila()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when pe.rol = 'admin' then 'ambas' else pe.fila end
    from personal pe
   where pe.usuario_id = auth.uid() and pe.activo;
$$;

revoke execute on function mi_fila() from public;
grant  execute on function mi_fila() to authenticated;


--  En que fila escanea alguien del equipo. Solo el administrador, igual
--  que dar roles: es parte de Equipo y accesos.
create or replace function guardar_fila_personal(p_correo text, p_fila text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  perform exigir_rol(array['admin']);

  if p_fila is null or p_fila not in ('carro', 'a_pie', 'ambas') then
    raise exception 'FILA_INVALIDA';
  end if;

  update personal pe
     set fila           = p_fila,
         actualizado_en = now()
    from auth.users u
   where u.id = pe.usuario_id
     and lower(u.email) = v_correo
  returning pe.usuario_id into v_usuario;

  if v_usuario is null then
    raise exception 'PERSONAL_NO_EXISTE';
  end if;

  return p_fila;
end;
$$;

revoke execute on function guardar_fila_personal(text, text) from public;
grant  execute on function guardar_fila_personal(text, text) to authenticated;


-- ------------------------------------------------------------
--  Las funciones que ahora saben de filas
-- ------------------------------------------------------------
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

  --  Los datos del pase se guardan sueltos y no como fila de "pases" a
  --  proposito: asi esta funcion se puede crear aunque esa tabla llegue
  --  mas abajo en el archivo. Las consultas se resuelven al ejecutarse.
  v_pase_id      uuid;
  v_pase_activo  boolean;
  v_pase_persona uuid;
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  -- Escanean voluntarios y administradores. Una cuenta sin rol no entrega.
  perform exigir_rol(array['admin', 'voluntario']);

  -- ----------------------------------------------------------
  --  Pase permanente (seccion 29)
  -- ----------------------------------------------------------
  --  El codigo de un pase no es de una cita sino de la persona, y no se
  --  quema: vale todos los dias de entrega hasta que se revoque. Lo que
  --  se quema es el dia: una caja por pase por fecha. Si alguien le saca
  --  copia al codigo, la copia no consigue una segunda caja.
  --
  --  El candado sobre la fila serializa dos escaneos del mismo pase, y
  --  el indice unico de entregas_pase es la red por debajo.
  select pa.id, pa.activo, pa.persona_id
    into v_pase_id, v_pase_activo, v_pase_persona
    from pases pa
   where pa.token = p_token
     for update;

  if found then
    select * into v_persona from personas where id = v_pase_persona;

    if not v_pase_activo then
      return query select 'PASE_REVOCADO'::text, v_persona.nombre,
                          v_persona.codigo_corto, null::time;
      return;
    end if;

    --  Un pase no sirve un martes: solo en dia de entrega abierto.
    if not exists (select 1 from dias_entrega d
                    where d.fecha = current_date and not d.cerrado) then
      return query select 'NO_ES_DIA_DE_ENTREGA'::text, v_persona.nombre,
                          v_persona.codigo_corto, null::time;
      return;
    end if;

    if exists (select 1 from entregas_pase e
                where e.pase_id = v_pase_id and e.fecha = current_date) then
      return query select 'YA_USADO'::text, v_persona.nombre,
                          v_persona.codigo_corto, null::time;
      return;
    end if;

    insert into entregas_pase (pase_id, fecha, usuario_id, fila)
    values (v_pase_id, current_date, v_usuario, fila_de_entrega());

    return query select 'VALIDO_PASE'::text, v_persona.nombre,
                        v_persona.codigo_corto, null::time;
    return;
  end if;

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

  --  Cada fila tiene su gente (seccion 32). Quien escanea en la fila de
  --  carros no entrega un codigo de la fila a pie: se le dice a donde
  --  mandarlo y el codigo NO se quema, para que en su fila si pase.
  if not puede_escanear_fila(v_bloque.fila) then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'OTRA_FILA');

    return query select 'OTRA_FILA'::text, v_persona.nombre,
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

  --  Cada fila tiene su gente (seccion 32). Autorizar salta la
  --  FECHA, no la fila. Quien escanea en la fila de
  --  carros no entrega un codigo de la fila a pie: se le dice a donde
  --  mandarlo y el codigo NO se quema, para que en su fila si pase.
  if not puede_escanear_fila(v_bloque.fila) then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'OTRA_FILA');

    return query select 'OTRA_FILA'::text, v_persona.nombre,
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

  insert into escaneos (cita_id, usuario_id, resultado, autorizado_por)
  values (v_cita.id, v_usuario, 'VALIDO_AUTORIZADO', v_autorizador);

  return query select 'VALIDO_AUTORIZADO'::text, v_persona.nombre,
                      v_persona.codigo_corto, v_bloque.hora;
end;
$$;


revoke execute on function registrar_entrega_autorizada(text, text) from public;
grant  execute on function registrar_entrega_autorizada(text, text) to authenticated;


create or replace function mover_cita(
  p_cita_id   uuid,
  p_bloque_id uuid,
  p_origen    text
)
returns citas
language plpgsql
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita     citas;
  v_actual   bloques;
  v_nuevo    bloques;
  v_abre_en  timestamptz;
  v_cerrado  boolean;
  v_ocupados int;
begin
  select * into v_cita from citas where id = p_cita_id for update;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado = 'cancelada' then
    raise exception 'CITA_YA_CANCELADA';
  end if;

  --  Ya la escanearon: no hay nada que mover.
  if v_cita.estado in ('llego', 'entregada') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  select * into v_actual from bloques where id = v_cita.bloque_id;
  if v_actual.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if v_cita.bloque_id = p_bloque_id then
    raise exception 'MISMO_HORARIO';
  end if;

  --  Las demas peticiones sobre el bloque de destino esperan aqui.
  select * into v_nuevo from bloques where id = p_bloque_id for update;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  --  Una cita no se cambia de fila: carro y a pie tienen su propio cupo y
  --  su propia gente (seccion 32).
  if v_nuevo.fila <> v_actual.fila then
    raise exception 'OTRA_FILA';
  end if;

  if v_nuevo.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_nuevo.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  --  El dia de destino tiene que estar abierto, igual que para
  --  registrarse. Si no, mover la cita seria la puerta de atras para
  --  apartar lugar en un dia que todavia no abre.
  select d.abre_en, d.cerrado into v_abre_en, v_cerrado
    from dias_entrega d
   where d.fecha = v_nuevo.fecha;

  if not found or v_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if now() < v_abre_en then
    raise exception 'AUN_NO_ABRE';
  end if;

  --  La propia cita no cuenta: se esta moviendo, no agregando.
  select count(*) into v_ocupados
    from citas c
   where c.bloque_id = p_bloque_id
     and c.estado <> 'cancelada'
     and c.id <> v_cita.id;

  if v_ocupados >= v_nuevo.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  update citas
     set bloque_id = p_bloque_id,
         semana    = date_trunc('week', v_nuevo.fecha)::date
   where id = v_cita.id
  returning * into v_cita;

  insert into movimientos_cita (cita_id, de_bloque_id, a_bloque_id, origen, usuario_id)
  values (v_cita.id, v_actual.id, v_nuevo.id, p_origen, auth.uid());

  return v_cita;

exception
  --  Lo levanta el indice unico parcial: ya tiene otra cita activa en la
  --  semana a la que se quiere mover.
  when unique_violation then
    raise exception 'YA_TIENE_CITA_ESTA_SEMANA';
end;
$$;





create or replace function registrar_y_reservar(
  p_nombre            text,
  p_apellidos         text,
  p_telefono          text,
  p_bloque_id         uuid,
  p_email             text,
  p_pais              text    default null,
  p_codigo_postal     text    default null,
  p_colonia           text    default null,
  p_calle             text    default null,
  p_numero            text    default null,
  p_numero_interior   text    default null,
  p_sin_domicilio     boolean default false,
  p_acepto_privacidad boolean default false,
  p_dispositivo       text    default null,
  p_codigo_anticipado text    default null
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
  --  Sin espacios de mas: "  maria   jose " se guarda "maria jose".
  v_nombres    text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_apellidos  text := regexp_replace(trim(coalesce(p_apellidos, '')), '\s+', ' ', 'g');
  v_telefono   text := trim(coalesce(p_telefono, ''));
  v_domicilio  record;
  v_bloque     bloques;
  --  Variables sueltas y no "dias_entrega" como tipo: Postgres revisa los
  --  tipos declarados al crear la funcion, y esa tabla se crea despues
  --  (seccion 21). Las consultas si se resuelven al ejecutarse.
  v_abre_en    timestamptz;
  v_abre_ant   timestamptz;
  v_codigo_dia text;
  v_dia_cerrado boolean;
  v_limite     int;
  v_usadas     int;
  v_persona    personas;
  v_cita       citas;
  v_codigo     text;
  v_intentos   int := 0;
  v_anticipada boolean := false;
begin
  if v_nombres = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  --  Nombre y apellidos separados: la gente escribe primero uno u otro, y
  --  asi las listas se pueden ordenar por apellido sin adivinar.
  if v_apellidos = '' then
    raise exception 'APELLIDOS_REQUERIDOS';
  end if;

  --  Un nombre con numeros casi siempre es el telefono en la casilla equivocada.
  if v_nombres ~ '[0-9]' or v_apellidos ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  if v_telefono = '' then
    raise exception 'TELEFONO_REQUERIDO';
  end if;

  --  Formato internacional (E.164): "+", la lada y el numero, sin espacios,
  --  de 7 a 15 digitos. La pantalla ya lo convierte asi; esto asegura que
  --  nadie guarde "664 123" llamando a la funcion por fuera.
  if v_telefono !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  --  El correo es obligatorio en el registro publico. La columna sigue
  --  aceptando nulos a proposito: el registro desde el panel para un adulto
  --  mayor tiene que poder guardarse sin correo.
  if coalesce(trim(p_email), '') = '' then
    raise exception 'EMAIL_REQUERIDO';
  end if;

  --  Comprobacion minima de forma. No se intenta adivinar si el correo
  --  existe: eso solo se sabe mandandole algo. Solo se atajan dedazos.
  if trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'EMAIL_INVALIDO';
  end if;

  --  Domicilio real en Mexico o Estados Unidos (seccion 26).
  select * into v_domicilio
    from validar_domicilio(p_pais, p_codigo_postal, p_colonia, p_calle,
                           p_numero, p_numero_interior, p_sin_domicilio);

  --  La casilla "comparto esta informacion por mi voluntad".
  if not coalesce(p_acepto_privacidad, false) then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
  end if;

  select * into v_bloque from bloques where id = p_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  --  La fila a pie no recibe citas hasta que se abra (seccion 32). La
  --  pantalla ya no la ofrece; esto cierra la puerta de atras.
  if v_bloque.fila = 'a_pie' and not a_pie_abierto() then
    raise exception 'A_PIE_CERRADO';
  end if;

  -- ----------------------------------------------------------
  --  Apertura del dia
  -- ----------------------------------------------------------
  --  Antes de la hora de apertura solo entra quien trae el codigo de
  --  suscriptor, y solo dentro de su ventana de acceso anticipado.
  select d.abre_en, d.abre_anticipado_en, d.codigo_anticipado, d.cerrado
    into v_abre_en, v_abre_ant, v_codigo_dia, v_dia_cerrado
    from dias_entrega d
   where d.fecha = v_bloque.fecha;

  if not found or v_dia_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if now() < v_abre_en then
    if v_abre_ant is null or now() < v_abre_ant then
      raise exception 'AUN_NO_ABRE';
    end if;

    if coalesce(trim(p_codigo_anticipado), '') = '' then
      raise exception 'AUN_NO_ABRE';
    end if;

    if upper(trim(p_codigo_anticipado)) <> v_codigo_dia then
      raise exception 'CODIGO_ANTICIPADO_INVALIDO';
    end if;

    v_anticipada := true;
  end if;

  -- ----------------------------------------------------------
  --  Tope por dispositivo
  -- ----------------------------------------------------------
  --  Se cuenta por FECHA DE ENTREGA, no por semana: el lunes y el jueves
  --  son dos entregas distintas. Con el tope en 1, un mismo telefono
  --  aparta su lugar el lunes y tambien el jueves, pero nunca dos veces
  --  el mismo dia. Se sube a 2 o 3 cuando llega una familia que comparte
  --  un solo telefono.
  --
  --  El candado serializa los registros de un mismo telefono. Sin el,
  --  tres pestanas mandando al mismo tiempo pasarian las tres el
  --  "cuantas lleva" antes de que ninguna hubiera insertado: es el
  --  mismo patron ingenuo que reproduce el bug del Google Form.
  if p_dispositivo is not null then
    perform pg_advisory_xact_lock(hashtext(p_dispositivo));

    select valor::int into v_limite
      from configuracion
     where clave = 'limite_citas_por_dispositivo';

    v_limite := coalesce(v_limite, 1);

    select count(*) into v_usadas
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.dispositivo_id = p_dispositivo
       and b.fecha = v_bloque.fecha
       and c.estado <> 'cancelada';

    if v_usadas >= v_limite then
      raise exception 'LIMITE_DISPOSITIVO';
    end if;
  end if;

  -- ----------------------------------------------------------
  --  Codigo corto tipo CB-4871
  -- ----------------------------------------------------------
  --  Se reintenta porque dos registros simultaneos pueden sacar el
  --  mismo numero al azar. El indice unico los separa; aqui solo se
  --  vuelve a intentar. Son 10,000 codigos para unas 2,000 personas.
  loop
    v_codigo := 'CB-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      --  "nombre" guarda el nombre completo: es el que se muestra al
      --  escanear y en la confirmacion.
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

  --  reservar_cita hace el bloqueo de fila que impide el sobrecupo y
  --  aplica la regla de una cita por semana. No se duplica aqui.
  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas
     set dispositivo_id        = p_dispositivo,
         con_codigo_anticipado = v_anticipada
   where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;


revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;


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

    --  La fila a pie no recibe citas hasta que se abra (seccion 32). La
    --  pantalla ya no la ofrece; esto cierra la puerta de atras.
    if v_bloque.fila = 'a_pie' and not a_pie_abierto() then
      raise exception 'A_PIE_CERRADO';
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


revoke execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) from public;
grant  execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) to authenticated;


create or replace function crear_dia_entrega(
  p_fecha              date,
  p_hora_inicio        time,
  p_hora_fin           time,
  p_capacidad          int,
  p_abre_en            timestamp,
  p_abre_anticipado_en timestamp default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_codigo text;
begin
  perform exigir_rol(array['admin']);

  if p_fecha is null or p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;
  if p_hora_inicio is null or p_hora_fin is null or p_hora_fin < p_hora_inicio then
    raise exception 'HORARIO_INVALIDO';
  end if;
  if p_capacidad is null or p_capacidad < 0 then
    raise exception 'CAPACIDAD_INVALIDA';
  end if;
  if p_abre_en is null then
    raise exception 'APERTURA_REQUERIDA';
  end if;
  if p_abre_anticipado_en is not null and p_abre_anticipado_en > p_abre_en then
    raise exception 'ANTICIPADO_DESPUES_DE_APERTURA';
  end if;
  if exists (select 1 from dias_entrega where fecha = p_fecha) then
    raise exception 'DIA_YA_EXISTE';
  end if;

  v_codigo := generar_codigo_anticipado();

  insert into dias_entrega (fecha, abre_en, abre_anticipado_en, codigo_anticipado)
  values (p_fecha,
          p_abre_en at time zone 'America/Los_Angeles',
          p_abre_anticipado_en at time zone 'America/Los_Angeles',
          v_codigo);

  insert into bloques (fecha, hora, capacidad)
  select p_fecha, t::time, p_capacidad
    from generate_series(p_fecha + p_hora_inicio, p_fecha + p_hora_fin, interval '15 minutes') t
  on conflict (fecha, hora, fila) do nothing;

  return v_codigo;
end;
$$;


revoke execute on function crear_dia_entrega(date, time, time, int, timestamp, timestamp) from public;
grant  execute on function crear_dia_entrega(date, time, time, int, timestamp, timestamp) to authenticated;


create or replace function agregar_bloque(p_fecha date, p_hora time, p_capacidad int)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  perform exigir_rol(array['admin']);

  if not exists (select 1 from dias_entrega where fecha = p_fecha) then
    raise exception 'DIA_NO_EXISTE';
  end if;
  if p_hora is null then
    raise exception 'HORARIO_INVALIDO';
  end if;
  if p_capacidad is null or p_capacidad < 0 then
    raise exception 'CAPACIDAD_INVALIDA';
  end if;

  insert into bloques (fecha, hora, capacidad)
  values (p_fecha, p_hora, p_capacidad)
  on conflict (fecha, hora, fila) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'BLOQUE_YA_EXISTE';
  end if;

  return v_id;
end;
$$;


revoke execute on function agregar_bloque(date, time, int) from public;
grant  execute on function agregar_bloque(date, time, int) to authenticated;


drop function if exists consultar_disponibilidad(date, date);

create or replace function consultar_disponibilidad(
  p_desde date default null,
  p_hasta date default null,
  p_fila  text default 'carro'
)
returns table (
  bloque_id          uuid,
  fecha              date,
  hora               time,
  capacidad          int,
  ocupados           int,
  libres             int,
  abierto            boolean,
  abre_en            timestamp,
  abre_anticipado_en timestamp
)
-- PL/pgSQL y no SQL: su cuerpo usa dias_entrega (seccion 21), y asi la
-- tabla se resuelve al ejecutarse, no al crearse la funcion.
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  return query
  select b.id,
         b.fecha,
         b.hora,
         b.capacidad,
         count(c.id) filter (where c.estado <> 'cancelada')::int,
         greatest(
           b.capacidad - count(c.id) filter (where c.estado <> 'cancelada'),
           0
         )::int,
         -- Las fechas aun no abiertas SI se muestran, con su hora de
         -- apertura: el publico sabe cuando volver. Reservar lo impide
         -- registrar_y_reservar(), no esta consulta.
         now() >= d.abre_en,
         d.abre_en at time zone 'America/Los_Angeles',
         d.abre_anticipado_en at time zone 'America/Los_Angeles'
    from bloques b
    join dias_entrega d on d.fecha = b.fecha and not d.cerrado
    left join citas c on c.bloque_id = b.id
   where b.cerrado = false
     --  Una fila a la vez, y la de a pie no se ofrece mientras este
     --  cerrada (seccion 32).
     and b.fila = coalesce(p_fila, 'carro')
     and (b.fila = 'carro' or a_pie_abierto())
     -- Nunca se ofrecen fechas pasadas: reservar_cita() las rechazaria
     -- con FECHA_PASADA y el usuario no entenderia por que.
     and b.fecha >= greatest(coalesce(p_desde, current_date), current_date)
     and b.fecha <= coalesce(p_hasta, current_date + 60)
   group by b.id, b.fecha, b.hora, b.capacidad, d.abre_en, d.abre_anticipado_en
   order by b.fecha, b.hora;
end;
$$;


revoke execute on function consultar_disponibilidad(date, date, text) from public;
grant  execute on function consultar_disponibilidad(date, date, text) to anon, authenticated;


drop function if exists consultar_cita(text);

create or replace function consultar_cita(p_token text)
returns table (
  codigo_corto text,
  nombre       text,
  fecha        date,
  hora         time,
  estado       text,
  fila         text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.codigo_corto, p.nombre, b.fecha, b.hora, c.estado, b.fila
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.token_qr = p_token;
$$;


revoke execute on function consultar_cita(text) from public;
grant  execute on function consultar_cita(text) to anon, authenticated;


drop function if exists resumen_del_dia(date);

create or replace function resumen_del_dia(p_fecha date default null, p_fila text default null)
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
  -- Los numeros del dia: el administrador siempre, y el voluntario si
  -- tiene puesta su palomita (seccion 31).
  perform exigir_permiso('ver_citas_del_dia');

  if p_fila is not null and p_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  return query
  select
    v_fecha,
    x.n_con_cita,
    x.n_recibieron,
    case when v_pasado then 0 else x.n_sin_escanear end,
    x.n_no_asistio + case when v_pasado then x.n_sin_escanear else 0 end,
    x.n_canceladas,
    --  Las anotadas por error se anulan y ya no cuentan (seccion 22).
    (select count(*)::int from entradas_sin_cita s
      where s.fecha = v_fecha and s.anulada_en is null and (p_fila is null or s.fila = p_fila)),
    --  Las cajas de los pases permanentes (seccion 29). No tienen
    --  cita: no apartan lugar, pero si cuentan como caja entregada.
    (select count(*)::int from entregas_pase e where e.fecha = v_fecha and (p_fila is null or e.fila = p_fila)),
    --  Intentos repetidos: alguien trato de usar dos veces el mismo
    --  codigo. Es la senal de que el corte esta funcionando y de que
    --  hay quien lo esta intentando.
    (select count(*)::int from escaneos e
       join citas   c on c.id = e.cita_id
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and e.resultado = 'YA_USADO' and (p_fila is null or b.fila = p_fila))
  from (
    select count(*) filter (where c.estado <> 'cancelada')::int             as n_con_cita,
           count(*) filter (where c.estado = 'entregada')::int             as n_recibieron,
           count(*) filter (where c.estado in ('reservada', 'llego'))::int as n_sin_escanear,
           count(*) filter (where c.estado = 'no_asistio')::int            as n_no_asistio,
           count(*) filter (where c.estado = 'cancelada')::int             as n_canceladas
      from citas c
      join bloques b on b.id = c.bloque_id
     where b.fecha = v_fecha
       and (p_fila is null or b.fila = p_fila)
  ) x;
end;
$$;


revoke execute on function resumen_del_dia(date, text) from public;
grant  execute on function resumen_del_dia(date, text) to authenticated;


drop function if exists citas_del_dia(date);

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
  motivo_cancelacion text,
  fila               text
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
         c.motivo_cancelacion,
         b.fila
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.cancelada_por
   where b.fecha = coalesce(p_fecha, current_date)
   order by b.hora, p.nombre;
end;
$$;


revoke execute on function citas_del_dia(date) from public;
grant  execute on function citas_del_dia(date) to authenticated;


drop function if exists bloques_del_dia(date);

create or replace function bloques_del_dia(p_fecha date default null)
returns table (
  bloque_id uuid,
  hora      time,
  capacidad int,
  ocupados  int,
  libres    int,
  cerrado   boolean,
  fila      text
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
         b.cerrado,
         b.fila
    from bloques b
    left join citas c on c.bloque_id = b.id
   where b.fecha = coalesce(p_fecha, current_date)
   group by b.id, b.hora, b.capacidad, b.cerrado, b.fila
   order by b.fila = 'a_pie', b.hora;
end;
$$;


revoke execute on function bloques_del_dia(date) from public;
grant  execute on function bloques_del_dia(date) to authenticated;


drop function if exists registrar_entrada_sin_cita(text);

create or replace function registrar_entrada_sin_cita(p_nombre text, p_fila text default null)
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
  --  Sin fila, la de quien la anota (seccion 32).
  v_fila     text := coalesce(p_fila, fila_de_entrega());
begin
  perform exigir_permiso('anotar_sin_cita');

  if v_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  if not puede_escanear_fila(v_fila) then
    raise exception 'OTRA_FILA';
  end if;

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
      insert into entradas_sin_cita (fecha, nombre, codigo, registrado_por, fila)
      values (current_date, v_nombre, v_codigo, v_usuario, v_fila);
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
             where s.fecha = current_date and s.anulada_en is null and s.fila = v_fila);
end;
$$;


revoke execute on function registrar_entrada_sin_cita(text, text) from public;
grant  execute on function registrar_entrada_sin_cita(text, text) to authenticated;


drop function if exists entradas_sin_cita_del_dia(date);

create or replace function entradas_sin_cita_del_dia(p_fecha date default null)
returns table (
  codigo        text,
  nombre        text,
  registrado_en timestamptz,
  anotado_por   text,
  anulada       boolean,
  anulada_en    timestamptz,
  anulada_por   text,
  fila          text
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
         ua.email::text,
         s.fila
    from entradas_sin_cita s
    left join auth.users u  on u.id  = s.registrado_por
    left join auth.users ua on ua.id = s.anulada_por
   where s.fecha = coalesce(p_fecha, current_date)
   order by s.registrado_en desc;
end;
$$;


revoke execute on function entradas_sin_cita_del_dia(date) from public;
grant  execute on function entradas_sin_cita_del_dia(date) to authenticated;


drop function if exists listar_personal();

create or replace function listar_personal()
returns table (
  correo        text,
  rol           text,
  estado        text,
  ultimo_acceso timestamptz,
  es_yo         boolean,
  tiene_codigo  boolean,
  fila          text
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
  select u.email::text,
         pe.rol,
         case when pe.activo then 'activo' else 'sin_acceso' end,
         u.last_sign_in_at,
         pe.usuario_id = auth.uid(),
         exists (select 1 from autorizadores a where a.usuario_id = pe.usuario_id and a.activo),
         pe.fila
    from personal pe
    join auth.users u on u.id = pe.usuario_id
  union all
  select pp.correo,
         pp.rol,
         'pendiente',
         null::timestamptz,
         false,
         false,
         'ambas'::text
    from personal_pendiente pp
   order by 3, 2, 1;
end;
$$;


revoke execute on function listar_personal() from public;
grant  execute on function listar_personal() to authenticated;


drop function if exists reporte_por_dias(date, date);

create or replace function reporte_por_dias(p_desde date, p_hasta date, p_fila text default null)
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

  if p_fila is not null and p_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  --  Con la zona de San Diego puesta, usado_en::date es la fecha de San Diego.
  return query
  with dias as (
    select b.fecha as dia from bloques b where b.fecha between p_desde and p_hasta and (p_fila is null or b.fila = p_fila)
    union
    select s.fecha from entradas_sin_cita s where s.fecha between p_desde and p_hasta and (p_fila is null or s.fila = p_fila)
    union
    select c.usado_en::date from citas c
      join bloques b on b.id = c.bloque_id
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
    union
    select e.fecha from entregas_pase e where e.fecha between p_desde and p_hasta and (p_fila is null or e.fila = p_fila)
  ),
  cupos as (
    select b.fecha as dia, sum(b.capacidad)::int as n
      from bloques b
     where b.fecha between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
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
       and (p_fila is null or b.fila = p_fila)
     group by b.fecha
  ),
  entregas as (
    select c.usado_en::date as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
     group by c.usado_en::date
  ),
  sin_cita_dia as (
    select s.fecha as dia, count(*)::int as n
      from entradas_sin_cita s
     where s.fecha between p_desde and p_hasta and s.anulada_en is null and (p_fila is null or s.fila = p_fila)
     group by s.fecha
  ),
  pases_dia as (
    select e.fecha as dia, count(*)::int as n
      from entregas_pase e
     where e.fecha between p_desde and p_hasta and (p_fila is null or e.fila = p_fila)
     group by e.fecha
  ),
  repetidos as (
    select e.escaneado_en::date as dia, count(*)::int as n
      from escaneos e
      join citas   c on c.id = e.cita_id
      join bloques b on b.id = c.bloque_id
     where e.resultado = 'YA_USADO' and e.escaneado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
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


revoke execute on function reporte_por_dias(date, date, text) from public;
grant  execute on function reporte_por_dias(date, date, text) to authenticated;

commit;
