-- ============================================================
--  Cajita de Bendicion - Pruebas de las reglas en la base de datos
-- ============================================================
--  Como usarlo: SQL Editor de Supabase, pestana nueva, pegar TODO y Run.
--
--  AL TERMINAR SIEMPRE SALE UN "ERROR", A PROPOSITO. Ese error trae el
--  resultado ("PRUEBAS: 90 de 90 pasaron" y la lista) y es lo que deshace
--  todo lo que las pruebas crearon: fechas, horarios, personas, citas y
--  escaneos de prueba. No queda nada guardado y no se tocan las fechas
--  reales (las de prueba estan a unos 9 meses de hoy).
--
--  Requiere todas las migraciones, hasta 2026-09-12-nombre-y-telefono.sql.
--
--  Las pruebas del panel, del escaneo y de roles se hacen "como" la primera
--  cuenta con rol admin de la tabla personal. Si no hay ninguna, se omiten
--  y el resultado lo dice.
--
--  Lo que NO cubre: personas registrandose o escaneando al MISMO tiempo.
--  Eso necesita conexiones simultaneas de verdad y esta en
--  scripts/prueba-concurrencia.mjs y scripts/prueba-escaneo.mjs.
-- ============================================================

do $pruebas$
declare
  v_lunes        date := date_trunc('week', current_date + 280)::date;
  v_jueves       date;
  v_programada   date;
  v_ventana      date;
  v_cerrada      date;
  v_nueva        date;
  v_pasada       date := current_date - 400;
  v_hoy          date := current_date;

  v_b_lunes      uuid;
  v_b_uno        uuid;
  v_b_cerrado    uuid;
  v_b_jueves     uuid;
  v_b_programada uuid;
  v_b_ventana    uuid;
  v_b_cerrada    uuid;
  v_b_pasada     uuid;
  v_b_hoy        uuid;
  v_b_nuevo      uuid;

  v_admin        uuid;
  v_persona      uuid;
  v_token        text;
  v_token_otro   text;
  v_codigo       text;
  v_texto        text;
  v_nombre       text;
  v_nombres      text;
  v_apellidos    text;
  v_telefono     text;
  v_email        text;
  v_numero       int;
  v_si           boolean;
  v_numero2      int;

  v_total        int;
  v_pasaron      int;
  v_lista        text;
begin
  v_jueves     := v_lunes + 3;
  v_programada := v_lunes + 7;
  v_ventana    := v_lunes + 10;
  v_cerrada    := v_lunes + 14;
  v_nueva      := v_lunes + 21;

  if exists (select 1 from dias_entrega
              where fecha in (v_lunes, v_jueves, v_programada, v_ventana, v_cerrada, v_nueva, v_pasada)) then
    raise exception 'PRUEBAS: ya hay fechas de entrega reales en las fechas de prueba (desde %). No se corrio nada.', v_lunes;
  end if;

  -- ==========================================================
  --  Herramientas (se borran solas al final)
  -- ==========================================================
  create temp table resultados (n serial, prueba text, paso boolean, detalle text);

  --  Corre p_sql y espera que falle con p_codigo.
  execute $f$
    create function pg_temp.esperar_error(p_prueba text, p_sql text, p_codigo text)
    returns void language plpgsql as $b$
    begin
      begin
        execute p_sql;
      exception when others then
        insert into resultados (prueba, paso, detalle)
        values (p_prueba, sqlerrm like '%' || p_codigo || '%', sqlerrm);
        return;
      end;
      insert into resultados (prueba, paso, detalle)
      values (p_prueba, false, 'no marco error; se esperaba ' || p_codigo);
    end
    $b$
  $f$;

  --  Corre p_sql y espera que funcione. Lo que haga se queda (hasta el final).
  execute $f$
    create function pg_temp.esperar_ok(p_prueba text, p_sql text)
    returns void language plpgsql as $b$
    begin
      execute p_sql;
      insert into resultados (prueba, paso, detalle) values (p_prueba, true, null);
    exception when others then
      insert into resultados (prueba, paso, detalle) values (p_prueba, false, sqlerrm);
    end
    $b$
  $f$;

  execute $f$
    create function pg_temp.comprobar(p_prueba text, p_condicion boolean, p_detalle text default null)
    returns void language sql as $b$
      insert into resultados (prueba, paso, detalle)
      values (p_prueba, coalesce(p_condicion, false), p_detalle);
    $b$
  $f$;

  --  Arma la llamada al registro publico con datos correctos por defecto.
  execute $f$
    create function pg_temp.registro(
      p_bloque      uuid,
      p_codigo      text default null,
      p_dispositivo text default null,
      p_nombre      text default 'María',
      p_apellidos   text default 'Pérez',
      p_telefono    text default '+16195551234',
      p_email       text default 'maria@gmail.com'
    )
    returns text language sql as $b$
      select format(
        'select * from registrar_y_reservar(p_nombre => %L, p_apellidos => %L, p_telefono => %L, '
        'p_bloque_id => %L::uuid, p_email => %L, p_dispositivo => %L, p_codigo_anticipado => %L)',
        p_nombre, p_apellidos, p_telefono, p_bloque, p_email, p_dispositivo, p_codigo);
    $b$
  $f$;

  --  Arma la llamada al registro desde el panel.
  execute $f$
    create function pg_temp.panel(
      p_bloque    uuid,
      p_nombre    text default 'José',
      p_apellidos text default 'Ramírez',
      p_telefono  text default '+526641234567',
      p_email     text default null
    )
    returns text language sql as $b$
      select format(
        'select * from registrar_desde_panel(p_nombre => %L, p_apellidos => %L, p_telefono => %L, '
        'p_bloque_id => %L::uuid, p_email => %L)',
        p_nombre, p_apellidos, p_telefono, p_bloque, p_email);
    $b$
  $f$;

  --  Arma la llamada para crear una fecha desde el panel.
  execute $f$
    create function pg_temp.crear(
      p_fecha date, p_inicio text, p_fin text, p_capacidad int,
      p_abre timestamptz, p_anticipado timestamptz default null
    )
    returns text language sql as $b$
      select format(
        'select crear_dia_entrega(p_fecha => %L::date, p_hora_inicio => %L::time, p_hora_fin => %L::time, '
        'p_capacidad => %s, p_abre_en => %L::timestamp, p_abre_anticipado_en => %L::timestamp)',
        p_fecha, p_inicio, p_fin, p_capacidad,
        p_abre at time zone 'America/Los_Angeles',
        p_anticipado at time zone 'America/Los_Angeles');
    $b$
  $f$;

  -- ==========================================================
  --  Datos de prueba
  -- ==========================================================
  insert into dias_entrega (fecha, abre_en, abre_anticipado_en, codigo_anticipado, cerrado) values
    (v_lunes,      now() - interval '1 day',    null,                        'ABCDEF', false),  -- abierta
    (v_jueves,     now() - interval '1 day',    null,                        'ABCDEG', false),  -- abierta, misma semana
    (v_programada, now() + interval '1 day',    now() + interval '12 hours', 'PRUEBA', false),  -- aun no abre
    (v_ventana,    now() + interval '1 day',    now() - interval '1 hour',   'K7MP2Q', false),  -- hora de suscriptores
    (v_cerrada,    now() - interval '1 day',    null,                        'CERRAD', true),   -- cerrada
    (v_pasada,     now() - interval '500 days', null,                        'PASADA', false);  -- ya paso

  insert into bloques (fecha, hora, capacidad) values (v_lunes, '14:00', 50) returning id into v_b_lunes;
  insert into bloques (fecha, hora, capacidad) values (v_lunes, '14:15', 1) returning id into v_b_uno;
  insert into bloques (fecha, hora, capacidad, cerrado) values (v_lunes, '14:30', 50, true) returning id into v_b_cerrado;
  insert into bloques (fecha, hora, capacidad) values (v_jueves, '14:00', 50) returning id into v_b_jueves;
  insert into bloques (fecha, hora, capacidad) values (v_programada, '14:00', 50) returning id into v_b_programada;
  insert into bloques (fecha, hora, capacidad) values (v_ventana, '14:00', 50) returning id into v_b_ventana;
  insert into bloques (fecha, hora, capacidad) values (v_cerrada, '14:00', 50) returning id into v_b_cerrada;
  insert into bloques (fecha, hora, capacidad) values (v_pasada, '14:00', 50) returning id into v_b_pasada;

  -- ==========================================================
  --  1. Registro publico: datos de la persona
  -- ==========================================================
  perform pg_temp.esperar_error('Registro: sin nombre',
    pg_temp.registro(v_b_lunes, p_nombre => '  '), 'NOMBRE_REQUERIDO');
  perform pg_temp.esperar_error('Registro: sin apellidos',
    pg_temp.registro(v_b_lunes, p_apellidos => ''), 'APELLIDOS_REQUERIDOS');
  perform pg_temp.esperar_error('Registro: nombre con números',
    pg_temp.registro(v_b_lunes, p_nombre => 'Mar1a'), 'NOMBRE_INVALIDO');
  perform pg_temp.esperar_error('Registro: apellidos con números (el teléfono en la casilla equivocada)',
    pg_temp.registro(v_b_lunes, p_apellidos => '6641234567'), 'NOMBRE_INVALIDO');
  perform pg_temp.esperar_error('Registro: sin teléfono',
    pg_temp.registro(v_b_lunes, p_telefono => ''), 'TELEFONO_REQUERIDO');
  perform pg_temp.esperar_error('Registro: teléfono sin lada (+)',
    pg_temp.registro(v_b_lunes, p_telefono => '6641234567'), 'TELEFONO_INVALIDO');
  perform pg_temp.esperar_error('Registro: teléfono con espacios',
    pg_temp.registro(v_b_lunes, p_telefono => '+52 664 123 4567'), 'TELEFONO_INVALIDO');
  perform pg_temp.esperar_error('Registro: teléfono con letras',
    pg_temp.registro(v_b_lunes, p_telefono => '+52664abc4567'), 'TELEFONO_INVALIDO');
  perform pg_temp.esperar_error('Registro: teléfono con 16 dígitos',
    pg_temp.registro(v_b_lunes, p_telefono => '+1234567890123456'), 'TELEFONO_INVALIDO');
  perform pg_temp.esperar_error('Registro: teléfono demasiado corto',
    pg_temp.registro(v_b_lunes, p_telefono => '+5212'), 'TELEFONO_INVALIDO');
  perform pg_temp.esperar_error('Registro: teléfono con lada que empieza en 0',
    pg_temp.registro(v_b_lunes, p_telefono => '+0526641234567'), 'TELEFONO_INVALIDO');
  perform pg_temp.esperar_error('Registro: sin correo',
    pg_temp.registro(v_b_lunes, p_email => ''), 'EMAIL_REQUERIDO');
  perform pg_temp.esperar_error('Registro: correo sin @',
    pg_temp.registro(v_b_lunes, p_email => 'mariagmail.com'), 'EMAIL_INVALIDO');
  perform pg_temp.esperar_error('Registro: correo sin punto después de la @',
    pg_temp.registro(v_b_lunes, p_email => 'maria@gmail'), 'EMAIL_INVALIDO');
  perform pg_temp.esperar_error('Registro: correo con espacio',
    pg_temp.registro(v_b_lunes, p_email => 'maria @gmail.com'), 'EMAIL_INVALIDO');

  -- ==========================================================
  --  2. Registro publico: horario y fecha
  -- ==========================================================
  perform pg_temp.esperar_error('Registro: horario que no existe',
    pg_temp.registro(gen_random_uuid()), 'BLOQUE_NO_EXISTE');
  perform pg_temp.esperar_error('Registro: fecha cerrada',
    pg_temp.registro(v_b_cerrada), 'DIA_CERRADO');
  perform pg_temp.esperar_error('Registro: horario cerrado',
    pg_temp.registro(v_b_cerrado), 'BLOQUE_CERRADO');
  perform pg_temp.esperar_error('Registro: fecha que ya pasó',
    pg_temp.registro(v_b_pasada), 'FECHA_PASADA');

  -- ==========================================================
  --  3. Apertura y codigo de suscriptores
  -- ==========================================================
  perform pg_temp.esperar_error('Apertura: antes de abrir, sin código, nadie entra',
    pg_temp.registro(v_b_programada), 'AUN_NO_ABRE');
  perform pg_temp.esperar_error('Apertura: antes de la hora de suscriptores, ni con el código correcto',
    pg_temp.registro(v_b_programada, p_codigo => 'PRUEBA'), 'AUN_NO_ABRE');
  perform pg_temp.esperar_error('Apertura: en hora de suscriptores, sin código no entra',
    pg_temp.registro(v_b_ventana), 'AUN_NO_ABRE');
  perform pg_temp.esperar_error('Apertura: en hora de suscriptores, código equivocado',
    pg_temp.registro(v_b_ventana, p_codigo => 'ZZZZZZ'), 'CODIGO_ANTICIPADO_INVALIDO');
  perform pg_temp.esperar_error('Apertura: el código de otra fecha no sirve',
    pg_temp.registro(v_b_ventana, p_codigo => 'PRUEBA'), 'CODIGO_ANTICIPADO_INVALIDO');
  perform pg_temp.esperar_ok('Apertura: en hora de suscriptores, código correcto en minúsculas y con espacios',
    pg_temp.registro(v_b_ventana, p_codigo => ' k7mp2q '));

  select exists (select 1 from citas where bloque_id = v_b_ventana and con_codigo_anticipado) into v_si;
  perform pg_temp.comprobar('Apertura: la cita queda marcada como "entró con código"', v_si);

  -- ==========================================================
  --  4. Registro correcto: que guarda
  -- ==========================================================
  begin
    select r.token_qr into v_token
      from registrar_y_reservar(p_nombre => '  maría   josé ', p_apellidos => 'Pérez   López',
                                p_telefono => '+526641234567', p_bloque_id => v_b_lunes,
                                p_email => ' maria@gmail.com ') r;
    perform pg_temp.comprobar('Registro: fecha abierta, sin código, entra', v_token is not null);
  exception when others then
    perform pg_temp.comprobar('Registro: fecha abierta, sin código, entra', false, sqlerrm);
  end;

  select p.nombre, p.nombres, p.apellidos, p.telefono, p.email
    into v_nombre, v_nombres, v_apellidos, v_telefono, v_email
    from citas c join personas p on p.id = c.persona_id
   where c.token_qr = v_token;

  perform pg_temp.comprobar('Registro: guarda nombres y apellidos por separado, sin espacios de más',
    v_nombres = 'maría josé' and v_apellidos = 'Pérez López', format('%s | %s', v_nombres, v_apellidos));
  perform pg_temp.comprobar('Registro: guarda el nombre completo (el que sale al escanear)',
    v_nombre = 'maría josé Pérez López', v_nombre);
  perform pg_temp.comprobar('Registro: guarda el teléfono internacional y el correo sin espacios',
    v_telefono = '+526641234567' and v_email = 'maria@gmail.com', format('%s | %s', v_telefono, v_email));

  select nombre into v_texto from consultar_cita(v_token);
  perform pg_temp.comprobar('Confirmación: consultar_cita devuelve el nombre completo',
    v_texto = 'maría josé Pérez López', v_texto);

  -- ==========================================================
  --  5. Cupo
  -- ==========================================================
  perform pg_temp.esperar_ok('Cupo: horario de 1 lugar, la primera persona entra',
    pg_temp.registro(v_b_uno));
  perform pg_temp.esperar_error('Cupo: horario de 1 lugar, la segunda ya no',
    pg_temp.registro(v_b_uno), 'BLOQUE_LLENO');
  update citas set estado = 'cancelada' where bloque_id = v_b_uno;
  perform pg_temp.esperar_ok('Cupo: si se cancela, el lugar se libera',
    pg_temp.registro(v_b_uno));

  -- ==========================================================
  --  6. Limite por dispositivo (se pone en 2 solo durante la prueba)
  -- ==========================================================
  insert into configuracion (clave, valor) values ('limite_citas_por_dispositivo', '2')
  on conflict (clave) do update set valor = excluded.valor;

  perform pg_temp.esperar_ok('Dispositivo: 1a cita de la semana',
    pg_temp.registro(v_b_lunes, p_dispositivo => 'prueba-disp-a'));
  perform pg_temp.esperar_ok('Dispositivo: 2a cita de la semana (jueves)',
    pg_temp.registro(v_b_jueves, p_dispositivo => 'prueba-disp-a'));
  perform pg_temp.esperar_error('Dispositivo: 3a cita la misma semana, ya no',
    pg_temp.registro(v_b_lunes, p_dispositivo => 'prueba-disp-a'), 'LIMITE_DISPOSITIVO');
  perform pg_temp.esperar_ok('Dispositivo: otro teléfono sí puede',
    pg_temp.registro(v_b_lunes, p_dispositivo => 'prueba-disp-b'));
  perform pg_temp.esperar_ok('Dispositivo: la semana siguiente vuelve a poder',
    pg_temp.registro(v_b_ventana, p_codigo => 'K7MP2Q', p_dispositivo => 'prueba-disp-a'));
  perform pg_temp.esperar_ok('Dispositivo: sin identificador (navegador bloqueado) no hay tope',
    pg_temp.registro(v_b_lunes, p_dispositivo => null));

  -- ==========================================================
  --  7. Una cita por semana (misma persona)
  -- ==========================================================
  insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
  values ('CB-PRB1', 'Prueba Semana', 'Prueba', 'Semana', '+16195550000')
  returning id into v_persona;

  perform pg_temp.esperar_ok('Semana: reserva el lunes',
    format('select reservar_cita(%L::uuid, %L::uuid)', v_persona, v_b_lunes));
  perform pg_temp.esperar_error('Semana: no puede reservar también el jueves',
    format('select reservar_cita(%L::uuid, %L::uuid)', v_persona, v_b_jueves), 'YA_TIENE_CITA_ESTA_SEMANA');
  update citas set estado = 'cancelada' where persona_id = v_persona;
  perform pg_temp.esperar_ok('Semana: si cancela el lunes, puede reservar el jueves',
    format('select reservar_cita(%L::uuid, %L::uuid)', v_persona, v_b_jueves));
  perform pg_temp.esperar_ok('Semana: la semana siguiente también puede',
    format('select reservar_cita(%L::uuid, %L::uuid)', v_persona, v_b_programada));

  -- ==========================================================
  --  8. Revisar el codigo de suscriptor (lo usa el calendario)
  -- ==========================================================
  perform pg_temp.comprobar('Código: correcto en hora de suscriptores',
    validar_codigo_anticipado(v_ventana, 'K7MP2Q'));
  perform pg_temp.comprobar('Código: acepta minúsculas y espacios',
    validar_codigo_anticipado(v_ventana, ' k7mp2q '));
  perform pg_temp.comprobar('Código: equivocado no sirve',
    not validar_codigo_anticipado(v_ventana, 'ZZZZZZ'));
  perform pg_temp.comprobar('Código: vacío no sirve',
    not validar_codigo_anticipado(v_ventana, null));
  perform pg_temp.comprobar('Código: antes de la hora de suscriptores no sirve',
    not validar_codigo_anticipado(v_programada, 'PRUEBA'));
  perform pg_temp.comprobar('Código: en una fecha ya abierta al público no hace falta (no se pide)',
    not validar_codigo_anticipado(v_lunes, 'ABCDEF'));

  -- ==========================================================
  --  9. Calendario publico
  -- ==========================================================
  select abierto into v_si from consultar_disponibilidad(v_programada, v_programada) limit 1;
  perform pg_temp.comprobar('Calendario: la fecha que aún no abre sale, pero bloqueada', v_si = false);

  select abierto into v_si from consultar_disponibilidad(v_lunes, v_lunes) limit 1;
  perform pg_temp.comprobar('Calendario: la fecha abierta sale abierta', v_si = true);

  select count(*) into v_numero from consultar_disponibilidad(v_cerrada, v_cerrada);
  perform pg_temp.comprobar('Calendario: la fecha cerrada no sale', v_numero = 0, v_numero::text);

  select count(*) into v_numero from consultar_disponibilidad(v_lunes, v_lunes) where bloque_id = v_b_cerrado;
  perform pg_temp.comprobar('Calendario: el horario cerrado no sale', v_numero = 0, v_numero::text);

  select libres into v_numero from consultar_disponibilidad(v_lunes, v_lunes) where bloque_id = v_b_uno;
  perform pg_temp.comprobar('Calendario: cuenta los lugares ocupados sin contar canceladas', v_numero = 0, v_numero::text);

  -- ==========================================================
  --  10. El caso del jueves: una fecha abierta que se vuelve a programar
  -- ==========================================================
  update dias_entrega
     set abre_en = now() + interval '2 hours', abre_anticipado_en = now() + interval '1 hour'
   where fecha = v_jueves;

  select abierto into v_si from consultar_disponibilidad(v_jueves, v_jueves) limit 1;
  perform pg_temp.comprobar('Caso jueves: con la apertura en el futuro, la fecha queda bloqueada', v_si = false);
  perform pg_temp.esperar_error('Caso jueves: antes de la hora de suscriptores nadie entra, ni con código',
    pg_temp.registro(v_b_jueves, p_codigo => 'ABCDEG'), 'AUN_NO_ABRE');

  update dias_entrega set abre_anticipado_en = now() - interval '1 minute' where fecha = v_jueves;
  perform pg_temp.esperar_error('Caso jueves: en hora de suscriptores, sin código no entra',
    pg_temp.registro(v_b_jueves), 'AUN_NO_ABRE');
  perform pg_temp.esperar_ok('Caso jueves: en hora de suscriptores, con código sí entra',
    pg_temp.registro(v_b_jueves, p_codigo => 'ABCDEG'));

  update dias_entrega set abre_en = now() - interval '1 minute' where fecha = v_jueves;
  perform pg_temp.esperar_ok('Caso jueves: ya abierta al público, entra sin código',
    pg_temp.registro(v_b_jueves));

  -- ==========================================================
  --  10b. Cancelar la propia cita (desde el enlace de confirmacion)
  -- ==========================================================
  select token_qr into v_token from citas where bloque_id = v_b_uno and estado <> 'cancelada' limit 1;

  perform pg_temp.esperar_ok('Cancelar: la persona cancela su cita desde su enlace',
    format('select cancelar_mi_cita(%L)', v_token));
  select estado into v_texto from citas where token_qr = v_token;
  perform pg_temp.comprobar('Cancelar: queda cancelada, con la hora y sin "quién" (fue la propia persona)',
    v_texto = 'cancelada'
    and (select cancelada_en is not null and cancelada_por is null from citas where token_qr = v_token),
    v_texto);
  perform pg_temp.esperar_ok('Cancelar: su lugar queda libre para otra persona',
    pg_temp.registro(v_b_uno));
  perform pg_temp.esperar_error('Cancelar: no se cancela dos veces',
    format('select cancelar_mi_cita(%L)', v_token), 'CITA_YA_CANCELADA');
  perform pg_temp.esperar_error('Cancelar: un enlace que no existe',
    'select cancelar_mi_cita(''no-existe'')', 'CITA_NO_EXISTE');

  insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
  values ('CB-PRB6', 'Prueba Entregada', 'Prueba', 'Entregada', '+16195550006') returning id into v_persona;
  insert into citas (persona_id, bloque_id, semana, token_qr, estado)
  values (v_persona, v_b_programada, date_trunc('week', v_programada)::date, 'token-prueba-entregada', 'entregada');
  perform pg_temp.esperar_error('Cancelar: una cita que ya se usó no se cancela',
    'select cancelar_mi_cita(''token-prueba-entregada'')', 'CITA_YA_ENTREGADA');

  insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
  values ('CB-PRB7', 'Prueba Pasada', 'Prueba', 'Pasada', '+16195550007') returning id into v_persona;
  insert into citas (persona_id, bloque_id, semana, token_qr)
  values (v_persona, v_b_pasada, date_trunc('week', v_pasada)::date, 'token-prueba-pasada');
  perform pg_temp.esperar_error('Cancelar: una cita de un día que ya pasó no se cancela',
    'select cancelar_mi_cita(''token-prueba-pasada'')', 'FECHA_PASADA');

  -- ==========================================================
  --  11. Panel, escaneo y roles (como la primera cuenta admin)
  -- ==========================================================
  select usuario_id into v_admin from personal where rol = 'admin' and activo order by creado_en limit 1;

  if v_admin is null then
    perform pg_temp.comprobar('Panel, escaneo y roles: OMITIDAS porque no hay ninguna cuenta admin', true, 'omitidas');
  else
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- ---------- Crear y editar fechas ----------
    perform pg_temp.esperar_error('Panel: no crea fechas que ya pasaron',
      pg_temp.crear(current_date - 1, '14:00', '18:30', 20, now()), 'FECHA_PASADA');
    perform pg_temp.esperar_error('Panel: el último horario no puede ir antes del primero',
      pg_temp.crear(v_nueva, '18:30', '14:00', 20, now()), 'HORARIO_INVALIDO');
    perform pg_temp.esperar_error('Panel: lugares negativos',
      pg_temp.crear(v_nueva, '14:00', '18:30', -1, now()), 'CAPACIDAD_INVALIDA');
    perform pg_temp.esperar_error('Panel: suscriptores no pueden entrar después del público',
      pg_temp.crear(v_nueva, '14:00', '18:30', 20, now() + interval '1 day', now() + interval '2 days'),
      'ANTICIPADO_DESPUES_DE_APERTURA');

    begin
      select crear_dia_entrega(v_nueva, '14:00', '18:30', 20,
                               (now() + interval '1 day') at time zone 'America/Los_Angeles',
                               (now() + interval '23 hours') at time zone 'America/Los_Angeles')
        into v_codigo;
      perform pg_temp.comprobar('Panel: crea la fecha y devuelve su código', v_codigo is not null);
    exception when others then
      perform pg_temp.comprobar('Panel: crea la fecha y devuelve su código', false, sqlerrm);
    end;

    select count(*) into v_numero from bloques where fecha = v_nueva;
    perform pg_temp.comprobar('Panel: crea horarios de 15 en 15 (2:00 a 6:30 PM son 19)', v_numero = 19, v_numero::text);
    perform pg_temp.comprobar('Panel: el código tiene 6 caracteres sin 0, O, 1 ni I',
      v_codigo ~ '^[A-HJ-NP-Z2-9]{6}$', v_codigo);
    perform pg_temp.esperar_error('Panel: no crea la misma fecha dos veces',
      pg_temp.crear(v_nueva, '14:00', '18:30', 20, now() + interval '1 day'), 'DIA_YA_EXISTE');

    select regenerar_codigo_anticipado(v_nueva) into v_texto;
    perform pg_temp.comprobar('Panel: "Generar otro" cambia el código',
      v_texto is distinct from v_codigo
      and v_texto = (select codigo_anticipado from dias_entrega where fecha = v_nueva),
      format('%s -> %s', v_codigo, v_texto));

    perform pg_temp.esperar_error('Panel: al editar, suscriptores no pueden entrar después del público',
      format('select actualizar_dia_entrega(%L::date, %L::timestamp, %L::timestamp, false)', v_nueva,
             (now() + interval '1 day') at time zone 'America/Los_Angeles',
             (now() + interval '2 days') at time zone 'America/Los_Angeles'),
      'ANTICIPADO_DESPUES_DE_APERTURA');

    -- ---------- Horarios ----------
    perform pg_temp.esperar_error('Horarios: no agrega una hora que ya existe',
      format('select agregar_bloque(%L::date, %L::time, 20)', v_nueva, '14:00'), 'BLOQUE_YA_EXISTE');

    begin
      select agregar_bloque(v_nueva, '18:45', 20) into v_b_nuevo;
      perform pg_temp.comprobar('Horarios: agrega una hora nueva', v_b_nuevo is not null);
    exception when others then
      perform pg_temp.comprobar('Horarios: agrega una hora nueva', false, sqlerrm);
    end;

    perform pg_temp.esperar_error('Horarios: lugares negativos',
      format('select actualizar_bloque(%L::uuid, -1, null)', v_b_lunes), 'CAPACIDAD_INVALIDA');
    perform pg_temp.esperar_ok('Horarios: cerrar un horario',
      format('select actualizar_bloque(%L::uuid, null, true)', v_b_lunes));
    perform pg_temp.esperar_error('Horarios: en un horario cerrado ya nadie se registra',
      pg_temp.registro(v_b_lunes), 'BLOQUE_CERRADO');
    perform pg_temp.esperar_ok('Horarios: reabrir el horario',
      format('select actualizar_bloque(%L::uuid, null, false)', v_b_lunes));
    perform pg_temp.esperar_error('Horarios: no se elimina un horario con registros',
      format('select eliminar_bloque(%L::uuid)', v_b_lunes), 'BLOQUE_CON_CITAS');
    perform pg_temp.esperar_ok('Horarios: se elimina un horario sin registros',
      format('select eliminar_bloque(%L::uuid)', v_b_nuevo));

    perform pg_temp.esperar_error('Panel: no se elimina una fecha con registros',
      format('select eliminar_dia_entrega(%L::date)', v_lunes), 'DIA_CON_CITAS');
    perform pg_temp.esperar_ok('Panel: se elimina una fecha sin registros',
      format('select eliminar_dia_entrega(%L::date)', v_nueva));
    select count(*) into v_numero from bloques where fecha = v_nueva;
    perform pg_temp.comprobar('Panel: al eliminar la fecha se van sus horarios', v_numero = 0, v_numero::text);

    -- ---------- Registro desde el panel ----------
    perform pg_temp.esperar_ok('Panel: registra sin correo', pg_temp.panel(v_b_lunes));
    perform pg_temp.esperar_ok('Panel: registra en una fecha que aún no abre al público',
      pg_temp.panel(v_b_programada));
    perform pg_temp.esperar_error('Panel: no registra en una fecha cerrada',
      pg_temp.panel(v_b_cerrada), 'DIA_CERRADO');
    perform pg_temp.esperar_error('Panel: teléfono inválido',
      pg_temp.panel(v_b_lunes, p_telefono => '664 123 4567'), 'TELEFONO_INVALIDO');
    perform pg_temp.esperar_error('Panel: sin apellidos',
      pg_temp.panel(v_b_lunes, p_apellidos => ''), 'APELLIDOS_REQUERIDOS');
    perform pg_temp.esperar_error('Panel: correo mal escrito',
      pg_temp.panel(v_b_lunes, p_email => 'jose@'), 'EMAIL_INVALIDO');

    -- ---------- Escaneo ----------
    if not exists (select 1 from dias_entrega where fecha = v_hoy) then
      insert into dias_entrega (fecha, abre_en, codigo_anticipado) values (v_hoy, now() - interval '1 day', 'HOYHOY');
    end if;
    insert into bloques (fecha, hora, capacidad) values (v_hoy, '23:58', 5)
    on conflict (fecha, hora) do update set capacidad = excluded.capacidad
    returning id into v_b_hoy;

    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
    values ('CB-PRB2', 'Prueba Escaneo', 'Prueba', 'Escaneo', '+16195550001') returning id into v_persona;
    select (reservar_cita(v_persona, v_b_hoy)).token_qr into v_token;

    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
    values ('CB-PRB3', 'Prueba Otra Fecha', 'Prueba', 'Otra Fecha', '+16195550002') returning id into v_persona;
    select (reservar_cita(v_persona, v_b_programada)).token_qr into v_token_otro;

    select resultado into v_texto from registrar_entrega(v_token);
    perform pg_temp.comprobar('Escaneo: la primera vez, VALIDO', v_texto = 'VALIDO', v_texto);
    select resultado into v_texto from registrar_entrega(v_token);
    perform pg_temp.comprobar('Escaneo: el mismo QR otra vez, YA_USADO', v_texto = 'YA_USADO', v_texto);
    select resultado into v_texto from registrar_entrega_por_codigo('cb-prb2');
    perform pg_temp.comprobar('Escaneo: por código corto tampoco entrega dos veces', v_texto = 'YA_USADO', v_texto);
    select resultado into v_texto from registrar_entrega(v_token_otro);
    perform pg_temp.comprobar('Escaneo: QR de otro día, OTRA_FECHA', v_texto = 'OTRA_FECHA', v_texto);
    select resultado into v_texto from registrar_entrega('no-existe');
    perform pg_temp.comprobar('Escaneo: QR que no existe, NO_EXISTE', v_texto = 'NO_EXISTE', v_texto);
    select resultado into v_texto from registrar_entrega_autorizada(v_token_otro, null);
    perform pg_temp.comprobar('Escaneo: el admin autoriza otro día sin código', v_texto = 'VALIDO_AUTORIZADO', v_texto);
    select resultado into v_texto from registrar_entrega_autorizada(v_token_otro, null);
    perform pg_temp.comprobar('Escaneo: autorizado tampoco entrega dos veces', v_texto = 'YA_USADO', v_texto);

    -- ---------- Entraron sin cita ----------
    select sin_cita into v_numero from resumen_del_dia(null);

    perform pg_temp.esperar_error('Sin cita: sin nombre no se anota',
      'select * from registrar_entrada_sin_cita(''   '')', 'NOMBRE_REQUERIDO');
    perform pg_temp.esperar_error('Sin cita: el nombre no lleva números',
      'select * from registrar_entrada_sin_cita(''Juan 2'')', 'NOMBRE_INVALIDO');

    begin
      select r.codigo into v_codigo from registrar_entrada_sin_cita('  josé   ramírez ') r;
      perform pg_temp.comprobar('Sin cita: se anota con nombre y da un código de comprobante',
        v_codigo ~ '^SC-[0-9]{4}$', v_codigo);
    exception when others then
      perform pg_temp.comprobar('Sin cita: se anota con nombre y da un código de comprobante', false, sqlerrm);
    end;

    perform pg_temp.esperar_ok('Sin cita: se anota otra persona',
      'select * from registrar_entrada_sin_cita(''Ana López'')');

    select sin_cita into v_numero2 from resumen_del_dia(null);
    perform pg_temp.comprobar('Sin cita: el resumen del día las cuenta', v_numero2 = v_numero + 2,
      format('%s -> %s', v_numero, v_numero2));

    select count(*) into v_numero2
      from entradas_sin_cita_del_dia(null) e
     where e.codigo = v_codigo
       and e.nombre = 'josé ramírez'
       and e.anotado_por is not null
       and e.registrado_en is not null
       and not e.anulada;
    perform pg_temp.comprobar('Sin cita: la lista del día muestra nombre, código, quién lo anotó y a qué hora',
      v_numero2 = 1, v_numero2::text);

    perform pg_temp.esperar_ok('Sin cita: se anula una anotada por error',
      format('select anular_entrada_sin_cita(%L)', v_codigo));
    select sin_cita into v_numero2 from resumen_del_dia(null);
    perform pg_temp.comprobar('Sin cita: la anulada ya no cuenta', v_numero2 = v_numero + 1,
      format('%s -> %s', v_numero, v_numero2));

    select count(*) into v_numero2
      from entradas_sin_cita_del_dia(null) e
     where e.codigo = v_codigo and e.anulada and e.anulada_por is not null and e.anulada_en is not null;
    perform pg_temp.comprobar('Sin cita: la anulada no se borra, queda quién la anuló y cuándo',
      v_numero2 = 1, v_numero2::text);

    perform pg_temp.esperar_error('Sin cita: no se anula dos veces',
      format('select anular_entrada_sin_cita(%L)', v_codigo), 'ENTRADA_YA_ANULADA');
    perform pg_temp.esperar_error('Sin cita: un código que no existe',
      'select anular_entrada_sin_cita(''SC-XXXX'')', 'ENTRADA_NO_EXISTE');

    -- ---------- Excepción: segunda cita en la semana ----------
    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
    values ('CB-PRB8', 'Prueba Excepcion', 'Prueba', 'Excepcion', '+16195550008') returning id into v_persona;

    perform pg_temp.esperar_error('Excepción: si no tiene cita esa semana, no hace falta',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'CB-PRB8', v_b_lunes, 'Enfermedad'),
      'NO_NECESITA_EXCEPCION');

    perform reservar_cita(v_persona, v_b_lunes);

    perform pg_temp.esperar_error('Excepción: sin motivo no se autoriza',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'CB-PRB8', v_b_jueves, '  '),
      'MOTIVO_REQUERIDO');
    perform pg_temp.esperar_error('Excepción: un código que no existe',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'CB-NOEXISTE', v_b_jueves, 'Enfermedad'),
      'PERSONA_NO_EXISTE');
    perform pg_temp.esperar_error('Excepción: tampoco se pasa del cupo',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'CB-PRB8', v_b_uno, 'Enfermedad'),
      'BLOQUE_LLENO');
    perform pg_temp.esperar_ok('Excepción: el pastor autoriza la segunda cita con su motivo',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'cb-prb8', v_b_jueves, '  Enfermedad en la familia '));

    select count(*) into v_numero from citas where persona_id = v_persona and estado <> 'cancelada';
    perform pg_temp.comprobar('Excepción: la persona queda con dos citas esa semana', v_numero = 2, v_numero::text);
    select count(*) into v_numero from excepciones
     where persona_id = v_persona and motivo = 'Enfermedad en la familia' and autorizado_por = v_admin;
    perform pg_temp.comprobar('Excepción: queda guardado el motivo y quién la autorizó', v_numero = 1, v_numero::text);

    perform pg_temp.esperar_error('Excepción: no se autoriza una tercera',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'CB-PRB8', v_b_jueves, 'Otra vez'),
      'YA_TIENE_EXCEPCION_ESTA_SEMANA');
    perform pg_temp.esperar_error('Excepción: sin autorización sigue sin poder tener otra',
      format('select reservar_cita(%L::uuid, %L::uuid)', v_persona, v_b_jueves), 'YA_TIENE_CITA_ESTA_SEMANA');

    -- ---------- Cancelar desde el panel ----------
    perform pg_temp.esperar_error('Cancelar (panel): una cita que no existe',
      format('select cancelar_cita_panel(%L, %L::date, %L::time, null)', 'CB-PRB8', v_programada, '14:00'),
      'CITA_NO_EXISTE');
    perform pg_temp.esperar_ok('Cancelar (panel): el pastor cancela con motivo',
      format('select cancelar_cita_panel(%L, %L::date, %L::time, %L)', 'cb-prb8', v_jueves, '14:00', 'Avisó que no puede'));

    select count(*) into v_numero from citas
     where persona_id = v_persona and estado = 'cancelada'
       and cancelada_por = v_admin and motivo_cancelacion = 'Avisó que no puede';
    perform pg_temp.comprobar('Cancelar (panel): queda quién canceló y por qué', v_numero = 1, v_numero::text);
    perform pg_temp.esperar_ok('Excepción: si se cancela, se puede autorizar otra',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'CB-PRB8', v_b_jueves, 'Nueva fecha'));

    -- ---------- Equipo y accesos desde el panel ----------
    select count(*) into v_numero from listar_personal() l where l.es_yo and l.rol = 'admin' and l.estado = 'activo';
    perform pg_temp.comprobar('Equipo: el pastor se ve a sí mismo en la lista, como admin activo', v_numero = 1, v_numero::text);

    perform pg_temp.esperar_error('Equipo: correo mal escrito',
      'select guardar_personal(''sin-arroba'', ''voluntario'')', 'CORREO_INVALIDO');
    perform pg_temp.esperar_error('Equipo: rol que no existe',
      'select guardar_personal(''alguien@gmail.com'', ''supervisor'')', 'ROL_INVALIDO');
    perform pg_temp.esperar_error('Equipo: nadie se quita a sí mismo el rol de admin',
      format('select guardar_personal((select email from auth.users where id = %L::uuid), ''voluntario'')', v_admin),
      'NO_PUEDES_QUITARTE_ADMIN');
    perform pg_temp.esperar_error('Equipo: nadie se quita a sí mismo el acceso',
      format('select quitar_acceso_personal((select email from auth.users where id = %L::uuid))', v_admin),
      'NO_PUEDES_QUITARTE_ADMIN');

    select guardar_personal('Nuevo.Voluntario.CB@gmail.com', 'voluntario') into v_texto;
    perform pg_temp.comprobar('Equipo: da acceso a alguien que todavía no ha entrado (queda pendiente)',
      v_texto like 'PENDIENTE%', v_texto);
    select count(*) into v_numero from listar_personal() l
     where l.correo = 'nuevo.voluntario.cb@gmail.com' and l.estado = 'pendiente' and l.rol = 'voluntario';
    perform pg_temp.comprobar('Equipo: aparece en la lista como pendiente de entrar', v_numero = 1, v_numero::text);

    select quitar_acceso_personal('nuevo.voluntario.cb@gmail.com') into v_texto;
    perform pg_temp.comprobar('Equipo: se le quita la autorización antes de que entre',
      v_texto = 'AUTORIZACION_QUITADA'
      and not exists (select 1 from listar_personal() l where l.correo = 'nuevo.voluntario.cb@gmail.com'),
      v_texto);
    perform pg_temp.esperar_error('Equipo: quitar a alguien que no está en el equipo',
      'select quitar_acceso_personal(''nadie.cb@gmail.com'')', 'PERSONAL_NO_EXISTE');

    begin
      select guardar_personal('otro.admin.cb@gmail.com', 'admin') into v_texto;
      insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
              'otro.admin.cb@gmail.com', now(),
              '{"provider":"google","providers":["google"]}', '{}', now(), now())
      returning id into v_persona;
      insert into autorizadores (usuario_id, codigo_hash) values (v_persona, crypt('codigo-otro-admin', gen_salt('bf')));

      select count(*) into v_numero from listar_personal() l
       where l.correo = 'otro.admin.cb@gmail.com' and l.estado = 'activo' and l.rol = 'admin';
      perform pg_temp.comprobar('Equipo: al entrar con Google queda activo con su rol', v_numero = 1, v_numero::text);

      select quitar_acceso_personal('otro.admin.cb@gmail.com') into v_texto;
      perform pg_temp.comprobar('Equipo: se le quita el acceso a otro admin (no se borra, queda sin acceso)',
        v_texto = 'ACCESO_QUITADO'
        and exists (select 1 from listar_personal() l where l.correo = 'otro.admin.cb@gmail.com' and l.estado = 'sin_acceso'),
        v_texto);
      perform pg_temp.comprobar('Equipo: al quitarle el acceso, su código de autorización deja de servir',
        not exists (select 1 from autorizadores a where a.usuario_id = v_persona and a.activo));

      select guardar_personal('otro.admin.cb@gmail.com', 'voluntario') into v_texto;
      perform pg_temp.comprobar('Equipo: se le devuelve el acceso, ahora como voluntario',
        exists (select 1 from listar_personal() l
                 where l.correo = 'otro.admin.cb@gmail.com' and l.estado = 'activo' and l.rol = 'voluntario'),
        v_texto);
    exception when others then
      perform pg_temp.comprobar('Equipo: cuenta de prueba de otro admin', false, sqlerrm);
    end;

    perform pg_temp.esperar_error('Equipo: el código de autorización necesita al menos 6 caracteres',
      'select definir_mi_codigo_autorizacion(''123'')', 'CODIGO_MUY_CORTO');
    perform pg_temp.esperar_ok('Equipo: el pastor pone su propio código de autorización',
      'select definir_mi_codigo_autorizacion(''codigo-prueba-cb'')');
    select count(*) into v_numero from listar_personal() l where l.es_yo and l.tiene_codigo;
    perform pg_temp.comprobar('Equipo: la lista indica que ya tiene código', v_numero = 1, v_numero::text);

    -- ---------- Roles: voluntario ----------
    update personal set rol = 'voluntario' where usuario_id = v_admin;

    perform pg_temp.esperar_error('Roles: un voluntario no crea fechas',
      pg_temp.crear(v_nueva, '14:00', '18:30', 20, now() + interval '1 day'), 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no ve la lista de personas',
      'select * from citas_del_dia(null)', 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no registra desde el panel',
      pg_temp.panel(v_b_lunes), 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no anota "entró sin cita"',
      'select * from registrar_entrada_sin_cita(''Nombre Prueba'')', 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no ve quién entró sin cita',
      'select * from entradas_sin_cita_del_dia(null)', 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no ve el equipo',
      'select * from listar_personal()', 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no da accesos',
      'select guardar_personal(''alguien.cb@gmail.com'', ''admin'')', 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no pone código de autorización',
      'select definir_mi_codigo_autorizacion(''codigo-voluntario'')', 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no autoriza excepciones',
      format('select * from reservar_con_excepcion(%L, %L::uuid, %L)', 'CB-PRB8', v_b_jueves, 'Motivo'), 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no cancela citas',
      format('select cancelar_cita_panel(%L, %L::date, %L::time, null)', 'CB-PRB8', v_lunes, '14:00'), 'SIN_PERMISO');

    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
    values ('CB-PRB4', 'Prueba Voluntario', 'Prueba', 'Voluntario', '+16195550003') returning id into v_persona;
    select (reservar_cita(v_persona, v_b_hoy)).token_qr into v_token;
    select resultado into v_texto from registrar_entrega(v_token);
    perform pg_temp.comprobar('Roles: un voluntario sí escanea', v_texto = 'VALIDO', v_texto);

    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
    values ('CB-PRB5', 'Prueba Autorizar', 'Prueba', 'Autorizar', '+16195550004') returning id into v_persona;
    select (reservar_cita(v_persona, v_b_ventana)).token_qr into v_token_otro;
    select resultado into v_texto from registrar_entrega_autorizada(v_token_otro, 'codigo-equivocado');
    perform pg_temp.comprobar('Roles: un voluntario no autoriza otro día sin el código del admin',
      v_texto = 'CODIGO_INVALIDO', v_texto);

    -- ---------- Roles: sin sesion ----------
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);

    perform pg_temp.esperar_error('Roles: sin sesión no se crean fechas',
      pg_temp.crear(v_nueva, '14:00', '18:30', 20, now() + interval '1 day'), 'SIN_SESION');
    perform pg_temp.esperar_error('Roles: sin sesión no se escanea',
      'select * from registrar_entrega(''x'')', 'SIN_SESION');
    perform pg_temp.esperar_error('Roles: sin sesión no se anota "entró sin cita"',
      'select * from registrar_entrada_sin_cita(''Nombre Prueba'')', 'SIN_SESION');
    perform pg_temp.esperar_error('Roles: sin sesión no se ve el equipo',
      'select * from listar_personal()', 'SIN_SESION');
  end if;

  -- ==========================================================
  --  12. Personal autorizado antes de entrar con Google
  -- ==========================================================
  select definir_personal('  Pastor.Prueba.CB@Gmail.com ', 'admin') into v_texto;
  perform pg_temp.comprobar('Google: se autoriza un correo que todavía no tiene cuenta',
    v_texto like 'PENDIENTE%'
    and exists (select 1 from personal_pendiente where correo = 'pastor.prueba.cb@gmail.com' and rol = 'admin'),
    v_texto);
  perform pg_temp.esperar_error('Google: un correo mal escrito no se autoriza',
    'select definir_personal(''pastor@'', ''admin'')', 'CORREO_INVALIDO');
  perform pg_temp.esperar_error('Google: un rol que no existe',
    'select definir_personal(''otro@gmail.com'', ''supervisor'')', 'ROL_INVALIDO');

  begin
    --  Alguien crea una cuenta de correo y contrasena con el correo del pastor.
    insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'pastor.prueba.cb@gmail.com', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now())
    returning id into v_persona;

    perform pg_temp.comprobar('Google: una cuenta con contraseña y ese mismo correo NO recibe el rol',
      not exists (select 1 from personal where usuario_id = v_persona));

    delete from auth.users where id = v_persona;

    --  El pastor entra por primera vez con Google.
    insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            'pastor.prueba.cb@gmail.com', now(),
            '{"provider":"google","providers":["google"]}', '{}', now(), now())
    returning id into v_persona;

    select rol into v_texto from personal where usuario_id = v_persona and activo;
    perform pg_temp.comprobar('Google: al entrar por primera vez con Google ya tiene su rol',
      v_texto = 'admin', coalesce(v_texto, 'sin rol'));
    perform pg_temp.comprobar('Google: la autorización pendiente se usa una sola vez',
      not exists (select 1 from personal_pendiente where correo = 'pastor.prueba.cb@gmail.com'));

    select definir_personal('pastor.prueba.cb@gmail.com', 'voluntario') into v_texto;
    perform pg_temp.comprobar('Google: con la cuenta ya creada, definir_personal cambia el rol al momento',
      v_texto like 'PERSONAL_LISTO%'
      and (select rol from personal where usuario_id = v_persona) = 'voluntario',
      v_texto);
  exception when others then
    perform pg_temp.comprobar('Google: cuentas de prueba en auth.users', false, sqlerrm);
  end;

  -- ==========================================================
  --  Resultado (y deshacer todo)
  -- ==========================================================
  select count(*),
         count(*) filter (where paso),
         string_agg(format('%s %s%s', case when paso then '✓' else '✗' end, prueba,
                           case when paso then '' else ' → ' || coalesce(detalle, '') end),
                    E'\n' order by n)
    into v_total, v_pasaron, v_lista
    from resultados;

  raise exception using
    message = format(E'PRUEBAS: %s de %s pasaron.%s\n\n%s',
                     v_pasaron, v_total,
                     case when v_pasaron = v_total then ' Todo bien.' else ' Revisa las marcadas con ✗.' end,
                     v_lista),
    hint = 'Este error es a proposito: deshace todo lo que crearon las pruebas. No quedo nada guardado.';
end
$pruebas$;
