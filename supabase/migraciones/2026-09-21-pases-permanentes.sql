-- ============================================================
--  Cajita de Bendicion - Pases permanentes
--
--  El pastor le da a ciertas personas un pase que no vence: llegan,
--  muestran su codigo y pasan, sin registrarse cada semana. Reemplaza
--  las tarjetas de papel.
--
--  Reglas (decididas el 21 sep 2026):
--   * Sirve los dos dias de entrega, lunes y jueves.
--   * UNA caja por dia. Una copia del codigo no consigue otra.
--   * No aparta lugar del cupo: la caja se cuenta aparte, como las de
--     "entro sin cita", para que el total al banco de alimentos cuadre.
--   * No vence; se revoca desde el panel y deja de servir al momento.
--   * Solo administradores dan y quitan pases.
--
--  Cambia registrar_entrega(), resumen_del_dia() y reporte_por_dias().
--  Requiere 2026-09-15-historial-y-reportes.sql. Se puede repetir.
-- ============================================================

--  Todo va en una sola transaccion: esta migracion borra y vuelve a
--  crear resumen_del_dia() y reporte_por_dias(), que el panel usa a
--  diario. Si algo fallara a media hoja, sin la transaccion esas dos
--  quedarian borradas y el panel dejaria de abrir.
begin;

-- ------------------------------------------------------------
--  El pase y sus entregas
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
--  El escaneo, el resumen y los reportes
-- ------------------------------------------------------------
--  Las dos ultimas cambian sus columnas de salida, y Postgres no deja
--  cambiarlas con "create or replace": se borran antes.
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

drop function if exists reporte_por_dias(date, date);

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


-- ------------------------------------------------------------
--  Dar de alta a alguien sin cita
-- ------------------------------------------------------------
--  Para darle un pase a una persona nueva hay que poder registrarla sin
--  elegirle fecha: el pase no aparta lugar. Con p_bloque_id en null,
--  esta funcion solo crea a la persona y devuelve su codigo.
--
--  No cambia su firma: lo que ya la llama con un horario sigue igual.

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

commit;
