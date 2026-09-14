-- ============================================================
--  Cajita de Bendición — Esquema base (PostgreSQL / Supabase)
--  Versión 1: fila de carros
-- ============================================================
--  Este archivo crea las tablas, las reglas de integridad y las
--  dos transacciones que sostienen todo el sistema:
--    · reservar_cita()      — impide sobrecupo y doble cita semanal
--    · registrar_entrega()  — impide que un QR se use dos veces
--
--  La idea de fondo: las reglas viven en la base de datos, no en
--  el código de la aplicación. Así no se pueden romper por un
--  descuido al programar la pantalla.
-- ============================================================


-- ============================================================
--  1. PERSONAS
-- ============================================================
--  Una fila por persona mayor de 18 años. No existe el concepto
--  de "familia": si tres personas de una casa quieren tres cajas,
--  son tres filas aquí, tal como lo definió el Pastor David.

create table personas (
  id             uuid primary key default gen_random_uuid(),

  -- Identificador tipo matrícula. Es lo que el voluntario teclea
  -- cuando el QR no se deja leer. Estable de por vida.
  codigo_corto   text unique not null,

  -- Nombre completo, tal como se muestra al escanear y en la confirmacion.
  nombre         text not null,
  -- Separados para ordenar las listas por apellido: la gente escribe
  -- primero uno u otro.
  nombres        text,
  apellidos      text,
  telefono       text,
  email          text,
  direccion      text,
  ciudad         text,
  codigo_postal  text,

  idioma         text not null default 'es'
                 check (idioma in ('es','en')),

  -- Pases especiales que hoy se manejan con tarjeta física.
  --   normal       → reserva como todos
  --   horario_fijo → siempre el mismo bloque, sin reservar cada semana
  --   preferente   → entra sin fila (casos médicos)
  tipo_pase      text not null default 'normal'
                 check (tipo_pase in ('normal','horario_fijo','preferente')),

  activo         boolean not null default true,
  creado_en      timestamptz not null default now()
);

create index idx_personas_nombre on personas using gin (to_tsvector('spanish', nombre));
create index idx_personas_telefono on personas (telefono);
create index idx_personas_apellidos on personas (apellidos, nombres);


-- ============================================================
--  2. BLOQUES DE HORARIO
-- ============================================================
--  Un bloque = una fecha + una hora de 15 minutos + su cupo.
--  El administrador los crea; por eso NO se restringe aquí que
--  sean solo lunes y jueves. Si algún día hacen una entrega
--  especial en miércoles, el sistema no debe estorbarles.

create table bloques (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  hora       time not null,
  capacidad  int  not null check (capacidad >= 0),
  cerrado    boolean not null default false,
  creado_en  timestamptz not null default now(),

  unique (fecha, hora)
);

create index idx_bloques_fecha on bloques (fecha);


-- ============================================================
--  3. CITAS
-- ============================================================

create table citas (
  id           uuid primary key default gen_random_uuid(),
  persona_id   uuid not null references personas(id) on delete restrict,
  bloque_id    uuid not null references bloques(id)  on delete restrict,

  -- Lunes de la semana a la que pertenece la cita. Se calcula
  -- solo, dentro de reservar_cita(); no lo manda la aplicación.
  semana       date not null,

  estado       text not null default 'reservada'
               check (estado in ('reservada','llego','entregada','cancelada','no_asistio')),

  -- Contenido del QR. Aleatorio y sin datos personales adentro,
  -- para que una foto del código no revele nada de la persona.
  token_qr     text unique not null,

  usado_en     timestamptz,
  creada_en    timestamptz not null default now()
);

-- ------------------------------------------------------------
--  LA REGLA CENTRAL: una cita activa por persona por semana.
--
--  Es un índice único PARCIAL: solo aplica a los estados activos.
--  Esto es lo que permite que alguien cancele y vuelva a
--  reservar en la misma semana sin quedar bloqueado.
--
--  MySQL no soporta esto y Firestore tampoco. Es la razón
--  principal para usar PostgreSQL en este proyecto.
-- ------------------------------------------------------------
create unique index una_cita_activa_por_semana
  on citas (persona_id, semana)
  where estado in ('reservada','llego','entregada');

create index idx_citas_bloque on citas (bloque_id) where estado <> 'cancelada';
create index idx_citas_token  on citas (token_qr);


-- ============================================================
--  4. ESCANEOS
-- ============================================================
--  Bitácora de quién escaneó qué y cuándo. Sirve para auditoría
--  y para responder "¿a qué hora se le entregó a esta persona?".

create table escaneos (
  id           uuid primary key default gen_random_uuid(),
  cita_id      uuid not null references citas(id),
  usuario_id   uuid not null,              -- auth.users de Supabase
  resultado    text not null,
  escaneado_en timestamptz not null default now()
);


-- ============================================================
--  5. ENTRADAS SIN CITA
-- ============================================================
--  El botón que pidió el Pastor David: una fila por cada persona
--  que se dejó pasar sin cita. No se guarda nombre ni teléfono,
--  es puro conteo. Se guarda quién lo autorizó y a qué hora para
--  poder revisarlo después.

create table entradas_sin_cita (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default (now() at time zone 'America/Los_Angeles')::date,
  registrado_por  uuid not null,
  registrado_en   timestamptz not null default now()
);

create index idx_sin_cita_fecha on entradas_sin_cita (fecha);


-- ============================================================
--  6. EXCEPCIONES AUTORIZADAS
-- ============================================================
--  Cuando el administrador permite una segunda entrega en la
--  misma semana (enfermedad, situación especial). Queda
--  registrado el motivo y quién la autorizó.

create table excepciones (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references personas(id),
  semana          date not null,
  motivo          text not null,
  autorizado_por  uuid not null,
  creada_en       timestamptz not null default now()
);


-- ============================================================
--  7. RESERVAR UNA CITA
-- ============================================================
--  Esta función es el corazón del sistema y resuelve el problema
--  que hoy tiene el formulario de Google.
--
--  El "for update" bloquea la fila del bloque mientras se cuenta
--  y se inserta. Si cinco personas pican "reservar" en el mismo
--  segundo sobre un bloque con dos lugares, entran dos y las
--  otras tres reciben BLOQUE_LLENO. Nunca se sobrepasa el cupo.

create or replace function reservar_cita(
  p_persona_id uuid,
  p_bloque_id  uuid
)
returns citas
language plpgsql
as $$
declare
  v_bloque   bloques;
  v_ocupados int;
  v_semana   date;
  v_cita     citas;
begin
  -- Las demás peticiones sobre este mismo bloque esperan aquí.
  select * into v_bloque
    from bloques
   where id = p_bloque_id
     for update;

  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  if v_bloque.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_bloque.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  select count(*) into v_ocupados
    from citas
   where bloque_id = p_bloque_id
     and estado <> 'cancelada';

  if v_ocupados >= v_bloque.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  -- El lunes de esa semana, en formato fecha.
  v_semana := date_trunc('week', v_bloque.fecha)::date;

  insert into citas (persona_id, bloque_id, semana, token_qr)
  values (
    p_persona_id,
    p_bloque_id,
    v_semana,
    encode(gen_random_bytes(24), 'hex')
  )
  returning * into v_cita;

  return v_cita;

exception
  -- Lo lanza el índice único parcial de arriba.
  when unique_violation then
    raise exception 'YA_TIENE_CITA_ESTA_SEMANA';
end;
$$;


-- ============================================================
--  8. REGISTRAR LA ENTREGA (ESCANEO)
-- ============================================================
--  Mismo principio: el "for update" sobre la cita evita que dos
--  voluntarios escaneando el mismo QR al mismo tiempo registren
--  dos entregas. El segundo recibe YA_USADO.

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
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  -- Escanean voluntarios y administradores. Una cuenta sin rol no entrega.
  perform exigir_rol(array['admin', 'voluntario']);

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


-- ============================================================
--  9. RESUMEN DEL DÍA
-- ============================================================
--  Los cuatro números del panel administrativo, en una consulta.

create or replace view resumen_dia as
select
  b.fecha,
  count(*) filter (where c.estado in ('reservada','llego','entregada'))       as con_cita,
  count(*) filter (where c.estado = 'entregada')                             as ya_recibieron,
  count(*) filter (where c.estado = 'reservada')                             as faltan_por_llegar,
  (select count(*) from entradas_sin_cita s where s.fecha = b.fecha)         as sin_cita,
  (select count(*) from escaneos e
     join citas c2 on c2.id = e.cita_id
     join bloques b2 on b2.id = c2.bloque_id
    where e.resultado = 'YA_USADO' and b2.fecha = b.fecha)                   as intentos_repetidos
from bloques b
left join citas c on c.bloque_id = b.id
group by b.fecha;


-- ============================================================
--  10. ROW LEVEL SECURITY
-- ============================================================
--  Se activa aqui, explicitamente, y no se deja a la casilla
--  "Enable automatic RLS" del panel de Supabase: este archivo tiene
--  que bastarse solo. Si alguien recrea la base sin esa casilla
--  palomeada, las tablas nacerian abiertas.
--
--  Sin politicas, RLS significa "no pasa nadie". Ese es el estado
--  seguro de partida. El acceso legitimo entra por las dos funciones
--  de mas abajo, nunca tocando las tablas directamente.

alter table personas          enable row level security;
alter table bloques           enable row level security;
alter table citas             enable row level security;
alter table escaneos          enable row level security;
alter table entradas_sin_cita enable row level security;
alter table excepciones       enable row level security;


-- ============================================================
--  11. ZONA HORARIA
-- ============================================================
--  Supabase deja la base en UTC. Con entregas de 2:45 a 6:30 PM en
--  San Diego, todo lo que pasa despues de las 5 PM cae en el "dia
--  siguiente" segun UTC. Sin esto, registrar_entrega() rechazaria
--  citas validas con OTRA_FECHA y reservar_cita() las rechazaria con
--  FECHA_PASADA, justo en la hora mas cargada y con la fila afuera.
--
--  Se usa el NOMBRE de la zona, no un desfase fijo: America/Los_Angeles
--  se ajusta solo al horario de verano. Un -8 escrito a mano se
--  romperia dos veces al año.

alter database postgres set timezone to 'America/Los_Angeles';


-- ============================================================
--  12. PERMISOS
-- ============================================================
--  Las tablas estan cerradas. Estas dos funciones son la unica puerta,
--  y por eso corren con los permisos de su dueño en vez de los de
--  quien las llama.
--
--  El search_path fijo NO es opcional: sin el, una funcion security
--  definer se puede secuestrar apuntandola a tablas falsas. El schema
--  extensions hace falta para gen_random_bytes().
--
--  La zona se fija tambien aqui para no depender de la sesion ni de
--  conexiones viejas que sigan en el pool con la configuracion previa.

alter function reservar_cita(uuid, uuid)
  security definer
  set search_path = public, extensions, pg_temp
  set timezone    = 'America/Los_Angeles';

alter function registrar_entrega(text)
  security definer
  set search_path = public, extensions, pg_temp
  set timezone    = 'America/Los_Angeles';

--  Postgres regala EXECUTE a todo el mundo por defecto. Con security
--  definer eso es peligroso: se retira y se entrega a mano.
revoke execute on function reservar_cita(uuid, uuid) from public;
revoke execute on function registrar_entrega(text)   from public;

--  reservar_cita     -> nadie desde el navegador. Solo la llaman
--                       registrar_y_reservar() y registrar_desde_panel(),
--                       que antes revisan la apertura del dia y el limite
--                       por dispositivo (secciones 15, 20 y 21).
--  registrar_entrega -> solo personal con sesion iniciada. Un visitante
--                       no tiene por que poder quemar codigos QR.
grant execute on function registrar_entrega(text)   to authenticated;


-- ============================================================
--  13. CONSULTAR DISPONIBILIDAD
-- ============================================================
--  Alimenta /calendario y /horarios/:fecha.
--
--  Es una funcion y no una politica de lectura sobre citas a
--  proposito: devuelve unicamente numeros agregados. Nunca sale de
--  aqui quien reservo, ni su nombre, ni su telefono. Parte de la
--  comunidad atendida tiene estatus migratorio delicado; una funcion
--  estrecha no puede filtrar de mas, una politica mal escrita si.
--
--  No se filtra por lunes y jueves. El calendario muestra las fechas
--  que TIENEN bloques, y el administrador decide cuales crear. Asi una
--  entrega especial en miercoles funciona sin tocar el codigo.

create or replace function consultar_disponibilidad(
  p_desde date default null,
  p_hasta date default null
)
returns table (
  bloque_id          uuid,
  fecha              date,
  hora               time,
  capacidad          int,
  ocupados           int,
  libres             int,
  abierto            boolean,
  abre_en            timestamp,
  abre_anticipado_en timestamp
)
-- PL/pgSQL y no SQL: su cuerpo usa dias_entrega (seccion 21), y asi la
-- tabla se resuelve al ejecutarse, no al crearse la funcion.
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  return query
  select b.id,
         b.fecha,
         b.hora,
         b.capacidad,
         count(c.id) filter (where c.estado <> 'cancelada')::int,
         greatest(
           b.capacidad - count(c.id) filter (where c.estado <> 'cancelada'),
           0
         )::int,
         -- Las fechas aun no abiertas SI se muestran, con su hora de
         -- apertura: el publico sabe cuando volver. Reservar lo impide
         -- registrar_y_reservar(), no esta consulta.
         now() >= d.abre_en,
         d.abre_en at time zone 'America/Los_Angeles',
         d.abre_anticipado_en at time zone 'America/Los_Angeles'
    from bloques b
    join dias_entrega d on d.fecha = b.fecha and not d.cerrado
    left join citas c on c.bloque_id = b.id
   where b.cerrado = false
     -- Nunca se ofrecen fechas pasadas: reservar_cita() las rechazaria
     -- con FECHA_PASADA y el usuario no entenderia por que.
     and b.fecha >= greatest(coalesce(p_desde, current_date), current_date)
     and b.fecha <= coalesce(p_hasta, current_date + 60)
   group by b.id, b.fecha, b.hora, b.capacidad, d.abre_en, d.abre_anticipado_en
   order by b.fecha, b.hora;
end;
$$;

revoke execute on function consultar_disponibilidad(date, date) from public;
grant  execute on function consultar_disponibilidad(date, date) to anon, authenticated;


-- ============================================================
--  14. CONFIGURACION
-- ============================================================
--  Ajustes que el administrador cambia sin tocar codigo.

create table if not exists configuracion (
  clave text primary key,
  valor text not null,
  nota  text
);

insert into configuracion (clave, valor, nota) values
  ('limite_citas_por_dispositivo', '1',
   'Cuantas citas puede crear un mismo telefono por semana. Es un tope, ' ||
   'no un muro: una ventana privada o borrar datos del navegador cuenta ' ||
   'como dispositivo nuevo. Se sube cuando llega una familia que comparte ' ||
   'un solo telefono.')
on conflict (clave) do nothing;


-- ============================================================
--  15. REGISTRO PUBLICO
-- ============================================================

--  De que dispositivo salio cada cita. Es una senal, no una identidad:
--  sirve para topar el abuso obvio y para que el panel muestre patrones.
alter table citas add column if not exists dispositivo_id text;

create index if not exists idx_citas_dispositivo
  on citas (dispositivo_id, semana)
  where estado <> 'cancelada';


--  Crea la persona y aparta su lugar, todo en una sola transaccion.
--  Si algo falla a la mitad, no queda una persona sin cita.
--
--  Se borra antes de crearla porque una version previa tenia p_email con
--  valor por defecto. Postgres no deja quitar defaults con "create or
--  replace" (42P13); hay que tirar la funcion y volverla a hacer. Borrar
--  una funcion no toca ningun dato.
drop function if exists registrar_y_reservar(text, text, uuid, text, text, text);

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
--  16. CONSULTAR LA PROPIA CITA
-- ============================================================
--  Alimenta /confirmacion/:token. Permite recargar la pagina o volver
--  al enlace despues, sin perder el codigo.
--
--  Devuelve el nombre porque el mockup lo muestra ("A nombre de...") y
--  porque el voluntario lo necesita para cotejar. No expone telefono,
--  correo ni direccion: quien tiene el token ve su cita, nada mas.
--
--  El token son 24 bytes aleatorios, no se adivina.

create or replace function consultar_cita(p_token text)
returns table (
  codigo_corto text,
  nombre       text,
  fecha        date,
  hora         time,
  estado       text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.codigo_corto, p.nombre, b.fecha, b.hora, c.estado
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.token_qr = p_token;
$$;

revoke execute on function consultar_cita(text) from public;
grant  execute on function consultar_cita(text) to anon, authenticated;


-- ============================================================
--  17. PANEL: CITAS DE HOY
-- ============================================================
--  Alimenta /admin. Todo aqui es solo para personal con sesion: nada
--  se otorga a anon.
--
--  ROLES: estas funciones son solo del administrador (seccion 20). La
--  restriccion va dentro de cada funcion, no en la pantalla: una
--  pantalla se esquiva, una funcion no.

--  Los cuatro numeros del encabezado del panel.
create or replace function resumen_del_dia(p_fecha date default null)
returns table (
  fecha              date,
  con_cita           int,
  ya_recibieron      int,
  faltan_por_llegar  int,
  sin_cita           int,
  intentos_repetidos int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_fecha date := coalesce(p_fecha, current_date);
begin
  -- Las estadisticas son solo del administrador.
  perform exigir_rol(array['admin']);

  return query
  select
    v_fecha,
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha
        and c.estado in ('reservada','llego','entregada')),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and c.estado = 'entregada'),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and c.estado = 'reservada'),
    (select count(*)::int from entradas_sin_cita s where s.fecha = v_fecha),
    --  Intentos repetidos: alguien trato de usar dos veces el mismo
    --  codigo. Es la senal de que el corte esta funcionando y de que
    --  hay quien lo esta intentando.
    (select count(*)::int from escaneos e
       join citas   c on c.id = e.cita_id
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and e.resultado = 'YA_USADO');
end;
$$;

revoke execute on function resumen_del_dia(date) from public;
grant  execute on function resumen_del_dia(date) to authenticated;


--  La lista de llegadas del mockup 8.
--
--  Devuelve solo las cinco columnas que la pantalla muestra. NO salen
--  telefono, correo ni direccion: un voluntario en la entrada no los
--  necesita para dejar pasar a alguien, y parte de la comunidad tiene
--  estatus migratorio delicado.
create or replace function citas_del_dia(p_fecha date default null)
returns table (
  nombre       text,
  codigo_corto text,
  ciudad       text,
  hora         time,
  estado       text,
  usado_en     timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  -- La lista de personas es solo del administrador: un voluntario no ve
  -- el padron, solo lo necesario para escanear.
  perform exigir_rol(array['admin']);

  return query
  select p.nombre, p.codigo_corto, p.ciudad, b.hora, c.estado, c.usado_en
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where b.fecha = coalesce(p_fecha, current_date)
     and c.estado <> 'cancelada'
   order by b.hora, p.nombre;
end;
$$;

revoke execute on function citas_del_dia(date) from public;
grant  execute on function citas_del_dia(date) to authenticated;


--  Los cupos por horario, para el bloque "Cupo de cada horario".
--
--  Distinta de consultar_disponibilidad(): esa es para el publico y
--  esconde los horarios cerrados. El administrador necesita verlos,
--  justamente para poder reabrirlos.
create or replace function bloques_del_dia(p_fecha date default null)
returns table (
  bloque_id uuid,
  hora      time,
  capacidad int,
  ocupados  int,
  libres    int,
  cerrado   boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  return query
  select b.id,
         b.hora,
         b.capacidad,
         count(c.id) filter (where c.estado <> 'cancelada')::int,
         greatest(b.capacidad - count(c.id) filter (where c.estado <> 'cancelada'), 0)::int,
         b.cerrado
    from bloques b
    left join citas c on c.bloque_id = b.id
   where b.fecha = coalesce(p_fecha, current_date)
   group by b.id, b.hora, b.capacidad, b.cerrado
   order by b.hora;
end;
$$;

revoke execute on function bloques_del_dia(date) from public;
grant  execute on function bloques_del_dia(date) to authenticated;


-- ============================================================
--  18. ESCANEO: RESPALDO MANUAL
-- ============================================================
--  Cuando el QR no se deja leer -- pantalla rota, sol de frente, el
--  senor que no trae el telefono -- el voluntario busca por nombre o
--  por el codigo corto. Es el plan B que exige CLAUDE.md, y la razon
--  de que el codigo corto exista.

--  Busca citas para el respaldo manual del escaneo.
--
--  Dos modos, a proposito distintos:
--
--  * Por NOMBRE o parte del codigo: solo las citas de HOY. No es un
--    buscador del padron; fuera del dia de entrega no devuelve nada.
--
--  * Con el codigo corto EXACTO (CB-4871): tambien sus citas cercanas de
--    otros dias, de una semana antes a dos semanas despues, para poder
--    autorizarlas si llego en otra fecha. Tener el codigo completo ya
--    identifica a la persona, asi que no abre el padron.
--
--  Nunca expone telefono, correo, direccion ni el token del QR.
--
--  Se borra antes de crearla porque la version anterior no devolvia la
--  fecha, y Postgres no deja cambiar las columnas de salida con
--  "create or replace".
drop function if exists buscar_para_escaneo(text);

create or replace function buscar_para_escaneo(p_texto text)
returns table (
  nombre       text,
  codigo_corto text,
  fecha        date,
  hora         time,
  estado       text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_texto text := trim(coalesce(p_texto, ''));
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if v_texto = '' then
    return;
  end if;

  return query
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and (
       (b.fecha = current_date
        and (p.codigo_corto ilike '%' || v_texto || '%'
             or p.nombre ilike '%' || v_texto || '%'))
       or
       (upper(p.codigo_corto) = upper(v_texto)
        and b.fecha between current_date - 7 and current_date + 14)
     )
   order by (b.fecha = current_date) desc,
            abs(b.fecha - current_date),
            p.nombre
   limit 20;
end;
$$;

revoke execute on function buscar_para_escaneo(text) from public;
grant  execute on function buscar_para_escaneo(text) to authenticated;


--  Registra la entrega usando el codigo corto en vez del QR.
--
--  NO reimplementa la logica: busca el token de la cita de hoy y llama
--  a registrar_entrega(), que es la que tiene el bloqueo de fila ya
--  probado con diez escaneos simultaneos. Duplicar esa logica seria
--  crear una segunda puerta sin candado.
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
     and upper(trim(p.codigo_corto)) = upper(trim(p_codigo))
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


-- ============================================================
--  19. AUTORIZAR UNA ENTREGA DE OTRA FECHA
-- ============================================================
--  A veces el administrador decide entregar a alguien cuya cita era de
--  otro dia: llego un dia antes, o se le paso la fecha. Se permite, pero
--  solo con el codigo personal de quien autoriza, y queda en la bitacora
--  quien lo autorizo.
--
--  Solo se salta la FECHA. Lo demas no se negocia: un codigo ya usado
--  sigue siendo YA_USADO y una cita cancelada sigue sin proceder.
--  1 QR = 1 caja.

--  Quien puede autorizar. Se da de alta desde el SQL Editor con
--  definir_autorizador(): un voluntario no puede darse de alta a si mismo.
--  El codigo se guarda cifrado con bcrypt, nunca en claro.
create table if not exists autorizadores (
  usuario_id     uuid primary key references auth.users(id) on delete cascade,
  codigo_hash    text not null,
  activo         boolean not null default true,
  actualizado_en timestamptz not null default now()
);

alter table autorizadores enable row level security;

--  Intentos de autorizacion, para frenar a quien quiera adivinar un codigo.
create table if not exists intentos_autorizacion (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  exitoso    boolean not null,
  creado_en  timestamptz not null default now()
);

alter table intentos_autorizacion enable row level security;

create index if not exists idx_intentos_autorizacion
  on intentos_autorizacion (usuario_id, creado_en);

--  Quien autorizo cada entrega fuera de fecha. Nulo en las entregas normales.
alter table escaneos add column if not exists autorizado_por uuid;


--  Da de alta (o cambia el codigo de) una persona que puede autorizar.
--
--  Uso, en el SQL Editor:
--    select definir_autorizador('pastor@correo.com', 'su-codigo-personal');
--
--  Para quitarle el permiso:
--    update autorizadores set activo = false
--     where usuario_id = (select id from auth.users where email = 'pastor@correo.com');
create or replace function definir_autorizador(p_correo text, p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_usuario uuid;
begin
  if length(coalesce(p_codigo, '')) < 6 then
    raise exception 'CODIGO_MUY_CORTO: el codigo debe tener al menos 6 caracteres';
  end if;

  select id into v_usuario
    from auth.users
   where lower(email) = lower(trim(p_correo));

  if v_usuario is null then
    raise exception 'USUARIO_NO_EXISTE: primero crea la cuenta en Authentication';
  end if;

  -- El codigo es "la contrasena del admin" que el voluntario pide para una
  -- entrega de otra fecha. Solo un administrador puede tenerlo.
  if not exists (select 1 from personal
                  where usuario_id = v_usuario and rol = 'admin' and activo) then
    raise exception 'NO_ES_ADMIN: primero corre definir_personal(correo, ''admin'')';
  end if;

  insert into autorizadores (usuario_id, codigo_hash, activo, actualizado_en)
  values (v_usuario, crypt(p_codigo, gen_salt('bf')), true, now())
  on conflict (usuario_id) do update
     set codigo_hash    = excluded.codigo_hash,
         activo         = true,
         actualizado_en = now();

  return 'AUTORIZADOR_LISTO';
end;
$$;

--  Solo desde el SQL Editor. No se otorga a nadie mas.
revoke execute on function definir_autorizador(text, text) from public, anon, authenticated;


--  Registra la entrega de una cita de otra fecha, con codigo de autorizacion.
create or replace function registrar_entrega_autorizada(p_token text, p_codigo text)
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
  v_usuario     uuid := auth.uid();
  v_rol         text;
  v_autorizador uuid;
  v_fallidos    int;
  v_cita        citas;
  v_persona     personas;
  v_bloque      bloques;
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  v_rol := exigir_rol(array['admin', 'voluntario']);

  if v_rol = 'admin' then
    -- El administrador autoriza con su propia sesion: no necesita codigo.
    -- Queda registrado a su nombre igual.
    v_autorizador := v_usuario;
  else
    -- Freno contra adivinar: 5 intentos fallidos en 15 minutos dejan a
    -- esa cuenta sin poder intentar durante otros 15.
    select count(*) into v_fallidos
      from intentos_autorizacion
     where usuario_id = v_usuario
       and not exitoso
       and creado_en > now() - interval '15 minutes';

    if v_fallidos >= 5 then
      return query select 'BLOQUEADO'::text, null::text, null::text, null::time;
      return;
    end if;

    -- El codigo tiene que ser de un administrador activo.
    select a.usuario_id into v_autorizador
      from autorizadores a
      join personal pe on pe.usuario_id = a.usuario_id
                      and pe.rol = 'admin'
                      and pe.activo
     where a.activo
       and a.codigo_hash = crypt(coalesce(p_codigo, ''), a.codigo_hash)
     limit 1;

    if v_autorizador is null then
      -- Se registra y se RESPONDE (no se lanza error): un error desharia
      -- el registro del intento fallido y el freno nunca se activaria.
      insert into intentos_autorizacion (usuario_id, exitoso) values (v_usuario, false);
      return query select 'CODIGO_INVALIDO'::text, null::text, null::text, null::time;
      return;
    end if;

    insert into intentos_autorizacion (usuario_id, exitoso) values (v_usuario, true);
  end if;

  -- Mismo candado de fila que registrar_entrega(): dos escaneos
  -- simultaneos del mismo codigo no pueden entregar dos cajas.
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

  update citas
     set estado   = 'entregada',
         usado_en = now()
   where id = v_cita.id;

  insert into escaneos (cita_id, usuario_id, resultado, autorizado_por)
  values (v_cita.id, v_usuario, 'VALIDO_AUTORIZADO', v_autorizador);

  return query select 'VALIDO_AUTORIZADO'::text, v_persona.nombre,
                      v_persona.codigo_corto, v_bloque.hora;
end;
$$;

revoke execute on function registrar_entrega_autorizada(text, text) from public;
grant  execute on function registrar_entrega_autorizada(text, text) to authenticated;


--  Autoriza la entrega de otra fecha usando el codigo corto en vez del QR.
--
--  NO reimplementa nada: busca el token de esa cita y llama a
--  registrar_entrega_autorizada(), que tiene el candado de fila, el freno
--  de intentos fallidos y el registro de quien autorizo.
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
   where upper(trim(p.codigo_corto)) = upper(trim(p_codigo))
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


-- ============================================================
--  20. ROLES DEL PERSONAL
-- ============================================================
--  Tres roles:
--    admin      -> el pastor. Ve todo el panel y las estadisticas,
--                  registra personas desde el panel sin limite por
--                  dispositivo, y autoriza entregas de otra fecha sin codigo.
--    voluntario -> solo escanea. Entrega las citas del dia; para una de
--                  otra fecha necesita el codigo de autorizacion de un admin.
--    usuario    -> el publico. En la V1 no tiene cuenta y no aparece aqui.
--
--  Una cuenta de Authentication que no este en esta tabla no puede hacer
--  nada en el panel. Los permisos se revisan DENTRO de cada funcion: una
--  pantalla escondida se esquiva escribiendo la direccion, una funcion no.
--
--  Varias funciones de secciones anteriores (8, 17, 18 y 19) llaman a
--  exigir_rol(). PL/pgSQL resuelve esas llamadas al ejecutarse, no al
--  crearse, por eso pueden estar definidas antes que esta seccion.

create table if not exists personal (
  usuario_id     uuid primary key references auth.users(id) on delete cascade,
  rol            text not null check (rol in ('admin', 'voluntario')),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table personal enable row level security;


--  Revisa que quien llama tenga uno de los roles pedidos. Devuelve su rol.
--  El codigo de error 42501 es "permiso denegado": la aplicacion ya sabe
--  mostrarlo como tal.
create or replace function exigir_rol(p_roles text[])
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol text;
begin
  if auth.uid() is null then
    raise exception 'SIN_SESION' using errcode = '42501';
  end if;

  select rol into v_rol
    from personal
   where usuario_id = auth.uid()
     and activo;

  if v_rol is null or not (v_rol = any (p_roles)) then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;

  return v_rol;
end;
$$;

revoke execute on function exigir_rol(text[]) from public, anon, authenticated;


--  El rol de la cuenta con sesion, para que la aplicacion sepa que
--  pantallas mostrar. Devuelve null si la cuenta no es del personal.
create or replace function mi_rol()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rol from personal where usuario_id = auth.uid() and activo;
$$;

revoke execute on function mi_rol() from public;
grant  execute on function mi_rol() to authenticated;


--  Da de alta o cambia el rol de una cuenta del personal.
--
--  Uso, en el SQL Editor (la cuenta debe existir en Authentication):
--    select definir_personal('pastor@correo.com', 'admin');
--    select definir_personal('voluntario@correo.com', 'voluntario');
--
--  Para quitarle el acceso:
--    update personal set activo = false
--     where usuario_id = (select id from auth.users where email = 'voluntario@correo.com');
create or replace function definir_personal(p_correo text, p_rol text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_usuario uuid;
begin
  if p_rol not in ('admin', 'voluntario') then
    raise exception 'ROL_INVALIDO: usa admin o voluntario';
  end if;

  select id into v_usuario
    from auth.users
   where lower(email) = lower(trim(p_correo));

  if v_usuario is null then
    raise exception 'USUARIO_NO_EXISTE: primero crea la cuenta en Authentication';
  end if;

  insert into personal (usuario_id, rol, activo)
  values (v_usuario, p_rol, true)
  on conflict (usuario_id) do update
     set rol            = excluded.rol,
         activo         = true,
         actualizado_en = now();

  return 'PERSONAL_LISTO: ' || p_rol;
end;
$$;

--  Solo desde el SQL Editor.
revoke execute on function definir_personal(text, text) from public, anon, authenticated;


--  Quien del personal hizo cada registro desde el panel. Nulo en los
--  registros que las familias hacen por su cuenta.
alter table citas add column if not exists registrado_por uuid;


--  Registro desde el panel, para quien no puede registrarse por su cuenta.
--
--  Solo admin. A diferencia del formulario publico:
--    * no aplica el limite por dispositivo: la computadora de la oficina
--      registra a muchas personas;
--    * el correo es opcional: muchos adultos mayores no tienen.
--  El corte de cupo y la regla de una cita por semana siguen igual, porque
--  la cita la aparta reservar_cita().
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


-- ============================================================
--  21. DIAS DE ENTREGA: APERTURA Y ACCESO ANTICIPADO
-- ============================================================
--  Cada fecha de entrega se abre al publico a la hora que decide el
--  administrador. Antes de esa hora nadie puede reservar, salvo quien tenga
--  el codigo de suscriptor de Facebook de esa fecha, y solo desde
--  abre_anticipado_en. Si abre_anticipado_en es nulo, no hay acceso
--  anticipado para esa fecha.
--
--  La regla vive en registrar_y_reservar(), la unica puerta publica.
--  Esconder la fecha en el calendario no bastaria: es el mismo error del
--  Google Form, que avisaba "lleno" pero no bloqueaba.

--  Codigo aleatorio de 6 caracteres. Sin 0/O ni 1/I: el pastor lo publica
--  en Facebook y la gente lo teclea, y esas letras se confunden.
create or replace function generar_codigo_anticipado()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  v_letras constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text := '';
begin
  for i in 1..6 loop
    -- 32 letras: el residuo de un byte entre 32 no favorece a ninguna.
    v_codigo := v_codigo || substr(v_letras, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
  end loop;
  return v_codigo;
end;
$$;

revoke execute on function generar_codigo_anticipado() from public, anon, authenticated;


create table if not exists dias_entrega (
  fecha              date primary key,
  abre_en            timestamptz not null,
  abre_anticipado_en timestamptz,
  codigo_anticipado  text not null,
  cerrado            boolean not null default false,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  check (abre_anticipado_en is null or abre_anticipado_en <= abre_en)
);

alter table dias_entrega enable row level security;

--  Las fechas que ya tenian horarios quedan abiertas desde ya, para no
--  cerrar de golpe lo que esta en uso.
insert into dias_entrega (fecha, abre_en, codigo_anticipado)
select d.fecha, now(), generar_codigo_anticipado()
  from (select distinct fecha from bloques) d
on conflict (fecha) do nothing;

--  Todo horario pertenece a un dia de entrega.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bloques_fecha_dia_fk') then
    alter table bloques
      add constraint bloques_fecha_dia_fk
      foreign key (fecha) references dias_entrega (fecha) on delete cascade;
  end if;
end;
$$;

--  Para vigilar filtraciones del codigo: el panel cuenta cuantas citas
--  entraron con el antes de la apertura.
alter table citas add column if not exists con_codigo_anticipado boolean not null default false;

--  El publico escribe el codigo en /horarios/:fecha. Solo dice si sirve
--  ahora; nunca revela el codigo.
create or replace function validar_codigo_anticipado(p_fecha date, p_codigo text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
      from dias_entrega d
     where d.fecha = p_fecha
       and not d.cerrado
       and now() < d.abre_en
       and d.abre_anticipado_en is not null
       and now() >= d.abre_anticipado_en
       and upper(trim(coalesce(p_codigo, ''))) = d.codigo_anticipado
  );
$$;

revoke execute on function validar_codigo_anticipado(date, text) from public;
grant  execute on function validar_codigo_anticipado(date, text) to anon, authenticated;


--  ---------- Funciones del administrador ----------
--  Las fechas y horas se intercambian como hora LOCAL de San Diego
--  ("2026-09-11T12:00"), no con zona: asi no importa en que zona este la
--  computadora de quien las captura.

create or replace function listar_dias_entrega(p_desde date default null)
returns table (
  fecha              date,
  abre_en            timestamp,
  abre_anticipado_en timestamp,
  codigo_anticipado  text,
  cerrado            boolean,
  abierto            boolean,
  total_bloques      int,
  capacidad_total    int,
  ocupados           int,
  anticipadas        int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  return query
  select d.fecha,
         d.abre_en at time zone 'America/Los_Angeles',
         d.abre_anticipado_en at time zone 'America/Los_Angeles',
         d.codigo_anticipado,
         d.cerrado,
         now() >= d.abre_en,
         (select count(*)::int from bloques b where b.fecha = d.fecha),
         (select coalesce(sum(b.capacidad), 0)::int from bloques b where b.fecha = d.fecha),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and c.estado <> 'cancelada'),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and c.estado <> 'cancelada' and c.con_codigo_anticipado)
    from dias_entrega d
   where d.fecha >= coalesce(p_desde, current_date)
   order by d.fecha;
end;
$$;

revoke execute on function listar_dias_entrega(date) from public;
grant  execute on function listar_dias_entrega(date) to authenticated;


--  Crea el dia y sus horarios de 15 en 15 minutos. Devuelve el codigo.
create or replace function crear_dia_entrega(
  p_fecha              date,
  p_hora_inicio        time,
  p_hora_fin           time,
  p_capacidad          int,
  p_abre_en            timestamp,
  p_abre_anticipado_en timestamp default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_codigo text;
begin
  perform exigir_rol(array['admin']);

  if p_fecha is null or p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;
  if p_hora_inicio is null or p_hora_fin is null or p_hora_fin < p_hora_inicio then
    raise exception 'HORARIO_INVALIDO';
  end if;
  if p_capacidad is null or p_capacidad < 0 then
    raise exception 'CAPACIDAD_INVALIDA';
  end if;
  if p_abre_en is null then
    raise exception 'APERTURA_REQUERIDA';
  end if;
  if p_abre_anticipado_en is not null and p_abre_anticipado_en > p_abre_en then
    raise exception 'ANTICIPADO_DESPUES_DE_APERTURA';
  end if;
  if exists (select 1 from dias_entrega where fecha = p_fecha) then
    raise exception 'DIA_YA_EXISTE';
  end if;

  v_codigo := generar_codigo_anticipado();

  insert into dias_entrega (fecha, abre_en, abre_anticipado_en, codigo_anticipado)
  values (p_fecha,
          p_abre_en at time zone 'America/Los_Angeles',
          p_abre_anticipado_en at time zone 'America/Los_Angeles',
          v_codigo);

  insert into bloques (fecha, hora, capacidad)
  select p_fecha, t::time, p_capacidad
    from generate_series(p_fecha + p_hora_inicio, p_fecha + p_hora_fin, interval '15 minutes') t
  on conflict (fecha, hora) do nothing;

  return v_codigo;
end;
$$;

revoke execute on function crear_dia_entrega(date, time, time, int, timestamp, timestamp) from public;
grant  execute on function crear_dia_entrega(date, time, time, int, timestamp, timestamp) to authenticated;


create or replace function actualizar_dia_entrega(
  p_fecha              date,
  p_abre_en            timestamp,
  p_abre_anticipado_en timestamp,
  p_cerrado            boolean
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  if p_abre_en is null then
    raise exception 'APERTURA_REQUERIDA';
  end if;
  if p_abre_anticipado_en is not null and p_abre_anticipado_en > p_abre_en then
    raise exception 'ANTICIPADO_DESPUES_DE_APERTURA';
  end if;

  update dias_entrega
     set abre_en            = p_abre_en at time zone 'America/Los_Angeles',
         abre_anticipado_en = p_abre_anticipado_en at time zone 'America/Los_Angeles',
         cerrado            = coalesce(p_cerrado, cerrado),
         actualizado_en     = now()
   where fecha = p_fecha;

  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function actualizar_dia_entrega(date, timestamp, timestamp, boolean) from public;
grant  execute on function actualizar_dia_entrega(date, timestamp, timestamp, boolean) to authenticated;


--  Si el codigo se filtro, se genera otro. El anterior deja de servir.
create or replace function regenerar_codigo_anticipado(p_fecha date)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_codigo text := generar_codigo_anticipado();
begin
  perform exigir_rol(array['admin']);

  update dias_entrega
     set codigo_anticipado = v_codigo,
         actualizado_en    = now()
   where fecha = p_fecha;

  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  return v_codigo;
end;
$$;

revoke execute on function regenerar_codigo_anticipado(date) from public;
grant  execute on function regenerar_codigo_anticipado(date) to authenticated;


--  Solo si no hay citas. Con citas el dia se CIERRA, no se borra: borrarlo
--  perderia el historial de entregas.
create or replace function eliminar_dia_entrega(p_fecha date)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  if exists (select 1 from citas c
               join bloques b on b.id = c.bloque_id
              where b.fecha = p_fecha) then
    raise exception 'DIA_CON_CITAS';
  end if;

  delete from dias_entrega where fecha = p_fecha;

  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function eliminar_dia_entrega(date) from public;
grant  execute on function eliminar_dia_entrega(date) to authenticated;


--  Cambiar cupo o cerrar un horario. Bajar el cupo por debajo de lo ya
--  reservado es valido (el camion llego tarde): las citas existentes se
--  respetan y ya no entran nuevas.
create or replace function actualizar_bloque(p_bloque_id uuid, p_capacidad int, p_cerrado boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  if p_capacidad is not null and p_capacidad < 0 then
    raise exception 'CAPACIDAD_INVALIDA';
  end if;

  update bloques
     set capacidad = coalesce(p_capacidad, capacidad),
         cerrado   = coalesce(p_cerrado, cerrado)
   where id = p_bloque_id;

  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function actualizar_bloque(uuid, int, boolean) from public;
grant  execute on function actualizar_bloque(uuid, int, boolean) to authenticated;


create or replace function agregar_bloque(p_fecha date, p_hora time, p_capacidad int)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  perform exigir_rol(array['admin']);

  if not exists (select 1 from dias_entrega where fecha = p_fecha) then
    raise exception 'DIA_NO_EXISTE';
  end if;
  if p_hora is null then
    raise exception 'HORARIO_INVALIDO';
  end if;
  if p_capacidad is null or p_capacidad < 0 then
    raise exception 'CAPACIDAD_INVALIDA';
  end if;

  insert into bloques (fecha, hora, capacidad)
  values (p_fecha, p_hora, p_capacidad)
  on conflict (fecha, hora) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'BLOQUE_YA_EXISTE';
  end if;

  return v_id;
end;
$$;

revoke execute on function agregar_bloque(date, time, int) from public;
grant  execute on function agregar_bloque(date, time, int) to authenticated;


create or replace function eliminar_bloque(p_bloque_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  if exists (select 1 from citas where bloque_id = p_bloque_id) then
    raise exception 'BLOQUE_CON_CITAS';
  end if;

  delete from bloques where id = p_bloque_id;

  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function eliminar_bloque(uuid) from public;
grant  execute on function eliminar_bloque(uuid) to authenticated;


-- ============================================================
--  PRUEBA OBLIGATORIA ANTES DE SEGUIR
-- ============================================================
--  Antes de programar una sola pantalla, comprobar que estas dos
--  funciones aguantan concurrencia real:
--
--   1. Crear un bloque con capacidad 2.
--   2. Lanzar 50 llamadas simultáneas a reservar_cita() sobre él.
--      Deben quedar exactamente 2 citas. Ni una más.
--
--   3. Tomar un token válido.
--   4. Lanzar 10 llamadas simultáneas a registrar_entrega() con
--      ese mismo token. Debe devolver VALIDO una sola vez y
--      YA_USADO las otras nueve.
--
--  Si esto pasa, el sistema ya vale más que el formulario actual.
--  Si no pasa, ninguna pantalla bonita lo va a salvar.
-- ============================================================
