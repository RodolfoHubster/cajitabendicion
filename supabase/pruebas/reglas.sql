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

    -- ---------- Roles: voluntario ----------
    update personal set rol = 'voluntario' where usuario_id = v_admin;

    perform pg_temp.esperar_error('Roles: un voluntario no crea fechas',
      pg_temp.crear(v_nueva, '14:00', '18:30', 20, now() + interval '1 day'), 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no ve la lista de personas',
      'select * from citas_del_dia(null)', 'SIN_PERMISO');
    perform pg_temp.esperar_error('Roles: un voluntario no registra desde el panel',
      pg_temp.panel(v_b_lunes), 'SIN_PERMISO');

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
  end if;

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
