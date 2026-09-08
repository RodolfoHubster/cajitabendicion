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

  nombre         text not null,
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
  fecha           date not null default current_date,
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

create or replace function registrar_entrega(
  p_token   text,
  p_usuario uuid
)
returns table (
  resultado    text,
  nombre       text,
  codigo_corto text,
  hora         time
)
language plpgsql
as $$
declare
  v_cita    citas;
  v_persona personas;
  v_bloque  bloques;
begin
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
    values (v_cita.id, p_usuario, 'OTRA_FECHA');

    return query select 'OTRA_FECHA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  if v_cita.estado = 'entregada' then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, p_usuario, 'YA_USADO');

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
  values (v_cita.id, p_usuario, 'VALIDO');

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
