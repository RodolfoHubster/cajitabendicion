-- ============================================================
--  Cajita de Bendicion - Turnos anulados y todo desde el escaner (seccion 46)
--
--  Lo que se vio el jueves 15 de octubre de 2026 en la fila a pie: el
--  turno 1 llego a las 3:40 PM y su turno seguia valiendo.
--
--  * anular_turno(): la voluntaria anula el turno de quien llego tarde. Su
--    QR ya no entrega, su pagina se lo dice y saca uno nuevo al final de la
--    fila, una sola vez (sacar_turno_a_pie: TURNOS_ANULADOS). Cuenta en
--    reporte_por_dias (turnos_anulados).
--  * turnos_a_pie_de_hoy() y qr_de_turno(): buscar en vivo por turno o por
--    codigo en el escaner y ver el detalle de un turno, sin ir a Citas de hoy.
--  * consultar_cita() dice a que hora lo llamaron y si se anulo; turno_de_cita()
--    si se anulo. entregar_turno() contesta TURNO_ANULADO.
--  * sacar_turno_a_pie() acepta su codigo CB de carro (p_codigo_carro) para
--    cambiarse a pie desde cualquier navegador.
--
--  Agrega dos columnas a citas (sin tocar datos). No toca el candado del
--  cupo ni registrar_entrega(). Correrla ANTES de subir las pantallas
--  nuevas. Se puede repetir.
-- ============================================================

begin;

alter table citas add column if not exists turno_anulado_en  timestamptz;
alter table citas add column if not exists turno_anulado_por uuid;

--  A que hora lo llamaron y si se anulo (cambian sus columnas).
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
  turno        int,
  --  A pie (seccion 46): a que hora lo llamaron y no estaba, y si su turno
  --  se anulo. El escaner pregunta antes de entregarle a quien llega tarde.
  saltado_en   timestamp,
  anulado      boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.codigo_corto, p.nombre, b.fecha, b.hora, c.estado, b.fila, c.turno,
         c.turno_saltado_en at time zone 'America/Los_Angeles',
         c.turno_anulado_en is not null
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.token_qr = p_token;
$$;

revoke execute on function consultar_cita(text) from public;
grant  execute on function consultar_cita(text) to anon, authenticated;

--  Si su turno se anulo (cambian sus columnas).
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
  anulado   boolean
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
         v_bloque.hora,
         v_bloque.terminada_en is not null
           or exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and d.cerrado),
         v_cita.turno_anulado_en is not null;
end;
$$;

revoke execute on function turno_de_cita(text) from public;
grant  execute on function turno_de_cita(text) to anon, authenticated;

--  El publico, desde el QR general. Responde con un resultado en vez de
--  lanzar error, para que la pagina sepa que decir:
--    NUEVO                turno recien sacado
--    YA_TENIA             ese telefono ya tiene turno hoy: se le devuelve
--    TIENE_CITA_EN_CARRO  tiene cita de carro hoy: se le pregunta si se cambia
--    YA_RECIBIO_EN_CARRO  ya recibio en carro hoy: no hay segunda despensa
--    AUN_NO_ABRE          todavia no es la hora (abre_en dice cuando)
--    NO_HAY_FILA          hoy no hay fila a pie
--    CERRADA              el dia o la fila se cerraron
--    FALTA_CODIGO         ese dia se pide el codigo del dia (seccion 43)
--    CODIGO_INCORRECTO    el codigo no es el del dia
--    DEMASIADOS_INTENTOS  5 codigos mal en 5 minutos: espera (segundos)
--    CODIGO_CARRO_NO_EXISTE  no hay cita de carro de hoy con ese codigo CB
--                         (seccion 46; cuenta como intento fallido)
--    TURNOS_ANULADOS      a este telefono ya se le anularon dos turnos hoy
--                         (seccion 46): el primero se perdona, el segundo no
--
--  p_codigo_carro (seccion 46): su codigo CB de la cita de carro de hoy. Asi
--  se cambia a pie aunque abra esta pagina en otro navegador (el de la
--  camara, no el de Facebook donde hizo su cita): el telefono no la
--  reconoceria y el cambio no se contaba.
drop function if exists sacar_turno_a_pie(text, boolean);
drop function if exists sacar_turno_a_pie(text, boolean, text);
drop function if exists sacar_turno_a_pie(text, boolean, text, text);

create or replace function sacar_turno_a_pie(
  p_dispositivo   text,
  p_cambiar_carro boolean default false,
  --  El codigo del dia, si ese dia se pide (seccion 43).
  p_codigo        text    default null,
  --  Su codigo CB de carro, para cambiarse a pie (seccion 46).
  p_codigo_carro  text    default null
)
returns table (
  resultado  text,
  token_qr   text,
  codigo     text,
  turno      int,
  fecha      date,
  hora       time,
  abre_en    timestamp,
  citas_carro int,
  hora_carro time,
  --  Si es el dueno del carro: cuantos acompanantes se le cancelan tambien.
  acompanantes int,
  --  Con DEMASIADOS_INTENTOS: cuantos segundos faltan para volver a probar.
  espera     int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_disp     text := nullif(trim(coalesce(p_dispositivo, '')), '');
  v_bloque   bloques;
  v_abre     timestamptz;
  v_cerrado  boolean;
  v_cita     citas;
  v_carros   int;
  v_hora     time;
  v_duenos   uuid[];
  v_acomp    int := 0;
  v_codigo_dia text;
  v_fallos   int;
  v_primero  timestamptz;
  --  Su codigo CB de carro, como se teclee ("48213", "cb 48213").
  v_codigo_carro text := nullif(normalizar_codigo_corto(p_codigo_carro), '');
  v_carro    citas;
  v_anulados int;
begin
  if v_disp is null or char_length(v_disp) > 100 then
    raise exception 'DISPOSITIVO_INVALIDO';
  end if;

  select * into v_bloque from bloques b where b.fecha = current_date and b.fila = 'a_pie';
  select d.a_pie_abre_en, d.cerrado, d.a_pie_codigo into v_abre, v_cerrado, v_codigo_dia
    from dias_entrega d where d.fecha = current_date;

  if v_bloque.id is null or v_abre is null then
    return query select 'NO_HAY_FILA'::text, null::text, null::text, null::int, current_date, null::time,
                        null::timestamp, 0, null::time, 0, 0;
    return;
  end if;

  if coalesce(v_cerrado, false) or v_bloque.cerrado then
    return query select 'CERRADA'::text, null::text, null::text, null::int, current_date, v_bloque.hora,
                        null::timestamp, 0, null::time, 0, 0;
    return;
  end if;

  if now() < v_abre then
    return query select 'AUN_NO_ABRE'::text, null::text, null::text, null::int, current_date, v_bloque.hora,
                        (v_abre at time zone 'America/Los_Angeles'), 0, null::time, 0, 0;
    return;
  end if;

  --  Un telefono a la vez: dos toques seguidos no sacan dos turnos.
  perform pg_advisory_xact_lock(hashtext('turno-a-pie:' || v_disp || ':' || current_date::text));

  --  Ya tiene turno hoy (esperando, ya recibido, o lo llamaron y no
  --  estaba): se le devuelve el suyo, no uno nuevo hasta atras (seccion 44).
  --  Uno ANULADO ya no cuenta (seccion 46): puede sacar otro.
  select c.* into v_cita
    from citas c
   where c.bloque_id = v_bloque.id
     and c.dispositivo_id = v_disp
     and c.estado in ('reservada', 'llego', 'entregada')
   order by c.creada_en desc
   limit 1;

  if v_cita.id is not null then
    return query select 'YA_TENIA'::text, v_cita.token_qr, p.codigo_corto, v_cita.turno, current_date,
                        v_bloque.hora, null::timestamp, 0, null::time, 0, 0
                   from personas p where p.id = v_cita.persona_id;
    return;
  end if;

  --  Le anularon el turno por llegar tarde (seccion 46): se le da otro, al
  --  final de la fila, una sola vez. Si tambien ese se anula, ya no.
  select count(*)::int into v_anulados
    from citas c
   where c.bloque_id = v_bloque.id
     and c.dispositivo_id = v_disp
     and c.turno_anulado_en is not null;

  if v_anulados >= 2 then
    return query select 'TURNOS_ANULADOS'::text, null::text, null::text, null::int, current_date,
                        null::time, null::timestamp, 0, null::time, 0, 0;
    return;
  end if;

  --  Cinco codigos mal en 5 minutos (el del dia o el CB de carro) frenan
  --  este telefono: no se pueden adivinar probando.
  if v_codigo_dia is not null or v_codigo_carro is not null then
    select count(*)::int, min(i.creado_en) into v_fallos, v_primero
      from intentos_turno i
     where i.dispositivo = v_disp and i.creado_en > now() - interval '5 minutes';

    if v_fallos >= 5 then
      return query select 'DEMASIADOS_INTENTOS'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0,
                          greatest(1, ceil(extract(epoch from (v_primero + interval '5 minutes' - now())))::int);
      return;
    end if;
  end if;

  --  El codigo del dia (seccion 43): sin el no hay turno, asi no se saca
  --  desde la casa con el enlace.
  if v_codigo_dia is not null then
    if nullif(trim(coalesce(p_codigo, '')), '') is null then
      return query select 'FALTA_CODIGO'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0, 0;
      return;
    end if;

    --  Se registra y se RESPONDE (no se lanza error): un error desharia el
    --  registro del intento y el freno nunca se activaria.
    if trim(p_codigo) <> v_codigo_dia then
      insert into intentos_turno (dispositivo) values (v_disp);
      return query select 'CODIGO_INCORRECTO'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0, 0;
      return;
    end if;
  end if;

  --  Ya recibio en carro hoy desde este telefono: no hay segunda despensa.
  if exists (select 1 from citas c join bloques b on b.id = c.bloque_id
              where c.dispositivo_id = v_disp and b.fecha = current_date and b.fila = 'carro'
                and c.estado = 'entregada') then
    return query select 'YA_RECIBIO_EN_CARRO'::text, null::text, null::text, null::int, current_date,
                        null::time, null::timestamp, 0, null::time, 0, 0;
    return;
  end if;

  --  Con su codigo CB (seccion 46): su cita de carro de hoy, la haya hecho
  --  en este telefono o no.
  if v_codigo_carro is not null then
    select c.* into v_carro
      from citas c
      join personas p on p.id = c.persona_id
      join bloques  b on b.id = c.bloque_id
     where upper(p.codigo_corto) = v_codigo_carro
       and b.fecha = current_date
       and b.fila = 'carro'
       and c.estado in ('reservada', 'llego', 'entregada')
     order by c.estado = 'entregada'
     limit 1;

    if v_carro.id is null then
      insert into intentos_turno (dispositivo) values (v_disp);
      return query select 'CODIGO_CARRO_NO_EXISTE'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0, 0;
      return;
    end if;

    if v_carro.estado = 'entregada' then
      return query select 'YA_RECIBIO_EN_CARRO'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0, 0;
      return;
    end if;
  end if;

  --  Tiene cita de carro hoy (en este telefono o con su codigo): primero
  --  se le pregunta.
  select count(*)::int, min(b.hora) into v_carros, v_hora
    from citas c join bloques b on b.id = c.bloque_id
   where (c.dispositivo_id = v_disp or c.id = v_carro.id)
     and b.fecha = current_date and b.fila = 'carro'
     and c.estado in ('reservada', 'llego');

  --  Si es el dueno del carro: sus acompanantes, de cualquier telefono.
  select coalesce(array_agg(c.id), '{}') into v_duenos
    from citas c join bloques b on b.id = c.bloque_id
   where (c.dispositivo_id = v_disp or c.id = v_carro.id)
     and b.fecha = current_date and b.fila = 'carro'
     and c.estado in ('reservada', 'llego') and c.acompana_a is null;

  select count(*)::int into v_acomp
    from citas c
   where c.acompana_a = any (v_duenos) and c.estado in ('reservada', 'llego');

  if v_carros > 0 and not coalesce(p_cambiar_carro, false) then
    return query select 'TIENE_CITA_EN_CARRO'::text, null::text, null::text, null::int, current_date,
                        null::time, null::timestamp, v_carros, v_hora, v_acomp, 0;
    return;
  end if;

  --  Se cambia a pie: sus citas de carro de hoy se cancelan (su QR ya no
  --  entrega) y quedan marcadas para los reportes. No hay regreso. Si es el
  --  dueno, el carro sale de la fila: tambien las de sus acompanantes.
  if v_carros > 0 then
    update citas c
       set estado             = 'cancelada',
           cancelada_en       = now(),
           motivo_cancelacion = case when c.dispositivo_id = v_disp or c.id = v_carro.id
                                     then 'Se cambió a la fila a pie'
                                     else 'Su carro se cambió a la fila a pie' end,
           se_cambio_a_pie    = true
      from bloques b
     where b.id = c.bloque_id
       and (c.dispositivo_id = v_disp or c.id = v_carro.id or c.acompana_a = any (v_duenos))
       and b.fecha = current_date
       and b.fila = 'carro'
       and c.estado in ('reservada', 'llego');
  end if;

  v_cita := crear_turno_anonimo(v_bloque.id, v_disp, null);

  return query select 'NUEVO'::text, v_cita.token_qr, p.codigo_corto, v_cita.turno, current_date,
                      v_bloque.hora, null::timestamp, v_carros, v_hora, v_acomp, 0
                 from personas p where p.id = v_cita.persona_id;
end;
$$;

revoke execute on function sacar_turno_a_pie(text, boolean, text, text) from public;
grant  execute on function sacar_turno_a_pie(text, boolean, text, text) to anon, authenticated;

--  Un turno anulado lo dice.
create or replace function entregar_turno(p_turno int)
returns table (
  resultado    text,
  nombre       text,
  codigo_corto text,
  hora         time,
  turno        int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_token text;
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  select c.token_qr into v_token
    from citas c
    join bloques b on b.id = c.bloque_id
   where b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno = p_turno
     and c.estado <> 'cancelada'
   limit 1;

  if v_token is null then
    --  Lo anularon por llegar tarde (seccion 46): que saque uno nuevo.
    if exists (select 1 from citas c join bloques b on b.id = c.bloque_id
                where b.fecha = current_date and b.fila = 'a_pie'
                  and c.turno = p_turno and c.turno_anulado_en is not null) then
      return query select 'TURNO_ANULADO'::text, null::text, null::text, null::time, p_turno;
      return;
    end if;
    return query select 'TURNO_NO_EXISTE'::text, null::text, null::text, null::time, p_turno;
    return;
  end if;

  return query
  select r.resultado, r.nombre, r.codigo_corto, r.hora, p_turno
    from registrar_entrega(v_token) r;
end;
$$;

revoke execute on function entregar_turno(int) from public, anon;
grant  execute on function entregar_turno(int) to authenticated;

--  Los turnos anulados del dia (cambian sus columnas).
drop function if exists reporte_por_dias(date, date, text);

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
  intentos_repetidos int,
  --  Citas de carro que se cancelaron porque la persona se paso a la fila a
  --  pie (seccion 42): cuantos prefirieron no esperar en carro.
  cambios_a_pie      int,
  --  Turnos a pie que la voluntaria anulo porque llegaron tarde (seccion 46).
  turnos_anulados    int
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
  ),
  cambios as (
    select b.fecha as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.se_cambio_a_pie and b.fecha between p_desde and p_hasta
       and (p_fila is null or p_fila = 'carro')
     group by b.fecha
  ),
  anulados as (
    select b.fecha as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.turno_anulado_en is not null and b.fecha between p_desde and p_hasta
       and (p_fila is null or p_fila = 'a_pie')
     group by b.fecha
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
         coalesce(re.n, 0),
         coalesce(ca.n, 0),
         coalesce(an.n, 0)
    from dias d
    left join cupos        cu on cu.dia = d.dia
    left join agenda       ag on ag.dia = d.dia
    left join entregas     en on en.dia = d.dia
    left join sin_cita_dia sc on sc.dia = d.dia
    left join pases_dia    pa on pa.dia = d.dia
    left join repetidos    re on re.dia = d.dia
    left join cambios      ca on ca.dia = d.dia
    left join anulados     an on an.dia = d.dia
   order by d.dia;
end;
$$;


revoke execute on function reporte_por_dias(date, date, text) from public;
grant  execute on function reporte_por_dias(date, date, text) to authenticated;

--  Anular el turno N de la fila a pie de hoy: lo llamaron, no estaba y
--  llego tarde. Su QR ya no entrega, su pagina se lo dice y puede sacar uno
--  nuevo. Queda quien lo anulo y a que hora. Por NUMERO de turno, con el
--  mismo cuidado que saltar_turno: dos voluntarias al mismo tiempo anulan
--  uno solo, y uno que ya recibio no se anula (TURNO_NO_EXISTE).
create or replace function anular_turno(p_turno int)
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
     set estado             = 'cancelada',
         cancelada_en       = now(),
         motivo_cancelacion = 'Turno anulado: no estaba cuando lo llamaron',
         turno_anulado_en   = now(),
         turno_anulado_por  = auth.uid()
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

revoke execute on function anular_turno(int) from public, anon;
grant  execute on function anular_turno(int) to authenticated;


--  Los turnos a pie de hoy, para buscar en el escaner mientras se teclea:
--  el turno, su codigo (la pantalla solo lo ensena en el detalle, para
--  compararlo con el que dice la persona), la sena, el estado y las horas.
--  Tambien los anulados, marcados. Solo quien escanea en la fila a pie.
--  Sin telefono, correo ni direccion.
create or replace function turnos_a_pie_de_hoy()
returns table (
  turno        int,
  codigo_corto text,
  nombre       text,
  estado       text,
  sacado_en    timestamp,
  saltado_en   timestamp,
  entregado_en timestamp,
  anulado_en   timestamp,
  --  Si se lo dio una voluntaria (sin telefono): su correo.
  dado_por     text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  return query
  select c.turno,
         p.codigo_corto,
         p.nombre,
         c.estado,
         c.creada_en        at time zone 'America/Los_Angeles',
         c.turno_saltado_en at time zone 'America/Los_Angeles',
         c.usado_en         at time zone 'America/Los_Angeles',
         c.turno_anulado_en at time zone 'America/Los_Angeles',
         u.email::text
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.registrado_por
   where b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno is not null
     and (c.estado <> 'cancelada' or c.turno_anulado_en is not null)
   order by c.turno;
end;
$$;

revoke execute on function turnos_a_pie_de_hoy() from public, anon;
grant  execute on function turnos_a_pie_de_hoy() to authenticated;


--  El QR del turno N de hoy, para el detalle del escaner ("Ver QR"). Quien
--  escanea en la fila a pie ya puede entregar ese turno; el QR no le da mas.
create or replace function qr_de_turno(p_turno int)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_token text;
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  select c.token_qr into v_token
    from citas c
    join bloques b on b.id = c.bloque_id
   where b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno = p_turno
     and c.estado <> 'cancelada'
   limit 1;

  if v_token is null then
    raise exception 'TURNO_NO_EXISTE';
  end if;

  return v_token;
end;
$$;

revoke execute on function qr_de_turno(int) from public, anon;
grant  execute on function qr_de_turno(int) to authenticated;

commit;
