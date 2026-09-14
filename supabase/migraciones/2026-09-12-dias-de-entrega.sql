-- ============================================================
--  Cajita de Bendicion - Fechas de entrega, apertura programada y
--  codigo de suscriptores (pantalla Horarios y cupos)
--
--  Requiere haber corrido antes 2026-09-12-roles.sql.
--  Se puede repetir.
--
--  Las fechas que ya tienen horarios quedan ABIERTAS, para no cerrar lo
--  que esta en uso. Las nuevas se crean desde el panel.
--
--  Despues de correrla:
--    * los horarios ya no se crean con SQL a mano: cada uno necesita su
--      fecha en dias_entrega (Horarios y cupos la crea);
--    * reservar_cita() ya no se puede llamar desde el navegador. La prueba
--      de concurrencia ahora pasa por registrar_desde_panel() con una
--      cuenta admin.
-- ============================================================

-- ============================================================
--  21. DIAS DE ENTREGA: APERTURA Y ACCESO ANTICIPADO
-- ============================================================
--  Cada fecha de entrega se abre al publico a la hora que decide el
--  administrador. Antes de esa hora nadie puede reservar, salvo quien tenga
--  el codigo de suscriptor de Facebook de esa fecha, y solo desde
--  abre_anticipado_en. Si abre_anticipado_en es nulo, no hay acceso
--  anticipado para esa fecha.
--
--  La regla vive en registrar_y_reservar(), la unica puerta publica.
--  Esconder la fecha en el calendario no bastaria: es el mismo error del
--  Google Form, que avisaba "lleno" pero no bloqueaba.

--  Codigo aleatorio de 6 caracteres. Sin 0/O ni 1/I: el pastor lo publica
--  en Facebook y la gente lo teclea, y esas letras se confunden.
create or replace function generar_codigo_anticipado()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  v_letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text := '';
begin
  for i in 1..6 loop
    -- 32 letras: el residuo de un byte entre 32 no favorece a ninguna.
    v_codigo := v_codigo || substr(v_letras, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
  end loop;
  return v_codigo;
end;
$$;

revoke execute on function generar_codigo_anticipado() from public, anon, authenticated;


create table if not exists dias_entrega (
  fecha              date primary key,
  abre_en            timestamptz not null,
  abre_anticipado_en timestamptz,
  codigo_anticipado  text not null,
  cerrado            boolean not null default false,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  check (abre_anticipado_en is null or abre_anticipado_en <= abre_en)
);

alter table dias_entrega enable row level security;

--  Las fechas que ya tenian horarios quedan abiertas desde ya, para no
--  cerrar de golpe lo que esta en uso.
insert into dias_entrega (fecha, abre_en, codigo_anticipado)
select d.fecha, now(), generar_codigo_anticipado()
  from (select distinct fecha from bloques) d
on conflict (fecha) do nothing;

--  Todo horario pertenece a un dia de entrega.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bloques_fecha_dia_fk') then
    alter table bloques
      add constraint bloques_fecha_dia_fk
      foreign key (fecha) references dias_entrega (fecha) on delete cascade;
  end if;
end;
$$;

--  Para vigilar filtraciones del codigo: el panel cuenta cuantas citas
--  entraron con el antes de la apertura.
alter table citas add column if not exists con_codigo_anticipado boolean not null default false;

--  El publico escribe el codigo en /horarios/:fecha. Solo dice si sirve
--  ahora; nunca revela el codigo.
create or replace function validar_codigo_anticipado(p_fecha date, p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from dias_entrega d
     where d.fecha = p_fecha
       and not d.cerrado
       and now() < d.abre_en
       and d.abre_anticipado_en is not null
       and now() >= d.abre_anticipado_en
       and upper(trim(coalesce(p_codigo, ''))) = d.codigo_anticipado
  );
$$;

revoke execute on function validar_codigo_anticipado(date, text) from public;
grant  execute on function validar_codigo_anticipado(date, text) to anon, authenticated;


--  ---------- Funciones del administrador ----------
--  Las fechas y horas se intercambian como hora LOCAL de San Diego
--  ("2026-09-11T12:00"), no con zona: asi no importa en que zona este la
--  computadora de quien las captura.

create or replace function listar_dias_entrega(p_desde date default null)
returns table (
  fecha              date,
  abre_en            timestamp,
  abre_anticipado_en timestamp,
  codigo_anticipado  text,
  cerrado            boolean,
  abierto            boolean,
  total_bloques      int,
  capacidad_total    int,
  ocupados           int,
  anticipadas        int
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
  select d.fecha,
         d.abre_en at time zone 'America/Los_Angeles',
         d.abre_anticipado_en at time zone 'America/Los_Angeles',
         d.codigo_anticipado,
         d.cerrado,
         now() >= d.abre_en,
         (select count(*)::int from bloques b where b.fecha = d.fecha),
         (select coalesce(sum(b.capacidad), 0)::int from bloques b where b.fecha = d.fecha),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and c.estado <> 'cancelada'),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and c.estado <> 'cancelada' and c.con_codigo_anticipado)
    from dias_entrega d
   where d.fecha >= coalesce(p_desde, current_date)
   order by d.fecha;
end;
$$;

revoke execute on function listar_dias_entrega(date) from public;
grant  execute on function listar_dias_entrega(date) to authenticated;


--  Crea el dia y sus horarios de 15 en 15 minutos. Devuelve el codigo.
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
  on conflict (fecha, hora) do nothing;

  return v_codigo;
end;
$$;

revoke execute on function crear_dia_entrega(date, time, time, int, timestamp, timestamp) from public;
grant  execute on function crear_dia_entrega(date, time, time, int, timestamp, timestamp) to authenticated;


create or replace function actualizar_dia_entrega(
  p_fecha              date,
  p_abre_en            timestamp,
  p_abre_anticipado_en timestamp,
  p_cerrado            boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  if p_abre_en is null then
    raise exception 'APERTURA_REQUERIDA';
  end if;
  if p_abre_anticipado_en is not null and p_abre_anticipado_en > p_abre_en then
    raise exception 'ANTICIPADO_DESPUES_DE_APERTURA';
  end if;

  update dias_entrega
     set abre_en            = p_abre_en at time zone 'America/Los_Angeles',
         abre_anticipado_en = p_abre_anticipado_en at time zone 'America/Los_Angeles',
         cerrado            = coalesce(p_cerrado, cerrado),
         actualizado_en     = now()
   where fecha = p_fecha;

  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function actualizar_dia_entrega(date, timestamp, timestamp, boolean) from public;
grant  execute on function actualizar_dia_entrega(date, timestamp, timestamp, boolean) to authenticated;


--  Si el codigo se filtro, se genera otro. El anterior deja de servir.
create or replace function regenerar_codigo_anticipado(p_fecha date)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_codigo text := generar_codigo_anticipado();
begin
  perform exigir_rol(array['admin']);

  update dias_entrega
     set codigo_anticipado = v_codigo,
         actualizado_en    = now()
   where fecha = p_fecha;

  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  return v_codigo;
end;
$$;

revoke execute on function regenerar_codigo_anticipado(date) from public;
grant  execute on function regenerar_codigo_anticipado(date) to authenticated;


--  Solo si no hay citas. Con citas el dia se CIERRA, no se borra: borrarlo
--  perderia el historial de entregas.
create or replace function eliminar_dia_entrega(p_fecha date)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  if exists (select 1 from citas c
               join bloques b on b.id = c.bloque_id
              where b.fecha = p_fecha) then
    raise exception 'DIA_CON_CITAS';
  end if;

  delete from dias_entrega where fecha = p_fecha;

  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function eliminar_dia_entrega(date) from public;
grant  execute on function eliminar_dia_entrega(date) to authenticated;


--  Cambiar cupo o cerrar un horario. Bajar el cupo por debajo de lo ya
--  reservado es valido (el camion llego tarde): las citas existentes se
--  respetan y ya no entran nuevas.
create or replace function actualizar_bloque(p_bloque_id uuid, p_capacidad int, p_cerrado boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  if p_capacidad is not null and p_capacidad < 0 then
    raise exception 'CAPACIDAD_INVALIDA';
  end if;

  update bloques
     set capacidad = coalesce(p_capacidad, capacidad),
         cerrado   = coalesce(p_cerrado, cerrado)
   where id = p_bloque_id;

  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function actualizar_bloque(uuid, int, boolean) from public;
grant  execute on function actualizar_bloque(uuid, int, boolean) to authenticated;


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
  on conflict (fecha, hora) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'BLOQUE_YA_EXISTE';
  end if;

  return v_id;
end;
$$;

revoke execute on function agregar_bloque(date, time, int) from public;
grant  execute on function agregar_bloque(date, time, int) to authenticated;


create or replace function eliminar_bloque(p_bloque_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  if exists (select 1 from citas where bloque_id = p_bloque_id) then
    raise exception 'BLOQUE_CON_CITAS';
  end if;

  delete from bloques where id = p_bloque_id;

  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function eliminar_bloque(uuid) from public;
grant  execute on function eliminar_bloque(uuid) to authenticated;


--  reservar_cita() ya no se llama desde el navegador: las puertas son
--  registrar_y_reservar() y, para el admin, registrar_desde_panel(), que
--  revisan la apertura y el limite por dispositivo antes de llamarla.
revoke execute on function reservar_cita(uuid, uuid) from public, anon, authenticated;


-- ============================================================
--  13. CONSULTAR DISPONIBILIDAD, ahora con la apertura de cada fecha
-- ============================================================
--  Cambian las columnas que devuelve: Postgres obliga a borrarla antes
--  (42P13). Borrar una funcion no toca ningun dato.
drop function if exists consultar_disponibilidad(date, date);

create or replace function consultar_disponibilidad(
  p_desde date default null,
  p_hasta date default null
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
     -- Nunca se ofrecen fechas pasadas: reservar_cita() las rechazaria
     -- con FECHA_PASADA y el usuario no entenderia por que.
     and b.fecha >= greatest(coalesce(p_desde, current_date), current_date)
     and b.fecha <= coalesce(p_hasta, current_date + 60)
   group by b.id, b.fecha, b.hora, b.capacidad, d.abre_en, d.abre_anticipado_en
   order by b.fecha, b.hora;
end;
$$;

revoke execute on function consultar_disponibilidad(date, date) from public;
grant  execute on function consultar_disponibilidad(date, date) to anon, authenticated;


-- ============================================================
--  15. REGISTRO PUBLICO, ahora respeta la apertura de la fecha
-- ============================================================
--  Se agrega p_codigo_anticipado. Con otro numero de parametros Postgres
--  crearia una segunda version al lado de la vieja, y la vieja seguiria
--  dejando reservar antes de la apertura: por eso se borra primero.
drop function if exists registrar_y_reservar(text, text, uuid, text, text, text);

create or replace function registrar_y_reservar(
  p_nombre            text,
  p_telefono          text,
  p_bloque_id         uuid,
  p_email             text,
  p_ciudad            text default null,
  p_dispositivo       text default null,
  p_codigo_anticipado text default null
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
  v_bloque     bloques;
  --  Variables sueltas y no "dias_entrega" como tipo: Postgres revisa los
  --  tipos declarados al crear la funcion, y esa tabla se crea despues
  --  (seccion 21). Las consultas si se resuelven al ejecutarse.
  v_abre_en    timestamptz;
  v_abre_ant   timestamptz;
  v_codigo_dia text;
  v_dia_cerrado boolean;
  v_semana     date;
  v_limite     int;
  v_usadas     int;
  v_persona    personas;
  v_cita       citas;
  v_codigo     text;
  v_intentos   int := 0;
  v_anticipada boolean := false;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if coalesce(trim(p_telefono), '') = '' then
    raise exception 'TELEFONO_REQUERIDO';
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

  select * into v_bloque from bloques where id = p_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
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

  v_semana := date_trunc('week', v_bloque.fecha)::date;

  -- ----------------------------------------------------------
  --  Tope por dispositivo
  -- ----------------------------------------------------------
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
      from citas
     where dispositivo_id = p_dispositivo
       and semana = v_semana
       and estado <> 'cancelada';

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

revoke execute on function registrar_y_reservar(text, text, uuid, text, text, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, uuid, text, text, text, text) to anon, authenticated;


-- ============================================================
--  20. REGISTRO DESDE EL PANEL, ahora rechaza fechas cerradas
-- ============================================================

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

  --  El admin puede registrar aunque el dia no se haya abierto al publico,
  --  pero no en un dia cerrado (dia festivo, entrega cancelada).
  --  "d.fecha" calificado: sin prefijo chocaria con la columna "fecha" que
  --  devuelve esta funcion.
  if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
    raise exception 'DIA_CERRADO';
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
