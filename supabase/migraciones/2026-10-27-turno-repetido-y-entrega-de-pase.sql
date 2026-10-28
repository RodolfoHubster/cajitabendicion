-- ============================================================
--  Cajita de Bendicion - Turno repetido y entrega de un pase a mano
--  (seccion 53)
--
--  * Desde el detalle de un turno en el escaner, cancelar el que sobra
--    cuando alguien saco dos (cancelar_turno_repetido); se puede regresar
--    el mismo dia (deshacer_turno_repetido). Su pagina le dice que ya tenia
--    otro, y ese telefono ya no saca mas turnos hoy (TURNO_REPETIDO).
--  * El administrador marca la caja de un pase que no se escaneo,
--    escogiendo el dia de entrega (marcar_entrega_pase).
--
--  Cambia sacar_turno_a_pie(), turno_de_cita() y turnos_a_pie_de_hoy(); no
--  toca registrar_entrega() ni los cupos. Mejor correrla fuera del horario
--  de la fila a pie, y ANTES de subir las pantallas nuevas. Se puede repetir.
-- ============================================================

begin;

--  Pedido del 27 de octubre de 2026:
--
--  * Turno repetido: alguien saca un segundo turno (otra ventana, otro
--    telefono) y se forma con los dos. Desde el detalle del turno en el
--    escaner, la voluntaria cancela el que sobra (cancelar_turno_repetido)
--    y la persona se queda con el otro. No es "anular" (seccion 46): con
--    un turno anulado se puede sacar otro al final; con uno repetido, no
--    (desde ese telefono, sacar_turno_a_pie dice TURNO_REPETIDO). Su pagina
--    le dice que ese turno se cancelo porque ya tenia otro, y cual, si la
--    voluntaria lo escribio. Se puede regresar el mismo dia, por si se
--    cancelo el equivocado (deshacer_turno_repetido). Queda quien y cuando.
--  * Entrega de un pase a mano: se dieron pases nuevos y nadie escaneo su
--    caja. El administrador la marca, escogiendo el dia de entrega
--    (marcar_entrega_pase), como marcar_entregada_panel() con las citas:
--    con el mismo candado que el escaner, una sola caja por pase por dia,
--    y queda que fue a mano, quien y por que.

alter table citas add column if not exists turno_repetido_en  timestamptz;
alter table citas add column if not exists turno_repetido_por uuid;
--  El turno con el que se queda, si la voluntaria lo escribio.
alter table citas add column if not exists turno_se_queda     int;

alter table entregas_pase add column if not exists a_mano boolean not null default false;
alter table entregas_pase add column if not exists motivo text;


--  Cancelar el turno N de hoy porque la persona ya tiene otro (p_se_queda,
--  opcional: el que conserva). Solo uno que sigue esperando (o que llamaron
--  y no estaba): uno que ya recibio no se cancela (TURNO_NO_EXISTE). Con el
--  mismo cuidado que anular_turno: dos voluntarias al mismo tiempo cancelan
--  uno solo.
create or replace function cancelar_turno_repetido(p_turno int, p_se_queda int default null)
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

  if p_se_queda is not null then
    if p_se_queda = p_turno then
      raise exception 'MISMO_TURNO';
    end if;

    if not exists (select 1
                     from citas c
                     join bloques b on b.id = c.bloque_id
                    where b.fecha = current_date
                      and b.fila = 'a_pie'
                      and c.turno = p_se_queda
                      and c.estado <> 'cancelada') then
      raise exception 'TURNO_QUE_QUEDA_NO_EXISTE';
    end if;
  end if;

  update citas c
     set estado             = 'cancelada',
         cancelada_en       = now(),
         cancelada_por      = auth.uid(),
         motivo_cancelacion = 'Turno repetido' || coalesce(': se queda con el turno ' || p_se_queda, ''),
         turno_repetido_en  = now(),
         turno_repetido_por = auth.uid(),
         turno_se_queda     = p_se_queda
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

revoke execute on function cancelar_turno_repetido(int, int) from public, anon;
grant  execute on function cancelar_turno_repetido(int, int) to authenticated;


--  Se cancelo el equivocado: el turno N de hoy vuelve a la fila, esperando.
create or replace function deshacer_turno_repetido(p_turno int)
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
     set estado             = 'reservada',
         cancelada_en       = null,
         cancelada_por      = null,
         motivo_cancelacion = null,
         turno_repetido_en  = null,
         turno_repetido_por = null,
         turno_se_queda     = null
    from bloques b
   where b.id = c.bloque_id
     and b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno = p_turno
     and c.estado = 'cancelada'
     and c.turno_repetido_en is not null
  returning c.id into v_id;

  if v_id is null then
    raise exception 'TURNO_NO_EXISTE';
  end if;

  return p_turno;
end;
$$;

revoke execute on function deshacer_turno_repetido(int) from public, anon;
grant  execute on function deshacer_turno_repetido(int) to authenticated;


--  La caja de un pase que no se escaneo, en un dia de entrega (hoy o uno
--  pasado). Solo el administrador. p_fila: carro (de arranque) o a_pie.
--  Contesta MARCADA, o: FECHA_FUTURA, FILA_INVALIDA, NO_ES_DIA_DE_ENTREGA
--  (no hubo entrega ese dia, o se cancelo), PASE_NO_EXISTE, PASE_REVOCADO
--  (ya no tenia pase ese dia) o PASE_YA_ENTREGADO (ese dia ya recibio).
create or replace function marcar_entrega_pase(
  p_codigo text,
  p_fecha  date,
  p_fila   text default 'carro',
  p_motivo text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_pase pases;
  v_fila text := coalesce(nullif(trim(p_fila), ''), 'carro');
begin
  perform exigir_rol(array['admin']);

  if p_fecha is null or p_fecha > current_date then
    raise exception 'FECHA_FUTURA';
  end if;

  if v_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  --  Un dia de entrega que no se cancelo (los de antes de dias_entrega
  --  solo tienen horarios).
  if not (exists (select 1 from dias_entrega d where d.fecha = p_fecha and not d.cerrado)
          or (not exists (select 1 from dias_entrega d where d.fecha = p_fecha)
              and exists (select 1 from bloques b where b.fecha = p_fecha))) then
    raise exception 'NO_ES_DIA_DE_ENTREGA';
  end if;

  --  El mismo candado que registrar_entrega(): si justo lo estan
  --  escaneando, uno espera al otro y ya ve la caja dada.
  select pa.* into v_pase
    from pases pa
    join personas p on p.id = pa.persona_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
   order by pa.activo desc, pa.creado_en desc
   limit 1
     for update of pa;

  if v_pase.id is null then
    raise exception 'PASE_NO_EXISTE';
  end if;

  --  Ya se lo habian quitado ese dia. (Uno dado despues si se puede: a
  --  veces se le da la caja y el pase se registra al otro dia.)
  if not v_pase.activo and (v_pase.revocado_en at time zone 'America/Los_Angeles')::date <= p_fecha then
    raise exception 'PASE_REVOCADO';
  end if;

  if exists (select 1 from entregas_pase e where e.pase_id = v_pase.id and e.fecha = p_fecha) then
    raise exception 'PASE_YA_ENTREGADO';
  end if;

  insert into entregas_pase (pase_id, fecha, usuario_id, fila, a_mano, motivo)
  values (v_pase.id, p_fecha, auth.uid(), v_fila, true,
          left(nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), ''), 200));

  return 'MARCADA';
end;
$$;

revoke execute on function marcar_entrega_pase(text, date, text, text) from public, anon;
grant  execute on function marcar_entrega_pase(text, date, text, text) to authenticated;


-- ------------------------------------------------------------
--  Lo que cambio de otras secciones (42, 43, 46)
-- ------------------------------------------------------------

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
  se_queda  int
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
         v_cita.turno_anulado_en is not null,
         v_cita.turno_repetido_en is not null,
         v_cita.turno_se_queda;
end;
$$;

revoke execute on function turno_de_cita(text) from public;
grant  execute on function turno_de_cita(text) to anon, authenticated;


drop function if exists turnos_a_pie_de_hoy();

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
  dado_por     text,
  repetido_en  timestamp,
  se_queda     int
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
         u.email::text,
         c.turno_repetido_en at time zone 'America/Los_Angeles',
         c.turno_se_queda
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.registrado_por
   where b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno is not null
     and (c.estado <> 'cancelada' or c.turno_anulado_en is not null or c.turno_repetido_en is not null)
   order by c.turno;
end;
$$;

revoke execute on function turnos_a_pie_de_hoy() from public, anon;
grant  execute on function turnos_a_pie_de_hoy() to authenticated;


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

  --  Seccion 53: desde este telefono se saco un turno repetido y la
  --  voluntaria lo cancelo. Ya tiene otro: no se le da uno mas.
  if exists (select 1
               from citas c
              where c.bloque_id = v_bloque.id
                and c.dispositivo_id = v_disp
                and c.turno_repetido_en is not null) then
    return query select 'TURNO_REPETIDO'::text, null::text, null::text, null::int, current_date,
                        null::time, null::timestamp, 0, null::time, 0, 0;
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

commit;
