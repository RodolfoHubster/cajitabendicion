-- ============================================================
--  Cajita de Bendicion - Domicilio real y aviso de privacidad
--
--  * Tabla codigos_postales y buscar_codigo_postal() para el formulario.
--  * Columnas de domicilio y consentimiento en personas.
--  * validar_domicilio(): Mexico o Estados Unidos, codigo postal del
--    catalogo, colonia de ese codigo, calle y numero con forma real.
--  * registrar_y_reservar() y registrar_desde_panel() piden domicilio y
--    la casilla de privacidad (cambian sus parametros).
--
--  ORDEN: 1) esta migracion, 2) 2026-09-15-codigos-postales-datos.sql,
--  3) subir el codigo de la pagina. Entre el paso 1 y el 3 la pagina
--  anterior no puede registrar: hacerlo todo seguido.
--
--  Se puede repetir.
--
--  SEGURIDAD: todo va en una transaccion. Primero guarda un respaldo de
--  personas y citas; al final comprueba que cada persona y cada cita
--  registradas antes siguen ahi, con su nombre, telefono, correo, zona y
--  su QR. Si algo no cuadra, se detiene y NO se aplica nada.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  Respaldo (se toma la primera vez que se corre)
-- ------------------------------------------------------------
--  Privado: RLS sin politicas, nadie lo lee desde la pagina. Cuando todo
--  este bien se puede borrar:
--    drop table respaldo_personas_20260915, respaldo_citas_20260915;
create table if not exists respaldo_personas_20260915 as table personas;
create table if not exists respaldo_citas_20260915    as table citas;

alter table respaldo_personas_20260915 enable row level security;
alter table respaldo_citas_20260915    enable row level security;
revoke all on respaldo_personas_20260915, respaldo_citas_20260915 from anon, authenticated;

-- ============================================================
--  26. DOMICILIO Y AVISO DE PRIVACIDAD
-- ============================================================
--  Decision del Pastor David (15 sep 2026): el registro pide un domicilio
--  real en Mexico o Estados Unidos, y la persona confirma que comparte su
--  informacion por su propia voluntad.
--
--  "Real" se revisa contra un catalogo de codigos postales de California y
--  Baja California (datos de GeoNames, licencia CC BY 4.0), que se carga con
--  supabase/migraciones/2026-09-15-codigos-postales-datos.sql. No hay API de
--  mapas: las direcciones de esta comunidad no salen de la base.
--
--  Se comprueba que el codigo postal exista, que la colonia sea de ese codigo
--  y que calle y numero tengan forma de calle y numero. No se comprueba que
--  la casa exista. Quien no tiene domicilio fijo lo marca y basta su codigo
--  postal.

create table if not exists codigos_postales (
  id         bigint generated always as identity primary key,
  pais       text not null check (pais in ('US', 'MX')),
  codigo     text not null check (codigo ~ '^[0-9]{5}$'),
  colonia    text,          -- Mexico: el asentamiento. Estados Unidos: nulo.
  ciudad     text not null,
  municipio  text,          -- Mexico: el municipio. Estados Unidos: el condado.
  estado     text not null
);

create index if not exists idx_codigos_postales on codigos_postales (pais, codigo);

--  Sin politicas: nadie la lee directo. El formulario usa buscar_codigo_postal().
alter table codigos_postales enable row level security;

--  Quien se registro antes de pedir domicilio (15 sep 2026) se respeta tal
--  cual: conserva su zona en "ciudad" y su "pais" queda vacio.
alter table personas add column if not exists pais                 text;
alter table personas add column if not exists estado               text;
alter table personas add column if not exists municipio            text;
alter table personas add column if not exists colonia              text;
alter table personas add column if not exists calle                text;
alter table personas add column if not exists numero_exterior      text;
alter table personas add column if not exists numero_interior      text;
alter table personas add column if not exists sin_domicilio        boolean not null default false;
--  Cuando confirmo que comparte su informacion por su voluntad.
alter table personas add column if not exists acepto_privacidad_en timestamptz;


--  Lo que el formulario muestra al escribir el codigo postal: ciudad, estado
--  y, en Mexico, sus colonias. Son datos publicos del catalogo y no tocan a
--  ninguna persona; por eso se abre a anon (el registro es sin sesion).
create or replace function buscar_codigo_postal(p_pais text, p_codigo text)
returns table (
  ciudad    text,
  colonia   text,
  municipio text,
  estado    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct cp.ciudad, cp.colonia, cp.municipio, cp.estado
    from codigos_postales cp
   where cp.pais   = upper(trim(coalesce(p_pais, '')))
     and cp.codigo = trim(coalesce(p_codigo, ''))
   order by cp.ciudad, cp.colonia;
$$;

revoke execute on function buscar_codigo_postal(text, text) from public;
grant  execute on function buscar_codigo_postal(text, text) to anon, authenticated;


--  Revisa el domicilio y lo devuelve limpio, con la ciudad, municipio y
--  estado del catalogo (no los que escriba la persona) y la direccion armada.
--  La usan registrar_y_reservar() y registrar_desde_panel(). Las mismas
--  reglas avisan a tiempo en la pantalla (src/datos/domicilio.js).
create or replace function validar_domicilio(
  p_pais              text,
  p_codigo_postal     text,
  p_colonia           text,
  p_calle             text,
  p_numero            text,
  p_numero_interior   text,
  p_sin_domicilio     boolean,
  out o_pais            text,
  out o_codigo_postal   text,
  out o_ciudad          text,
  out o_colonia         text,
  out o_municipio       text,
  out o_estado          text,
  out o_calle           text,
  out o_numero          text,
  out o_numero_interior text,
  out o_direccion       text
)
language plpgsql
stable
set search_path = public, extensions, pg_temp
as $$
declare
  v_sin     boolean := coalesce(p_sin_domicilio, false);
  v_colonia text    := regexp_replace(trim(coalesce(p_colonia, '')), '\s+', ' ', 'g');
  v_letras  text;
begin
  o_pais := upper(trim(coalesce(p_pais, '')));
  if o_pais not in ('US', 'MX') then
    raise exception 'PAIS_INVALIDO';
  end if;

  --  "92105-1234" (ZIP+4) se guarda como 92105.
  o_codigo_postal := regexp_replace(trim(coalesce(p_codigo_postal, '')), '^([0-9]{5})-[0-9]{4}$', '\1');
  if o_codigo_postal = '' then
    raise exception 'CODIGO_POSTAL_REQUERIDO';
  end if;

  if o_codigo_postal !~ '^[0-9]{5}$' then
    raise exception 'CODIGO_POSTAL_INVALIDO';
  end if;

  if not exists (select 1 from codigos_postales cp
                  where cp.pais = o_pais and cp.codigo = o_codigo_postal) then
    raise exception 'CODIGO_POSTAL_NO_EXISTE';
  end if;

  --  En Mexico un codigo postal abarca varias colonias: la persona elige la
  --  suya de la lista. Sin domicilio fijo la colonia es opcional.
  if o_pais = 'MX' and (v_colonia <> '' or not v_sin) then
    if v_colonia = '' then
      raise exception 'COLONIA_REQUERIDA';
    end if;

    select cp.colonia, cp.ciudad, cp.municipio, cp.estado
      into o_colonia, o_ciudad, o_municipio, o_estado
      from codigos_postales cp
     where cp.pais = o_pais
       and cp.codigo = o_codigo_postal
       and lower(cp.colonia) = lower(v_colonia)
     limit 1;

    if not found then
      raise exception 'COLONIA_INVALIDA';
    end if;
  else
    select cp.ciudad, cp.municipio, cp.estado
      into o_ciudad, o_municipio, o_estado
      from codigos_postales cp
     where cp.pais = o_pais and cp.codigo = o_codigo_postal
     order by cp.ciudad
     limit 1;
  end if;

  if v_sin then
    o_direccion := 'Sin domicilio fijo'
                   || coalesce(', ' || o_colonia, '')
                   || ', ' || o_codigo_postal || ' ' || o_ciudad || ', ' || o_estado;
    return;
  end if;

  o_calle := regexp_replace(trim(coalesce(p_calle, '')), '\s+', ' ', 'g');
  if o_calle = '' then
    raise exception 'CALLE_REQUERIDA';
  end if;

  --  Una calle tiene nombre: al menos 3 letras y no la misma repetida. Asi no
  --  pasan ".", "123" ni "aaaa".
  v_letras := lower(regexp_replace(o_calle, '[^[:alpha:]áéíóúüñÁÉÍÓÚÜÑ]', '', 'g'));
  if length(o_calle) > 120
     or length(v_letras) < 3
     or (select count(distinct letra) from regexp_split_to_table(v_letras, '') letra) < 2 then
    raise exception 'CALLE_INVALIDA';
  end if;

  --  Numero: 4250, 12B o 1234-5. En Mexico tambien "S/N" (sin numero).
  o_numero := upper(regexp_replace(trim(coalesce(p_numero, '')), '\s+', '', 'g'));
  if o_numero = '' then
    raise exception 'NUMERO_REQUERIDO';
  end if;

  if o_pais = 'MX' and o_numero in ('SN', 'S/N', 'S.N.', 'S-N') then
    o_numero := 'S/N';
  elsif o_numero !~ '^[0-9]{1,6}[A-Z]?(-[0-9A-Z]{1,4})?$' then
    raise exception 'NUMERO_INVALIDO';
  end if;

  o_numero_interior := nullif(upper(regexp_replace(trim(coalesce(p_numero_interior, '')), '\s+', ' ', 'g')), '');
  if o_numero_interior is not null and o_numero_interior !~ '^[0-9A-Z #-]{1,10}$' then
    raise exception 'NUMERO_INTERIOR_INVALIDO';
  end if;

  if o_pais = 'MX' then
    o_direccion := o_calle || ' ' || o_numero
                   || coalesce(' Int. ' || o_numero_interior, '')
                   || ', ' || o_colonia
                   || ', ' || o_codigo_postal || ' ' || o_ciudad || ', ' || o_estado || ', México';
  else
    o_direccion := o_numero || ' ' || o_calle
                   || coalesce(' Apt ' || o_numero_interior, '')
                   || ', ' || o_ciudad || ', ' || o_estado || ' ' || o_codigo_postal || ', USA';
  end if;
end;
$$;

--  Solo por dentro de las funciones de registro.
revoke execute on function validar_domicilio(text, text, text, text, text, text, boolean) from public, anon, authenticated;


--  Crea la persona y aparta su lugar, todo en una sola transaccion.
--  Si algo falla a la mitad, no queda una persona sin cita.
--
--  Pide el domicilio (validado con el catalogo, seccion 26) y la
--  confirmacion de que la persona comparte su informacion por su voluntad.
--
--  Se borran las versiones anteriores antes de crearla: cambiaron sus
--  parametros (p_email perdio su valor por defecto; despues p_ciudad dejo su
--  lugar al domicilio). Postgres no deja cambiar eso con "create or replace".
--  Borrar una funcion no toca ningun dato.
drop function if exists registrar_y_reservar(text, text, uuid, text, text, text);
drop function if exists registrar_y_reservar(text, text, text, uuid, text, text, text, text);

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
  p_codigo_anticipado text    default null
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
  v_domicilio  record;
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

  --  Domicilio real en Mexico o Estados Unidos (seccion 26).
  select * into v_domicilio
    from validar_domicilio(p_pais, p_codigo_postal, p_colonia, p_calle,
                           p_numero, p_numero_interior, p_sin_domicilio);

  --  La casilla "comparto esta informacion por mi voluntad".
  if not coalesce(p_acepto_privacidad, false) then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
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
  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas
     set dispositivo_id        = p_dispositivo,
         con_codigo_anticipado = v_anticipada
   where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;


--  Registro desde el panel, para quien no puede registrarse por su cuenta.
--
--  Solo admin. A diferencia del formulario publico:
--    * no aplica el limite por dispositivo: la computadora de la oficina
--      registra a muchas personas;
--    * el correo es opcional: muchos adultos mayores no tienen.
--  El domicilio y la confirmacion de privacidad se piden igual que en el
--  publico (la persona se la confirma al pastor). El corte de cupo y la
--  regla de una cita por semana siguen igual, porque la cita la aparta
--  reservar_cita().
--
--  Se borra la version anterior: su p_ciudad dejo su lugar al domicilio.
drop function if exists registrar_desde_panel(text, text, text, uuid, text, text);

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
  p_acepto_privacidad boolean default false
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
  v_domicilio record;
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

  select * into v_domicilio
    from validar_domicilio(p_pais, p_codigo_postal, p_colonia, p_calle,
                           p_numero, p_numero_interior, p_sin_domicilio);

  if not coalesce(p_acepto_privacidad, false) then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
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

  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) from public;
grant  execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) to authenticated;


-- ------------------------------------------------------------
--  Comprobacion: nadie de los ya registrados se perdio ni cambio
-- ------------------------------------------------------------
do $verificar$
declare
  v_faltan_personas int;
  v_cambiadas       int;
  v_faltan_citas    int;
begin
  select count(*) into v_faltan_personas
    from respaldo_personas_20260915 r
   where not exists (select 1 from personas p where p.id = r.id);

  select count(*) into v_cambiadas
    from respaldo_personas_20260915 r
    join personas p on p.id = r.id
   where p.codigo_corto is distinct from r.codigo_corto
      or p.nombre       is distinct from r.nombre
      or p.telefono     is distinct from r.telefono
      or p.email        is distinct from r.email
      or p.ciudad       is distinct from r.ciudad;

  select count(*) into v_faltan_citas
    from respaldo_citas_20260915 r
   where not exists (select 1 from citas c where c.id = r.id and c.token_qr = r.token_qr);

  if v_faltan_personas > 0 or v_cambiadas > 0 or v_faltan_citas > 0 then
    raise exception 'MIGRACION DETENIDA: faltan % personas, % cambiaron y faltan % citas. No se aplico nada.',
      v_faltan_personas, v_cambiadas, v_faltan_citas;
  end if;

  raise notice 'Domicilio instalado. Se conservaron % personas y % citas registradas antes.',
    (select count(*) from respaldo_personas_20260915), (select count(*) from respaldo_citas_20260915);
end
$verificar$;

commit;
