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
--  que se dejó pasar sin cita. Solo se guarda el nombre (sin
--  teléfono) y un código de comprobante (sección 22), quién lo anotó y a qué hora para
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

    insert into entregas_pase (pase_id, fecha, usuario_id)
    values (v_pase_id, current_date, v_usuario);

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
   'Cuantas citas puede crear un mismo telefono POR FECHA DE ENTREGA. Con ' ||
   '1, el mismo telefono aparta el lunes y tambien el jueves, pero no dos ' ||
   'veces el mismo dia. Es un tope, no un muro: una ventana privada o ' ||
   'borrar datos del navegador cuenta como dispositivo nuevo. Se sube ' ||
   'cuando llega una familia que comparte un solo telefono.')
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
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;


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

--  Los numeros del encabezado del panel.
--
--  Un dia que ya paso no tiene "faltan por llegar": quien tenia cita y nunca
--  se escaneo cuenta como "no asistio". No se guarda asi en la tabla (nada
--  corre a medianoche); se calcula al leer, y siempre sale al dia.
--
--  Se borra antes de crearla porque cambian sus columnas de salida, y
--  Postgres no deja cambiarlas con "create or replace".
drop function if exists resumen_del_dia(date);

create or replace function resumen_del_dia(p_fecha date default null)
returns table (
  fecha              date,
  con_cita           int,
  ya_recibieron      int,
  faltan_por_llegar  int,
  no_asistieron      int,
  canceladas         int,
  sin_cita           int,
  con_pase           int,
  intentos_repetidos int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_fecha  date    := coalesce(p_fecha, current_date);
  v_pasado boolean := coalesce(p_fecha, current_date) < current_date;
begin
  -- Las estadisticas son solo del administrador.
  perform exigir_rol(array['admin']);

  return query
  select
    v_fecha,
    x.n_con_cita,
    x.n_recibieron,
    case when v_pasado then 0 else x.n_sin_escanear end,
    x.n_no_asistio + case when v_pasado then x.n_sin_escanear else 0 end,
    x.n_canceladas,
    --  Las anotadas por error se anulan y ya no cuentan (seccion 22).
    (select count(*)::int from entradas_sin_cita s where s.fecha = v_fecha and s.anulada_en is null),
    --  Las cajas de los pases permanentes (seccion 29). No tienen
    --  cita: no apartan lugar, pero si cuentan como caja entregada.
    (select count(*)::int from entregas_pase e where e.fecha = v_fecha),
    --  Intentos repetidos: alguien trato de usar dos veces el mismo
    --  codigo. Es la senal de que el corte esta funcionando y de que
    --  hay quien lo esta intentando.
    (select count(*)::int from escaneos e
       join citas   c on c.id = e.cita_id
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and e.resultado = 'YA_USADO')
  from (
    select count(*) filter (where c.estado <> 'cancelada')::int             as n_con_cita,
           count(*) filter (where c.estado = 'entregada')::int             as n_recibieron,
           count(*) filter (where c.estado in ('reservada', 'llego'))::int as n_sin_escanear,
           count(*) filter (where c.estado = 'no_asistio')::int            as n_no_asistio,
           count(*) filter (where c.estado = 'cancelada')::int             as n_canceladas
      from citas c
      join bloques b on b.id = c.bloque_id
     where b.fecha = v_fecha
  ) x;
end;
$$;

revoke execute on function resumen_del_dia(date) from public;
grant  execute on function resumen_del_dia(date) to authenticated;


--  La lista de llegadas del mockup 8.
--
--  NO salen telefono, correo ni direccion: un voluntario en la entrada no los
--  necesita para dejar pasar a alguien, y parte de la comunidad tiene
--  estatus migratorio delicado.
--
--  Las canceladas tambien salen, con quien cancelo (su correo; nulo si fue la
--  propia persona desde su enlace), cuando y por que. En un dia que ya paso,
--  quien nunca se escaneo sale como "no_asistio".
--
--  Se borra antes de crearla porque cambian sus columnas de salida.
drop function if exists citas_del_dia(date);

create or replace function citas_del_dia(p_fecha date default null)
returns table (
  nombre             text,
  codigo_corto       text,
  ciudad             text,
  hora               time,
  estado             text,
  usado_en           timestamptz,
  cancelada_en       timestamptz,
  cancelada_por      text,
  motivo_cancelacion text
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
  select p.nombre,
         p.codigo_corto,
         p.ciudad,
         b.hora,
         case when c.estado in ('reservada', 'llego') and b.fecha < current_date
              then 'no_asistio'
              else c.estado
         end,
         c.usado_en,
         c.cancelada_en,
         u.email::text,
         c.motivo_cancelacion
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.cancelada_por
   where b.fecha = coalesce(p_fecha, current_date)
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
--  Uso, en el SQL Editor. Funciona aunque la persona todavia no haya
--  entrado: el rol queda pendiente y se aplica al entrar con Google (seccion 23).
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
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  if p_rol not in ('admin', 'voluntario') then
    raise exception 'ROL_INVALIDO: usa admin o voluntario';
  end if;

  if v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'CORREO_INVALIDO: revisa como esta escrito el correo';
  end if;

  select id into v_usuario
    from auth.users
   where lower(email) = v_correo;

  --  Todavia no tiene cuenta (va a entrar con Google por primera vez): el
  --  correo queda autorizado y el rol se aplica solo al entrar (seccion 23).
  if v_usuario is null then
    insert into personal_pendiente (correo, rol)
    values (v_correo, p_rol)
    on conflict (correo) do update
       set rol       = excluded.rol,
           creado_en = now();

    return 'PENDIENTE: ' || v_correo || ' sera ' || p_rol || ' en cuanto entre con Google';
  end if;

  insert into personal (usuario_id, rol, activo)
  values (v_usuario, p_rol, true)
  on conflict (usuario_id) do update
     set rol            = excluded.rol,
         activo         = true,
         actualizado_en = now();

  delete from personal_pendiente where correo = v_correo;

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

  --  Sin horario se da de alta a la persona y ya: es lo que hace falta
  --  para darle un pase permanente (seccion 29), que no aparta lugar.
  if p_bloque_id is not null then
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
    return query select v_persona.codigo_corto, null::text, null::date, null::time;
    return;
  end if;

  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) from public;
grant  execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean) to authenticated;


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
--  22. CANCELAR, ENTRO SIN CITA Y EXCEPCION SEMANAL
-- ============================================================
--  Tres reglas del Pastor David que completan la V1:
--    * Cancelar una cita libera el lugar al momento y deja reagendar esa
--      semana. La persona cancela desde su enlace; el admin, desde el panel.
--    * "Entro sin cita" anota a quien paso sin cita: solo su nombre, un codigo
--      de comprobante, quien lo anoto y a que hora. Un error se anula, no se borra.
--    * Una segunda cita en la misma semana solo con autorizacion del admin,
--      guardando el motivo y quien la autorizo.

--  Quien cancelo, cuando y por que. cancelada_por nulo: la propia persona.
alter table citas add column if not exists cancelada_en       timestamptz;
alter table citas add column if not exists cancelada_por      uuid;
alter table citas add column if not exists motivo_cancelacion text;

--  Una cita autorizada como excepcion apunta a su autorizacion.
alter table citas add column if not exists excepcion_id uuid references excepciones(id);

--  La regla de una cita por semana (seccion 3) deja fuera las citas de
--  excepcion. Esas tienen su propio indice: UNA excepcion activa por persona
--  por semana. En total, como maximo dos citas esa semana, y la segunda
--  siempre autorizada.
drop index if exists una_cita_activa_por_semana;
create unique index una_cita_activa_por_semana
  on citas (persona_id, semana)
  where estado in ('reservada','llego','entregada') and excepcion_id is null;

create unique index if not exists una_excepcion_activa_por_semana
  on citas (persona_id, semana)
  where estado in ('reservada','llego','entregada') and excepcion_id is not null;


--  La persona cancela su propia cita desde /confirmacion/:token.
--
--  Tener el token es ser dueno de la cita: son 24 bytes al azar que solo
--  estan en su QR y en su enlace. El candado de fila es el mismo que usa el
--  escaneo: cancelar y escanear al mismo tiempo no pueden pasar los dos.
create or replace function cancelar_mi_cita(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita  citas;
  v_fecha date;
begin
  select * into v_cita from citas c where c.token_qr = p_token for update;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado = 'cancelada' then
    raise exception 'CITA_YA_CANCELADA';
  end if;

  if v_cita.estado in ('entregada', 'llego') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  select b.fecha into v_fecha from bloques b where b.id = v_cita.bloque_id;
  if v_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  update citas
     set estado        = 'cancelada',
         cancelada_en  = now(),
         cancelada_por = null
   where id = v_cita.id;

  return 'CANCELADA';
end;
$$;

revoke execute on function cancelar_mi_cita(text) from public;
grant  execute on function cancelar_mi_cita(text) to anon, authenticated;


--  El administrador cancela una cita desde Citas de hoy.
--
--  Se identifica con el codigo de la persona, la fecha y la hora, que es lo
--  que muestra la lista. Asi el token del QR no tiene que viajar al panel.
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
  perform exigir_rol(array['admin']);

  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
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


--  "Entro sin cita" guarda el nombre (sin telefono) y un codigo de
--  comprobante que se le da a la persona, por si hay que aclarar un error
--  despues. No se borra: se anula, y queda quien lo anulo y cuando.
alter table entradas_sin_cita add column if not exists nombre      text;
alter table entradas_sin_cita add column if not exists codigo      text;
alter table entradas_sin_cita add column if not exists anulada_en  timestamptz;
alter table entradas_sin_cita add column if not exists anulada_por uuid;

--  El codigo SC-1234 no se repite en un mismo dia.
create unique index if not exists entradas_sin_cita_codigo_por_dia
  on entradas_sin_cita (fecha, codigo)
  where codigo is not null;


--  "Entro sin cita": anota a una persona que paso sin cita. Devuelve su
--  codigo de comprobante y cuantas van hoy.
--
--  Solo admin: CLAUDE.md pide que nunca este al alcance del publico ni de los
--  voluntarios. Solo el nombre, sin telefono.
create or replace function registrar_entrada_sin_cita(p_nombre text)
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
begin
  perform exigir_rol(array['admin']);

  if v_nombre = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if v_nombre ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  --  Se reintenta si dos anotaciones del mismo dia sacan el mismo numero.
  loop
    v_codigo := 'SC-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into entradas_sin_cita (fecha, nombre, codigo, registrado_por)
      values (current_date, v_nombre, v_codigo, v_usuario);
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
             where s.fecha = current_date and s.anulada_en is null);
end;
$$;

revoke execute on function registrar_entrada_sin_cita(text) from public;
grant  execute on function registrar_entrada_sin_cita(text) to authenticated;


--  Anula una entrada sin cita anotada por error. No la borra: deja de contar
--  y queda quien la anulo y cuando. Devuelve cuantas cuentan ese dia.
create or replace function anular_entrada_sin_cita(p_codigo text, p_fecha date default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_fecha   date := coalesce(p_fecha, current_date);
  v_id      uuid;
  v_anulada timestamptz;
begin
  perform exigir_rol(array['admin']);

  select s.id, s.anulada_en into v_id, v_anulada
    from entradas_sin_cita s
   where s.fecha = v_fecha
     and upper(s.codigo) = upper(trim(coalesce(p_codigo, '')))
     for update;

  if v_id is null then
    raise exception 'ENTRADA_NO_EXISTE';
  end if;

  if v_anulada is not null then
    raise exception 'ENTRADA_YA_ANULADA';
  end if;

  update entradas_sin_cita
     set anulada_en  = now(),
         anulada_por = v_usuario
   where id = v_id;

  return (select count(*)::int from entradas_sin_cita s
           where s.fecha = v_fecha and s.anulada_en is null);
end;
$$;

revoke execute on function anular_entrada_sin_cita(text, date) from public;
grant  execute on function anular_entrada_sin_cita(text, date) to authenticated;


--  La lista del dia: quien paso sin cita, quien lo anoto y a que hora.
--  De quien anoto se muestra su correo, que es como el pastor reconoce
--  a su equipo. Solo admin.
create or replace function entradas_sin_cita_del_dia(p_fecha date default null)
returns table (
  codigo        text,
  nombre        text,
  registrado_en timestamptz,
  anotado_por   text,
  anulada       boolean,
  anulada_en    timestamptz,
  anulada_por   text
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
  select s.codigo,
         s.nombre,
         s.registrado_en,
         u.email::text,
         s.anulada_en is not null,
         s.anulada_en,
         ua.email::text
    from entradas_sin_cita s
    left join auth.users u  on u.id  = s.registrado_por
    left join auth.users ua on ua.id = s.anulada_por
   where s.fecha = coalesce(p_fecha, current_date)
   order by s.registrado_en desc;
end;
$$;

revoke execute on function entradas_sin_cita_del_dia(date) from public;
grant  execute on function entradas_sin_cita_del_dia(date) to authenticated;


--  Segunda cita en la misma semana, autorizada por el administrador.
--
--  Para una persona que YA tiene su cita de la semana (se busca por su
--  codigo CB). Guarda el motivo y quien la autorizo en "excepciones".
--
--  No llama a reservar_cita(): esa rechaza, a proposito, una segunda cita
--  en la semana. Repite su candado de fila sobre el bloque ("for update")
--  para que el cupo no se pueda pasar ni con dos excepciones al mismo
--  tiempo. NO usar el patron de "consulto y despues inserto" sin el candado.
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
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')));
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


-- ============================================================
--  23. PERSONAL QUE ENTRA CON GOOGLE
-- ============================================================
--  El personal puede entrar al panel con su cuenta de Google (el publico
--  sigue sin cuenta en la V1). Google solo confirma quien es; el permiso lo
--  sigue dando la tabla personal.
--
--  Con Google, la cuenta no existe hasta la primera vez que la persona
--  entra. Para no obligar al pastor a entrar, ver "sin acceso" y esperar a
--  que alguien corra definir_personal(), su correo se autoriza ANTES: queda
--  aqui pendiente y el rol se aplica solo en cuanto entra.

create table if not exists personal_pendiente (
  correo    text primary key,
  rol       text not null check (rol in ('admin', 'voluntario')),
  creado_en timestamptz not null default now()
);

alter table personal_pendiente enable row level security;


--  Al crearse una cuenta, si su correo estaba autorizado, se le da su rol.
--
--  SOLO si la cuenta se creo entrando con Google, que ya comprobo que el
--  correo es de esa persona. Una cuenta de correo y contrasena con el mismo
--  correo NO recibe el rol: si en Supabase estuviera apagada la confirmacion
--  de correo, cualquiera podria registrarse con el correo del pastor y
--  quedarse con el panel. Esas cuentas se asignan a mano con definir_personal.
create or replace function aplicar_personal_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_rol text;
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google'
     or new.email_confirmed_at is null
     or new.email is null then
    return new;
  end if;

  select p.rol into v_rol
    from personal_pendiente p
   where p.correo = lower(new.email);

  if v_rol is not null then
    insert into personal (usuario_id, rol, activo)
    values (new.id, v_rol, true)
    on conflict (usuario_id) do update
       set rol            = excluded.rol,
           activo         = true,
           actualizado_en = now();

    delete from personal_pendiente where correo = lower(new.email);
  end if;

  return new;

exception
  --  Un problema aqui nunca debe impedir que alguien entre: a lo mucho se
  --  queda sin rol y se le asigna a mano.
  when others then
    return new;
end;
$$;

revoke execute on function aplicar_personal_pendiente() from public, anon, authenticated;

drop trigger if exists al_crear_cuenta_aplicar_personal on auth.users;
create trigger al_crear_cuenta_aplicar_personal
  after insert on auth.users
  for each row execute function aplicar_personal_pendiente();


-- ============================================================
--  24. ADMINISTRAR AL EQUIPO DESDE EL PANEL
-- ============================================================
--  El pastor da y quita accesos desde el panel, sin entrar a Supabase.
--
--  Por dentro usa definir_personal() y definir_autorizador(), que siguen
--  funcionando en el SQL Editor para recuperar el acceso si algo sale mal.
--  Estas versiones del panel agregan un freno que el SQL Editor no tiene:
--  nadie se quita a si mismo el rol de admin, asi el panel nunca se queda
--  sin quien lo administre.

--  El equipo: quienes tienen cuenta con rol y los correos autorizados que
--  todavia no han entrado. Solo admin.
create or replace function listar_personal()
returns table (
  correo        text,
  rol           text,
  estado        text,
  ultimo_acceso timestamptz,
  es_yo         boolean,
  tiene_codigo  boolean
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
  select u.email::text,
         pe.rol,
         case when pe.activo then 'activo' else 'sin_acceso' end,
         u.last_sign_in_at,
         pe.usuario_id = auth.uid(),
         exists (select 1 from autorizadores a where a.usuario_id = pe.usuario_id and a.activo)
    from personal pe
    join auth.users u on u.id = pe.usuario_id
  union all
  select pp.correo,
         pp.rol,
         'pendiente',
         null::timestamptz,
         false,
         false
    from personal_pendiente pp
   order by 3, 2, 1;
end;
$$;

revoke execute on function listar_personal() from public;
grant  execute on function listar_personal() to authenticated;


--  Da acceso o cambia el rol. Si la persona no ha entrado nunca, queda
--  pendiente hasta que entre con Google (seccion 23).
create or replace function guardar_personal(p_correo text, p_rol text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  perform exigir_rol(array['admin']);

  select u.id into v_usuario from auth.users u where lower(u.email) = v_correo;

  if v_usuario = auth.uid() and p_rol is distinct from 'admin' then
    raise exception 'NO_PUEDES_QUITARTE_ADMIN';
  end if;

  --  definir_personal revisa el rol y el correo, y hace el trabajo.
  return definir_personal(v_correo, p_rol);
end;
$$;

revoke execute on function guardar_personal(text, text) from public;
grant  execute on function guardar_personal(text, text) to authenticated;


--  Quita el acceso. A una cuenta la desactiva (no la borra: queda el
--  historial de quien anoto y escaneo); a un correo pendiente le quita la
--  autorizacion. Tambien apaga su codigo de autorizacion.
create or replace function quitar_acceso_personal(p_correo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  perform exigir_rol(array['admin']);

  delete from personal_pendiente where correo = v_correo;
  if found then
    return 'AUTORIZACION_QUITADA';
  end if;

  select u.id into v_usuario from auth.users u where lower(u.email) = v_correo;

  if v_usuario is null
     or not exists (select 1 from personal pe where pe.usuario_id = v_usuario and pe.activo) then
    raise exception 'PERSONAL_NO_EXISTE';
  end if;

  if v_usuario = auth.uid() then
    raise exception 'NO_PUEDES_QUITARTE_ADMIN';
  end if;

  update personal
     set activo = false, actualizado_en = now()
   where usuario_id = v_usuario;

  update autorizadores
     set activo = false, actualizado_en = now()
   where usuario_id = v_usuario;

  return 'ACCESO_QUITADO';
end;
$$;

revoke execute on function quitar_acceso_personal(text) from public;
grant  execute on function quitar_acceso_personal(text) to authenticated;


--  El admin pone o cambia SU PROPIO codigo de autorizacion: el que le pide
--  un voluntario para entregar una cita de otra fecha. Se guarda cifrado.
create or replace function definir_mi_codigo_autorizacion(p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo text;
begin
  perform exigir_rol(array['admin']);

  select u.email into v_correo from auth.users u where u.id = auth.uid();

  return definir_autorizador(v_correo, p_codigo);
end;
$$;

revoke execute on function definir_mi_codigo_autorizacion(text) from public;
grant  execute on function definir_mi_codigo_autorizacion(text) to authenticated;


-- ============================================================
--  25. REPORTES POR RANGO DE FECHAS
-- ============================================================
--  Un renglon por dia con entrega entre dos fechas: cupo, citas, cuantos
--  recibieron, no asistieron, cancelaron, entraron sin cita y el total de
--  cajas. Es lo que se reporta al banco de alimentos.
--
--  Cajas = citas escaneadas ESE dia + entradas sin cita no anuladas.
--  Las citas escaneadas cuentan el dia en que salio la caja (usado_en), no el
--  de la cita: una entrega autorizada de otra fecha suma el dia en que de
--  verdad se entrego. Asi el total cuadra con los escaneos (1 QR = 1 caja).
--
--  "No asistieron" y "por venir" si van por el dia de la cita: una cita de un
--  dia que ya paso y nunca se escaneo es "no asistio"; de hoy en adelante,
--  "por venir".
--
--  Maximo 366 dias por consulta. Solo admin.
create or replace function reporte_por_dias(p_desde date, p_hasta date)
returns table (
  fecha              date,
  capacidad          int,
  con_cita           int,
  recibieron         int,
  no_asistieron      int,
  pendientes         int,
  canceladas         int,
  con_excepcion      int,
  sin_cita           int,
  con_pase           int,
  cajas              int,
  intentos_repetidos int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'RANGO_MUY_LARGO';
  end if;

  --  Con la zona de San Diego puesta, usado_en::date es la fecha de San Diego.
  return query
  with dias as (
    select b.fecha as dia from bloques b where b.fecha between p_desde and p_hasta
    union
    select s.fecha from entradas_sin_cita s where s.fecha between p_desde and p_hasta
    union
    select c.usado_en::date from citas c
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
    union
    select e.fecha from entregas_pase e where e.fecha between p_desde and p_hasta
  ),
  cupos as (
    select b.fecha as dia, sum(b.capacidad)::int as n
      from bloques b
     where b.fecha between p_desde and p_hasta
     group by b.fecha
  ),
  agenda as (
    select b.fecha as dia,
           count(*) filter (where c.estado <> 'cancelada')::int as n_con_cita,
           count(*) filter (where c.estado = 'no_asistio'
                              or (c.estado in ('reservada', 'llego') and b.fecha < current_date))::int as n_no_asistieron,
           count(*) filter (where c.estado in ('reservada', 'llego') and b.fecha >= current_date)::int as n_pendientes,
           count(*) filter (where c.estado = 'cancelada')::int as n_canceladas,
           count(*) filter (where c.estado <> 'cancelada' and c.excepcion_id is not null)::int as n_excepcion
      from citas c
      join bloques b on b.id = c.bloque_id
     where b.fecha between p_desde and p_hasta
     group by b.fecha
  ),
  entregas as (
    select c.usado_en::date as dia, count(*)::int as n
      from citas c
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
     group by c.usado_en::date
  ),
  sin_cita_dia as (
    select s.fecha as dia, count(*)::int as n
      from entradas_sin_cita s
     where s.fecha between p_desde and p_hasta and s.anulada_en is null
     group by s.fecha
  ),
  pases_dia as (
    select e.fecha as dia, count(*)::int as n
      from entregas_pase e
     where e.fecha between p_desde and p_hasta
     group by e.fecha
  ),
  repetidos as (
    select e.escaneado_en::date as dia, count(*)::int as n
      from escaneos e
     where e.resultado = 'YA_USADO' and e.escaneado_en::date between p_desde and p_hasta
     group by e.escaneado_en::date
  )
  select d.dia,
         coalesce(cu.n, 0),
         coalesce(ag.n_con_cita, 0),
         coalesce(en.n, 0),
         coalesce(ag.n_no_asistieron, 0),
         coalesce(ag.n_pendientes, 0),
         coalesce(ag.n_canceladas, 0),
         coalesce(ag.n_excepcion, 0),
         coalesce(sc.n, 0),
         coalesce(pa.n, 0),
         --  Cajas del dia: las de cita, las de "entro sin cita" y las de
         --  los pases permanentes. Es el numero que se le reporta al
         --  banco de alimentos.
         coalesce(en.n, 0) + coalesce(sc.n, 0) + coalesce(pa.n, 0),
         coalesce(re.n, 0)
    from dias d
    left join cupos        cu on cu.dia = d.dia
    left join agenda       ag on ag.dia = d.dia
    left join entregas     en on en.dia = d.dia
    left join sin_cita_dia sc on sc.dia = d.dia
    left join pases_dia    pa on pa.dia = d.dia
    left join repetidos    re on re.dia = d.dia
   order by d.dia;
end;
$$;

revoke execute on function reporte_por_dias(date, date) from public;
grant  execute on function reporte_por_dias(date, date) to authenticated;


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


-- ============================================================
--  27. CAMBIAR EL HORARIO DE UNA CITA
-- ============================================================
--  Decision del Pastor David (21 sep 2026): quien ya tiene cita puede
--  cambiarse de horario sin perder su codigo CB ni su QR.
--
--  Antes, la unica salida era cancelar y volver a registrarse: la persona
--  quedaba duplicada en el padron, con otro codigo, y el QR que ya habia
--  guardado dejaba de servir.
--
--  La persona lo hace una sola vez desde su enlace de confirmacion. El
--  panel no tiene ese limite, para cuando le hablan por telefono. Cada
--  movimiento queda en movimientos_cita: de que horario a cual, quien y
--  cuando.

-- ------------------------------------------------------------
--  Historial
-- ------------------------------------------------------------
--  Una fila por cambio. Nunca se borra: es lo que contesta "esta
--  persona cambio su horario" cuando llega a la hora equivocada.
create table if not exists movimientos_cita (
  id           uuid primary key default gen_random_uuid(),
  cita_id      uuid not null references citas(id)   on delete restrict,
  de_bloque_id uuid not null references bloques(id) on delete restrict,
  a_bloque_id  uuid not null references bloques(id) on delete restrict,

  --  'publico' = lo hizo la persona con su enlace. 'panel' = alguien del
  --  equipo. Solo los de 'publico' gastan el cambio que le toca.
  origen       text not null check (origen in ('publico', 'panel')),
  usuario_id   uuid,
  creado_en    timestamptz not null default now()
);

create index if not exists idx_movimientos_cita on movimientos_cita (cita_id, creado_en);

--  Como todo lo demas: sin politicas, solo se llega por estas funciones.
alter table movimientos_cita enable row level security;

--  Cuantas veces puede cambiar la persona por su cuenta. Se sube desde
--  configuracion si un dia se decide ser mas flexible, sin tocar codigo.
insert into configuracion (clave, valor, nota)
values ('cambios_de_horario_permitidos', '1',
        'Cuantas veces puede una persona cambiar su horario desde su ' ||
        'enlace de confirmacion. El panel no tiene este limite.')
on conflict (clave) do nothing;


-- ------------------------------------------------------------
--  El movimiento
-- ------------------------------------------------------------
--  El candado va en el mismo orden que reservar_cita: primero la cita,
--  luego el bloque de destino. El conteo de ocupados se hace con el
--  bloque ya bloqueado, que es lo que impide el sobrecupo cuando dos
--  personas se mueven al mismo horario al mismo tiempo.
--
--  Si el horario nuevo se lleno justo antes, se levanta BLOQUE_LLENO y
--  la transaccion se deshace entera: la persona se queda con su cita
--  original. Nunca se queda sin nada.
create or replace function mover_cita(
  p_cita_id   uuid,
  p_bloque_id uuid,
  p_origen    text
)
returns citas
language plpgsql
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita     citas;
  v_actual   bloques;
  v_nuevo    bloques;
  v_abre_en  timestamptz;
  v_cerrado  boolean;
  v_ocupados int;
begin
  select * into v_cita from citas where id = p_cita_id for update;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado = 'cancelada' then
    raise exception 'CITA_YA_CANCELADA';
  end if;

  --  Ya la escanearon: no hay nada que mover.
  if v_cita.estado in ('llego', 'entregada') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  select * into v_actual from bloques where id = v_cita.bloque_id;
  if v_actual.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if v_cita.bloque_id = p_bloque_id then
    raise exception 'MISMO_HORARIO';
  end if;

  --  Las demas peticiones sobre el bloque de destino esperan aqui.
  select * into v_nuevo from bloques where id = p_bloque_id for update;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  if v_nuevo.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_nuevo.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  --  El dia de destino tiene que estar abierto, igual que para
  --  registrarse. Si no, mover la cita seria la puerta de atras para
  --  apartar lugar en un dia que todavia no abre.
  select d.abre_en, d.cerrado into v_abre_en, v_cerrado
    from dias_entrega d
   where d.fecha = v_nuevo.fecha;

  if not found or v_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if now() < v_abre_en then
    raise exception 'AUN_NO_ABRE';
  end if;

  --  La propia cita no cuenta: se esta moviendo, no agregando.
  select count(*) into v_ocupados
    from citas c
   where c.bloque_id = p_bloque_id
     and c.estado <> 'cancelada'
     and c.id <> v_cita.id;

  if v_ocupados >= v_nuevo.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  update citas
     set bloque_id = p_bloque_id,
         semana    = date_trunc('week', v_nuevo.fecha)::date
   where id = v_cita.id
  returning * into v_cita;

  insert into movimientos_cita (cita_id, de_bloque_id, a_bloque_id, origen, usuario_id)
  values (v_cita.id, v_actual.id, v_nuevo.id, p_origen, auth.uid());

  return v_cita;

exception
  --  Lo levanta el indice unico parcial: ya tiene otra cita activa en la
  --  semana a la que se quiere mover.
  when unique_violation then
    raise exception 'YA_TIENE_CITA_ESTA_SEMANA';
end;
$$;

--  Solo se llama desde las dos funciones de abajo, que son las que
--  revisan de quien es la cita y cuantos cambios lleva.
revoke execute on function mover_cita(uuid, uuid, text) from public, anon, authenticated;


-- ------------------------------------------------------------
--  La persona, desde su enlace de confirmacion
-- ------------------------------------------------------------
--  Tener el token es ser dueno de la cita, igual que en cancelar_mi_cita.
create or replace function mover_mi_cita(p_token text, p_bloque_id uuid)
returns table (
  fecha              date,
  hora               time,
  codigo_corto       text,
  cambios_restantes  int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita   citas;
  v_limite int;
  v_hechos int;
begin
  select * into v_cita from citas c where c.token_qr = p_token;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  select valor::int into v_limite
    from configuracion
   where clave = 'cambios_de_horario_permitidos';

  v_limite := coalesce(v_limite, 1);

  select count(*) into v_hechos
    from movimientos_cita m
   where m.cita_id = v_cita.id
     and m.origen = 'publico';

  --  Los movimientos que hizo el equipo no le gastan el suyo.
  if v_hechos >= v_limite then
    raise exception 'YA_CAMBIO_HORARIO';
  end if;

  v_cita := mover_cita(v_cita.id, p_bloque_id, 'publico');

  return query
    select b.fecha,
           b.hora,
           p.codigo_corto,
           greatest(v_limite - v_hechos - 1, 0)
      from bloques b
      join personas p on p.id = v_cita.persona_id
     where b.id = v_cita.bloque_id;
end;
$$;

revoke execute on function mover_mi_cita(text, uuid) from public;
grant  execute on function mover_mi_cita(text, uuid) to anon, authenticated;


--  Cuantos cambios le quedan, para avisarle antes de que elija.
create or replace function cambios_restantes(p_token text)
returns int
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cita_id uuid;
  v_limite  int;
  v_hechos  int;
begin
  select c.id into v_cita_id from citas c where c.token_qr = p_token;
  if not found then
    return 0;
  end if;

  select valor::int into v_limite
    from configuracion
   where clave = 'cambios_de_horario_permitidos';

  select count(*) into v_hechos
    from movimientos_cita m
   where m.cita_id = v_cita_id
     and m.origen = 'publico';

  return greatest(coalesce(v_limite, 1) - v_hechos, 0);
end;
$$;

revoke execute on function cambios_restantes(text) from public;
grant  execute on function cambios_restantes(text) to anon, authenticated;


-- ------------------------------------------------------------
--  El equipo, desde el panel
-- ------------------------------------------------------------
--  Sin limite de cambios: es para cuando le hablan por telefono al
--  pastor. Queda guardado quien lo movio.
create or replace function mover_cita_panel(p_cita_id uuid, p_bloque_id uuid)
returns table (
  fecha        date,
  hora         time,
  codigo_corto text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita citas;
begin
  perform exigir_rol(array['admin']);

  v_cita := mover_cita(p_cita_id, p_bloque_id, 'panel');

  return query
    select b.fecha, b.hora, p.codigo_corto
      from bloques b
      join personas p on p.id = v_cita.persona_id
     where b.id = v_cita.bloque_id;
end;
$$;

revoke execute on function mover_cita_panel(uuid, uuid) from public;
grant  execute on function mover_cita_panel(uuid, uuid) to authenticated;


--  El historial de una cita, para mostrarlo en el panel.
create or replace function historial_de_cita(p_cita_id uuid)
returns table (
  de_fecha  date,
  de_hora   time,
  a_fecha   date,
  a_hora    time,
  origen    text,
  quien     text,
  cuando    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  return query
    select viejo.fecha,
           viejo.hora,
           nuevo.fecha,
           nuevo.hora,
           m.origen,
           u.email::text,
           m.creado_en
      from movimientos_cita m
      join bloques viejo on viejo.id = m.de_bloque_id
      join bloques nuevo on nuevo.id = m.a_bloque_id
      left join auth.users u on u.id = m.usuario_id
     where m.cita_id = p_cita_id
     order by m.creado_en;
end;
$$;

revoke execute on function historial_de_cita(uuid) from public;
grant  execute on function historial_de_cita(uuid) to authenticated;


-- ============================================================
--  28. LA FICHA COMPLETA DE UNA PERSONA
-- ============================================================
--  El boton "Ver" de la lista del dia. Las listas muestran lo minimo
--  para trabajar en la fila; cuando de verdad hace falta el domicilio
--  exacto, se abre la ficha y queda claro que es otra cosa.

--  Las listas del dia muestran solo la ciudad, a proposito: son para
--  trabajar en la fila. Cuando hace falta el domicilio exacto (aclarar
--  una entrega, corregir un dato) se abre esta ficha.
--
--  Solo admin. Un voluntario escanea, no lee el padron: es la misma
--  regla que ya aplican citas_del_dia() y los reportes.
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
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  perform exigir_rol(array['admin']);

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


--  Sus citas, de la mas reciente para atras. Se marca "no asistio" igual
--  que en la lista del dia: no se guarda asi, se calcula al leer.
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
  perform exigir_rol(array['admin']);

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
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
   order by b.fecha desc, b.hora desc
   limit 30;
end;
$$;

revoke execute on function citas_de_persona(text) from public;
grant  execute on function citas_de_persona(text) to authenticated;


-- ============================================================
--  29. PASES PERMANENTES
-- ============================================================
--  El pase que el pastor le da a ciertas personas para que no tengan
--  que registrarse cada semana. Reemplaza las tarjetas de papel.
--
--  No es "entrada libre": el codigo identifica a la persona y da UNA
--  caja por dia de entrega. Una foto del codigo no consigue una
--  segunda caja ese dia, y revocarlo lo apaga al momento.
--
--  No aparta lugar del cupo, por eso su caja no es una cita: se cuenta
--  aparte, igual que "entro sin cita", y suma al total del dia.

--  El pase es de la PERSONA, no de una cita: su codigo no se quema y
--  sirve todos los dias de entrega, hasta que un administrador lo
--  revoca. Lo que si se quema es el dia: una caja por pase por fecha.
--
--  Decision del Pastor David (21 sep 2026): el pase no aparta lugar
--  del cupo. Quien lo trae llega y pasa; por eso no hay cita que
--  reservar y la caja se cuenta aparte, igual que "entro sin cita".
create table if not exists pases (
  id                uuid primary key default gen_random_uuid(),
  persona_id        uuid not null unique references personas(id) on delete restrict,

  --  Lo que lleva el codigo QR. 24 bytes al azar, sin datos adentro.
  token             text unique not null,

  --  Por que se le dio. No lleva hora: la persona llega cuando puede y
  --  muestra su codigo.
  motivo            text,

  activo            boolean not null default true,
  creado_por        uuid,
  creado_en         timestamptz not null default now(),

  --  Revocar no borra: queda quien lo quito, cuando y por que.
  revocado_por      uuid,
  revocado_en       timestamptz,
  motivo_revocacion text
);

--  UNA caja por pase por dia. El indice unico es lo que de verdad lo
--  impide: si dos voluntarios escanean el mismo pase al mismo tiempo,
--  uno inserta y el otro choca. No se confia en "consulto y luego
--  inserto", que es el patron que reproduce el bug del Google Form.
create table if not exists entregas_pase (
  id           uuid primary key default gen_random_uuid(),
  pase_id      uuid not null references pases(id) on delete restrict,
  fecha        date not null,
  entregada_en timestamptz not null default now(),
  usuario_id   uuid not null,

  unique (pase_id, fecha)
);

create index if not exists idx_entregas_pase_fecha on entregas_pase (fecha);

alter table pases         enable row level security;
alter table entregas_pase enable row level security;


-- ------------------------------------------------------------
--  Dar, cambiar y quitar el pase
-- ------------------------------------------------------------
--  Crear y revocar pases es el permiso mas delicado del sistema: es
--  dar acceso permanente. Solo administradores.
--
--  Llamarla otra vez sobre alguien que ya tiene pase le actualiza el
--  motivo. Si estaba revocado, se reactiva CON OTRO CODIGO, para que las
--  copias del anterior no vuelvan a servir.
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
  perform exigir_rol(array['admin']);

  select * into v_persona
    from personas p
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')));

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


--  Renovar el codigo. Es lo que se usa cuando el pase anda circulando o
--  alguien mas lo trae: se le genera otro a la MISMA persona, el viejo
--  deja de servir al momento y el nuevo se le entrega a ella.
--
--  No revive uno revocado: para eso se le vuelve a dar con crear_pase().
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
  perform exigir_rol(array['admin']);

  select pa.id, pa.activo, p.codigo_corto, p.nombre
    into v_pase_id, v_activo, v_codigo, v_nombre
    from pases pa
    join personas p on p.id = pa.persona_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
     for update of pa;

  if not found then
    raise exception 'PASE_NO_EXISTE';
  end if;

  if not v_activo then
    raise exception 'PASE_YA_REVOCADO';
  end if;

  update pases
     set token = encode(gen_random_bytes(24), 'hex')
   where id = v_pase_id
  returning token into v_token;

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
  perform exigir_rol(array['admin']);

  select pa.id into v_pase_id
    from pases pa
    join personas p on p.id = pa.persona_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
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


--  Todos los pases, para la pantalla que los administra.
create or replace function listar_pases()
returns table (
  codigo_corto      text,
  nombre            text,
  telefono          text,
  token             text,
  motivo            text,
  activo            boolean,
  creado_en         timestamptz,
  creado_por        text,
  revocado_en       timestamptz,
  motivo_revocacion text,
  cajas_entregadas  int,
  ultima_entrega    date
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
  select p.codigo_corto,
         p.nombre,
         p.telefono,
         --  Lo necesita el panel para volver a mostrar su QR si lo perdio.
         pa.token,
         pa.motivo,
         pa.activo,
         pa.creado_en,
         u.email::text,
         pa.revocado_en,
         pa.motivo_revocacion,
         (select count(*)::int from entregas_pase e where e.pase_id = pa.id),
         (select max(e.fecha) from entregas_pase e where e.pase_id = pa.id)
    from pases pa
    join personas p on p.id = pa.persona_id
    left join auth.users u on u.id = pa.creado_por
   order by pa.activo desc, p.nombre;
end;
$$;

revoke execute on function listar_pases() from public;
grant  execute on function listar_pases() to authenticated;


--  Los pases que pasaron ese dia, para la lista del panel.
create or replace function entregas_pase_del_dia(p_fecha date default null)
returns table (
  nombre       text,
  codigo_corto text,
  entregada_en timestamptz,
  entregada_por text
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
  select p.nombre,
         p.codigo_corto,
         e.entregada_en,
         u.email::text
    from entregas_pase e
    join pases    pa on pa.id = e.pase_id
    join personas p  on p.id = pa.persona_id
    left join auth.users u on u.id = e.usuario_id
   where e.fecha = coalesce(p_fecha, current_date)
   order by e.entregada_en;
end;
$$;

revoke execute on function entregas_pase_del_dia(date) from public;
grant  execute on function entregas_pase_del_dia(date) to authenticated;


--  La pantalla donde la persona ve y guarda su pase.
--
--  Tener el codigo es ser dueno del pase, igual que con el enlace de la
--  cita: son 24 bytes al azar. Devuelve solo lo que se imprime.
create or replace function pase_por_token(p_token text)
returns table (
  nombre       text,
  codigo_corto text,
  activo       boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.nombre, p.codigo_corto, pa.activo
    from pases pa
    join personas p on p.id = pa.persona_id
   where pa.token = p_token;
$$;

revoke execute on function pase_por_token(text) from public;
grant  execute on function pase_por_token(text) to anon, authenticated;


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
