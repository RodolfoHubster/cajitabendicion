-- ============================================================
--  Cajita de Bendicion - La fila a pie por turnos
--
--  La fila a pie deja de ir por horarios: cada dia tiene una fila con
--  turnos numerados, su cupo (o sin limite) y su hora de apertura del
--  registro (por lo general una hora antes de empezar).
--    * guardar_fila_a_pie() y quitar_fila_a_pie(): el admin, en Horarios
--    * crear_dia_a_pie(): una fecha solo a pie, desde "Nueva fecha"
--    * el turno lo da un disparador (dar_turno) al guardar la cita
--    * turno_de_cita(token): la persona ve su turno en vivo
--    * fila_de_turnos(fecha) y saltar_turno(turno): la voluntaria
--    * elegir_fila() y mi_fila_de_hoy(): cada quien elige en el escaner en
--      que fila esta hoy
--  Cambian: consultar_disponibilidad, registrar_y_reservar, consultar_cita
--  (trae el turno), registrar_desde_panel, listar_dias_entrega (trae la
--  fila a pie), reporte_por_dias, mover_cita, mover_entrega,
--  puede_escanear_fila y fila_de_entrega. Se quita el interruptor
--  a_pie_abierto.
--
--  Requiere 2026-09-27-guia-del-panel.sql. Se puede repetir.
--  Correrla ANTES de subir las pantallas nuevas.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  Seccion 32: la fila que cada quien elige hoy
-- ------------------------------------------------------------
alter table personal add column if not exists fila_hoy       text;
alter table personal add column if not exists fila_hoy_fecha date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personal_fila_hoy_valida') then
    alter table personal add constraint personal_fila_hoy_valida check (fila_hoy in ('carro', 'a_pie'));
  end if;
end;
$$;

--  Si quien tiene la sesion puede entregar en esa fila. Si hoy eligio fila
--  (seccion 38), solo en esa, sea quien sea. Si no, la regla de siempre:
--  el administrador en las dos; el voluntario, en la suya o en las dos si
--  asi lo dejaron.
create or replace function puede_escanear_fila(p_fila text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select coalesce(
    (select case
              when pe.fila_hoy_fecha = current_date and pe.fila_hoy is not null then pe.fila_hoy = p_fila
              else pe.rol = 'admin' or pe.fila = 'ambas' or pe.fila = p_fila
            end
       from personal pe
      where pe.usuario_id = auth.uid() and pe.activo),
    false);
$$;

revoke execute on function puede_escanear_fila(text) from public, anon, authenticated;


--  En que fila se cuenta un pase o una entrada sin cita: la de quien la
--  registra. La que eligio hoy (seccion 38); si no eligio, la suya, y
--  quien escanea en las dos se cuenta en la de carros.
create or replace function fila_de_entrega()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select coalesce(
    (select case
              when pe.fila_hoy_fecha = current_date and pe.fila_hoy is not null then pe.fila_hoy
              when pe.rol <> 'admin' and pe.fila = 'a_pie' then 'a_pie'
              else 'carro'
            end
       from personal pe
      where pe.usuario_id = auth.uid() and pe.activo),
    'carro');
$$;

revoke execute on function fila_de_entrega() from public, anon, authenticated;


-- ============================================================
--  38. LA FILA A PIE POR TURNOS
-- ============================================================
--  Decidido el 27 de septiembre de 2026. La fila a pie no va por horarios
--  de 15 minutos: es una fila con turnos numerados, como en Costco. Un
--  cartel con el QR de la pagina lleva al registro de siempre (los mismos
--  datos que en carro); al terminar, la persona recibe su QR y su turno.
--
--    * Un solo horario a pie por dia: su hora es cuando se empieza a
--      entregar y su cupo es el de todo el dia. "Sin limite" guarda
--      cupo_sin_limite(), un numero, para que reservar_cita() cuente igual.
--    * El registro a pie abre a su propia hora (dias_entrega.a_pie_abre_en),
--      por lo general una hora antes de empezar. Sin esa hora, la fila a pie
--      esta cerrada (A_PIE_CERRADO).
--    * El turno lo pone un disparador al guardar la cita. Lo ordena el
--      mismo candado de reservar_cita() sobre la fila del bloque: cincuenta
--      registros al mismo tiempo reciben los turnos 1 a 50, sin repetir ni
--      saltarse ninguno. reservar_cita() NO se toca.
--    * El turno que va es el menor que sigue esperando. La voluntaria puede
--      marcar "no se presento" (turno_saltado_en): la fila avanza, y si la
--      persona llega despues, su QR sigue sirviendo.
--    * Cada quien del equipo elige cada dia en que fila esta (fila_hoy,
--      seccion 32). Eso manda sobre la fila que le asignaron en Equipo.
--    * Una caja por QR, igual que en carro, y una cita por semana entre las
--      dos filas.

alter table citas        add column if not exists turno            int;
alter table citas        add column if not exists turno_saltado_en timestamptz;
alter table dias_entrega add column if not exists a_pie_abre_en    timestamptz;

--  El cupo que se guarda cuando el administrador elige "sin limite". Las
--  pantallas y los reportes lo reconocen y no lo suman.
create or replace function cupo_sin_limite()
returns int
language sql
immutable
as $$
  select 10000;
$$;

--  Un solo horario a pie por dia: la fila del dia.
create unique index if not exists una_fila_a_pie_por_dia on bloques (fecha) where fila = 'a_pie';

--  Las citas a pie que ya existieran reciben su turno en el orden en que se
--  registraron. Solo en filas que todavia no tienen ninguno: se puede repetir.
update citas c
   set turno = x.n
  from (select c2.id,
               row_number() over (partition by c2.bloque_id order by c2.creada_en, c2.id) as n
          from citas c2
          join bloques b on b.id = c2.bloque_id
         where b.fila = 'a_pie'
           and not exists (select 1 from citas c3 where c3.bloque_id = c2.bloque_id and c3.turno is not null)) x
 where x.id = c.id;

--  Nunca dos personas con el mismo turno en la misma fila. Es la red por
--  debajo del candado.
create unique index if not exists un_turno_por_fila on citas (bloque_id, turno) where turno is not null;

--  Da el turno que sigue. Tambien al moverse la cita a otra fila a pie
--  (cuando se mueve la entrega de un dia completo): alla toma el turno que
--  sigue, en el mismo orden en que llegaron.
--
--  El candado sobre la fila del bloque es el mismo de reservar_cita(), que
--  ya lo tiene tomado cuando esto corre: quien reserve al mismo tiempo
--  espera, y al seguir ya ve el turno que se acaba de dar.
create or replace function dar_turno()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
declare
  v_fila text;
begin
  if tg_op = 'UPDATE' and new.bloque_id is not distinct from old.bloque_id then
    return new;
  end if;

  select b.fila into v_fila from bloques b where b.id = new.bloque_id for update;

  if v_fila = 'a_pie' then
    select coalesce(max(c.turno), 0) + 1 into new.turno
      from citas c
     where c.bloque_id = new.bloque_id;
  else
    new.turno := null;
  end if;

  new.turno_saltado_en := null;
  return new;
end;
$$;

revoke execute on function dar_turno() from public, anon, authenticated;

drop trigger if exists citas_dar_turno on citas;
create trigger citas_dar_turno
  before insert or update of bloque_id on citas
  for each row execute function dar_turno();

--  Ya no hay interruptor general: cada dia se arma su fila a pie.
drop function if exists a_pie_abierto();
delete from configuracion where clave = 'a_pie_abierto';


--  ---------- Horarios: armar la fila a pie de un dia ----------

--  Crea o cambia la fila a pie de un dia: a que hora se empieza a entregar,
--  el cupo del dia (nulo = sin limite) y a que hora abre el registro (nulo =
--  una hora antes de empezar). Horas LOCALES de San Diego, como las demas
--  funciones de Horarios. Solo admin. Devuelve el horario a pie.
--
--  Si ya tiene turnos dados, se pueden cambiar la hora y el cupo; bajar el
--  cupo no le quita el lugar a nadie, solo ya no entran mas.
create or replace function guardar_fila_a_pie(
  p_fecha   date,
  p_hora    time,
  p_cupo    int       default null,
  p_abre_en timestamp default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_dia    dias_entrega;
  v_bloque bloques;
  v_cupo   int := coalesce(p_cupo, cupo_sin_limite());
  v_inicio timestamptz;
  v_abre   timestamptz;
begin
  perform exigir_rol(array['admin']);

  if p_fecha is null or p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  select * into v_dia from dias_entrega d where d.fecha = p_fecha for update;
  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  if v_dia.cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if p_hora is null then
    raise exception 'HORARIO_INVALIDO';
  end if;

  if v_cupo < 1 or v_cupo > cupo_sin_limite() then
    raise exception 'CAPACIDAD_INVALIDA';
  end if;

  v_inicio := (p_fecha + p_hora) at time zone 'America/Los_Angeles';
  v_abre   := coalesce(p_abre_en at time zone 'America/Los_Angeles', v_inicio - interval '1 hour');

  --  La gente tiene que poder sacar su turno antes de que la llamen.
  if v_abre > v_inicio then
    raise exception 'APERTURA_DESPUES_DE_INICIO';
  end if;

  --  El mismo candado que reservar_cita(): quien este sacando turno en este
  --  momento espera, y al seguir ya ve el cupo nuevo.
  select * into v_bloque from bloques b where b.fecha = p_fecha and b.fila = 'a_pie' for update;

  if found then
    update bloques set hora = p_hora, capacidad = v_cupo where id = v_bloque.id;
  else
    insert into bloques (fecha, hora, capacidad, fila)
    values (p_fecha, p_hora, v_cupo, 'a_pie')
    returning * into v_bloque;
  end if;

  update dias_entrega
     set a_pie_abre_en  = v_abre,
         actualizado_en = now()
   where fecha = p_fecha;

  return v_bloque.id;
end;
$$;

revoke execute on function guardar_fila_a_pie(date, time, int, timestamp) from public, anon;
grant  execute on function guardar_fila_a_pie(date, time, int, timestamp) to authenticated;


--  Una fecha de entrega SOLO a pie, desde "Nueva fecha" en Horarios: el dia
--  sin horarios de carro y con su fila a pie ya armada. (Si lleva las dos
--  filas, se crea con crear_dia_entrega() y luego guardar_fila_a_pie().)
--
--  Todo o nada: si la fila a pie no se puede armar (los turnos abren
--  despues de empezar, cupo de cero), el dia tampoco se crea. Sin horarios
--  de carro, lo unico que abre ese dia son los turnos: el dia abre con ellos.
create or replace function crear_dia_a_pie(
  p_fecha   date,
  p_hora    time,
  p_cupo    int       default null,
  p_abre_en timestamp default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  if p_fecha is null or p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if p_hora is null then
    raise exception 'HORARIO_INVALIDO';
  end if;

  if exists (select 1 from dias_entrega d where d.fecha = p_fecha) then
    raise exception 'DIA_YA_EXISTE';
  end if;

  insert into dias_entrega (fecha, abre_en, codigo_anticipado)
  values (p_fecha,
          coalesce(p_abre_en at time zone 'America/Los_Angeles',
                   (p_fecha + p_hora) at time zone 'America/Los_Angeles' - interval '1 hour'),
          generar_codigo_anticipado());

  return guardar_fila_a_pie(p_fecha, p_hora, p_cupo, p_abre_en);

exception
  --  Dos administradores creando la misma fecha al mismo tiempo.
  when unique_violation then
    raise exception 'DIA_YA_EXISTE';
end;
$$;

revoke execute on function crear_dia_a_pie(date, time, int, timestamp) from public, anon;
grant  execute on function crear_dia_a_pie(date, time, int, timestamp) to authenticated;


--  Quita la fila a pie de un dia, si todavia nadie saco turno. Con turnos
--  dados no se borra: se cierra el registro (actualizar_bloque) y los que
--  ya tienen turno lo conservan.
create or replace function quitar_fila_a_pie(p_fecha date)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_bloque bloques;
begin
  perform exigir_rol(array['admin']);

  perform 1 from dias_entrega d where d.fecha = p_fecha for update;
  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  select * into v_bloque from bloques b where b.fecha = p_fecha and b.fila = 'a_pie' for update;
  if not found then
    raise exception 'FILA_A_PIE_NO_EXISTE';
  end if;

  if exists (select 1 from citas c where c.bloque_id = v_bloque.id) then
    raise exception 'BLOQUE_CON_CITAS';
  end if;

  delete from bloques where id = v_bloque.id;

  update dias_entrega
     set a_pie_abre_en  = null,
         actualizado_en = now()
   where fecha = p_fecha;
end;
$$;

revoke execute on function quitar_fila_a_pie(date) from public, anon;
grant  execute on function quitar_fila_a_pie(date) to authenticated;


--  ---------- La persona: su turno en vivo ----------

--  Alimenta /confirmacion/:token en la fila a pie: su turno, el que va y
--  cuantos tiene antes. La pagina lo vuelve a pedir cada pocos segundos.
--  Solo numeros: nada de quien esta antes o despues. Sin filas si la cita
--  no existe o no es de la fila a pie.
create or replace function turno_de_cita(p_token text)
returns table (
  turno     int,
  estado    text,
  saltado   boolean,
  actual    int,
  antes     int,
  atendidos int,
  en_espera int,
  fecha     date,
  hora      time
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita   citas;
  v_bloque bloques;
begin
  select * into v_cita from citas c where c.token_qr = p_token;
  if not found or v_cita.turno is null then
    return;
  end if;

  select * into v_bloque from bloques b where b.id = v_cita.bloque_id;

  return query
  with esperando as (
    select c.turno
      from citas c
     where c.bloque_id = v_bloque.id
       and c.estado in ('reservada', 'llego')
       and c.turno_saltado_en is null
  )
  select v_cita.turno,
         v_cita.estado,
         v_cita.turno_saltado_en is not null,
         (select min(e.turno) from esperando e)::int,
         (select count(*) from esperando e where e.turno < v_cita.turno)::int,
         (select count(*) from citas c where c.bloque_id = v_bloque.id and c.estado = 'entregada')::int,
         (select count(*) from esperando e)::int,
         v_bloque.fecha,
         v_bloque.hora;
end;
$$;

revoke execute on function turno_de_cita(text) from public;
grant  execute on function turno_de_cita(text) to anon, authenticated;


--  ---------- La voluntaria: la fila en vivo ----------

--  Lo que ve en su telefono quien llama los turnos: el que va (con nombre y
--  codigo, para gritarlo y cotejar), los que siguen, los que no se
--  presentaron y las cuentas del dia. La pantalla lo vuelve a pedir cada
--  pocos segundos. Null si ese dia no hay fila a pie.
--
--  Un voluntario solo ve la de hoy y solo si esta en la fila a pie: son
--  nombres de personas, y solo los necesita quien las llama.
create or replace function fila_de_turnos(p_fecha date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_fecha  date := coalesce(p_fecha, current_date);
  v_rol    text;
  v_bloque bloques;
  v_abre   timestamptz;
  v_json   jsonb;
begin
  v_rol := exigir_rol(array['admin', 'voluntario']);

  if v_rol <> 'admin' then
    if v_fecha <> current_date then
      raise exception 'SOLO_HOY';
    end if;
    if not puede_escanear_fila('a_pie') then
      raise exception 'OTRA_FILA';
    end if;
  end if;

  select * into v_bloque from bloques b where b.fecha = v_fecha and b.fila = 'a_pie';
  if not found then
    return null;
  end if;

  select d.a_pie_abre_en into v_abre from dias_entrega d where d.fecha = v_fecha;

  with turnos as (
    select c.turno, c.estado, c.turno_saltado_en, c.usado_en, p.nombre, p.codigo_corto
      from citas c
      join personas p on p.id = c.persona_id
     where c.bloque_id = v_bloque.id
       and c.estado <> 'cancelada'
  ),
  esperando as (
    select * from turnos t where t.estado in ('reservada', 'llego') and t.turno_saltado_en is null
  )
  select jsonb_build_object(
    'bloque_id',  v_bloque.id,
    'fecha',      v_bloque.fecha,
    'hora',       v_bloque.hora,
    'capacidad',  v_bloque.capacidad,
    'sin_limite', v_bloque.capacidad >= cupo_sin_limite(),
    'cerrado',    v_bloque.cerrado,
    'abre_en',    v_abre at time zone 'America/Los_Angeles',
    'actual',     (select jsonb_build_object('turno', e.turno, 'nombre', e.nombre, 'codigo_corto', e.codigo_corto)
                     from esperando e order by e.turno limit 1),
    'siguientes', coalesce((select jsonb_agg(jsonb_build_object('turno', s.turno, 'nombre', s.nombre,
                                                                'codigo_corto', s.codigo_corto) order by s.turno)
                              from (select * from esperando e order by e.turno offset 1 limit 5) s), '[]'::jsonb),
    'saltados',   coalesce((select jsonb_agg(jsonb_build_object('turno', t.turno, 'nombre', t.nombre,
                                                                'codigo_corto', t.codigo_corto) order by t.turno)
                              from turnos t
                             where t.estado in ('reservada', 'llego') and t.turno_saltado_en is not null), '[]'::jsonb),
    'ultimo',     (select jsonb_build_object('turno', t.turno, 'nombre', t.nombre, 'codigo_corto', t.codigo_corto)
                     from turnos t where t.estado = 'entregada' order by t.usado_en desc nulls last, t.turno desc limit 1),
    'atendidos',  (select count(*) from turnos t where t.estado = 'entregada'),
    'en_espera',  (select count(*) from esperando),
    'total',      (select count(*) from turnos)
  ) into v_json;

  return v_json;
end;
$$;

revoke execute on function fila_de_turnos(date) from public, anon;
grant  execute on function fila_de_turnos(date) to authenticated;


--  "No se presento": la fila pasa al siguiente. Con p_saltado = false, la
--  persona regresa a la fila en su mismo turno. Por NUMERO de turno y no
--  "el que va": si dos voluntarias lo tocan al mismo tiempo, se salta uno
--  solo. Solo en la fila a pie de hoy.
create or replace function saltar_turno(p_turno int, p_saltado boolean default true)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_id uuid;
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  update citas c
     set turno_saltado_en = case when coalesce(p_saltado, true) then coalesce(c.turno_saltado_en, now()) end
    from bloques b
   where b.id = c.bloque_id
     and b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno = p_turno
     and c.estado in ('reservada', 'llego')
  returning c.id into v_id;

  if v_id is null then
    raise exception 'TURNO_NO_EXISTE';
  end if;

  return p_turno;
end;
$$;

revoke execute on function saltar_turno(int, boolean) from public, anon;
grant  execute on function saltar_turno(int, boolean) to authenticated;


--  ---------- El escaner: en que fila estoy hoy ----------

--  Cada quien elige al abrir el escaner. Cualquiera del equipo puede
--  cambiarse (la pantalla le pide confirmar); al dia siguiente se vuelve a
--  elegir. Manda sobre la fila asignada en Equipo (seccion 32).
create or replace function elegir_fila(p_fila text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if p_fila is null or p_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  update personal
     set fila_hoy       = p_fila,
         fila_hoy_fecha = current_date
   where usuario_id = auth.uid() and activo;

  return p_fila;
end;
$$;

revoke execute on function elegir_fila(text) from public, anon;
grant  execute on function elegir_fila(text) to authenticated;


--  La fila que eligio hoy quien tiene la sesion. Null si todavia no elige.
create or replace function mi_fila_de_hoy()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select case when pe.fila_hoy_fecha = current_date then pe.fila_hoy end
    from personal pe
   where pe.usuario_id = auth.uid() and pe.activo;
$$;

revoke execute on function mi_fila_de_hoy() from public, anon;
grant  execute on function mi_fila_de_hoy() to authenticated;


-- ------------------------------------------------------------
--  Lo que cambia en funciones que ya existian
-- ------------------------------------------------------------

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
         -- registrar_y_reservar(), no esta consulta. La fila a pie abre a
         -- su propia hora y sin codigo de suscriptores (seccion 38).
         now() >= case when b.fila = 'a_pie' then d.a_pie_abre_en else d.abre_en end,
         (case when b.fila = 'a_pie' then d.a_pie_abre_en else d.abre_en end) at time zone 'America/Los_Angeles',
         case when b.fila = 'a_pie' then null::timestamp
              else d.abre_anticipado_en at time zone 'America/Los_Angeles' end
    from bloques b
    join dias_entrega d on d.fecha = b.fecha and not d.cerrado
    left join citas c on c.bloque_id = b.id
   where b.cerrado = false
     --  Una fila a la vez. La de a pie sale solo cuando ya tiene su hora
     --  de apertura (seccion 38); sin ella esta cerrada.
     and b.fila = coalesce(p_fila, 'carro')
     and (b.fila = 'carro' or d.a_pie_abre_en is not null)
     -- Nunca se ofrecen fechas pasadas: reservar_cita() las rechazaria
     -- con FECHA_PASADA y el usuario no entenderia por que.
     and b.fecha >= greatest(coalesce(p_desde, current_date), current_date)
     and b.fecha <= coalesce(p_hasta, current_date + 60)
   group by b.id, b.fecha, b.hora, b.capacidad, b.fila, d.abre_en, d.abre_anticipado_en, d.a_pie_abre_en
   order by b.fecha, b.hora;
end;
$$;


revoke execute on function consultar_disponibilidad(date, date, text) from public;
grant  execute on function consultar_disponibilidad(date, date, text) to anon, authenticated;


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
  hora         time,
  --  true: ya tenia su cita ese dia y se le devuelve esa (seccion 33).
  ya_existia   boolean
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
  v_abre_a_pie timestamptz;
  v_limite     int;
  v_usadas     int;
  v_persona    personas;
  v_cita       citas;
  v_codigo     text;
  v_intentos   int := 0;
  v_anticipada boolean := false;
  v_previa     citas;
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

  -- ----------------------------------------------------------
  --  Apertura del dia
  -- ----------------------------------------------------------
  select d.abre_en, d.abre_anticipado_en, d.codigo_anticipado, d.cerrado, d.a_pie_abre_en
    into v_abre_en, v_abre_ant, v_codigo_dia, v_dia_cerrado, v_abre_a_pie
    from dias_entrega d
   where d.fecha = v_bloque.fecha;

  if not found or v_dia_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if v_bloque.fila = 'a_pie' then
    --  La fila a pie abre a su propia hora, por lo general una hora antes de
    --  empezar a entregar (seccion 38). Sin hora, esta cerrada. El codigo de
    --  suscriptores no adelanta a nadie: el turno es por orden de llegada.
    if v_abre_a_pie is null then
      raise exception 'A_PIE_CERRADO';
    end if;

    if now() < v_abre_a_pie then
      raise exception 'AUN_NO_ABRE';
    end if;

  --  Antes de la hora de apertura solo entra quien trae el codigo de
  --  suscriptor, y solo dentro de su ventana de acceso anticipado.
  elsif now() < v_abre_en then
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
  --  La misma persona, el mismo dia (seccion 33)
  -- ----------------------------------------------------------
  --  Con mala senal la gente toca "confirmar" otra vez, o regresa y lo
  --  vuelve a llenar. Si ya quedo registrada ese dia, se le devuelve SU
  --  cita en vez de un error que la hace creer que no tiene lugar, o en
  --  vez de una segunda cita y una segunda caja.
  --
  --  Solo se le devuelve si es el mismo telefono del registro o si fue
  --  hace menos de media hora (el reintento). Si no, se dice que ya existe
  --  y nada mas: saber el nombre y el telefono de alguien no debe bastar
  --  para sacar su codigo.
  v_previa := cita_de_la_misma_persona(v_bloque.fecha, v_telefono, v_nombres || ' ' || v_apellidos);

  if v_previa.id is not null then
    if (p_dispositivo is not null and v_previa.dispositivo_id = p_dispositivo)
       or v_previa.creada_en > now() - interval '30 minutes' then
      return query
        select p.codigo_corto, v_previa.token_qr, b.fecha, b.hora, true
          from personas p, bloques b
         where p.id = v_previa.persona_id
           and b.id = v_previa.bloque_id;
      return;
    end if;

    raise exception 'YA_REGISTRADO_ESE_DIA';
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
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;


--  Le crecio una columna (turno): se borra y se vuelve a crear.
drop function if exists consultar_cita(text);

create or replace function consultar_cita(p_token text)
returns table (
  codigo_corto text,
  nombre       text,
  fecha        date,
  hora         time,
  estado       text,
  fila         text,
  --  Su numero en la fila a pie (seccion 38). Nulo en carro.
  turno        int
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.codigo_corto, p.nombre, b.fecha, b.hora, c.estado, b.fila, c.turno
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.token_qr = p_token;
$$;


revoke execute on function consultar_cita(text) from public;
grant  execute on function consultar_cita(text) to anon, authenticated;


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
  hora         time,
  --  true: ya tenia su cita ese dia y se le devuelve esa (seccion 33).
  ya_existia   boolean
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
  v_previa    citas;
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

    --  La fila a pie no recibe citas hasta que el administrador la arme con
    --  su hora de apertura (seccion 38). El equipo si registra antes de esa
    --  hora, igual que en carro.
    if v_bloque.fila = 'a_pie'
       and not exists (select 1 from dias_entrega d
                        where d.fecha = v_bloque.fecha and d.a_pie_abre_en is not null) then
      raise exception 'A_PIE_CERRADO';
    end if;

    --  El admin puede registrar aunque el dia no se haya abierto al publico,
    --  pero no en un dia cerrado (dia festivo, entrega cancelada).
    --  "d.fecha" calificado: sin prefijo chocaria con la columna "fecha" que
    --  devuelve esta funcion.
    if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
      raise exception 'DIA_CERRADO';
    end if;

    --  La misma persona ya tiene cita ese dia (seccion 33): se devuelve la
    --  suya, que el personal puede ver, en vez de darle una segunda.
    v_previa := cita_de_la_misma_persona(v_bloque.fecha, v_telefono, v_nombres || ' ' || v_apellidos);

    if v_previa.id is not null then
      return query
        select p.codigo_corto, v_previa.token_qr, b.fecha, b.hora, true
          from personas p, bloques b
         where p.id = v_previa.persona_id
           and b.id = v_previa.bloque_id;
      return;
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
    return query select v_persona.codigo_corto, null::text, null::date, null::time, false;
    return;
  end if;

  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) from public;
grant  execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) to authenticated;


--  Le crecieron columnas (la fila a pie): se borra y se vuelve a crear.
drop function if exists listar_dias_entrega(date);

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
  anticipadas        int,
  --  La fila a pie del dia (seccion 38), si la hay. Los de arriba cuentan
  --  solo los horarios de carro: el cupo a pie va aparte y puede ser sin limite.
  a_pie_bloque_id    uuid,
  a_pie_hora         time,
  a_pie_capacidad    int,
  a_pie_cerrado      boolean,
  a_pie_abre_en      timestamp,
  a_pie_ocupados     int
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
         (select count(*)::int from bloques b where b.fecha = d.fecha and b.fila = 'carro'),
         (select coalesce(sum(b.capacidad), 0)::int from bloques b where b.fecha = d.fecha and b.fila = 'carro'),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and b.fila = 'carro' and c.estado <> 'cancelada'),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and c.estado <> 'cancelada' and c.con_codigo_anticipado),
         pie.id,
         pie.hora,
         pie.capacidad,
         pie.cerrado,
         d.a_pie_abre_en at time zone 'America/Los_Angeles',
         (select count(*)::int from citas c where c.bloque_id = pie.id and c.estado <> 'cancelada')
    from dias_entrega d
    left join bloques pie on pie.fecha = d.fecha and pie.fila = 'a_pie'
   where d.fecha >= coalesce(p_desde, current_date)
   order by d.fecha;
end;
$$;

revoke execute on function listar_dias_entrega(date) from public;
grant  execute on function listar_dias_entrega(date) to authenticated;


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
    --  Una fila a pie "sin limite" (seccion 38) no suma cupo: no lo tiene.
    select b.fecha as dia,
           sum(case when b.capacidad >= cupo_sin_limite() then 0 else b.capacidad end)::int as n
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


-- ------------------------------------------------------------
--  El movimiento
-- ------------------------------------------------------------
--  El candado va en el mismo orden que reservar_cita: primero la cita,
--  luego el bloque de destino. El conteo de ocupados se hace con el
--  bloque ya bloqueado, que es lo que impide el sobrecupo cuando dos
--  personas se mueven al mismo horario al mismo tiempo.
--
--  Si el horario nuevo se lleno justo antes, se levanta BLOQUE_LLENO y
--  la transaccion se deshace entera: la persona se queda con su cita
--  original. Nunca se queda sin nada.
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

  --  En la fila a pie el lugar de cada quien es su turno del dia (seccion
  --  38): en otro dia seria otro turno. Se saca uno nuevo ese dia.
  if v_nuevo.fila = 'a_pie' then
    raise exception 'A_PIE_SIN_CAMBIO';
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
  --  suscriptores (el que ya se publico en Facebook sigue sirviendo). La
  --  fila a pie abre a la misma hora, pero del dia nuevo (seccion 38); cada
  --  quien toma alla su turno en el mismo orden.
  insert into dias_entrega (fecha, abre_en, abre_anticipado_en, codigo_anticipado, a_pie_abre_en)
  values (p_fecha_nueva, v_dia.abre_en, v_dia.abre_anticipado_en, v_dia.codigo_anticipado,
          v_dia.a_pie_abre_en + (p_fecha_nueva - p_fecha) * interval '1 day');

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


commit;
