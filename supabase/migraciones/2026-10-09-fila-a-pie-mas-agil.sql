-- ============================================================
--  Cajita de Bendicion - La fila a pie, mas agil (seccion 44)
--
--  Lo que se vio el jueves 8 de octubre de 2026:
--  * "No se presento" ya NO pierde el turno: si la persona llega despues,
--    su QR entrega igual; se le regresa a la fila cuando sea, y si vuelve a
--    escanear el QR general le sale su mismo turno.
--  * Entregar por numero de turno, sin QR (entregar_turno), para quien
--    perdio su pagina pero sabe su numero.
--  * La busqueda del escaner dice la fila y el turno de cada cita.
--
--  Cambia registrar_entrega() (quita una revision; el candado es el mismo),
--  saltar_turno(), sacar_turno_a_pie() y buscar_para_escaneo(). Requiere
--  2026-10-06-turno-a-pie-sin-datos.sql. Correrla FUERA del horario de
--  entrega y ANTES de subir las pantallas nuevas. Se puede repetir.
-- ============================================================

begin;

--  Ya no pierde el turno quien no se presento.
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

  --  Fila a pie: desde el 9 de octubre de 2026 "no se presento" ya NO
  --  pierde el turno (seccion 44). Si la persona llega despues, su QR
  --  entrega igual: la voluntaria se arregla con ella.

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


--  Regresar a la fila cuando sea.
create or replace function saltar_turno(p_turno int, p_saltado boolean default true)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_id  uuid;
  v_rol text;
begin
  v_rol := exigir_rol(array['admin', 'voluntario']);

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


--  Si lo llamaron y vuelve a escanear, le sale su mismo turno.
drop function if exists sacar_turno_a_pie(text, boolean);
drop function if exists sacar_turno_a_pie(text, boolean, text);

create or replace function sacar_turno_a_pie(
  p_dispositivo   text,
  p_cambiar_carro boolean default false,
  --  El codigo del dia, si ese dia se pide (seccion 43).
  p_codigo        text    default null
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

  --  El codigo del dia (seccion 43): sin el no hay turno, asi no se saca
  --  desde la casa con el enlace. Cinco codigos mal desde un telefono lo
  --  frenan 5 minutos: no se puede adivinar probando.
  if v_codigo_dia is not null then
    select count(*)::int, min(i.creado_en) into v_fallos, v_primero
      from intentos_turno i
     where i.dispositivo = v_disp and i.creado_en > now() - interval '5 minutes';

    if v_fallos >= 5 then
      return query select 'DEMASIADOS_INTENTOS'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0,
                          greatest(1, ceil(extract(epoch from (v_primero + interval '5 minutes' - now())))::int);
      return;
    end if;

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

  --  Tiene cita de carro hoy: primero se le pregunta.
  select count(*)::int, min(b.hora) into v_carros, v_hora
    from citas c join bloques b on b.id = c.bloque_id
   where c.dispositivo_id = v_disp and b.fecha = current_date and b.fila = 'carro'
     and c.estado in ('reservada', 'llego');

  --  Si es el dueno del carro: sus acompanantes, de cualquier telefono.
  select coalesce(array_agg(c.id), '{}') into v_duenos
    from citas c join bloques b on b.id = c.bloque_id
   where c.dispositivo_id = v_disp and b.fecha = current_date and b.fila = 'carro'
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
           motivo_cancelacion = case when c.dispositivo_id = v_disp then 'Se cambió a la fila a pie'
                                     else 'Su carro se cambió a la fila a pie' end,
           se_cambio_a_pie    = true
      from bloques b
     where b.id = c.bloque_id
       and (c.dispositivo_id = v_disp or c.acompana_a = any (v_duenos))
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

revoke execute on function sacar_turno_a_pie(text, boolean, text) from public;
grant  execute on function sacar_turno_a_pie(text, boolean, text) to anon, authenticated;


--  La fila y el turno de cada cita en la busqueda del escaner.
drop function if exists buscar_para_escaneo(text);

create or replace function buscar_para_escaneo(p_texto text)
returns table (
  nombre       text,
  codigo_corto text,
  fecha        date,
  hora         time,
  estado       text,
  --  true: no hubo coincidencia exacta y este codigo se parece al
  --  tecleado (un digito distinto o dos al reves). Solo citas de hoy.
  parecido     boolean,
  --  De que fila es, y su turno si es a pie (seccion 44): en la fila a pie
  --  el escaner muestra solo turnos a pie, con su numero.
  fila         text,
  turno        int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_texto    text   := trim(coalesce(p_texto, ''));
  --  "cb 4871", "4871" o "CB487l" se buscan como CB-4871 (seccion 33).
  v_codigo   text   := normalizar_codigo_corto(p_texto);
  --  Sin acentos y en cualquier orden: "garcia maria" encuentra a
  --  "María García". En el telefono casi nadie escribe acentos.
  v_palabras text[] := array_remove(string_to_array(normalizar_texto(p_texto), ' '), '');
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if v_texto = '' then
    return;
  end if;

  return query
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado, false, b.fila, c.turno
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and (
       --  Los turnos sin datos (personas.anonima) solo salen con el codigo
       --  EXACTO: su codigo es lo unico que prueba de quien es el turno. Si
       --  dos dicen "yo soy el 50", gana quien sabe el codigo (seccion 43).
       (b.fecha = current_date
        and not p.anonima
        and (p.codigo_corto ilike '%' || v_texto || '%'
             or (cardinality(v_palabras) > 0
                 and not exists (select 1 from unnest(v_palabras) w
                                  where normalizar_texto(p.nombre) not like '%' || w || '%'))))
       or
       (upper(p.codigo_corto) = v_codigo
        and b.fecha between current_date - 7 and current_date + 14)
     )
   order by (b.fecha = current_date) desc,
            abs(b.fecha - current_date),
            p.nombre
   limit 20;

  --  Nada con ese codigo: casi siempre es un digito mal tecleado. Se
  --  ofrecen los de HOY que se le parecen, y el voluntario confirma con
  --  el nombre. No abre el padron: son las mismas citas que ya salen al
  --  buscar por nombre.
  if found or v_codigo !~ '^CB-[0-9]{4}$' then
    return;
  end if;

  return query
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado, true, b.fila, c.turno
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and b.fecha = current_date
     and not p.anonima
     and codigos_parecidos(upper(p.codigo_corto), v_codigo)
   order by p.nombre
   limit 5;
end;
$$;


revoke execute on function buscar_para_escaneo(text) from public;
grant  execute on function buscar_para_escaneo(text) to authenticated;


--  Entregar el turno N de la fila a pie de hoy sin escanear su QR. No
--  reimplementa la entrega: busca el token y llama a registrar_entrega(),
--  con su mismo candado. Un QR escaneado y este boton al mismo tiempo
--  entregan una sola vez. TURNO_NO_EXISTE si hoy no hay ese turno.
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

commit;
