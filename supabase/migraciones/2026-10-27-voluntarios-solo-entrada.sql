-- ============================================================
--  Cajita de Bendicion - Voluntarios: solo la entrada, pasar lista y
--  nota (seccion 52)
--
--  * De arranque se escanea SOLO la entrada; la salida se pone sola a la
--    hora de salida de siempre (6:30 PM, se cambia en Voluntarios). El modo
--    de antes (entrada y salida) se puede volver a escoger.
--  * Pasar lista: la entrada de hoy de varios a la vez, a una hora.
--  * Anotar un dia pasado a varios a la vez (solo el administrador).
--  * Una nota por voluntario; cuantos dias vino.
--
--  Requiere las del 20, 23 y 24 de octubre (voluntarios). No toca citas,
--  cupos ni las entregas: se puede correr aunque este la entrega. Correrla
--  ANTES de subir las pantallas nuevas. Se puede repetir.
-- ============================================================

begin;

--  Pedido del 26 de octubre de 2026: mucha gente no escaneaba su salida,
--  y algunos ni su entrada. Y una mejor forma de llevar a los voluntarios.
--
--  * Modo "solo la entrada" (configuracion voluntarios_modo, el de
--    arranque): al llegar se escanea su credencial y listo. Escanearla
--    otra vez dice que ya esta anotado y nunca lo saca, ni le abre otra
--    entrada ese dia (por costumbre la escanean al irse). La salida se
--    pone sola a la hora de salida de siempre (voluntarios_hora_salida,
--    6:30 PM de arranque), en cuanto pasa esa hora y alguien abre
--    Voluntarios o escanea; o antes, a mano, con "terminar el dia". Quien
--    se va temprano: "se fue temprano" (salida_temprana_voluntario).
--    Quien entro despues de la hora de salida se queda adentro ese dia; al
--    otro dia queda "sin salida", para corregirla.
--  * Modo "entrada y salida": como en la seccion 48.
--  * Pasar lista: la entrada de hoy de varios a la vez, a una hora (los que
--    llegaron y no escanearon). Lo hace quien atiende voluntarios.
--  * Anotar un dia pasado a varios a la vez, con entrada, salida y motivo.
--    Solo el administrador, como agregar una asistencia.
--  * Una nota interna por voluntario. En la lista, cuantos dias vino (en
--    total y en los ultimos 30).
--  * Cada asistencia guarda como se anoto (origen: qr, nombre, lista,
--    agregada o dia_pasado) y si su salida se puso sola.
--
--  El candado de siempre: cada voluntario se bloquea (for update) antes de
--  anotarle algo, asi que pasar lista y escanear al mismo tiempo no le
--  abren dos entradas (y el indice unico parcial de la seccion 48 lo
--  sostiene de todos modos).

alter table voluntarios add column if not exists nota  text;

alter table asistencias_voluntarios add column if not exists origen text;
alter table asistencias_voluntarios add column if not exists salida_automatica boolean not null default false;
alter table asistencias_voluntarios drop constraint if exists asistencias_voluntarios_origen_check;
alter table asistencias_voluntarios add constraint asistencias_voluntarios_origen_check
  check (origen is null or origen in ('qr', 'nombre', 'lista', 'agregada', 'dia_pasado'));

insert into configuracion (clave, valor, nota) values
  ('voluntarios_modo', 'solo_entrada',
   'Como se anota la asistencia de los voluntarios: solo_entrada (se escanea al llegar; ' ||
   'la salida se pone sola a la hora de salida) o entrada_salida (se escanea al llegar ' ||
   'y al irse). Se cambia en Voluntarios.'),
  ('voluntarios_hora_salida', '18:30',
   'Con solo_entrada: a que hora (San Diego, 24 horas) se pone sola la salida de quienes ' ||
   'siguen adentro. Se cambia en Voluntarios.')
on conflict (clave) do nothing;


--  "  Solo   puede los lunes " -> "Solo puede los lunes"; vacio, nulo.
create or replace function limpiar_texto_voluntario(p_texto text, p_maximo int, p_error text)
returns text
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v_texto text := nullif(regexp_replace(trim(coalesce(p_texto, '')), '\s+', ' ', 'g'), '');
begin
  if char_length(v_texto) > p_maximo then
    raise exception '%', p_error;
  end if;
  return v_texto;
end;
$$;

revoke execute on function limpiar_texto_voluntario(text, int, text) from public, anon, authenticated;


--  El modo de hoy: solo_entrada (el de arranque) o entrada_salida.
create or replace function modo_voluntarios()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when (select c.valor from configuracion c where c.clave = 'voluntarios_modo') = 'entrada_salida'
              then 'entrada_salida' else 'solo_entrada' end;
$$;

--  La hora de salida de siempre (6:30 PM si no se ha escogido).
create or replace function hora_salida_voluntarios()
returns time
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select case when c.valor ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then c.valor::time end
                     from configuracion c where c.clave = 'voluntarios_hora_salida'),
                  time '18:30');
$$;

revoke execute on function modo_voluntarios() from public, anon, authenticated;
revoke execute on function hora_salida_voluntarios() from public, anon, authenticated;


--  La salida que se pone sola (modo solo la entrada): a quien sigue adentro
--  de un dia cuya hora de salida ya paso, esa hora. Quien entro despues de
--  esa hora: si es de hoy sigue adentro; si es de otro dia, queda sin
--  salida. Devuelve cuantas salidas puso. En modo entrada y salida no hace
--  nada (ahi una entrada vieja abierta es un olvido, seccion 48).
create or replace function poner_salidas_automaticas()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_hora    time := hora_salida_voluntarios();
  v_cuantos int;
begin
  if modo_voluntarios() <> 'solo_entrada' then
    return 0;
  end if;

  with salidas as (
    select a.id, ((a.entrada_en at time zone 'America/Los_Angeles')::date + v_hora)
                   at time zone 'America/Los_Angeles' as salida
      from asistencias_voluntarios a
     where a.estado = 'dentro'
  )
  update asistencias_voluntarios a
     set salida_en         = s.salida,
         estado            = 'salio',
         salida_automatica = true
    from salidas s
   where a.id = s.id
     and s.salida <= now()
     and s.salida > a.entrada_en;

  get diagnostics v_cuantos = row_count;

  update asistencias_voluntarios a
     set estado = 'sin_salida'
   where a.estado = 'dentro'
     and (a.entrada_en at time zone 'America/Los_Angeles')::date < current_date;

  return v_cuantos;
end;
$$;

revoke execute on function poner_salidas_automaticas() from public, anon, authenticated;


--  Al abrir Voluntarios: poner las salidas que ya tocan. Devuelve cuantas.
create or replace function voluntarios_al_dia()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_atender_voluntarios();
  return poner_salidas_automaticas();
end;
$$;

revoke execute on function voluntarios_al_dia() from public, anon;
grant  execute on function voluntarios_al_dia() to authenticated;


--  Como se anota la asistencia: el modo y la hora de salida de siempre.
create or replace function ajustes_voluntarios()
returns table (modo text, hora_salida time)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_atender_voluntarios();
  return query select modo_voluntarios(), hora_salida_voluntarios();
end;
$$;

revoke execute on function ajustes_voluntarios() from public, anon;
grant  execute on function ajustes_voluntarios() to authenticated;


--  Cambiarlos: solo el administrador.
create or replace function guardar_ajustes_voluntarios(p_modo text, p_hora_salida time)
returns table (modo text, hora_salida time)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
begin
  perform exigir_rol(array['admin']);

  if p_modo is null or p_modo not in ('solo_entrada', 'entrada_salida') then
    raise exception 'MODO_INVALIDO';
  end if;

  if p_hora_salida is null then
    raise exception 'HORA_INVALIDA';
  end if;

  insert into configuracion (clave, valor) values ('voluntarios_modo', p_modo)
  on conflict (clave) do update set valor = excluded.valor;

  insert into configuracion (clave, valor) values ('voluntarios_hora_salida', to_char(p_hora_salida, 'HH24:MI'))
  on conflict (clave) do update set valor = excluded.valor;

  return query select p_modo, date_trunc('minute', p_hora_salida::interval)::time;
end;
$$;

revoke execute on function guardar_ajustes_voluntarios(text, time) from public, anon;
grant  execute on function guardar_ajustes_voluntarios(text, time) to authenticated;


--  Se fue temprano: su salida de hoy, a esa hora (o ahora). Devuelve sus
--  minutos. Sirve en los dos modos.
create or replace function salida_temprana_voluntario(p_asistencia bigint, p_hora time default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_a      asistencias_voluntarios;
  v_salida timestamptz := coalesce((current_date + p_hora) at time zone 'America/Los_Angeles', now());
begin
  perform exigir_atender_voluntarios();

  select * into v_a from asistencias_voluntarios a where a.id = p_asistencia for update;

  if v_a.id is null or v_a.estado <> 'dentro'
     or (v_a.entrada_en at time zone 'America/Los_Angeles')::date <> current_date then
    raise exception 'SIN_ENTRADA_ABIERTA';
  end if;

  if v_salida > now() then
    raise exception 'HORA_FUTURA';
  end if;

  if v_salida <= v_a.entrada_en then
    raise exception 'HORAS_INVALIDAS';
  end if;

  update asistencias_voluntarios a
     set salida_en = v_salida, salida_por = auth.uid(), estado = 'salio'
   where a.id = p_asistencia;

  return floor(extract(epoch from v_salida - v_a.entrada_en) / 60)::int;
end;
$$;

revoke execute on function salida_temprana_voluntario(bigint, time) from public, anon;
grant  execute on function salida_temprana_voluntario(bigint, time) to authenticated;


--  Pasar lista: la entrada de hoy, a esa hora (o ahora), de varios a la
--  vez. Por cada uno contesta:
--    ENTRADA    quedo anotado.
--    YA_ENTRO   ya estaba adentro.
--    YA_VINO    ya tiene una asistencia de hoy que termina despues de esa
--               hora (vino y se fue, o se encimaria).
--    INACTIVO   esta dado de baja.
--    NO_EXISTE  ese voluntario no existe.
create or replace function pasar_lista_voluntarios(p_voluntarios uuid[], p_hora time default null)
returns table (voluntario_id uuid, nombre text, resultado text, asistencia_id bigint)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
declare
  v_entrada timestamptz := coalesce((current_date + p_hora) at time zone 'America/Los_Angeles', now());
  v_id      uuid;
  v_vol     voluntarios;
  v_asis    bigint;
begin
  perform exigir_atender_voluntarios();

  if coalesce(cardinality(p_voluntarios), 0) = 0 or cardinality(p_voluntarios) > 300 then
    raise exception 'LISTA_INVALIDA';
  end if;

  if v_entrada > now() then
    raise exception 'HORA_FUTURA';
  end if;

  perform poner_salidas_automaticas();

  for v_id in select distinct u from unnest(p_voluntarios) u where u is not null loop
    --  Bloquear al voluntario, como al escanear.
    select * into v_vol from voluntarios v where v.id = v_id for update;

    if v_vol.id is null then
      return query select v_id, null::text, 'NO_EXISTE'::text, null::bigint;
      continue;
    end if;

    if not v_vol.activo then
      return query select v_vol.id, v_vol.nombre, 'INACTIVO'::text, null::bigint;
      continue;
    end if;

    --  Una entrada abierta de otro dia (modo entrada y salida): se fue sin marcar.
    update asistencias_voluntarios a
       set estado = 'sin_salida'
     where a.voluntario_id = v_vol.id and a.estado = 'dentro'
       and (a.entrada_en at time zone 'America/Los_Angeles')::date < current_date;

    if exists (select 1 from asistencias_voluntarios a where a.voluntario_id = v_vol.id and a.estado = 'dentro') then
      return query select v_vol.id, v_vol.nombre, 'YA_ENTRO'::text, null::bigint;
      continue;
    end if;

    if exists (select 1 from asistencias_voluntarios a
                where a.voluntario_id = v_vol.id and a.estado <> 'anulada'
                  and coalesce(a.salida_en, a.entrada_en + interval '1 minute') > v_entrada) then
      return query select v_vol.id, v_vol.nombre, 'YA_VINO'::text, null::bigint;
      continue;
    end if;

    insert into asistencias_voluntarios (voluntario_id, entrada_en, entrada_por, origen)
    values (v_vol.id, v_entrada, auth.uid(), 'lista')
    returning id into v_asis;

    return query select v_vol.id, v_vol.nombre, 'ENTRADA'::text, v_asis;
  end loop;
end;
$$;

revoke execute on function pasar_lista_voluntarios(uuid[], time) from public, anon;
grant  execute on function pasar_lista_voluntarios(uuid[], time) to authenticated;


--  Un dia que no se escaneo (o casi nadie): la asistencia completa de
--  varios a la vez, con entrada, salida y motivo. Solo el administrador.
--  Por cada uno: ANOTADA, YA_VINO (se encima con otra suya) o NO_EXISTE.
--  Los dados de baja si se anotan: ese dia pudieron haber venido.
create or replace function anotar_dia_voluntarios(
  p_voluntarios uuid[],
  p_fecha       date,
  p_entrada     time,
  p_salida      time,
  p_motivo      text
)
returns table (voluntario_id uuid, nombre text, resultado text, asistencia_id bigint)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
declare
  v_motivo  text := nullif(trim(coalesce(p_motivo, '')), '');
  v_entrada timestamptz := (p_fecha + p_entrada) at time zone 'America/Los_Angeles';
  v_salida  timestamptz := (p_fecha + p_salida) at time zone 'America/Los_Angeles';
  v_id      uuid;
  v_vol     voluntarios;
  v_asis    bigint;
begin
  perform exigir_rol(array['admin']);

  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  if coalesce(cardinality(p_voluntarios), 0) = 0 or cardinality(p_voluntarios) > 300 then
    raise exception 'LISTA_INVALIDA';
  end if;

  if p_fecha is null or p_fecha < current_date - 400 then
    raise exception 'RANGO_INVALIDO';
  end if;

  if v_entrada is null or v_salida is null or v_salida <= v_entrada
     or v_salida - v_entrada > interval '16 hours' then
    raise exception 'HORAS_INVALIDAS';
  end if;

  if v_salida > now() then
    raise exception 'HORA_FUTURA';
  end if;

  for v_id in select distinct u from unnest(p_voluntarios) u where u is not null loop
    select * into v_vol from voluntarios v where v.id = v_id for update;

    if v_vol.id is null then
      return query select v_id, null::text, 'NO_EXISTE'::text, null::bigint;
      continue;
    end if;

    if exists (
      select 1
        from asistencias_voluntarios a
       where a.voluntario_id = v_vol.id
         and a.estado <> 'anulada'
         and tstzrange(a.entrada_en,
                       case when a.salida_en is not null then a.salida_en
                            when a.estado = 'dentro' then greatest(now(), a.entrada_en + interval '1 minute')
                            else a.entrada_en + interval '1 minute' end)
             && tstzrange(v_entrada, v_salida)
    ) then
      return query select v_vol.id, v_vol.nombre, 'YA_VINO'::text, null::bigint;
      continue;
    end if;

    insert into asistencias_voluntarios
      (voluntario_id, entrada_en, salida_en, estado, entrada_por, salida_por,
       corregida_por, corregida_en, motivo, origen)
    values
      (v_vol.id, v_entrada, v_salida, 'salio', auth.uid(), auth.uid(),
       auth.uid(), now(), left(v_motivo, 200), 'dia_pasado')
    returning id into v_asis;

    return query select v_vol.id, v_vol.nombre, 'ANOTADA'::text, v_asis;
  end loop;
end;
$$;

revoke execute on function anotar_dia_voluntarios(uuid[], date, time, time, text) from public, anon;
grant  execute on function anotar_dia_voluntarios(uuid[], date, time, time, text) to authenticated;


-- ------------------------------------------------------------
--  Lo que cambio de la seccion 48
-- ------------------------------------------------------------

drop function if exists registrar_voluntario(text, text);
--  Seccion 52: le crecio la nota. (La de seis parametros fue una version de prueba
--  que no se quedo.)
drop function if exists registrar_voluntario(text, text, text, text);
drop function if exists registrar_voluntario(text, text, text, text, text, text);

create or replace function registrar_voluntario(
  p_nombre   text,
  p_contacto text default null,
  p_telefono text default null,
  p_correo   text default null,
  p_nota     text default null
)
returns table (id uuid, nombre text, token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_vol voluntarios;
  v_tel text;
  v_cor text;
begin
  perform exigir_atender_voluntarios();

  select c.telefono, c.correo into v_tel, v_cor
    from contacto_de_voluntario(p_contacto, p_telefono, p_correo) c;

  insert into voluntarios (nombre, telefono, correo, nota, token, creado_por)
  values (limpiar_nombre_voluntario(p_nombre),
          v_tel,
          v_cor,
          limpiar_texto_voluntario(p_nota, 300, 'NOTA_MUY_LARGA'),
          'vol' || encode(gen_random_bytes(24), 'hex'),
          auth.uid())
  returning * into v_vol;

  return query select v_vol.id, v_vol.nombre, v_vol.token;
end;
$$;

revoke execute on function registrar_voluntario(text, text, text, text, text) from public, anon;
grant  execute on function registrar_voluntario(text, text, text, text, text) to authenticated;


drop function if exists editar_voluntario(uuid, text, text);
--  Seccion 52: la nota. Nula, se queda como esta; en blanco, se quita. (La
--  de siete parametros fue una version de prueba que no se quedo.)
drop function if exists editar_voluntario(uuid, text, text, text, text);
drop function if exists editar_voluntario(uuid, text, text, text, text, text, text);

create or replace function editar_voluntario(
  p_id       uuid,
  p_nombre   text,
  p_contacto text default null,
  p_telefono text default null,
  p_correo   text default null,
  p_nota     text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tel text;
  v_cor text;
begin
  perform exigir_atender_voluntarios();

  select c.telefono, c.correo into v_tel, v_cor
    from contacto_de_voluntario(p_contacto, p_telefono, p_correo) c;

  update voluntarios v
     set nombre         = limpiar_nombre_voluntario(p_nombre),
         telefono       = v_tel,
         correo         = v_cor,
         contacto       = null,
         nota           = case when p_nota is null then v.nota
                               else limpiar_texto_voluntario(p_nota, 300, 'NOTA_MUY_LARGA') end,
         actualizado_en = now()
   where v.id = p_id;

  if not found then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  return 'GUARDADO';
end;
$$;

revoke execute on function editar_voluntario(uuid, text, text, text, text, text) from public, anon;
grant  execute on function editar_voluntario(uuid, text, text, text, text, text) to authenticated;


drop function if exists listar_voluntarios();

create or replace function listar_voluntarios()
returns table (
  id             uuid,
  nombre         text,
  telefono       text,
  correo         text,
  contacto_viejo text,
  token          text,
  activo         boolean,
  creado_en      timestamp,
  dentro_desde   timestamp,
  ultima_entrada timestamp,
  sin_salida     int,
  enviada_en     timestamp,
  enviada_medio  text,
  nota           text,
  visitas        int,
  visitas_30     int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_atender_voluntarios();

  return query
  select v.id, v.nombre, v.telefono, v.correo,
         case when v.telefono is null and v.correo is null then v.contacto end,
         v.token, v.activo,
         v.creado_en at time zone 'America/Los_Angeles',
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
                  or (a.estado = 'dentro' and (a.entrada_en at time zone 'America/Los_Angeles')::date < current_date))),
         env.enviada_en at time zone 'America/Los_Angeles',
         env.medio,
         v.nota,
         (select count(distinct (a.entrada_en at time zone 'America/Los_Angeles')::date)::int
            from asistencias_voluntarios a
           where a.voluntario_id = v.id and a.estado <> 'anulada'),
         (select count(distinct (a.entrada_en at time zone 'America/Los_Angeles')::date)::int
            from asistencias_voluntarios a
           where a.voluntario_id = v.id and a.estado <> 'anulada'
             and a.entrada_en >= now() - interval '30 days')
    from voluntarios v
    left join lateral (
      select e.enviada_en, e.medio
        from credenciales_enviadas e
       where e.voluntario_id = v.id and e.enviada_en >= v.credencial_desde
       order by e.enviada_en desc, e.id desc
       limit 1
    ) env on true
   order by v.activo desc, v.nombre;
end;
$$;

revoke execute on function listar_voluntarios() from public, anon;
grant  execute on function listar_voluntarios() to authenticated;


drop function if exists credencial_voluntario(text);

create or replace function credencial_voluntario(p_token text)
returns table (nombre text, activo boolean, dias int, minutos int, solo_entrada boolean)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select v.nombre, v.activo,
         (select count(distinct (a.entrada_en at time zone 'America/Los_Angeles')::date)::int
            from asistencias_voluntarios a where a.voluntario_id = v.id and a.estado = 'salio'),
         (select coalesce(sum(floor(extract(epoch from a.salida_en - a.entrada_en) / 60)), 0)::int
            from asistencias_voluntarios a where a.voluntario_id = v.id and a.estado = 'salio'),
         coalesce((select c.valor from configuracion c where c.clave = 'voluntarios_modo'), '') <> 'entrada_salida'
    from voluntarios v
   where v.token = lower(trim(coalesce(p_token, '')));
$$;

revoke execute on function credencial_voluntario(text) from public;
grant  execute on function credencial_voluntario(text) to anon, authenticated;


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
  v_modo    text;
begin
  perform exigir_atender_voluntarios();

  perform poner_salidas_automaticas();
  v_modo := modo_voluntarios();

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
    if v_modo = 'solo_entrada' or v_abierta.entrada_en > now() - interval '2 minutes' then
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

  --  Acaba de salir: es el mismo telefono leido otra vez. En modo solo la
  --  entrada, cualquier salida de hoy: por costumbre la escanean al irse.
  select * into v_ultima
    from asistencias_voluntarios a
   where a.voluntario_id = v_vol.id and a.estado = 'salio'
     and (a.salida_en > now() - interval '2 minutes'
          or (v_modo = 'solo_entrada'
              and (a.entrada_en at time zone 'America/Los_Angeles')::date = current_date))
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

  insert into asistencias_voluntarios (voluntario_id, entrada_por, origen)
  values (v_vol.id, auth.uid(), case when p_voluntario is not null then 'nombre' else 'qr' end)
  returning * into v_abierta;

  return query select 'ENTRADA'::text, v_abierta.id, v_vol.id, v_vol.nombre,
                      v_abierta.entrada_en at time zone 'America/Los_Angeles',
                      null::timestamp, null::int, v_olvido;
end;
$$;

revoke execute on function marcar_asistencia(text, uuid) from public, anon;
grant  execute on function marcar_asistencia(text, uuid) to authenticated;


drop function if exists asistencias_del_dia(date);

create or replace function asistencias_del_dia(p_fecha date default null)
returns table (
  id                bigint,
  voluntario_id     uuid,
  nombre            text,
  entrada           timestamp,
  salida            timestamp,
  minutos           int,
  estado            text,
  origen            text,
  salida_automatica boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_atender_voluntarios();

  return query
  select a.id, v.id, v.nombre,
         a.entrada_en at time zone 'America/Los_Angeles',
         a.salida_en at time zone 'America/Los_Angeles',
         floor(extract(epoch from a.salida_en - a.entrada_en) / 60)::int,
         a.estado,
         a.origen,
         a.salida_automatica
    from asistencias_voluntarios a
    join voluntarios v on v.id = a.voluntario_id
   where (a.entrada_en at time zone 'America/Los_Angeles')::date = coalesce(p_fecha, current_date)
     and a.estado <> 'anulada'
   order by a.entrada_en;
end;
$$;

revoke execute on function asistencias_del_dia(date) from public, anon;
grant  execute on function asistencias_del_dia(date) to authenticated;


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
    (voluntario_id, entrada_en, salida_en, estado, entrada_por, salida_por, corregida_por, corregida_en, motivo, origen)
  values
    (p_voluntario, v_entrada, v_salida, 'salio', auth.uid(), auth.uid(), auth.uid(), now(), left(v_motivo, 200), 'agregada')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function agregar_asistencia(uuid, timestamp, timestamp, text) from public, anon;
grant  execute on function agregar_asistencia(uuid, timestamp, timestamp, text) to authenticated;


drop function if exists asistencias_de_voluntario(uuid, date, date);

create or replace function asistencias_de_voluntario(p_voluntario uuid, p_desde date, p_hasta date)
returns table (
  id                bigint,
  fecha             date,
  entrada           timestamp,
  salida            timestamp,
  minutos           int,
  estado            text,
  corregida         boolean,
  motivo            text,
  salida_automatica boolean,
  origen            text
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
         a.motivo,
         a.salida_automatica,
         a.origen
    from asistencias_voluntarios a
   where a.voluntario_id = p_voluntario
     and (a.entrada_en at time zone 'America/Los_Angeles')::date between p_desde and p_hasta
   order by a.entrada_en desc;
end;
$$;

revoke execute on function asistencias_de_voluntario(uuid, date, date) from public, anon;
grant  execute on function asistencias_de_voluntario(uuid, date, date) to authenticated;

commit;
