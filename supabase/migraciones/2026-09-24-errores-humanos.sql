-- ============================================================
--  Cajita de Bendicion - Errores de dedo y errores de gente
--
--  * La misma persona el mismo dia: el doble toque con mala senal ya no
--    crea una segunda cita. Se le devuelve la suya.
--  * El codigo corto se acepta como lo teclea la gente: "cb 4871",
--    "4871", "CB487l".
--  * La busqueda del escaneo ya no se fija en acentos ni en el orden de
--    las palabras, y sugiere codigos parecidos cuando uno no existe.
--  * Se puede deshacer una entrega marcada por error (palomita nueva:
--    anular_entregas, apagada).
--  * "Entro sin cita" avisa si esa persona ya se anoto hoy
--    (NOMBRE_YA_ANOTADO_HOY), para no contar dos cajas por una.
--
--  No toca reservar_cita() ni registrar_entrega(). Requiere
--  2026-09-23-filas-carro-y-a-pie.sql. Se puede repetir.
-- ============================================================

begin;

-- ------------------------------------------------------------
--  Errores de dedo y errores de gente
-- ------------------------------------------------------------
--  Nadie se equivoca a proposito. La senal se cae y se toca "confirmar"
--  otra vez; en el telefono nadie escribe acentos; el voluntario teclea
--  "cb 4817" en vez de "CB-4871"; en la prisa se le entrega la caja a la
--  Maria equivocada. Esta seccion hace que esos errores no cuesten una
--  caja de mas ni una persona sin su caja.

--  Texto para COMPARAR, no para guardar: sin acentos, en minusculas, sin
--  puntos ni apostrofos y con un solo espacio. "MARÍA  de la Luz" y
--  "maria de la luz" quedan iguales. Las mayusculas con acento se
--  traducen antes de bajar a minusculas: asi no depende del idioma del
--  servidor.
create or replace function normalizar_texto(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select trim(regexp_replace(
           regexp_replace(
             lower(translate(coalesce(p_texto, ''),
                             'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇÝáàäâãéèëêíìïîóòöôõúùüûñçý',
                             'AAAAAEEEEIIIIOOOOOUUUUNCYaaaaaeeeeiiiiooooouuuuncy')),
             '[''’.]', '', 'g'),
           '[\s-]+', ' ', 'g'));
$$;

revoke execute on function normalizar_texto(text) from public, anon, authenticated;


--  El codigo corto como lo teclea la gente -> como esta guardado.
--    "cb 4871", "CB4871", "4871", "cb-487l", "CBO871"  ->  "CB-4871"/"CB-0871"
--  La O se lee como cero y la I y la L como uno, solo en los cuatro
--  digitos. Tiene que haber al menos un digito: "Lili" es un nombre, no un
--  codigo. Lo que no parece codigo se devuelve en mayusculas y sin
--  espacios a los lados, igual que antes.
create or replace function normalizar_codigo_corto(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
           when x ~ '^(CB|C8)?[0-9OIL]{4}$' and x ~ '[0-9]'
             then 'CB-' || translate(right(x, 4), 'OIL', '011')
           else upper(trim(coalesce(p_texto, '')))
         end
    from (select regexp_replace(upper(coalesce(p_texto, '')), '[^A-Z0-9]', '', 'g') as x) s;
$$;

revoke execute on function normalizar_codigo_corto(text) from public, anon, authenticated;


--  Si dos codigos se parecen tanto que uno es el otro mal tecleado: un
--  solo caracter distinto (4871 / 4881) o dos vecinos al reves
--  (4871 / 4817).
create or replace function codigos_parecidos(p_a text, p_b text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_distintos int[] := '{}';
  i           int;
begin
  if p_a is null or p_b is null or length(p_a) <> length(p_b) or p_a = p_b then
    return false;
  end if;

  for i in 1 .. length(p_a) loop
    if substr(p_a, i, 1) <> substr(p_b, i, 1) then
      v_distintos := v_distintos || i;
    end if;
  end loop;

  if cardinality(v_distintos) = 1 then
    return true;
  end if;

  return cardinality(v_distintos) = 2
     and v_distintos[2] = v_distintos[1] + 1
     and substr(p_a, v_distintos[1], 1) = substr(p_b, v_distintos[2], 1)
     and substr(p_a, v_distintos[2], 1) = substr(p_b, v_distintos[1], 1);
end;
$$;

revoke execute on function codigos_parecidos(text, text) from public, anon, authenticated;


--  La cita que la misma persona (mismo telefono, mismo nombre sin fijarse
--  en acentos ni mayusculas) ya tiene ese dia, o una fila vacia.
--
--  El candado va primero: dos envios iguales al mismo tiempo -- el doble
--  toque con mala senal -- esperan aqui su turno, y el segundo ya encuentra
--  la cita del primero. Sin el candado, los dos preguntarian "ya tiene?"
--  antes de que ninguno guardara: el mismo patron ingenuo del Google Form.
create or replace function cita_de_la_misma_persona(p_fecha date, p_telefono text, p_nombre text)
returns citas
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cita citas;
begin
  perform pg_advisory_xact_lock(hashtext('misma-persona:' || coalesce(p_telefono, '') || ':' || p_fecha::text));

  select c.* into v_cita
    from citas c
    join bloques  b on b.id = c.bloque_id
    join personas p on p.id = c.persona_id
   where b.fecha = p_fecha
     and c.estado <> 'cancelada'
     and p.telefono = p_telefono
     and normalizar_texto(p.nombre) = normalizar_texto(p_nombre)
   order by c.creada_en
   limit 1;

  return v_cita;
end;
$$;

revoke execute on function cita_de_la_misma_persona(date, text, text) from public, anon, authenticated;


-- ------------------------------------------------------------
--  Deshacer una entrega marcada por error
-- ------------------------------------------------------------
--  En la prisa se escanea a la Maria equivocada, o se toca "entregar" en
--  la persona de arriba en la lista. Sin esto, la Maria de verdad llega y
--  su codigo dice YA_USADO. Se deshace solo lo de HOY: lo de dias pasados
--  ya se reporto al banco de alimentos. No se borra nada: queda quien lo
--  deshizo, cuando y por que.
create table if not exists anulaciones_entrega (
  id            uuid primary key default gen_random_uuid(),
  cita_id       uuid references citas(id),
  pase_id       uuid references pases(id),
  fecha         date not null,
  entregada_en  timestamptz,
  anulada_por   uuid not null,
  anulada_en    timestamptz not null default now(),
  motivo        text not null
);

alter table anulaciones_entrega enable row level security;

create index if not exists idx_anulaciones_entrega_fecha on anulaciones_entrega (fecha);

--  Una palomita mas, apagada: deshacer una entrega es poder volver a
--  entregar ese codigo. El administrador siempre puede.
insert into permisos (clave) values ('anular_entregas')
on conflict (clave) do nothing;

create or replace function anular_entrega(p_codigo text, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_codigo  text := normalizar_codigo_corto(p_codigo);
  v_motivo  text := regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g');
  v_cita    citas;
  v_pase    entregas_pase;
begin
  perform exigir_permiso('anular_entregas');

  if v_motivo = '' then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  --  El mismo candado que registrar_entrega(): mientras se deshace, nadie
  --  la puede entregar a medias.
  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
   where upper(p.codigo_corto) = v_codigo
     and c.estado = 'entregada'
     and c.usado_en::date = current_date
   order by c.usado_en desc
   limit 1
     for update of c;

  if found then
    update citas
       set estado   = 'reservada',
           usado_en = null
     where id = v_cita.id;

    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'ANULADA');

    insert into anulaciones_entrega (cita_id, fecha, entregada_en, anulada_por, motivo)
    values (v_cita.id, current_date, v_cita.usado_en, v_usuario, v_motivo);

    return 'ANULADA';
  end if;

  --  Un pase permanente: se quita la caja de hoy, y el pase vuelve a
  --  servir hoy.
  select e.* into v_pase
    from entregas_pase e
    join pases    pa on pa.id = e.pase_id
    join personas p  on p.id  = pa.persona_id
   where upper(p.codigo_corto) = v_codigo
     and e.fecha = current_date
     for update of e;

  if found then
    insert into anulaciones_entrega (pase_id, fecha, entregada_en, anulada_por, motivo)
    values (v_pase.pase_id, v_pase.fecha, v_pase.entregada_en, v_usuario, v_motivo);

    delete from entregas_pase where id = v_pase.id;

    return 'ANULADA';
  end if;

  raise exception 'ENTREGA_NO_EXISTE';
end;
$$;

revoke execute on function anular_entrega(text, text) from public;
grant  execute on function anular_entrega(text, text) to authenticated;


-- ------------------------------------------------------------
--  Las funciones que ahora perdonan errores
-- ------------------------------------------------------------
drop function if exists registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text);

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

  select * into v_bloque from bloques where id = p_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  --  La fila a pie no recibe citas hasta que se abra (seccion 32). La
  --  pantalla ya no la ofrece; esto cierra la puerta de atras.
  if v_bloque.fila = 'a_pie' and not a_pie_abierto() then
    raise exception 'A_PIE_CERRADO';
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
  if p_dispositivo is not null then
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
       and c.estado <> 'cancelada';

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
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;


drop function if exists registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean);

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

  --  Sin horario se da de alta a la persona y ya: es lo que hace falta
  --  para darle un pase permanente (seccion 29), que no aparta lugar.
  if p_bloque_id is not null then
    select * into v_bloque from bloques where id = p_bloque_id;
    if not found then
      raise exception 'BLOQUE_NO_EXISTE';
    end if;

    --  La fila a pie no recibe citas hasta que se abra (seccion 32). La
    --  pantalla ya no la ofrece; esto cierra la puerta de atras.
    if v_bloque.fila = 'a_pie' and not a_pie_abierto() then
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

  if p_bloque_id is null then
    return query select v_persona.codigo_corto, null::text, null::date, null::time, false;
    return;
  end if;

  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) from public;
grant  execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) to authenticated;


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
  parecido     boolean
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
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado, false
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and (
       (b.fecha = current_date
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
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado, true
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and b.fecha = current_date
     and codigos_parecidos(upper(p.codigo_corto), v_codigo)
   order by p.nombre
   limit 5;
end;
$$;


revoke execute on function buscar_para_escaneo(text) from public;
grant  execute on function buscar_para_escaneo(text) to authenticated;


create or replace function registrar_entrega_por_codigo(p_codigo text)
returns table (
  resultado    text,
  nombre       text,
  codigo_corto text,
  hora         time
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_token text;
begin
  select c.token_qr into v_token
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where b.fecha = current_date
     and c.estado <> 'cancelada'
     and upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
   limit 1;

  if v_token is null then
    return query select 'NO_EXISTE'::text, null::text, null::text, null::time;
    return;
  end if;

  return query select * from registrar_entrega(v_token);
end;
$$;


revoke execute on function registrar_entrega_por_codigo(text) from public;
grant  execute on function registrar_entrega_por_codigo(text) to authenticated;


create or replace function registrar_entrega_autorizada_por_codigo(
  p_codigo              text,
  p_fecha               date,
  p_codigo_autorizacion text
)
returns table (
  resultado    text,
  nombre       text,
  codigo_corto text,
  hora         time
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_token text;
begin
  select c.token_qr into v_token
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
     and b.fecha = p_fecha
     and c.estado <> 'cancelada'
   limit 1;

  if v_token is null then
    return query select 'NO_EXISTE'::text, null::text, null::text, null::time;
    return;
  end if;

  return query select * from registrar_entrega_autorizada(v_token, p_codigo_autorizacion);
end;
$$;


revoke execute on function registrar_entrega_autorizada_por_codigo(text, date, text) from public;
grant  execute on function registrar_entrega_autorizada_por_codigo(text, date, text) to authenticated;


create or replace function cancelar_cita_panel(
  p_codigo text,
  p_fecha  date,
  p_hora   time,
  p_motivo text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_cita    citas;
begin
  perform exigir_permiso('cancelar_citas');

  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
     and b.fecha = p_fecha
     and b.hora  = p_hora
     and c.estado <> 'cancelada'
   limit 1
     for update of c;

  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado in ('entregada', 'llego') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  update citas
     set estado             = 'cancelada',
         cancelada_en       = now(),
         cancelada_por      = v_usuario,
         motivo_cancelacion = nullif(trim(p_motivo), '')
   where id = v_cita.id;

  return 'CANCELADA';
end;
$$;


revoke execute on function cancelar_cita_panel(text, date, time, text) from public;
grant  execute on function cancelar_cita_panel(text, date, time, text) to authenticated;


create or replace function reservar_con_excepcion(
  p_codigo    text,
  p_bloque_id uuid,
  p_motivo    text
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
  v_persona   personas;
  v_bloque    bloques;
  v_semana    date;
  v_ocupados  int;
  v_excepcion uuid;
  v_cita      citas;
begin
  perform exigir_rol(array['admin']);

  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_persona
    from personas p
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo);
  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  --  El mismo candado que reservar_cita(): las demas reservas sobre este
  --  horario esperan aqui.
  select * into v_bloque from bloques b where b.id = p_bloque_id for update;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  if v_bloque.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_bloque.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
    raise exception 'DIA_CERRADO';
  end if;

  v_semana := date_trunc('week', v_bloque.fecha)::date;

  --  La excepcion es para una SEGUNDA cita. Sin cita esa semana no hace falta.
  if not exists (select 1 from citas c
                  where c.persona_id = v_persona.id
                    and c.semana = v_semana
                    and c.estado in ('reservada', 'llego', 'entregada')
                    and c.excepcion_id is null) then
    raise exception 'NO_NECESITA_EXCEPCION';
  end if;

  if exists (select 1 from citas c
              where c.persona_id = v_persona.id
                and c.semana = v_semana
                and c.estado in ('reservada', 'llego', 'entregada')
                and c.excepcion_id is not null) then
    raise exception 'YA_TIENE_EXCEPCION_ESTA_SEMANA';
  end if;

  select count(*) into v_ocupados
    from citas c
   where c.bloque_id = p_bloque_id
     and c.estado <> 'cancelada';

  if v_ocupados >= v_bloque.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  insert into excepciones (persona_id, semana, motivo, autorizado_por)
  values (v_persona.id, v_semana, trim(p_motivo), v_usuario)
  returning id into v_excepcion;

  insert into citas (persona_id, bloque_id, semana, token_qr, excepcion_id, registrado_por)
  values (v_persona.id, p_bloque_id, v_semana, encode(gen_random_bytes(24), 'hex'), v_excepcion, v_usuario)
  returning * into v_cita;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;

exception
  --  Lo lanza el indice de una excepcion por semana si dos llegan juntas.
  when unique_violation then
    raise exception 'YA_TIENE_EXCEPCION_ESTA_SEMANA';
end;
$$;


revoke execute on function reservar_con_excepcion(text, uuid, text) from public;
grant  execute on function reservar_con_excepcion(text, uuid, text) to authenticated;


create or replace function citas_de_persona(p_codigo text)
returns table (
  fecha    date,
  hora     time,
  estado   text,
  usado_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('ver_personas');

  return query
  select b.fecha,
         b.hora,
         case
           when c.estado = 'reservada' and b.fecha < current_date then 'no_asistio'
           else c.estado
         end,
         c.usado_en
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
   order by b.fecha desc, b.hora desc
   limit 30;
end;
$$;


revoke execute on function citas_de_persona(text) from public;
grant  execute on function citas_de_persona(text) to authenticated;


create or replace function crear_pase(
  p_codigo text,
  p_motivo text default null
)
returns table (
  codigo_corto text,
  nombre       text,
  token        text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_persona personas;
  v_pase    pases;
begin
  perform exigir_permiso('dar_pases');

  select * into v_persona
    from personas p
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo);

  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  insert into pases (persona_id, token, motivo, creado_por)
  values (v_persona.id,
          encode(gen_random_bytes(24), 'hex'),
          nullif(trim(coalesce(p_motivo, '')), ''),
          auth.uid())
  on conflict (persona_id) do update
     set motivo            = excluded.motivo,
         --  Uno que sigue activo conserva su codigo, para que el papel
         --  que ya trae la persona siga sirviendo. Para cambiarselo esta
         --  renovar_pase(). Uno revocado empieza de cero: asi las copias
         --  del viejo no reviven.
         token             = case when pases.activo then pases.token else excluded.token end,
         activo            = true,
         creado_por        = excluded.creado_por,
         creado_en         = now(),
         revocado_por      = null,
         revocado_en       = null,
         motivo_revocacion = null
  returning * into v_pase;

  return query select v_persona.codigo_corto, v_persona.nombre, v_pase.token;
end;
$$;


revoke execute on function crear_pase(text, text) from public;
grant  execute on function crear_pase(text, text) to authenticated;


create or replace function renovar_pase(p_codigo text)
returns table (
  codigo_corto text,
  nombre       text,
  token        text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  --  Todo escalar: un 'select ... into' con varios destinos no admite
  --  una variable de fila en medio.
  v_pase_id uuid;
  v_activo  boolean;
  v_token   text;
  v_codigo  text;
  v_nombre  text;
begin
  perform exigir_permiso('dar_pases');

  select pa.id, pa.activo, p.codigo_corto, p.nombre
    into v_pase_id, v_activo, v_codigo, v_nombre
    from pases pa
    join personas p on p.id = pa.persona_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
     for update of pa;

  if not found then
    raise exception 'PASE_NO_EXISTE';
  end if;

  if not v_activo then
    raise exception 'PASE_YA_REVOCADO';
  end if;

  --  Todo calificado con el alias: 'token' tambien es el nombre de una
  --  de las columnas que devuelve esta funcion, y sin el alias Postgres
  --  no sabe a cual se refiere.
  update pases pa
     set token = encode(gen_random_bytes(24), 'hex')
   where pa.id = v_pase_id
  returning pa.token into v_token;

  return query select v_codigo, v_nombre, v_token;
end;
$$;


revoke execute on function renovar_pase(text) from public;
grant  execute on function renovar_pase(text) to authenticated;


create or replace function revocar_pase(p_codigo text, p_motivo text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_pase_id uuid;
begin
  perform exigir_permiso('dar_pases');

  select pa.id into v_pase_id
    from pases pa
    join personas p on p.id = pa.persona_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
     for update;

  if not found then
    raise exception 'PASE_NO_EXISTE';
  end if;

  update pases
     set activo            = false,
         revocado_por      = auth.uid(),
         revocado_en       = now(),
         motivo_revocacion = nullif(trim(coalesce(p_motivo, '')), '')
   where id = v_pase_id
     and activo;

  if not found then
    raise exception 'PASE_YA_REVOCADO';
  end if;

  return 'PASE_REVOCADO';
end;
$$;


revoke execute on function revocar_pase(text, text) from public;
grant  execute on function revocar_pase(text, text) to authenticated;


create or replace function detalle_de_persona(p_codigo text)
returns table (
  codigo_corto         text,
  nombre               text,
  nombres              text,
  apellidos            text,
  telefono             text,
  email                text,
  pais                 text,
  direccion            text,
  calle                text,
  numero_exterior      text,
  numero_interior      text,
  colonia              text,
  ciudad               text,
  municipio            text,
  estado               text,
  codigo_postal        text,
  sin_domicilio        boolean,
  acepto_privacidad_en timestamptz,
  registrada_en        timestamptz,
  citas_totales        int,
  cajas_recibidas      int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_codigo text := normalizar_codigo_corto(p_codigo);
begin
  perform exigir_permiso('ver_personas');

  if v_codigo = '' then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  return query
  select p.codigo_corto,
         p.nombre,
         p.nombres,
         p.apellidos,
         p.telefono,
         p.email,
         p.pais,
         p.direccion,
         p.calle,
         p.numero_exterior,
         p.numero_interior,
         p.colonia,
         p.ciudad,
         p.municipio,
         p.estado,
         p.codigo_postal,
         p.sin_domicilio,
         p.acepto_privacidad_en,
         p.creado_en,
         (select count(*)::int from citas c
           where c.persona_id = p.id and c.estado <> 'cancelada'),
         (select count(*)::int from citas c
           where c.persona_id = p.id and c.estado = 'entregada')
    from personas p
   where upper(p.codigo_corto) = v_codigo;

  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;
end;
$$;


revoke execute on function detalle_de_persona(text) from public;
grant  execute on function detalle_de_persona(text) to authenticated;



--  "Entro sin cita" dos veces la misma persona el mismo dia: se avisa.
drop function if exists registrar_entrada_sin_cita(text, text);

create or replace function registrar_entrada_sin_cita(
  p_nombre             text,
  p_fila               text    default null,
  p_confirmar_repetido boolean default false
)
returns table (
  codigo text,
  total  int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario  uuid := auth.uid();
  v_nombre   text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_codigo   text;
  v_intentos int := 0;
  --  Sin fila, la de quien la anota (seccion 32).
  v_fila     text := coalesce(p_fila, fila_de_entrega());
  v_repetido text;
begin
  perform exigir_permiso('anotar_sin_cita');

  if v_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  if not puede_escanear_fila(v_fila) then
    raise exception 'OTRA_FILA';
  end if;

  if v_nombre = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if v_nombre ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  --  La misma persona anotada dos veces hoy (seccion 33): dos voluntarios
  --  en la puerta, o el mismo que toco dos veces. Cada anotacion es una caja
  --  que se reporta al banco de alimentos; una de mas descuadra la cuenta.
  --  Se avisa con el comprobante que ya tiene, y si de verdad es otra
  --  persona con el mismo nombre, se confirma y pasa.
  --
  --  El candado hace que dos anotaciones iguales al mismo tiempo esperen
  --  su turno: la segunda ya ve la primera.
  if not coalesce(p_confirmar_repetido, false) then
    perform pg_advisory_xact_lock(hashtext('sin-cita:' || current_date::text || ':' || normalizar_texto(v_nombre)));

    select s.codigo into v_repetido
      from entradas_sin_cita s
     where s.fecha = current_date
       and s.anulada_en is null
       and normalizar_texto(s.nombre) = normalizar_texto(v_nombre)
     order by s.registrado_en desc
     limit 1;

    if v_repetido is not null then
      raise exception 'NOMBRE_YA_ANOTADO_HOY:%', v_repetido;
    end if;
  end if;

  --  Se reintenta si dos anotaciones del mismo dia sacan el mismo numero.
  loop
    v_codigo := 'SC-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into entradas_sin_cita (fecha, nombre, codigo, registrado_por, fila)
      values (current_date, v_nombre, v_codigo, v_usuario, v_fila);
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  return query
    select v_codigo,
           (select count(*)::int from entradas_sin_cita s
             where s.fecha = current_date and s.anulada_en is null and s.fila = v_fila);
end;
$$;

revoke execute on function registrar_entrada_sin_cita(text, text, boolean) from public;
grant  execute on function registrar_entrada_sin_cita(text, text, boolean) to authenticated;

commit;
