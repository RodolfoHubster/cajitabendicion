-- ============================================================
--  Cajita de Bendicion - Nombre y apellidos separados, telefono
--  internacional y validaciones del registro
--
--  Requiere haber corrido antes 2026-09-12-dias-de-entrega.sql.
--  Se puede repetir.
--
--  IMPORTANTE: correla junto con la version nueva de la pagina. La
--  anterior llama a estas funciones sin apellidos y el registro fallaria
--  hasta que se actualice.
--
--  Las personas ya registradas conservan su nombre completo; nombres y
--  apellidos quedan vacios para ellas.
--
--  Despues, para revisar todas las reglas: supabase/pruebas/reglas.sql
-- ============================================================

--  Separados para ordenar las listas por apellido. "nombre" sigue
--  guardando el nombre completo que se muestra al escanear.
alter table personas add column if not exists nombres text;
alter table personas add column if not exists apellidos text;
create index if not exists idx_personas_apellidos on personas (apellidos, nombres);


-- ============================================================
--  15. REGISTRO PUBLICO: apellidos y telefono internacional
-- ============================================================
--  Cambian los parametros: con otra firma Postgres crearia una segunda
--  version al lado de la vieja, y la vieja seguiria aceptando telefonos
--  sin lada. Por eso se borra primero. Borrar una funcion no toca datos.
drop function if exists registrar_y_reservar(text, text, uuid, text, text, text, text);

create or replace function registrar_y_reservar(
  p_nombre            text,
  p_apellidos         text,
  p_telefono          text,
  p_bloque_id         uuid,
  p_email             text,
  p_ciudad            text default null,
  p_dispositivo       text default null,
  p_codigo_anticipado text default null
)
returns table (
  codigo_corto text,
  token_qr     text,
  fecha        date,
  hora         time
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
  v_bloque     bloques;
  --  Variables sueltas y no "dias_entrega" como tipo: Postgres revisa los
  --  tipos declarados al crear la funcion, y esa tabla se crea despues
  --  (seccion 21). Las consultas si se resuelven al ejecutarse.
  v_abre_en    timestamptz;
  v_abre_ant   timestamptz;
  v_codigo_dia text;
  v_dia_cerrado boolean;
  v_semana     date;
  v_limite     int;
  v_usadas     int;
  v_persona    personas;
  v_cita       citas;
  v_codigo     text;
  v_intentos   int := 0;
  v_anticipada boolean := false;
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

  select * into v_bloque from bloques where id = p_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  -- ----------------------------------------------------------
  --  Apertura del dia
  -- ----------------------------------------------------------
  --  Antes de la hora de apertura solo entra quien trae el codigo de
  --  suscriptor, y solo dentro de su ventana de acceso anticipado.
  select d.abre_en, d.abre_anticipado_en, d.codigo_anticipado, d.cerrado
    into v_abre_en, v_abre_ant, v_codigo_dia, v_dia_cerrado
    from dias_entrega d
   where d.fecha = v_bloque.fecha;

  if not found or v_dia_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if now() < v_abre_en then
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

  v_semana := date_trunc('week', v_bloque.fecha)::date;

  -- ----------------------------------------------------------
  --  Tope por dispositivo
  -- ----------------------------------------------------------
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
      from citas
     where dispositivo_id = p_dispositivo
       and semana = v_semana
       and estado <> 'cancelada';

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
      insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, email, ciudad)
      values (v_codigo,
              v_nombres || ' ' || v_apellidos,
              v_nombres,
              v_apellidos,
              v_telefono,
              nullif(trim(p_email), ''),
              nullif(trim(p_ciudad), ''))
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
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text) to anon, authenticated;


-- ============================================================
--  20. REGISTRO DESDE EL PANEL: apellidos y telefono internacional
-- ============================================================
drop function if exists registrar_desde_panel(text, text, uuid, text, text);

create or replace function registrar_desde_panel(
  p_nombre    text,
  p_apellidos text,
  p_telefono  text,
  p_bloque_id uuid,
  p_email     text default null,
  p_ciudad    text default null
)
returns table (
  codigo_corto text,
  token_qr     text,
  fecha        date,
  hora         time
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
  v_bloque    bloques;
  v_persona   personas;
  v_cita      citas;
  v_codigo    text;
  v_intentos  int := 0;
begin
  perform exigir_rol(array['admin']);

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

  select * into v_bloque from bloques where id = p_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  --  El admin puede registrar aunque el dia no se haya abierto al publico,
  --  pero no en un dia cerrado (dia festivo, entrega cancelada).
  --  "d.fecha" calificado: sin prefijo chocaria con la columna "fecha" que
  --  devuelve esta funcion.
  if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
    raise exception 'DIA_CERRADO';
  end if;

  loop
    v_codigo := 'CB-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, email, ciudad)
      values (v_codigo,
              v_nombres || ' ' || v_apellidos,
              v_nombres,
              v_apellidos,
              v_telefono,
              nullif(trim(p_email), ''),
              nullif(trim(p_ciudad), ''))
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_desde_panel(text, text, text, uuid, text, text) from public;
grant  execute on function registrar_desde_panel(text, text, text, uuid, text, text) to authenticated;
