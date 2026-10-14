-- ============================================================
--  Cajita de Bendicion - Codigos de 5 numeros (seccion 45)
--
--  Cada registro y cada turno a pie usa un codigo CB para siempre, y con
--  4 numeros solo caben 10,000: al 10 de octubre de 2026 iban 2,671 y se
--  gastan unos 800 a 1,000 por semana. Los nuevos son de 5 numeros
--  (CB-10000 a CB-99999). Los de 4 que ya existen siguen valiendo igual:
--  QR, busqueda, papeles impresos y pases.
--
--  Cambia normalizar_codigo_corto() (lee 4 o 5 numeros), los tres lugares
--  que crean codigos (registrar_y_reservar, registrar_desde_panel,
--  crear_turno_anonimo) y buscar_para_escaneo() (codigos parecidos de 5).
--  No toca el candado del cupo. Se puede repetir.
-- ============================================================

begin;

create or replace function normalizar_codigo_corto(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  --  4 numeros (los de antes) o 5 (desde el 10 de octubre de 2026).
  select case
           when x ~ '^(CB|C8)?[0-9OIL]{4,5}$' and x ~ '[0-9]'
             then 'CB-' || translate(regexp_replace(x, '^(CB|C8)', ''), 'OIL', '011')
           else upper(trim(coalesce(p_texto, '')))
         end
    from (select regexp_replace(upper(coalesce(p_texto, '')), '[^A-Z0-9]', '', 'g') as x) s;
$$;


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
  p_codigo_anticipado text    default null,
  --  Viene en el carro de alguien que ya tiene cita (seccion 39): el codigo
  --  CB de quien maneja. Su horario es el de esa cita; con p_fecha basta
  --  (cuando ya no quedan lugares no se puede escoger horario).
  p_codigo_acompanante text   default null,
  p_fecha             date    default null
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
  v_bloque_id  uuid := p_bloque_id;
  v_dia        date;
  v_duenio     citas;
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

  -- ----------------------------------------------------------
  --  Acompanante: va en el carro de quien maneja (seccion 39)
  -- ----------------------------------------------------------
  --  Se busca la cita de carro propio de ese codigo ese dia, y la persona
  --  queda en ese mismo horario. No ocupa lugar: el carro ya lo tiene.
  if nullif(trim(coalesce(p_codigo_acompanante, '')), '') is not null then
    select b.fecha into v_dia from bloques b where b.id = p_bloque_id;
    v_dia := coalesce(v_dia, p_fecha);

    select c.* into v_duenio
      from citas c
      join personas p on p.id = c.persona_id
      join bloques  b on b.id = c.bloque_id
     where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo_acompanante)
       and b.fecha = v_dia
       and b.fila = 'carro'
       and c.estado in ('reservada', 'llego')
       and c.acompana_a is null
     order by c.creada_en
     limit 1;

    if v_duenio.id is null then
      raise exception 'ACOMPANANTE_SIN_CITA';
    end if;

    v_bloque_id := v_duenio.bloque_id;
  end if;

  select * into v_bloque from bloques where id = v_bloque_id;
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
  --  Quien viene de acompanante no cuenta: es comun que la familia se
  --  registre desde el telefono de quien maneja, y ya tiene su tope por carro.
  if p_dispositivo is not null and v_duenio.id is null then
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
       and c.estado <> 'cancelada'
       and c.acompana_a is null;

    if v_usadas >= v_limite then
      raise exception 'LIMITE_DISPOSITIVO';
    end if;
  end if;

  -- ----------------------------------------------------------
  --  Codigo corto tipo CB-4871
  -- ----------------------------------------------------------
  --  Se reintenta porque dos registros simultaneos pueden sacar el
  --  mismo numero al azar. El indice unico los separa; aqui solo se
  --  vuelve a intentar. Desde el 10 de octubre de 2026 los nuevos son de
  --  5 numeros (CB-10000 a CB-99999, seccion 45): con 4 se iban a acabar.
  --  Los de 4 que ya existen siguen valiendo.
  loop
    v_codigo := 'CB-' || (10000 + floor(random() * 90000))::int::text;

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
  v_cita := reservar_cita(v_persona.id, v_bloque_id, v_duenio.id);

  update citas
     set dispositivo_id        = p_dispositivo,
         con_codigo_anticipado = v_anticipada
   where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


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
  p_acepto_privacidad boolean default false,
  --  Viene en el carro de alguien que ya tiene cita (seccion 39): el codigo
  --  CB de quien maneja. Va a su horario; con p_fecha basta.
  p_codigo_acompanante text   default null,
  p_fecha             date    default null
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
  v_bloque_id uuid := p_bloque_id;
  v_dia       date;
  v_duenio    citas;
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

  --  Acompanante: la cita de carro propio de ese codigo ese dia, igual que
  --  en el registro publico. Queda en ese horario y no ocupa otro lugar; el
  --  tope por carro lo revisa reservar_cita().
  if nullif(trim(coalesce(p_codigo_acompanante, '')), '') is not null then
    select b.fecha into v_dia from bloques b where b.id = p_bloque_id;
    v_dia := coalesce(v_dia, p_fecha);

    select c.* into v_duenio
      from citas c
      join personas p on p.id = c.persona_id
      join bloques  b on b.id = c.bloque_id
     where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo_acompanante)
       and b.fecha = v_dia
       and b.fila = 'carro'
       and c.estado in ('reservada', 'llego')
       and c.acompana_a is null
     order by c.creada_en
     limit 1;

    if v_duenio.id is null then
      raise exception 'ACOMPANANTE_SIN_CITA';
    end if;

    v_bloque_id := v_duenio.bloque_id;
  end if;

  --  Sin horario se da de alta a la persona y ya: es lo que hace falta
  --  para darle un pase permanente (seccion 29), que no aparta lugar.
  if v_bloque_id is not null then
    select * into v_bloque from bloques where id = v_bloque_id;
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

  --  5 numeros, como en el registro publico (seccion 45).
  loop
    v_codigo := 'CB-' || (10000 + floor(random() * 90000))::int::text;

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

  if v_bloque_id is null then
    return query select v_persona.codigo_corto, null::text, null::date, null::time, false;
    return;
  end if;

  v_cita := reservar_cita(v_persona.id, v_bloque_id, v_duenio.id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


create or replace function crear_turno_anonimo(p_bloque_id uuid, p_dispositivo text, p_registrado_por uuid)
returns citas
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_persona  personas;
  v_cita     citas;
  v_codigo   text;
  v_intentos int := 0;
begin
  --  El codigo CB, como en el registro (5 numeros): si sale repetido se
  --  vuelve a sacar.
  loop
    v_codigo := 'CB-' || (10000 + floor(random() * 90000))::int::text;
    begin
      insert into personas (codigo_corto, nombre, anonima)
      values (v_codigo, 'Turno', true)
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  --  El mismo candado y el mismo cupo de siempre; el turno lo pone dar_turno().
  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas
     set dispositivo_id = p_dispositivo,
         registrado_por = p_registrado_por
   where id = v_cita.id
  returning * into v_cita;

  --  Su nombre es su turno: asi lo ve la voluntaria que lo llama.
  update personas set nombre = 'Turno ' || v_cita.turno where id = v_persona.id;

  return v_cita;
end;
$$;


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
  if found or v_codigo !~ '^CB-[0-9]{4,5}$' then
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

commit;
