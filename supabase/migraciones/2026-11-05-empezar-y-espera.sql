-- ============================================================
--  La fila a pie: empezar a entregar y la espera aproximada
--  (seccion 57 de schema.sql)
-- ============================================================
--  Hasta que la voluntaria toca "Empezar a entregar" (o se entrega la
--  primera caja, o el primer "no se presento"), no va ningun turno: quien
--  espera ve "Todavia no empezamos". Antes, en cuanto alguien sacaba el 1,
--  la fila decia "va el 1" y al del 1 le sonaba "es tu turno".
--  Y la espera aproximada: el promedio entre una caja y la siguiente (las
--  ultimas 10) por cuantos tiene antes.
--
--  Agrega bloques.empezada_en y las funciones fila_empezo_en(),
--  ritmo_de_la_fila() y empezar_fila_a_pie(). Cambia turno_de_cita(),
--  fila_a_pie_en_vivo() y fila_de_turnos(). No toca registrar_entrega()
--  ni los cupos. Mejor fuera del horario de la fila a pie, y antes de subir
--  las pantallas. Se puede correr dos veces.
-- ============================================================

-- ============================================================
--  57. LA FILA A PIE: EMPEZAR A ENTREGAR Y LA ESPERA APROXIMADA
-- ============================================================
--  Pedido del 5 de noviembre de 2026:
--
--  * En cuanto alguien sacaba el turno 1, la fila decia "va el 1" (y a
--    quien tenia el 1 le sonaba "es tu turno") aunque todavia no se
--    entregaba nada. Ahora la entrega empieza cuando la voluntaria toca
--    "Empezar a entregar" (empezar_fila_a_pie), o sola con la primera caja
--    que se entrega o el primer "no se presento", si se le olvido. Hasta
--    entonces no va ningun turno: quien espera ve "Todavia no empezamos".
--  * La espera aproximada: el promedio entre una caja y la siguiente (las
--    ultimas 10 de la fila a pie) por cuantos tiene antes. Es un promedio,
--    no una hora, y la pagina lo dice asi.
--
--  Lo usan turno_de_cita(), fila_a_pie_en_vivo() y fila_de_turnos(). No
--  toca registrar_entrega(): la entrega no escribe nada nuevo, todo se
--  calcula al preguntar.

alter table bloques add column if not exists empezada_en timestamptz;

--  Cuando empezo la entrega de una fila: con el boton, o la primera caja
--  entregada o el primer "no se presento". Nulo si todavia no empieza.
create or replace function fila_empezo_en(p_bloque uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
           b.empezada_en,
           (select least(min(c.usado_en) filter (where c.estado = 'entregada'), min(c.turno_saltado_en))
              from citas c
             where c.bloque_id = b.id))
    from bloques b
   where b.id = p_bloque;
$$;

revoke execute on function fila_empezo_en(uuid) from public, anon, authenticated;


--  Cada cuantos segundos sale una caja en esa fila: el promedio entre una
--  entrega y la siguiente, con las ultimas 10. Solo las ultimas, para que
--  siga el paso de ahorita y una pausa de hace rato ya no pese. Nulo
--  mientras van menos de 5: con dos o tres, una familia que pasa junta lo
--  echaria a perder.
create or replace function ritmo_de_la_fila(p_bloque uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with ultimas as (
    select c.usado_en
      from citas c
     where c.bloque_id = p_bloque
       and c.estado = 'entregada'
       and c.usado_en is not null
     order by c.usado_en desc
     limit 10
  )
  select case
           when count(*) >= 5
           then round(extract(epoch from (max(u.usado_en) - min(u.usado_en))) / (count(*) - 1))::int
         end
    from ultimas u;
$$;

revoke execute on function ritmo_de_la_fila(uuid) from public, anon, authenticated;


--  "Empezar a entregar" en la fila a pie de hoy: quien espera lo ve en su
--  telefono y el turno 1 pasa a ser el que va. La voluntaria de la fila a
--  pie o el administrador. Con p_empezada = false se deshace (si se toco
--  antes de tiempo); si ya se entrego alguna caja, la fila sigue empezada.
create or replace function empezar_fila_a_pie(p_empezada boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_empezada boolean := coalesce(p_empezada, true);
  v_id       uuid;
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  update bloques b
     set empezada_en = case when v_empezada then coalesce(b.empezada_en, now()) end
   where b.fecha = current_date
     and b.fila = 'a_pie'
  returning b.id into v_id;

  if v_id is null then
    raise exception 'FILA_A_PIE_NO_EXISTE';
  end if;

  return v_empezada;
end;
$$;

revoke execute on function empezar_fila_a_pie(boolean) from public, anon;
grant  execute on function empezar_fila_a_pie(boolean) to authenticated;


-- ============================================================
--  Las tres funciones que lo usan (secciones 38 y 51)
-- ============================================================

--  Alimenta /confirmacion/:token en la fila a pie: su turno, el que va y
--  cuantos tiene antes. La pagina lo vuelve a pedir cada pocos segundos.
--  Solo numeros: nada de quien esta antes o despues. Sin filas si la cita
--  no existe o no es de la fila a pie.
--  Le crecio "cerrada" (seccion 43): la fila de ese dia ya termino. Y
--  "anulado" (seccion 46): la voluntaria anulo su turno. Y "repetido" y
--  "se_queda" (seccion 53): se cancelo porque ya tenia otro, y cual. Y
--  "empezada" y "segundos_por_turno" (seccion 57): antes de empezar a
--  entregar no va ningun turno (salia "va el 1" y al del 1 le sonaba "es
--  tu turno"), y cada cuantos segundos sale una caja, para la espera
--  aproximada.
drop function if exists turno_de_cita(text);

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
  hora      time,
  --  La fila se termino (o el dia se cancelo): "la fila de hoy ya
  --  termino". Cerrar los turnos NO cuenta: quien ya tiene turno lo
  --  conserva.
  cerrada   boolean,
  --  La voluntaria anulo su turno (seccion 46): llego tarde. Su pagina le
  --  dice que saque uno nuevo.
  anulado   boolean,
  --  Seccion 53: se cancelo porque ya tenia otro turno (y cual, si se sabe).
  repetido  boolean,
  se_queda  int,
  --  Seccion 57: ya empezo la entrega, y cada cuantos segundos sale una
  --  caja (nulo mientras van menos de 5).
  empezada           boolean,
  segundos_por_turno int
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
  v_empezo timestamptz;
begin
  select * into v_cita from citas c where c.token_qr = p_token;
  if not found or v_cita.turno is null then
    return;
  end if;

  select * into v_bloque from bloques b where b.id = v_cita.bloque_id;
  v_empezo := fila_empezo_en(v_bloque.id);

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
         --  Antes de empezar a entregar no va nadie (seccion 57).
         case when v_empezo is not null then (select min(e.turno) from esperando e) end::int,
         (select count(*) from esperando e where e.turno < v_cita.turno)::int,
         (select count(*) from citas c where c.bloque_id = v_bloque.id and c.estado = 'entregada')::int,
         (select count(*) from esperando e)::int,
         v_bloque.fecha,
         v_bloque.hora,
         v_bloque.terminada_en is not null
           or exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and d.cerrado),
         v_cita.turno_anulado_en is not null,
         v_cita.turno_repetido_en is not null,
         v_cita.turno_se_queda,
         v_empezo is not null,
         ritmo_de_la_fila(v_bloque.id);
end;
$$;

revoke execute on function turno_de_cita(text) from public;
grant  execute on function turno_de_cita(text) to anon, authenticated;


--  Lo que ve en su telefono quien llama los turnos: el que va (con nombre y
--  codigo, para gritarlo y cotejar), los que siguen, los que no se
--  presentaron y las cuentas del dia. La pantalla lo vuelve a pedir cada
--  pocos segundos. Null si ese dia no hay fila a pie.
--
--  Un voluntario solo ve la de hoy y solo si esta en la fila a pie: son
--  nombres de personas, y solo los necesita quien las llama.
--
--  Seccion 57: si ya empezo la entrega (a que hora, y si fue con el boton)
--  y cada cuantos segundos sale una caja. "actual" sigue siendo a quien
--  llamar primero, aunque todavia no se empiece.
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
  v_codigo text;
  v_hasta  time;
  v_json   jsonb;
  v_empezo timestamptz;
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
  v_empezo := fila_empezo_en(v_bloque.id);

  --  El codigo del dia solo mientras se pide; la hora, si hay codigo (seccion 47).
  select d.a_pie_abre_en, codigo_del_dia_vigente(d.fecha),
         case when d.a_pie_codigo is not null then d.a_pie_codigo_hasta end
    into v_abre, v_codigo, v_hasta
    from dias_entrega d where d.fecha = v_fecha;

  with turnos as (
    --  El codigo de un turno sin datos no se manda: es lo unico que prueba
    --  de quien es el turno (seccion 43). Se comprueba buscandolo.
    select c.turno, c.estado, c.turno_saltado_en, c.usado_en, p.nombre,
           case when p.anonima then null else p.codigo_corto end as codigo_corto
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
    'terminada',  v_bloque.terminada_en is not null,
    'abre_en',    v_abre at time zone 'America/Los_Angeles',
    --  El codigo del dia (seccion 43), si se pide: para decirlo en la entrada.
    'codigo_dia', v_codigo,
    --  Hasta que hora se pide (seccion 47). Con codigo_dia nulo: ya no se pide.
    'codigo_hasta', v_hasta,
    'actual',     (select jsonb_build_object('turno', e.turno, 'nombre', e.nombre, 'codigo_corto', e.codigo_corto)
                     from esperando e order by e.turno limit 1),
    'siguientes', coalesce((select jsonb_agg(jsonb_build_object('turno', s.turno, 'nombre', s.nombre,
                                                                'codigo_corto', s.codigo_corto) order by s.turno)
                              from (select * from esperando e order by e.turno offset 1 limit 5) s), '[]'::jsonb),
    'saltados',   coalesce((select jsonb_agg(jsonb_build_object('turno', t.turno, 'nombre', t.nombre,
                                                                'codigo_corto', t.codigo_corto,
                                                                'saltado_en', t.turno_saltado_en) order by t.turno)
                              from turnos t
                             where t.estado in ('reservada', 'llego') and t.turno_saltado_en is not null), '[]'::jsonb),
    'ultimo',     (select jsonb_build_object('turno', t.turno, 'nombre', t.nombre, 'codigo_corto', t.codigo_corto)
                     from turnos t where t.estado = 'entregada' order by t.usado_en desc nulls last, t.turno desc limit 1),
    'atendidos',  (select count(*) from turnos t where t.estado = 'entregada'),
    'en_espera',  (select count(*) from esperando),
    'total',      (select count(*) from turnos),
    --  Seccion 57.
    'empezada',           v_empezo is not null,
    'empezo_en',          to_char(v_empezo, 'HH24:MI:SS'),
    'empezada_a_mano',    v_bloque.empezada_en is not null,
    'segundos_por_turno', ritmo_de_la_fila(v_bloque.id)
  ) into v_json;

  return v_json;
end;
$$;

revoke execute on function fila_de_turnos(date) from public, anon;
grant  execute on function fila_de_turnos(date) to authenticated;


--  Le crecio "empezada" y "segundos_por_turno" (seccion 57): antes de
--  empezar a entregar no va ningun turno, y cada cuantos segundos sale una
--  caja, para la espera aproximada. Pasa a plpgsql porque usa funciones de
--  la seccion 57, que se crean despues.
drop function if exists fila_a_pie_en_vivo();

create or replace function fila_a_pie_en_vivo()
returns table (
  hora       time,
  abre_en    timestamp,
  abierta    boolean,
  cerrada    boolean,
  terminada  boolean,
  --  El turno que va (el mas bajo que espera), o nulo si nadie espera o si
  --  todavia no empiezan a entregar.
  actual     int,
  --  El ultimo que recibio su caja.
  ultimo     int,
  atendidos  int,
  en_espera  int,
  --  Cuantos turnos se han dado hoy (sin los cancelados).
  total      int,
  --  Seccion 57: ya empezo la entrega, y cada cuantos segundos sale una caja
  --  (nulo mientras van menos de 5).
  empezada           boolean,
  segundos_por_turno int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
begin
  return query
  with fila as (
    select b.id, b.hora, b.cerrado, b.terminada_en, d.a_pie_abre_en, d.cerrado as dia_cerrado,
           fila_empezo_en(b.id) as empezo
      from bloques b
      join dias_entrega d on d.fecha = b.fecha
     where b.fecha = current_date
       and b.fila = 'a_pie'
       and d.a_pie_abre_en is not null
  ),
  turnos as (
    select c.turno, c.estado, c.turno_saltado_en, c.usado_en
      from citas c
      join fila f on f.id = c.bloque_id
     where c.estado <> 'cancelada'
  )
  select f.hora,
         f.a_pie_abre_en at time zone 'America/Los_Angeles',
         now() >= f.a_pie_abre_en,
         f.cerrado or f.dia_cerrado or f.terminada_en is not null,
         f.dia_cerrado or f.terminada_en is not null,
         case when f.empezo is not null then
           (select min(t.turno) from turnos t
             where t.estado in ('reservada', 'llego') and t.turno_saltado_en is null)
         end::int,
         (select t.turno from turnos t
           where t.estado = 'entregada' order by t.usado_en desc nulls last, t.turno desc limit 1)::int,
         (select count(*) from turnos t where t.estado = 'entregada')::int,
         (select count(*) from turnos t
           where t.estado in ('reservada', 'llego') and t.turno_saltado_en is null)::int,
         (select count(*) from turnos t)::int,
         f.empezo is not null,
         ritmo_de_la_fila(f.id)
    from fila f;
end;
$$;

revoke execute on function fila_a_pie_en_vivo() from public;
grant  execute on function fila_a_pie_en_vivo() to anon, authenticated;
