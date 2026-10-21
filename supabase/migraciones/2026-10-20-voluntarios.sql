-- ============================================================
--  Cajita de Bendicion - Voluntarios: credencial, entrada y salida (seccion 48)
--
--  Pedido del 20 de octubre de 2026 (Pastor David): las horas de servicio
--  de los voluntarios. Cada voluntario tiene una credencial con QR
--  permanente (solo su nombre y, si quiere, un contacto); un administrador
--  la escanea en "Voluntarios" al llegar y al irse.
--
--  Tablas nuevas: voluntarios y asistencias_voluntarios. No toca citas,
--  cupos ni registrar_entrega(): se puede correr aunque este la entrega.
--  Correrla ANTES de subir las pantallas nuevas. Se puede repetir.
-- ============================================================

begin;

--  Pedido del 20 de octubre de 2026 (Pastor David), la fase 3: las horas
--  de servicio de los voluntarios. Cada voluntario tiene una credencial
--  con un QR permanente. Al llegar y al irse se reporta con un
--  administrador, que la escanea en "Voluntarios": si no ha entrado, es su
--  entrada; si ya entro, su salida.
--
--  * No es una cuenta del panel: solo su nombre y, si quiere, un telefono
--    o correo para mandarle su credencial. Las cuentas siguen siendo para
--    quien usa el panel (Equipo y accesos).
--  * El codigo empieza con "vol": el escaner de la despensa sabe que es una
--    credencial y no una cita, y lo dice.
--  * Solo administradores registran, escanean, corrigen y ven las horas.
--  * Una sola entrada abierta por voluntario: lo asegura un indice unico
--    parcial, y al escanear se bloquea la fila del voluntario, asi que dos
--    escaneos al mismo tiempo no abren dos entradas.
--  * Leerlo otra vez en los primeros 2 minutos no lo saca ni lo vuelve a
--    meter (YA_ENTRO, YA_SALIO): es el mismo telefono leido dos veces.
--    En ese plazo, "Deshacer" quita la entrada o reabre la salida.
--  * Si se fue sin marcar salida, su entrada queda "sin salida" y no suma
--    horas hasta que el administrador la corrige. Corregir, agregar o
--    anular piden motivo y guardan quien y cuando: no se borra nada.

create table if not exists voluntarios (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  --  Telefono o correo, opcional: solo para mandarle su credencial.
  contacto       text,
  --  Lo que lleva el QR: "vol" y 24 bytes al azar. Sin datos adentro.
  token          text not null unique,
  activo         boolean not null default true,
  creado_por     uuid,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists asistencias_voluntarios (
  id            bigint generated always as identity primary key,
  voluntario_id uuid not null references voluntarios(id) on delete restrict,
  entrada_en    timestamptz not null default now(),
  salida_en     timestamptz,
  --  dentro: entro y no ha salido. salio: completa, suma horas.
  --  sin_salida: se fue sin marcar, no suma. anulada: fue por error.
  estado        text not null default 'dentro'
                check (estado in ('dentro', 'salio', 'sin_salida', 'anulada')),
  entrada_por   uuid,
  salida_por    uuid,
  corregida_por uuid,
  corregida_en  timestamptz,
  motivo        text,
  check (salida_en is null or salida_en > entrada_en),
  check (estado <> 'salio' or salida_en is not null),
  check (estado not in ('dentro', 'sin_salida') or salida_en is null)
);

--  Una sola entrada abierta por voluntario.
create unique index if not exists idx_asistencia_abierta
  on asistencias_voluntarios (voluntario_id) where estado = 'dentro';
create index if not exists idx_asistencias_entrada on asistencias_voluntarios (entrada_en);

alter table voluntarios             enable row level security;
alter table asistencias_voluntarios enable row level security;


-- ------------------------------------------------------------
--  Registrar, cambiar y dar de baja
-- ------------------------------------------------------------

--  "  Juana   Lopez " -> "Juana Lopez". De 2 a 80 letras.
create or replace function limpiar_nombre_voluntario(p_nombre text)
returns text
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v_nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if char_length(v_nombre) not between 2 and 80 then
    raise exception 'NOMBRE_INVALIDO';
  end if;
  return v_nombre;
end;
$$;

--  El contacto (telefono o correo) es opcional: vacio queda nulo.
create or replace function limpiar_contacto_voluntario(p_contacto text)
returns text
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v_contacto text := nullif(regexp_replace(trim(coalesce(p_contacto, '')), '\s+', ' ', 'g'), '');
begin
  if char_length(v_contacto) > 120 then
    raise exception 'CONTACTO_INVALIDO';
  end if;
  return v_contacto;
end;
$$;

revoke execute on function limpiar_nombre_voluntario(text) from public, anon, authenticated;
revoke execute on function limpiar_contacto_voluntario(text) from public, anon, authenticated;


create or replace function registrar_voluntario(p_nombre text, p_contacto text default null)
returns table (id uuid, nombre text, token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_vol voluntarios;
begin
  perform exigir_rol(array['admin']);

  insert into voluntarios (nombre, contacto, token, creado_por)
  values (limpiar_nombre_voluntario(p_nombre),
          limpiar_contacto_voluntario(p_contacto),
          'vol' || encode(gen_random_bytes(24), 'hex'),
          auth.uid())
  returning * into v_vol;

  return query select v_vol.id, v_vol.nombre, v_vol.token;
end;
$$;

revoke execute on function registrar_voluntario(text, text) from public, anon;
grant  execute on function registrar_voluntario(text, text) to authenticated;


create or replace function editar_voluntario(p_id uuid, p_nombre text, p_contacto text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  update voluntarios v
     set nombre         = limpiar_nombre_voluntario(p_nombre),
         contacto       = limpiar_contacto_voluntario(p_contacto),
         actualizado_en = now()
   where v.id = p_id;

  if not found then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  return 'GUARDADO';
end;
$$;

revoke execute on function editar_voluntario(uuid, text, text) from public, anon;
grant  execute on function editar_voluntario(uuid, text, text) to authenticated;


--  Dar de baja (o de alta otra vez). Su credencial deja de marcar entrada,
--  y si estaba adentro, esa entrada queda "sin salida" para corregirla.
create or replace function activar_voluntario(p_id uuid, p_activo boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  update voluntarios v
     set activo = coalesce(p_activo, true), actualizado_en = now()
   where v.id = p_id;

  if not found then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  if not coalesce(p_activo, true) then
    update asistencias_voluntarios a
       set estado = 'sin_salida'
     where a.voluntario_id = p_id and a.estado = 'dentro';
  end if;

  return coalesce(p_activo, true);
end;
$$;

revoke execute on function activar_voluntario(uuid, boolean) from public, anon;
grant  execute on function activar_voluntario(uuid, boolean) to authenticated;


--  Otra credencial: la vieja deja de servir al momento (si se perdio o la
--  trae alguien mas).
create or replace function nuevo_qr_voluntario(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text;
begin
  perform exigir_rol(array['admin']);

  update voluntarios v
     set token = 'vol' || encode(gen_random_bytes(24), 'hex'), actualizado_en = now()
   where v.id = p_id
  returning v.token into v_token;

  if v_token is null then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  return v_token;
end;
$$;

revoke execute on function nuevo_qr_voluntario(uuid) from public, anon;
grant  execute on function nuevo_qr_voluntario(uuid) to authenticated;


--  Todos, los activos primero. dentro_desde: si hoy esta adentro, desde
--  cuando. sin_salida: cuantas veces se fue sin marcar y falta corregir.
create or replace function listar_voluntarios()
returns table (
  id             uuid,
  nombre         text,
  contacto       text,
  token          text,
  activo         boolean,
  dentro_desde   timestamp,
  ultima_entrada timestamp,
  sin_salida     int
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
  select v.id, v.nombre, v.contacto, v.token, v.activo,
         (select a.entrada_en at time zone 'America/Los_Angeles'
            from asistencias_voluntarios a
           where a.voluntario_id = v.id and a.estado = 'dentro'
             and (a.entrada_en at time zone 'America/Los_Angeles')::date = current_date),
         (select max(a.entrada_en) at time zone 'America/Los_Angeles'
            from asistencias_voluntarios a
           where a.voluntario_id = v.id and a.estado <> 'anulada'),
         (select count(*)::int
            from asistencias_voluntarios a
           where a.voluntario_id = v.id
             and (a.estado = 'sin_salida'
                  or (a.estado = 'dentro' and (a.entrada_en at time zone 'America/Los_Angeles')::date < current_date)))
    from voluntarios v
   order by v.activo desc, v.nombre;
end;
$$;

revoke execute on function listar_voluntarios() from public, anon;
grant  execute on function listar_voluntarios() to authenticated;


--  Lo que ve el voluntario con el enlace de su credencial: solo su nombre.
--  Quien tiene el enlace es el dueno, como con los pases.
create or replace function credencial_voluntario(p_token text)
returns table (nombre text, activo boolean)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select v.nombre, v.activo
    from voluntarios v
   where v.token = lower(trim(coalesce(p_token, '')));
$$;

revoke execute on function credencial_voluntario(text) from public;
grant  execute on function credencial_voluntario(text) to anon, authenticated;


-- ------------------------------------------------------------
--  Entrada y salida
-- ------------------------------------------------------------

--  Escanear su credencial (p_token) o, si no la trae, escogerlo de la lista
--  (p_voluntario). Contesta:
--    ENTRADA    no estaba adentro: entra. olvido: la fecha de una entrada
--               vieja que se quedo sin salida (se fue sin marcar).
--    SALIDA     estaba adentro: sale, con sus minutos.
--    YA_ENTRO   entro hace menos de 2 minutos: se leyo dos veces.
--    YA_SALIO   salio hace menos de 2 minutos: igual.
--    INACTIVO   esta dado de baja.
--    NO_EXISTE  ese QR no es de ningun voluntario.
create or replace function marcar_asistencia(p_token text default null, p_voluntario uuid default null)
returns table (
  resultado     text,
  asistencia_id bigint,
  voluntario_id uuid,
  nombre        text,
  entrada_en    timestamp,
  salida_en     timestamp,
  minutos       int,
  olvido        date
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
declare
  v_vol     voluntarios;
  v_abierta asistencias_voluntarios;
  v_ultima  asistencias_voluntarios;
  v_olvido  date;
begin
  perform exigir_rol(array['admin']);

  --  Bloquear al voluntario: dos escaneos al mismo tiempo van en fila.
  select * into v_vol
    from voluntarios v
   where (p_voluntario is not null and v.id = p_voluntario)
      or (p_voluntario is null and v.token = lower(trim(coalesce(p_token, ''))))
     for update;

  if v_vol.id is null then
    return query select 'NO_EXISTE'::text, null::bigint, null::uuid, null::text,
                        null::timestamp, null::timestamp, null::int, null::date;
    return;
  end if;

  if not v_vol.activo then
    return query select 'INACTIVO'::text, null::bigint, v_vol.id, v_vol.nombre,
                        null::timestamp, null::timestamp, null::int, null::date;
    return;
  end if;

  select * into v_abierta
    from asistencias_voluntarios a
   where a.voluntario_id = v_vol.id and a.estado = 'dentro';

  --  Una entrada de otro dia: se fue sin marcar salida. Queda para corregir.
  if v_abierta.id is not null and (v_abierta.entrada_en at time zone 'America/Los_Angeles')::date < current_date then
    update asistencias_voluntarios a set estado = 'sin_salida' where a.id = v_abierta.id;
    v_olvido := (v_abierta.entrada_en at time zone 'America/Los_Angeles')::date;
    v_abierta := null;
  end if;

  if v_abierta.id is not null then
    if v_abierta.entrada_en > now() - interval '2 minutes' then
      return query select 'YA_ENTRO'::text, v_abierta.id, v_vol.id, v_vol.nombre,
                          v_abierta.entrada_en at time zone 'America/Los_Angeles',
                          null::timestamp, null::int, null::date;
      return;
    end if;

    update asistencias_voluntarios a
       set salida_en = now(), salida_por = auth.uid(), estado = 'salio'
     where a.id = v_abierta.id
    returning * into v_abierta;

    return query select 'SALIDA'::text, v_abierta.id, v_vol.id, v_vol.nombre,
                        v_abierta.entrada_en at time zone 'America/Los_Angeles',
                        v_abierta.salida_en at time zone 'America/Los_Angeles',
                        floor(extract(epoch from v_abierta.salida_en - v_abierta.entrada_en) / 60)::int,
                        null::date;
    return;
  end if;

  --  Acaba de salir: es el mismo telefono leido otra vez.
  select * into v_ultima
    from asistencias_voluntarios a
   where a.voluntario_id = v_vol.id and a.estado = 'salio'
     and a.salida_en > now() - interval '2 minutes'
   order by a.salida_en desc
   limit 1;

  if v_ultima.id is not null then
    return query select 'YA_SALIO'::text, v_ultima.id, v_vol.id, v_vol.nombre,
                        v_ultima.entrada_en at time zone 'America/Los_Angeles',
                        v_ultima.salida_en at time zone 'America/Los_Angeles',
                        floor(extract(epoch from v_ultima.salida_en - v_ultima.entrada_en) / 60)::int,
                        null::date;
    return;
  end if;

  insert into asistencias_voluntarios (voluntario_id, entrada_por)
  values (v_vol.id, auth.uid())
  returning * into v_abierta;

  return query select 'ENTRADA'::text, v_abierta.id, v_vol.id, v_vol.nombre,
                      v_abierta.entrada_en at time zone 'America/Los_Angeles',
                      null::timestamp, null::int, v_olvido;
end;
$$;

revoke execute on function marcar_asistencia(text, uuid) from public, anon;
grant  execute on function marcar_asistencia(text, uuid) to authenticated;


--  Deshacer lo recien marcado (2 minutos): una entrada por error se quita;
--  una salida por error se reabre.
create or replace function deshacer_asistencia(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_a asistencias_voluntarios;
begin
  perform exigir_rol(array['admin']);

  select * into v_a from asistencias_voluntarios a where a.id = p_id for update;

  if v_a.id is null then
    raise exception 'ASISTENCIA_NO_EXISTE';
  end if;

  if v_a.estado = 'salio' and v_a.corregida_en is null and v_a.salida_en > now() - interval '2 minutes'
     and not exists (select 1 from asistencias_voluntarios a
                      where a.voluntario_id = v_a.voluntario_id and a.estado = 'dentro') then
    update asistencias_voluntarios a
       set salida_en = null, salida_por = null, estado = 'dentro'
     where a.id = p_id;
    return 'SALIDA_DESHECHA';
  end if;

  if v_a.estado = 'dentro' and v_a.entrada_en > now() - interval '2 minutes' then
    delete from asistencias_voluntarios a where a.id = p_id;
    return 'ENTRADA_DESHECHA';
  end if;

  raise exception 'FUERA_DE_PLAZO';
end;
$$;

revoke execute on function deshacer_asistencia(bigint) from public, anon;
grant  execute on function deshacer_asistencia(bigint) to authenticated;


--  Lo de un dia (hoy, si no se dice): quien entro, a que hora, y si ya
--  salio. Sin las anuladas.
create or replace function asistencias_del_dia(p_fecha date default null)
returns table (
  id            bigint,
  voluntario_id uuid,
  nombre        text,
  entrada       timestamp,
  salida        timestamp,
  minutos       int,
  estado        text
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
  select a.id, v.id, v.nombre,
         a.entrada_en at time zone 'America/Los_Angeles',
         a.salida_en at time zone 'America/Los_Angeles',
         floor(extract(epoch from a.salida_en - a.entrada_en) / 60)::int,
         a.estado
    from asistencias_voluntarios a
    join voluntarios v on v.id = a.voluntario_id
   where (a.entrada_en at time zone 'America/Los_Angeles')::date = coalesce(p_fecha, current_date)
     and a.estado <> 'anulada'
   order by a.entrada_en;
end;
$$;

revoke execute on function asistencias_del_dia(date) from public, anon;
grant  execute on function asistencias_del_dia(date) to authenticated;


-- ------------------------------------------------------------
--  Corregir, agregar y anular (con motivo)
-- ------------------------------------------------------------

--  Que las horas tengan sentido: la salida despues de la entrada, no mas
--  de 16 horas seguidas, nada en el futuro y sin encimarse con otra
--  asistencia del mismo voluntario. p_excepto: la que se esta corrigiendo.
create or replace function revisar_horas_asistencia(
  p_voluntario uuid,
  p_entrada    timestamptz,
  p_salida     timestamptz,
  p_excepto    bigint default null
)
returns void
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
begin
  if p_entrada is null or p_salida is null or p_salida <= p_entrada
     or p_salida - p_entrada > interval '16 hours' then
    raise exception 'HORAS_INVALIDAS';
  end if;

  if p_salida > now() then
    raise exception 'HORA_FUTURA';
  end if;

  if exists (
    select 1
      from asistencias_voluntarios a
     where a.voluntario_id = p_voluntario
       and a.id is distinct from p_excepto
       and a.estado <> 'anulada'
       and tstzrange(a.entrada_en,
                     case when a.salida_en is not null then a.salida_en
                          when a.estado = 'dentro' then greatest(now(), a.entrada_en + interval '1 minute')
                          else a.entrada_en + interval '1 minute' end)
           && tstzrange(p_entrada, p_salida)
  ) then
    raise exception 'TRASLAPE';
  end if;
end;
$$;

revoke execute on function revisar_horas_asistencia(uuid, timestamptz, timestamptz, bigint) from public, anon, authenticated;


--  Ponerle la hora correcta (o la salida que falto). Horas en San Diego.
create or replace function corregir_asistencia(p_id bigint, p_entrada timestamp, p_salida timestamp, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_a       asistencias_voluntarios;
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
  v_entrada timestamptz := p_entrada at time zone 'America/Los_Angeles';
  v_salida  timestamptz := p_salida at time zone 'America/Los_Angeles';
begin
  perform exigir_rol(array['admin']);

  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_a from asistencias_voluntarios a where a.id = p_id for update;

  if v_a.id is null then
    raise exception 'ASISTENCIA_NO_EXISTE';
  end if;

  if v_a.estado = 'anulada' then
    raise exception 'ASISTENCIA_ANULADA';
  end if;

  perform revisar_horas_asistencia(v_a.voluntario_id, v_entrada, v_salida, p_id);

  update asistencias_voluntarios a
     set entrada_en    = v_entrada,
         salida_en     = v_salida,
         salida_por    = coalesce(a.salida_por, auth.uid()),
         estado        = 'salio',
         corregida_por = auth.uid(),
         corregida_en  = now(),
         motivo        = left(v_motivo, 200)
   where a.id = p_id;

  return 'CORREGIDA';
end;
$$;

revoke execute on function corregir_asistencia(bigint, timestamp, timestamp, text) from public, anon;
grant  execute on function corregir_asistencia(bigint, timestamp, timestamp, text) to authenticated;


--  Una asistencia que no se escaneo (olvido su credencial y nadie lo
--  busco). Horas en San Diego.
create or replace function agregar_asistencia(p_voluntario uuid, p_entrada timestamp, p_salida timestamp, p_motivo text)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
  v_entrada timestamptz := p_entrada at time zone 'America/Los_Angeles';
  v_salida  timestamptz := p_salida at time zone 'America/Los_Angeles';
  v_id      bigint;
begin
  perform exigir_rol(array['admin']);

  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  --  Bloquear al voluntario, como al escanear.
  perform 1 from voluntarios v where v.id = p_voluntario for update;
  if not found then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  perform revisar_horas_asistencia(p_voluntario, v_entrada, v_salida);

  insert into asistencias_voluntarios
    (voluntario_id, entrada_en, salida_en, estado, entrada_por, salida_por, corregida_por, corregida_en, motivo)
  values
    (p_voluntario, v_entrada, v_salida, 'salio', auth.uid(), auth.uid(), auth.uid(), now(), left(v_motivo, 200))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function agregar_asistencia(uuid, timestamp, timestamp, text) from public, anon;
grant  execute on function agregar_asistencia(uuid, timestamp, timestamp, text) to authenticated;


--  Se registro por error (otro voluntario, otro dia): deja de sumar.
create or replace function anular_asistencia(p_id bigint, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  perform exigir_rol(array['admin']);

  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  update asistencias_voluntarios a
     set estado        = 'anulada',
         corregida_por = auth.uid(),
         corregida_en  = now(),
         motivo        = left(v_motivo, 200)
   where a.id = p_id and a.estado <> 'anulada';

  if not found then
    raise exception 'ASISTENCIA_NO_EXISTE';
  end if;

  return 'ANULADA';
end;
$$;

revoke execute on function anular_asistencia(bigint, text) from public, anon;
grant  execute on function anular_asistencia(bigint, text) to authenticated;


-- ------------------------------------------------------------
--  Las horas
-- ------------------------------------------------------------

--  Por voluntario, entre dos fechas: cuantos dias vino, cuantos minutos
--  (solo las completas) y cuantas se quedaron sin salida.
create or replace function horas_de_voluntarios(p_desde date, p_hasta date)
returns table (
  voluntario_id uuid,
  nombre        text,
  activo        boolean,
  dias          int,
  minutos       int,
  sin_salida    int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'RANGO_INVALIDO';
  end if;

  return query
  select v.id, v.nombre, v.activo,
         (count(distinct (a.entrada_en at time zone 'America/Los_Angeles')::date)
            filter (where a.estado = 'salio'))::int,
         coalesce(sum(floor(extract(epoch from a.salida_en - a.entrada_en) / 60))
            filter (where a.estado = 'salio'), 0)::int,
         (count(*) filter (where a.estado = 'sin_salida'
                             or (a.estado = 'dentro'
                                 and (a.entrada_en at time zone 'America/Los_Angeles')::date < current_date)))::int
    from voluntarios v
    join asistencias_voluntarios a on a.voluntario_id = v.id
   where (a.entrada_en at time zone 'America/Los_Angeles')::date between p_desde and p_hasta
     and a.estado <> 'anulada'
   group by v.id, v.nombre, v.activo
   order by v.nombre;
end;
$$;

revoke execute on function horas_de_voluntarios(date, date) from public, anon;
grant  execute on function horas_de_voluntarios(date, date) to authenticated;


--  Cada asistencia de un voluntario entre dos fechas, la mas nueva primero,
--  anuladas incluidas (para ver que paso).
create or replace function asistencias_de_voluntario(p_voluntario uuid, p_desde date, p_hasta date)
returns table (
  id        bigint,
  fecha     date,
  entrada   timestamp,
  salida    timestamp,
  minutos   int,
  estado    text,
  corregida boolean,
  motivo    text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 400 then
    raise exception 'RANGO_INVALIDO';
  end if;

  return query
  select a.id,
         (a.entrada_en at time zone 'America/Los_Angeles')::date,
         a.entrada_en at time zone 'America/Los_Angeles',
         a.salida_en at time zone 'America/Los_Angeles',
         floor(extract(epoch from a.salida_en - a.entrada_en) / 60)::int,
         case when a.estado = 'dentro'
                   and (a.entrada_en at time zone 'America/Los_Angeles')::date < current_date
              then 'sin_salida' else a.estado end,
         a.corregida_en is not null,
         a.motivo
    from asistencias_voluntarios a
   where a.voluntario_id = p_voluntario
     and (a.entrada_en at time zone 'America/Los_Angeles')::date between p_desde and p_hasta
   order by a.entrada_en desc;
end;
$$;

revoke execute on function asistencias_de_voluntario(uuid, date, date) from public, anon;
grant  execute on function asistencias_de_voluntario(uuid, date, date) to authenticated;

commit;
