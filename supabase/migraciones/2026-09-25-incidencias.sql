-- ============================================================
--  Cajita de Bendicion - Incidencias del dia
--
--  El camion llega tarde, llueve, dia festivo. Desde Horarios, el admin:
--    * anunciar_retraso(fecha, minutos, mensaje): aviso con la hora nueva
--    * mover_entrega(fecha, fecha_nueva, mensaje): todas las citas a otra
--      fecha con su mismo QR, codigo y hora
--    * cancelar_entrega(fecha, mensaje): se cancelan y el lugar queda libre
--  Mas: tabla incidencias (quien, cuando, a cuantas), incidencias_publicas()
--  e incidencia_de_cita(token) para lo que ve la gente, y
--  personas_a_avisar(fecha) para avisar por WhatsApp.
--
--  Requiere 2026-09-25-entregas-a-mano.sql. Se puede repetir.
-- ============================================================

begin;

-- ============================================================
--  36. INCIDENCIAS DEL DIA: RETRASO, MOVER O CANCELAR LA ENTREGA
-- ============================================================
--  El camion llega tarde, llueve, cae en dia festivo. Tres salidas, desde
--  Horarios y solo del administrador (decision del 25 de septiembre de 2026,
--  pendiente del visto bueno del pastor):
--
--    * retraso: nadie se mueve. Se avisa cuantos minutos y cada quien ve su
--      hora nueva, en el mismo orden de siempre. El QR se revisa por FECHA,
--      no por hora: un retraso no rompe nada.
--    * movida: todas las citas pasan a otra fecha con su mismo QR, su codigo
--      y su hora. La fecha original se cierra.
--    * cancelada: las citas se cancelan con el motivo y el lugar queda
--      libre para sacar otra. No cuentan como "no asistio".
--
--  No se recorren las demas fechas: moveria a gente que no tenia problema.
--  Queda quien lo decidio, cuando y a cuantas personas toco (incidencias).

create table if not exists incidencias (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  tipo         text not null check (tipo in ('retraso', 'movida', 'cancelada')),
  minutos      int,
  fecha_nueva  date,
  mensaje      text,
  afectadas    int not null default 0,
  creada_por   uuid not null,
  creada_en    timestamptz not null default now(),
  retirada_en  timestamptz,
  retirada_por uuid
);

alter table incidencias enable row level security;
revoke all on incidencias from anon, authenticated;

create index if not exists idx_incidencias_fecha       on incidencias (fecha);
create index if not exists idx_incidencias_fecha_nueva on incidencias (fecha_nueva);

--  Las citas movidas por una incidencia quedan en su historial como tales
--  (y no gastan el cambio de horario que le toca a la persona).
alter table movimientos_cita drop constraint if exists movimientos_cita_origen_check;
alter table movimientos_cita add constraint movimientos_cita_origen_check
  check (origen in ('publico', 'panel', 'incidencia'));

--  Una fecha que ya se movio o se cancelo no se vuelve a tocar por aqui.
create or replace function dia_ya_resuelto(p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1 from incidencias i
     where i.fecha = p_fecha and i.tipo in ('movida', 'cancelada') and i.retirada_en is null
  );
$$;

revoke execute on function dia_ya_resuelto(date) from public, anon, authenticated;


--  Retraso: cuantos minutos. El aviso nuevo reemplaza al anterior; con 0,
--  solo se quita.
create or replace function anunciar_retraso(p_fecha date, p_minutos int, p_mensaje text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_n       int;
begin
  perform exigir_rol(array['admin']);

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if not exists (select 1 from dias_entrega d where d.fecha = p_fecha) then
    raise exception 'DIA_NO_EXISTE';
  end if;

  if dia_ya_resuelto(p_fecha) then
    raise exception 'DIA_YA_RESUELTO';
  end if;

  if p_minutos is null or p_minutos < 0 or p_minutos > 480 then
    raise exception 'MINUTOS_INVALIDOS';
  end if;

  update incidencias
     set retirada_en  = now(),
         retirada_por = v_usuario
   where fecha = p_fecha and tipo = 'retraso' and retirada_en is null;

  if p_minutos = 0 then
    return 'RETIRADO';
  end if;

  select count(*)::int into v_n
    from citas c
    join bloques b on b.id = c.bloque_id
   where b.fecha = p_fecha and c.estado in ('reservada', 'llego');

  insert into incidencias (fecha, tipo, minutos, mensaje, afectadas, creada_por)
  values (p_fecha, 'retraso', p_minutos, nullif(regexp_replace(trim(coalesce(p_mensaje, '')), '\s+', ' ', 'g'), ''), v_n, v_usuario);

  return 'AVISADO';
end;
$$;

revoke execute on function anunciar_retraso(date, int, text) from public, anon;
grant  execute on function anunciar_retraso(date, int, text) to authenticated;


--  Mover la entrega completa a otra fecha. Cada cita conserva su QR, su
--  codigo y su hora. La fecha nueva no debe tener entrega: juntar dos dias
--  en uno pasaria del cupo. Si alguien ya tiene su cita de esa semana (la
--  regla de una por semana), esa se queda y se cuenta en sin_mover.
create or replace function mover_entrega(p_fecha date, p_fecha_nueva date, p_mensaje text default null)
returns table (
  movidas   int,
  sin_mover int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario   uuid := auth.uid();
  v_dia       dias_entrega;
  v_bloque    bloques;
  v_nuevo     uuid;
  v_cita      citas;
  v_movidas   int := 0;
  v_sin_mover int := 0;
begin
  perform exigir_rol(array['admin']);

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if p_fecha_nueva is null or p_fecha_nueva <= current_date or p_fecha_nueva = p_fecha then
    raise exception 'FECHA_NUEVA_INVALIDA';
  end if;

  select * into v_dia from dias_entrega d where d.fecha = p_fecha for update;
  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  if dia_ya_resuelto(p_fecha) then
    raise exception 'DIA_YA_RESUELTO';
  end if;

  if exists (select 1 from dias_entrega d where d.fecha = p_fecha_nueva) then
    raise exception 'FECHA_YA_TIENE_ENTREGA';
  end if;

  --  Mismo candado que reservar_cita(): quien estuviera reservando en este
  --  momento espera, y al seguir encuentra el horario cerrado.
  perform 1 from bloques b where b.fecha = p_fecha for update;

  --  La fecha nueva abre como la original, con el mismo codigo de
  --  suscriptores (el que ya se publico en Facebook sigue sirviendo).
  insert into dias_entrega (fecha, abre_en, abre_anticipado_en, codigo_anticipado)
  values (p_fecha_nueva, v_dia.abre_en, v_dia.abre_anticipado_en, v_dia.codigo_anticipado);

  for v_bloque in
    select * from bloques b where b.fecha = p_fecha order by b.hora, b.fila
  loop
    insert into bloques (fecha, hora, capacidad, fila, cerrado)
    values (p_fecha_nueva, v_bloque.hora, v_bloque.capacidad, v_bloque.fila, v_bloque.cerrado)
    returning id into v_nuevo;

    for v_cita in
      select * from citas c
       where c.bloque_id = v_bloque.id and c.estado in ('reservada', 'llego')
       order by c.creada_en
         for update
    loop
      begin
        update citas
           set bloque_id = v_nuevo,
               semana    = date_trunc('week', p_fecha_nueva)::date
         where id = v_cita.id;

        insert into movimientos_cita (cita_id, de_bloque_id, a_bloque_id, origen, usuario_id)
        values (v_cita.id, v_bloque.id, v_nuevo, 'incidencia', v_usuario);

        v_movidas := v_movidas + 1;
      exception when unique_violation then
        --  Ya tiene su cita de esa semana: se queda y se avisa aparte.
        v_sin_mover := v_sin_mover + 1;
      end;
    end loop;
  end loop;

  update bloques set cerrado = true where fecha = p_fecha;
  update dias_entrega set cerrado = true, actualizado_en = now() where fecha = p_fecha;

  --  El retraso que hubiera ya no aplica.
  update incidencias
     set retirada_en  = now(),
         retirada_por = v_usuario
   where fecha = p_fecha and tipo = 'retraso' and retirada_en is null;

  insert into incidencias (fecha, tipo, fecha_nueva, mensaje, afectadas, creada_por)
  values (p_fecha, 'movida', p_fecha_nueva, nullif(regexp_replace(trim(coalesce(p_mensaje, '')), '\s+', ' ', 'g'), ''), v_movidas, v_usuario);

  return query select v_movidas, v_sin_mover;
end;
$$;

revoke execute on function mover_entrega(date, date, text) from public, anon;
grant  execute on function mover_entrega(date, date, text) to authenticated;


--  Cancelar la entrega: las citas pendientes se cancelan con el motivo y el
--  lugar queda libre. Devuelve cuantas se cancelaron.
create or replace function cancelar_entrega(p_fecha date, p_mensaje text default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_motivo  text := nullif(regexp_replace(trim(coalesce(p_mensaje, '')), '\s+', ' ', 'g'), '');
  v_n       int;
begin
  perform exigir_rol(array['admin']);

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  perform 1 from dias_entrega d where d.fecha = p_fecha for update;
  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  if dia_ya_resuelto(p_fecha) then
    raise exception 'DIA_YA_RESUELTO';
  end if;

  --  Mismo candado que reservar_cita(), y el dia se cierra antes de soltarlo.
  perform 1 from bloques b where b.fecha = p_fecha for update;
  update bloques set cerrado = true where fecha = p_fecha;
  update dias_entrega set cerrado = true, actualizado_en = now() where fecha = p_fecha;

  update citas c
     set estado             = 'cancelada',
         cancelada_en       = now(),
         cancelada_por      = v_usuario,
         motivo_cancelacion = coalesce(v_motivo, 'Se cancelo la entrega de este dia')
    from bloques b
   where b.id = c.bloque_id
     and b.fecha = p_fecha
     and c.estado in ('reservada', 'llego');

  get diagnostics v_n = row_count;

  update incidencias
     set retirada_en  = now(),
         retirada_por = v_usuario
   where fecha = p_fecha and tipo = 'retraso' and retirada_en is null;

  insert into incidencias (fecha, tipo, mensaje, afectadas, creada_por)
  values (p_fecha, 'cancelada', v_motivo, v_n, v_usuario);

  return v_n;
end;
$$;

revoke execute on function cancelar_entrega(date, text) from public, anon;
grant  execute on function cancelar_entrega(date, text) to authenticated;


--  Para el aviso de la portada y el calendario: lo vigente de hoy en
--  adelante. Publico: no trae nombres ni nada de nadie.
create or replace function incidencias_publicas()
returns table (
  fecha       date,
  tipo        text,
  minutos     int,
  fecha_nueva date,
  mensaje     text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select i.fecha, i.tipo, i.minutos, i.fecha_nueva, i.mensaje
    from incidencias i
   where i.retirada_en is null
     and (i.fecha >= current_date or (i.tipo = 'movida' and i.fecha_nueva >= current_date))
   order by i.fecha, i.creada_en;
$$;

revoke execute on function incidencias_publicas() from public;
grant  execute on function incidencias_publicas() to anon, authenticated;


--  Lo que le toca a UNA cita, para su pagina (/confirmacion/:token): el
--  retraso de su dia, si su dia se cancelo, o de que fecha se movio.
create or replace function incidencia_de_cita(p_token text)
returns table (
  tipo        text,
  minutos     int,
  fecha       date,
  fecha_nueva date,
  mensaje     text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  with suya as (
    select c.id, c.estado, b.fecha
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.token_qr = p_token
  )
  select i.tipo, i.minutos, i.fecha, i.fecha_nueva, i.mensaje
    from suya, incidencias i
   where i.fecha = suya.fecha
     and i.retirada_en is null
     and (i.tipo = 'retraso' or (i.tipo = 'cancelada' and suya.estado = 'cancelada'))
  union all
  select i.tipo, i.minutos, i.fecha, i.fecha_nueva, i.mensaje
    from suya
    join movimientos_cita m on m.cita_id = suya.id and m.origen = 'incidencia'
    join bloques bo         on bo.id = m.de_bloque_id
    join incidencias i      on i.tipo = 'movida' and i.fecha = bo.fecha and i.retirada_en is null;
$$;

revoke execute on function incidencia_de_cita(text) from public;
grant  execute on function incidencia_de_cita(text) to anon, authenticated;


--  El historial de una fecha (lo que se hizo con ella, o lo que llego a
--  ella movido de otra). Solo admin.
create or replace function incidencias_de_fecha(p_fecha date)
returns table (
  tipo        text,
  minutos     int,
  fecha       date,
  fecha_nueva date,
  mensaje     text,
  afectadas   int,
  creada_por  text,
  creada_en   timestamptz,
  retirada    boolean
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
  select i.tipo, i.minutos, i.fecha, i.fecha_nueva, i.mensaje, i.afectadas,
         u.email::text, i.creada_en, i.retirada_en is not null
    from incidencias i
    left join auth.users u on u.id = i.creada_por
   where i.fecha = p_fecha or i.fecha_nueva = p_fecha
   order by i.creada_en desc;
end;
$$;

revoke execute on function incidencias_de_fecha(date) from public, anon;
grant  execute on function incidencias_de_fecha(date) to authenticated;


--  A quien avisar por una incidencia de esa fecha: las pendientes de ese
--  dia, las que se cancelaron por la incidencia y las que se movieron de
--  ahi. Con su telefono y su token (para mandarle el enlace a SU QR). Solo
--  admin.
create or replace function personas_a_avisar(p_fecha date)
returns table (
  nombre       text,
  telefono     text,
  codigo_corto text,
  fecha        date,
  hora         time,
  estado       text,
  token_qr     text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cancelada timestamptz;
begin
  perform exigir_rol(array['admin']);

  select min(i.creada_en) into v_cancelada
    from incidencias i
   where i.fecha = p_fecha and i.tipo = 'cancelada' and i.retirada_en is null;

  return query
  select p.nombre, p.telefono, p.codigo_corto, b.fecha, b.hora, c.estado, c.token_qr
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where (b.fecha = p_fecha
          and (c.estado in ('reservada', 'llego')
               or (c.estado = 'cancelada' and v_cancelada is not null and c.cancelada_en >= v_cancelada)))
      or exists (
           select 1
             from movimientos_cita m
             join bloques bo on bo.id = m.de_bloque_id
            where m.cita_id = c.id and m.origen = 'incidencia' and bo.fecha = p_fecha)
   order by b.hora, p.nombre;
end;
$$;

revoke execute on function personas_a_avisar(date) from public, anon;
grant  execute on function personas_a_avisar(date) to authenticated;

commit;
