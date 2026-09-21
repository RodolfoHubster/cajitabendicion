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
--  Requiere todas las migraciones, hasta 2026-09-21-cambiar-horario.sql.
--  El catalogo real de codigos postales no hace falta: las pruebas traen los suyos.
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
  v_cita         uuid;
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
  v_fila         record;

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

  --  Arma la llamada al registro publico con datos correctos por defecto,
  --  domicilio incluido (92105, San Diego) y el aviso de privacidad aceptado.
  execute $f$
    create function pg_temp.registro(
      p_bloque        uuid,
      p_codigo        text    default null,
      p_dispositivo   text    default null,
      p_nombre        text    default 'María',
      p_apellidos     text    default 'Pérez',
      p_telefono      text    default '+16195551234',
      p_email         text    default 'maria@gmail.com',
      p_pais          text    default 'US',
      p_cp            text    default '92105',
      p_colonia       text    default null,
      p_calle         text    default 'El Cajon Blvd',
      p_numero        text    default '4250',
      p_interior      text    default null,
      p_sin_domicilio boolean default false,
      p_acepto        boolean default true
    )
    returns text language sql as $b$
      select format(
        'select * from registrar_y_reservar(p_nombre => %L, p_apellidos => %L, p_telefono => %L, '
        'p_bloque_id => %L::uuid, p_email => %L, p_dispositivo => %L, p_codigo_anticipado => %L, '
        'p_pais => %L, p_codigo_postal => %L, p_colonia => %L, p_calle => %L, p_numero => %L, '
        'p_numero_interior => %L, p_sin_domicilio => %L::boolean, p_acepto_privacidad => %L::boolean)',
        p_nombre, p_apellidos, p_telefono, p_bloque, p_email, p_dispositivo, p_codigo,
        p_pais, p_cp, p_colonia, p_calle, p_numero, p_interior, p_sin_domicilio, p_acepto);
    $b$
  $f$;

  --  Arma la llamada al registro desde el panel (domicilio en Tijuana).
  execute $f$
    create function pg_temp.panel(
      p_bloque    uuid,
      p_nombre    text    default 'José',
      p_apellidos text    default 'Ramírez',
      p_telefono  text    default '+526641234567',
      p_email     text    default null,
      p_pais      text    default 'MX',
      p_cp        text    default '22000',
      p_colonia   text    default 'Zona Centro',
      p_calle     text    default 'Av. Revolución',
      p_numero    text    default '1234',
      p_acepto    boolean default true
    )
    returns text language sql as $b$
      select format(
        'select * from registrar_desde_panel(p_nombre => %L, p_apellidos => %L, p_telefono => %L, '
        'p_bloque_id => %L::uuid, p_email => %L, p_pais => %L, p_codigo_postal => %L, p_colonia => %L, '
        'p_calle => %L, p_numero => %L, p_acepto_privacidad => %L::boolean)',
        p_nombre, p_apellidos, p_telefono, p_bloque, p_email, p_pais, p_cp, p_colonia, p_calle, p_numero, p_acepto);
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

  --  Codigos postales de prueba, por si el catalogo real todavia no se carga.
  insert into codigos_postales (pais, codigo, colonia, ciudad, municipio, estado) values
    ('US', '92105', null,          'San Diego', 'San Diego', 'California'),
    ('MX', '22000', 'Zona Centro', 'Tijuana',   'Tijuana',   'Baja California'),
    ('MX', '22000', 'Zona Norte',  'Tijuana',   'Tijuana',   'Baja California');

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
  --  1b. Registro publico: domicilio y aviso de privacidad
  -- ==========================================================
  perform pg_temp.esperar_error('Domicilio: sin aceptar el aviso de privacidad no se registra',
    pg_temp.registro(v_b_lunes, p_acepto => false), 'CONSENTIMIENTO_REQUERIDO');
  perform pg_temp.esperar_error('Domicilio: solo México o Estados Unidos',
    pg_temp.registro(v_b_lunes, p_pais => 'CA'), 'PAIS_INVALIDO');
  perform pg_temp.esperar_error('Domicilio: sin código postal',
    pg_temp.registro(v_b_lunes, p_cp => ' '), 'CODIGO_POSTAL_REQUERIDO');
  perform pg_temp.esperar_error('Domicilio: código postal con letras',
    pg_temp.registro(v_b_lunes, p_cp => '92A05'), 'CODIGO_POSTAL_INVALIDO');
  perform pg_temp.esperar_error('Domicilio: código postal que no está en el catálogo',
    pg_temp.registro(v_b_lunes, p_cp => '00000'), 'CODIGO_POSTAL_NO_EXISTE');
  perform pg_temp.esperar_error('Domicilio: un código de México no sirve como ZIP de Estados Unidos',
    pg_temp.registro(v_b_lunes, p_pais => 'US', p_cp => '22000'), 'CODIGO_POSTAL_NO_EXISTE');
  perform pg_temp.esperar_error('Domicilio: sin calle',
    pg_temp.registro(v_b_lunes, p_calle => '  '), 'CALLE_REQUERIDA');
  perform pg_temp.esperar_error('Domicilio: una calle que es un punto',
    pg_temp.registro(v_b_lunes, p_calle => '.'), 'CALLE_INVALIDA');
  perform pg_temp.esperar_error('Domicilio: una calle de la misma letra repetida',
    pg_temp.registro(v_b_lunes, p_calle => 'aaaaa'), 'CALLE_INVALIDA');
  perform pg_temp.esperar_error('Domicilio: sin número',
    pg_temp.registro(v_b_lunes, p_numero => ''), 'NUMERO_REQUERIDO');
  perform pg_temp.esperar_error('Domicilio: número sin dígitos',
    pg_temp.registro(v_b_lunes, p_numero => 'abc'), 'NUMERO_INVALIDO');
  perform pg_temp.esperar_error('Domicilio: "S/N" solo se acepta en México',
    pg_temp.registro(v_b_lunes, p_numero => 'S/N'), 'NUMERO_INVALIDO');
  perform pg_temp.esperar_error('Domicilio: interior con símbolos',
    pg_temp.registro(v_b_lunes, p_interior => '5; x'), 'NUMERO_INTERIOR_INVALIDO');
  perform pg_temp.esperar_error('Domicilio: en México hay que elegir la colonia',
    pg_temp.registro(v_b_lunes, p_pais => 'MX', p_cp => '22000'), 'COLONIA_REQUERIDA');
  perform pg_temp.esperar_error('Domicilio: una colonia que no es de ese código postal',
    pg_temp.registro(v_b_lunes, p_pais => 'MX', p_cp => '22000', p_colonia => 'Colonia Inventada'),
    'COLONIA_INVALIDA');
  perform pg_temp.esperar_ok('Domicilio: en México, "s/n" como número',
    pg_temp.registro(v_b_lunes, p_pais => 'MX', p_cp => '22000', p_colonia => 'Zona Norte', p_numero => 's/n',
                     p_telefono => '+526641110001'));
  perform pg_temp.esperar_ok('Domicilio: sin domicilio fijo, basta el código postal',
    pg_temp.registro(v_b_lunes, p_sin_domicilio => true, p_calle => null, p_numero => null,
                     p_telefono => '+16195550199'));

  select count(*) into v_numero from personas p
   where p.telefono = '+16195550199' and p.sin_domicilio and p.codigo_postal = '92105'
     and p.ciudad = 'San Diego' and p.calle is null and p.direccion like 'Sin domicilio fijo%'
     and p.acepto_privacidad_en is not null;
  perform pg_temp.comprobar('Domicilio: sin domicilio fijo queda marcado, con su ciudad y cuándo aceptó el aviso',
    v_numero = 1, v_numero::text);

  select count(*) into v_numero from personas p
   where p.telefono = '+526641110001' and p.numero_exterior = 'S/N' and p.colonia = 'Zona Norte';
  perform pg_temp.comprobar('Domicilio: el número "s/n" se guarda como S/N', v_numero = 1, v_numero::text);

  select count(*) into v_numero from buscar_codigo_postal(' mx ', ' 22000 ') b
   where b.colonia = 'Zona Centro' and b.ciudad = 'Tijuana';
  perform pg_temp.comprobar('Domicilio: el formulario encuentra las colonias de un código postal',
    v_numero = 1, v_numero::text);
  select count(*) into v_numero from buscar_codigo_postal('US', '00000');
  perform pg_temp.comprobar('Domicilio: un código que no existe no devuelve nada', v_numero = 0, v_numero::text);

  -- ==========================================================
  --  1c. Quien se registro antes de pedir domicilio
  -- ==========================================================
  --  Asi quedaron los registros de antes: zona en "ciudad", sin pais ni direccion.
  insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, email, ciudad)
  values ('CB-PRA1', 'Prueba Antes Domicilio', 'Prueba', 'Antes Domicilio', '+16195550111', 'antes@gmail.com', 'Chula Vista')
  returning id into v_persona;
  select (reservar_cita(v_persona, v_b_jueves)).token_qr into v_token_otro;

  perform pg_temp.comprobar('Antes del domicilio: la persona sigue igual (su zona, sin país ni dirección)',
    exists (select 1 from personas p
             where p.id = v_persona and p.ciudad = 'Chula Vista' and p.pais is null
               and p.direccion is null and not p.sin_domicilio and p.acepto_privacidad_en is null));

  select nombre into v_texto from consultar_cita(v_token_otro);
  perform pg_temp.comprobar('Antes del domicilio: su enlace de confirmación sigue funcionando',
    v_texto = 'Prueba Antes Domicilio', coalesce(v_texto, 'no encontró la cita'));

  perform pg_temp.esperar_ok('Antes del domicilio: registrar a alguien nuevo (con domicilio) no le cambia nada',
    pg_temp.registro(v_b_jueves, p_telefono => '+16195550113'));
  perform pg_temp.comprobar('Antes del domicilio: después de registros nuevos, su zona sigue ahí',
    (select ciudad from personas where id = v_persona) = 'Chula Vista');

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
                                p_email => ' maria@gmail.com ', p_pais => 'mx', p_codigo_postal => ' 22000 ',
                                p_colonia => 'zona  centro', p_calle => '  Av.   Revolución ', p_numero => '1234-b',
                                p_numero_interior => '5', p_acepto_privacidad => true) r;
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

  select p.* into v_fila from citas c join personas p on p.id = c.persona_id where c.token_qr = v_token;
  perform pg_temp.comprobar('Registro: guarda el domicilio con la colonia y la ciudad del catálogo',
    v_fila.pais = 'MX' and v_fila.codigo_postal = '22000' and v_fila.colonia = 'Zona Centro'
    and v_fila.ciudad = 'Tijuana' and v_fila.estado = 'Baja California' and v_fila.calle = 'Av. Revolución'
    and v_fila.numero_exterior = '1234-B' and v_fila.numero_interior = '5' and not v_fila.sin_domicilio,
    format('%s | %s | %s | %s | %s | %s | %s', v_fila.pais, v_fila.codigo_postal, v_fila.colonia,
           v_fila.ciudad, v_fila.calle, v_fila.numero_exterior, v_fila.numero_interior));
  perform pg_temp.comprobar('Registro: arma la dirección completa y guarda cuándo aceptó el aviso',
    v_fila.direccion = 'Av. Revolución 1234-B Int. 5, Zona Centro, 22000 Tijuana, Baja California, México'
    and v_fila.acepto_privacidad_en is not null,
    v_fila.direccion);

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
  --  10c. Cambiar el horario (mover la cita)
  -- ==========================================================
  insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
  values ('CB-PRM1', 'Prueba Mover', 'Prueba', 'Mover', '+16195550011') returning id into v_persona;
  insert into citas (persona_id, bloque_id, semana, token_qr)
  values (v_persona, v_b_lunes, date_trunc('week', v_lunes)::date, 'token-prueba-mover')
  returning id into v_cita;

  --  Esta se deja quieta: la mueve el panel en la seccion 11. Va con su
  --  propia persona a proposito: si fuera la misma de arriba, mandarla al
  --  jueves le dejaria dos citas en la misma semana.
  insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
  values ('CB-PRM3', 'Prueba Mover Panel', 'Prueba', 'Mover Panel', '+16195550013') returning id into v_persona;
  insert into citas (persona_id, bloque_id, semana, token_qr)
  values (v_persona, v_b_ventana, date_trunc('week', v_ventana)::date, 'token-prueba-mover-panel');

  perform pg_temp.comprobar('Mover: antes de cambiar, le queda 1 cambio',
    cambios_restantes('token-prueba-mover') = 1, cambios_restantes('token-prueba-mover')::text);

  perform pg_temp.esperar_error('Mover: al mismo horario en el que ya está',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_lunes), 'MISMO_HORARIO');

  --  v_b_uno tiene un solo lugar y ya esta ocupado desde la prueba de cupo.
  perform pg_temp.esperar_error('Mover: a un horario lleno',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_uno), 'BLOQUE_LLENO');
  perform pg_temp.comprobar('Mover: si el horario estaba lleno, se queda con la cita que ya tenía',
    (select bloque_id from citas where id = v_cita) = v_b_lunes);

  perform pg_temp.esperar_error('Mover: a un horario cerrado',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_cerrado), 'BLOQUE_CERRADO');
  perform pg_temp.esperar_error('Mover: a una fecha que todavía no abre',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_programada), 'AUN_NO_ABRE');
  perform pg_temp.esperar_error('Mover: a una fecha cerrada',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_cerrada), 'DIA_CERRADO');
  perform pg_temp.esperar_error('Mover: a una fecha que ya pasó',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_pasada), 'FECHA_PASADA');

  perform pg_temp.esperar_ok('Mover: cambia del lunes al jueves',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_jueves));
  perform pg_temp.comprobar('Mover: es la misma cita, con su mismo enlace y su misma persona',
    (select count(*) from citas where token_qr = 'token-prueba-mover') = 1
    and (select p.codigo_corto from personas p
          join citas c on c.persona_id = p.id
         where c.id = v_cita) = 'CB-PRM1');
  perform pg_temp.comprobar('Mover: queda en el horario nuevo y con su semana al día',
    (select bloque_id from citas where id = v_cita) = v_b_jueves
    and (select semana from citas where id = v_cita) = date_trunc('week', v_jueves)::date);
  perform pg_temp.comprobar('Mover: el cambio queda guardado en el historial',
    (select count(*) from movimientos_cita where cita_id = v_cita and origen = 'publico') = 1);
  perform pg_temp.comprobar('Mover: ya no le quedan cambios',
    cambios_restantes('token-prueba-mover') = 0);
  perform pg_temp.esperar_error('Mover: una segunda vez, ya no',
    format('select * from mover_mi_cita(''token-prueba-mover'', %L::uuid)', v_b_lunes), 'YA_CAMBIO_HORARIO');

  perform pg_temp.esperar_error('Mover: una cita que ya se usó',
    format('select * from mover_mi_cita(''token-prueba-entregada'', %L::uuid)', v_b_lunes), 'CITA_YA_ENTREGADA');
  perform pg_temp.esperar_error('Mover: una cita cancelada',
    format('select * from mover_mi_cita(%L, %L::uuid)', v_token, v_b_lunes), 'CITA_YA_CANCELADA');
  perform pg_temp.esperar_error('Mover: una cita de un día que ya pasó',
    format('select * from mover_mi_cita(''token-prueba-pasada'', %L::uuid)', v_b_lunes), 'FECHA_PASADA');
  perform pg_temp.esperar_error('Mover: un enlace que no existe',
    format('select * from mover_mi_cita(''no-existe'', %L::uuid)', v_b_lunes), 'CITA_NO_EXISTE');

  --  Quien ya tiene cita el lunes no puede mover la de otra semana al jueves:
  --  serian dos en la misma semana.
  insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
  values ('CB-PRM2', 'Prueba Semana Mover', 'Prueba', 'Semana Mover', '+16195550012') returning id into v_persona;
  insert into citas (persona_id, bloque_id, semana, token_qr)
  values (v_persona, v_b_lunes, date_trunc('week', v_lunes)::date, 'token-prueba-semana-a');
  insert into citas (persona_id, bloque_id, semana, token_qr)
  values (v_persona, v_b_ventana, date_trunc('week', v_ventana)::date, 'token-prueba-semana-b');

  perform pg_temp.esperar_error('Mover: no puede quedarse con dos citas en la misma semana',
    format('select * from mover_mi_cita(''token-prueba-semana-b'', %L::uuid)', v_b_jueves),
    'YA_TIENE_CITA_ESTA_SEMANA');
  perform pg_temp.comprobar('Mover: al no poder, su cita se queda donde estaba',
    (select bloque_id from citas where token_qr = 'token-prueba-semana-b') = v_b_ventana);

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
    perform pg_temp.esperar_error('Panel: también pide que la persona confirme el aviso de privacidad',
      pg_temp.panel(v_b_lunes, p_acepto => false), 'CONSENTIMIENTO_REQUERIDO');
    perform pg_temp.esperar_error('Panel: también revisa el código postal contra el catálogo',
      pg_temp.panel(v_b_lunes, p_cp => '00000'), 'CODIGO_POSTAL_NO_EXISTE');

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

    --  Alguien que se registro antes de pedir domicilio llega hoy a recoger.
    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, ciudad)
    values ('CB-PRA2', 'Prueba Antes Escaneo', 'Prueba', 'Antes Escaneo', '+16195550112', 'San Ysidro')
    returning id into v_persona;
    select (reservar_cita(v_persona, v_b_hoy)).token_qr into v_token;
    select resultado into v_texto from registrar_entrega(v_token);
    perform pg_temp.comprobar('Antes del domicilio: quien se registró sin dirección sí recibe su caja',
      v_texto = 'VALIDO', v_texto);
    select count(*) into v_numero from citas_del_dia(v_hoy) c
     where c.codigo_corto = 'CB-PRA2' and c.ciudad = 'San Ysidro' and c.estado = 'entregada';
    perform pg_temp.comprobar('Antes del domicilio: sale en la lista del día con su zona', v_numero = 1, v_numero::text);

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

    -- ---------- Días pasados y reportes ----------
    --  En la fecha pasada de prueba ya hay una cita que nunca se escaneó (CB-PRB7).
    --  Se agregan una entregada, una cancelada y dos entradas sin cita (una anulada).
    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
    values ('CB-PRB9', 'Prueba Recibio', 'Prueba', 'Recibio', '+16195550009') returning id into v_persona;
    insert into citas (persona_id, bloque_id, semana, token_qr, estado, usado_en)
    values (v_persona, v_b_pasada, date_trunc('week', v_pasada)::date, 'token-prueba-recibio', 'entregada',
            (v_pasada + time '14:05') at time zone 'America/Los_Angeles');

    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono)
    values ('CB-PRC1', 'Prueba Cancelo', 'Prueba', 'Cancelo', '+16195550010') returning id into v_persona;
    insert into citas (persona_id, bloque_id, semana, token_qr, estado, cancelada_en, cancelada_por, motivo_cancelacion)
    values (v_persona, v_b_pasada, date_trunc('week', v_pasada)::date, 'token-prueba-cancelo', 'cancelada',
            (v_pasada - 1 + time '10:00') at time zone 'America/Los_Angeles', v_admin, 'Motivo de prueba');

    insert into entradas_sin_cita (fecha, nombre, codigo, registrado_por, registrado_en)
    values (v_pasada, 'Prueba Sin Cita', 'SC-9001', v_admin,
            (v_pasada + time '15:00') at time zone 'America/Los_Angeles');
    insert into entradas_sin_cita (fecha, nombre, codigo, registrado_por, registrado_en, anulada_en, anulada_por)
    values (v_pasada, 'Prueba Anulada', 'SC-9002', v_admin,
            (v_pasada + time '15:10') at time zone 'America/Los_Angeles', now(), v_admin);

    select c.estado into v_texto from citas_del_dia(v_pasada) c where c.codigo_corto = 'CB-PRB7';
    perform pg_temp.comprobar('Días pasados: quien tenía cita y nunca se escaneó sale como "no asistió"',
      v_texto = 'no_asistio', v_texto);
    select count(*) into v_numero from citas_del_dia(v_lunes) c where c.estado = 'no_asistio';
    perform pg_temp.comprobar('Días pasados: en un día que todavía no llega, nadie sale como "no asistió"',
      v_numero = 0, v_numero::text);

    select count(*) into v_numero from citas_del_dia(v_pasada) c
     where c.codigo_corto = 'CB-PRC1' and c.estado = 'cancelada' and c.motivo_cancelacion = 'Motivo de prueba'
       and c.cancelada_por is not null and c.cancelada_en is not null;
    perform pg_temp.comprobar('Días pasados: las canceladas salen en la lista, con quién, cuándo y por qué',
      v_numero = 1, v_numero::text);

    select * into v_fila from resumen_del_dia(v_pasada);
    perform pg_temp.comprobar('Días pasados: el resumen cuenta no asistieron y canceladas, y ya no "faltan por llegar"',
      v_fila.con_cita = 2 and v_fila.ya_recibieron = 1 and v_fila.no_asistieron = 1
      and v_fila.faltan_por_llegar = 0 and v_fila.canceladas = 1 and v_fila.sin_cita = 1,
      format('con cita %s, recibieron %s, no asistieron %s, faltan %s, canceladas %s, sin cita %s',
             v_fila.con_cita, v_fila.ya_recibieron, v_fila.no_asistieron,
             v_fila.faltan_por_llegar, v_fila.canceladas, v_fila.sin_cita));

    select * into v_fila from reporte_por_dias(v_pasada, v_pasada);
    perform pg_temp.comprobar('Reportes: cajas = recibieron + sin cita (sin contar las anuladas)',
      v_fila.recibieron = 1 and v_fila.sin_cita = 1 and v_fila.cajas = 2,
      format('recibieron %s, sin cita %s, cajas %s', v_fila.recibieron, v_fila.sin_cita, v_fila.cajas));
    perform pg_temp.comprobar('Reportes: cupo, con cita, no asistieron y canceladas del día',
      v_fila.capacidad = 50 and v_fila.con_cita = 2 and v_fila.no_asistieron = 1
      and v_fila.canceladas = 1 and v_fila.pendientes = 0,
      format('cupo %s, con cita %s, no asistieron %s, canceladas %s, por venir %s',
             v_fila.capacidad, v_fila.con_cita, v_fila.no_asistieron, v_fila.canceladas, v_fila.pendientes));

    select count(*) into v_numero from reporte_por_dias(v_pasada - 3, v_pasada + 3);
    perform pg_temp.comprobar('Reportes: solo salen los días con entrega', v_numero = 1, v_numero::text);

    select * into v_fila from reporte_por_dias(v_lunes, v_lunes);
    perform pg_temp.comprobar('Reportes: en un día que todavía no llega, las citas son "por venir"',
      v_fila.pendientes > 0 and v_fila.no_asistieron = 0,
      format('por venir %s, no asistieron %s', v_fila.pendientes, v_fila.no_asistieron));

    perform pg_temp.esperar_error('Reportes: "desde" después de "hasta"',
      format('select * from reporte_por_dias(%L::date, %L::date)', v_hoy, v_hoy - 1), 'RANGO_INVALIDO');
    perform pg_temp.esperar_error('Reportes: más de un año de una sola vez',
      format('select * from reporte_por_dias(%L::date, %L::date)', v_hoy - 400, v_hoy), 'RANGO_MUY_LARGO');

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
    perform pg_temp.esperar_error('Roles: un voluntario no ve reportes',
      format('select * from reporte_por_dias(%L::date, %L::date)', v_hoy - 7, v_hoy), 'SIN_PERMISO');
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

    -- ---------- Mover una cita desde el panel ----------
    select id into v_cita from citas where token_qr = 'token-prueba-mover-panel';

    perform pg_temp.esperar_ok('Panel: mueve la cita de alguien a otro horario',
      format('select * from mover_cita_panel(%L::uuid, %L::uuid)', v_cita, v_b_jueves));
    perform pg_temp.comprobar('Panel: el movimiento guarda quién lo hizo',
      (select count(*) from movimientos_cita
        where cita_id = v_cita and origen = 'panel' and usuario_id = v_admin) = 1);
    perform pg_temp.comprobar('Panel: moverla desde el panel no le gasta el cambio a la persona',
      cambios_restantes('token-prueba-mover-panel') = 1,
      cambios_restantes('token-prueba-mover-panel')::text);
    perform pg_temp.esperar_ok('Panel: el historial de la cita se puede consultar',
      format('select * from historial_de_cita(%L::uuid)', v_cita));
    perform pg_temp.comprobar('Panel: el historial dice de qué horario a cuál',
      (select count(*) from historial_de_cita(v_cita)
        where de_fecha = v_ventana and a_fecha = v_jueves and origen = 'panel') = 1);
    perform pg_temp.esperar_error('Panel: tampoco desde el panel se mete gente en un horario lleno',
      format('select * from mover_cita_panel(%L::uuid, %L::uuid)', v_cita, v_b_uno), 'BLOQUE_LLENO');

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
    perform pg_temp.esperar_error('Roles: sin sesión no se mueven citas desde el panel',
      format('select * from mover_cita_panel(%L::uuid, %L::uuid)', v_cita, v_b_lunes), 'SIN_SESION');
    perform pg_temp.esperar_error('Roles: sin sesión no se ven reportes',
      format('select * from reporte_por_dias(%L::date, %L::date)', v_hoy - 7, v_hoy), 'SIN_SESION');
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
