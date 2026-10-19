-- ============================================================
--  Cajita de Bendicion - El codigo del dia hasta cierta hora (seccion 47)
--
--  Pedido del 19 de octubre de 2026: los turnos a pie se abren temprano
--  pidiendo el codigo del dia (solo lo sabe quien esta en la entrada) y a
--  cierta hora se deja de pedir. Desde esa hora cualquiera saca turno con
--  el QR del cartel y queda al final de la fila.
--
--  * dias_entrega.a_pie_codigo_hasta: la hora (nula: todo el dia, como
--    hasta ahora). Se cambia con codigo_turno_a_pie_hasta() (solo admin).
--  * codigo_del_dia_vigente(): el codigo que se pide ahora. La usan
--    sacar_turno_a_pie(), fila_a_pie_hoy() (pide_codigo y codigo_hasta) y
--    fila_de_turnos() (codigo_dia y codigo_hasta).
--
--  Agrega una columna a dias_entrega (sin tocar datos): los dias que ya
--  piden el codigo lo siguen pidiendo todo el dia. No toca el candado del
--  cupo ni registrar_entrega(). Correrla ANTES de subir las pantallas
--  nuevas. Se puede repetir.
-- ============================================================

begin;

--  Hasta que hora se pide el codigo del dia (seccion 47). Nula: todo el dia.
alter table dias_entrega add column if not exists a_pie_codigo_hasta time;

--  El codigo del dia que se pide AHORA (seccion 47): el de esa fecha, salvo
--  que hoy ya haya pasado la hora hasta la que se pedia. Nulo si no se
--  pide. Solo la usan las funciones de aqui; nadie la llama de fuera.
create or replace function codigo_del_dia_vigente(p_fecha date)
returns text
language sql
stable
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select case
           when d.a_pie_codigo_hasta is null
             or d.fecha <> current_date
             or localtime < d.a_pie_codigo_hasta
           then d.a_pie_codigo
         end
    from dias_entrega d
   where d.fecha = p_fecha;
$$;

revoke execute on function codigo_del_dia_vigente(date) from public, anon, authenticated;


--  sacar_turno_a_pie(): el codigo del dia solo mientras se pide.
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
  --  El codigo del dia, solo si a esta hora todavia se pide (seccion 47).
  select d.a_pie_abre_en, d.cerrado, codigo_del_dia_vigente(d.fecha) into v_abre, v_cerrado, v_codigo_dia
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


--  La fila a pie de hoy, para la pagina /turno: si hay, si ya abrio y si
--  pide el codigo del dia (nunca el codigo). Sin fila, ningun renglon.
--  "cerrada": ya no se dan turnos. "terminada": ademas, la fila acabo.
--  "codigo_hasta" (seccion 47): mientras se pide el codigo, a que hora se
--  deja de pedir, para que la pagina quite el campo a esa hora.
drop function if exists fila_a_pie_hoy();

create or replace function fila_a_pie_hoy()
returns table (
  hora         time,
  abre_en      timestamp,
  abierta      boolean,
  cerrada      boolean,
  pide_codigo  boolean,
  terminada    boolean,
  codigo_hasta timestamp
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select b.hora,
         d.a_pie_abre_en at time zone 'America/Los_Angeles',
         now() >= d.a_pie_abre_en,
         b.cerrado or d.cerrado or b.terminada_en is not null,
         codigo_del_dia_vigente(d.fecha) is not null,
         d.cerrado or b.terminada_en is not null,
         case when codigo_del_dia_vigente(d.fecha) is not null then d.fecha + d.a_pie_codigo_hasta end
    from bloques b
    join dias_entrega d on d.fecha = b.fecha
   where b.fecha = current_date
     and b.fila = 'a_pie'
     and d.a_pie_abre_en is not null;
$$;

revoke execute on function fila_a_pie_hoy() from public;
grant  execute on function fila_a_pie_hoy() to anon, authenticated;


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
  v_codigo text;
  v_hasta  time;
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
    'total',      (select count(*) from turnos)
  ) into v_json;

  return v_json;
end;
$$;

revoke execute on function fila_de_turnos(date) from public, anon;
grant  execute on function fila_de_turnos(date) to authenticated;


--  Hasta que hora se pide el codigo del dia de una fecha. Sin p_cambiar
--  solo la lee. p_hasta nulo: todo el dia. Devuelve la hora (o nulo).
create or replace function codigo_turno_a_pie_hasta(p_fecha date, p_cambiar boolean default false, p_hasta time default null)
returns time
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_hasta time;
begin
  perform exigir_rol(array['admin']);

  if not exists (select 1 from bloques b where b.fecha = p_fecha and b.fila = 'a_pie') then
    raise exception 'FILA_A_PIE_NO_EXISTE';
  end if;

  if coalesce(p_cambiar, false) then
    update dias_entrega d
       set a_pie_codigo_hasta = p_hasta
     where d.fecha = p_fecha
    returning d.a_pie_codigo_hasta into v_hasta;
  else
    select d.a_pie_codigo_hasta into v_hasta from dias_entrega d where d.fecha = p_fecha;
  end if;

  return v_hasta;
end;
$$;

revoke execute on function codigo_turno_a_pie_hasta(date, boolean, time) from public, anon;
grant  execute on function codigo_turno_a_pie_hasta(date, boolean, time) to authenticated;

commit;
