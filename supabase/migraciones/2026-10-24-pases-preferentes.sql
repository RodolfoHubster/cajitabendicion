-- ============================================================
--  Cajita de Bendicion - Pases preferentes (seccion 50)
--
--  Personas de la tercera edad o con movilidad reducida: un pase
--  permanente PREFERENTE, con solo su nombre (telefono opcional) y una nota
--  para reconocerla. Al escanearlo, quien escanea ve su nombre y su nota y
--  confirma antes de entregar. En Reportes se cuentan aparte.
--
--  * pases.preferente y pases.nota (sin tocar los pases que ya existen).
--  * crear_pase_preferente() y marcar_pase_preferente().
--  * Cambian pase_por_token(), listar_pases() y reporte_por_dias()
--    (con_pase_preferente).
--
--  No toca citas, cupos ni registrar_entrega(): se puede correr aunque este
--  la entrega. Correrla ANTES de subir las pantallas nuevas. Se puede repetir.
-- ============================================================

begin;

alter table pases add column if not exists preferente boolean not null default false;
alter table pases add column if not exists nota       text;


drop function if exists pase_por_token(text);

create or replace function pase_por_token(p_token text)
returns table (
  nombre       text,
  codigo_corto text,
  activo       boolean,
  vip          boolean,
  --  Seccion 50. La nota, solo para el equipo: quien abre el enlace no la ve.
  preferente   boolean,
  nota         text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.nombre, p.codigo_corto, pa.activo, pa.vip, pa.preferente,
         case when exists (select 1 from personal pe where pe.usuario_id = auth.uid() and pe.activo)
              then pa.nota end
    from pases pa
    join personas p on p.id = pa.persona_id
   where pa.token = p_token;
$$;

revoke execute on function pase_por_token(text) from public;
grant  execute on function pase_por_token(text) to anon, authenticated;


drop function if exists listar_pases();

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
  ultima_entrega    date,
  vip               boolean,
  preferente        boolean,
  nota              text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('dar_pases');

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
         (select max(e.fecha) from entregas_pase e where e.pase_id = pa.id),
         pa.vip,
         pa.preferente,
         pa.nota
    from pases pa
    join personas p on p.id = pa.persona_id
    left join auth.users u on u.id = pa.creado_por
   order by pa.activo desc, p.nombre;
end;
$$;

revoke execute on function listar_pases() from public;
grant  execute on function listar_pases() to authenticated;


drop function if exists reporte_por_dias(date, date, text);

create or replace function reporte_por_dias(p_desde date, p_hasta date, p_fila text default null)
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
  intentos_repetidos int,
  --  Citas de carro que se cancelaron porque la persona se paso a la fila a
  --  pie (seccion 42): cuantos prefirieron no esperar en carro.
  cambios_a_pie      int,
  --  Turnos a pie que la voluntaria anulo porque llegaron tarde (seccion 46).
  turnos_anulados    int,
  --  De las cajas con pase, las de pases preferentes (seccion 50).
  con_pase_preferente int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('ver_reportes');

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'RANGO_MUY_LARGO';
  end if;

  if p_fila is not null and p_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  --  Con la zona de San Diego puesta, usado_en::date es la fecha de San Diego.
  return query
  with dias as (
    select b.fecha as dia from bloques b where b.fecha between p_desde and p_hasta and (p_fila is null or b.fila = p_fila)
    union
    select s.fecha from entradas_sin_cita s where s.fecha between p_desde and p_hasta and (p_fila is null or s.fila = p_fila)
    union
    select c.usado_en::date from citas c
      join bloques b on b.id = c.bloque_id
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
    union
    select e.fecha from entregas_pase e where e.fecha between p_desde and p_hasta and (p_fila is null or e.fila = p_fila)
  ),
  cupos as (
    --  Una fila a pie "sin limite" (seccion 38) no suma cupo: no lo tiene.
    select b.fecha as dia,
           sum(case when b.capacidad >= cupo_sin_limite() then 0 else b.capacidad end)::int as n
      from bloques b
     where b.fecha between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
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
       and (p_fila is null or b.fila = p_fila)
     group by b.fecha
  ),
  entregas as (
    select c.usado_en::date as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
     group by c.usado_en::date
  ),
  sin_cita_dia as (
    select s.fecha as dia, count(*)::int as n
      from entradas_sin_cita s
     where s.fecha between p_desde and p_hasta and s.anulada_en is null and (p_fila is null or s.fila = p_fila)
     group by s.fecha
  ),
  pases_dia as (
    select e.fecha as dia, count(*)::int as n
      from entregas_pase e
     where e.fecha between p_desde and p_hasta and (p_fila is null or e.fila = p_fila)
     group by e.fecha
  ),
  repetidos as (
    select e.escaneado_en::date as dia, count(*)::int as n
      from escaneos e
      join citas   c on c.id = e.cita_id
      join bloques b on b.id = c.bloque_id
     where e.resultado = 'YA_USADO' and e.escaneado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
     group by e.escaneado_en::date
  ),
  cambios as (
    select b.fecha as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.se_cambio_a_pie and b.fecha between p_desde and p_hasta
       and (p_fila is null or p_fila = 'carro')
     group by b.fecha
  ),
  anulados as (
    select b.fecha as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.turno_anulado_en is not null and b.fecha between p_desde and p_hasta
       and (p_fila is null or p_fila = 'a_pie')
     group by b.fecha
  ),
  preferentes as (
    select e.fecha as dia, count(*)::int as n
      from entregas_pase e
      join pases pa on pa.id = e.pase_id
     where pa.preferente and e.fecha between p_desde and p_hasta
       and (p_fila is null or e.fila = p_fila)
     group by e.fecha
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
         coalesce(re.n, 0),
         coalesce(ca.n, 0),
         coalesce(an.n, 0),
         coalesce(pr.n, 0)
    from dias d
    left join cupos        cu on cu.dia = d.dia
    left join agenda       ag on ag.dia = d.dia
    left join entregas     en on en.dia = d.dia
    left join sin_cita_dia sc on sc.dia = d.dia
    left join pases_dia    pa on pa.dia = d.dia
    left join repetidos    re on re.dia = d.dia
    left join cambios      ca on ca.dia = d.dia
    left join anulados     an on an.dia = d.dia
    left join preferentes  pr on pr.dia = d.dia
   order by d.dia;
end;
$$;


revoke execute on function reporte_por_dias(date, date, text) from public;
grant  execute on function reporte_por_dias(date, date, text) to authenticated;


--  Pedido del 24 de octubre de 2026: personas de la tercera edad, con
--  andadera o que se les complica moverse. Sacar cita cada semana o hacer
--  fila les cuesta; reciben un pase permanente PREFERENTE.
--
--  * Es un pase como los de la seccion 29: QR permanente, una caja por dia
--    de entrega, no aparta lugar del cupo, y se puede encontrar por su
--    codigo CB si el QR no se lee.
--  * Para darlo basta su nombre (telefono opcional) y una nota para
--    reconocerla ("andadera azul, viene con su nieto Luis"): sin domicilio
--    ni registro completo (crear_pase_preferente). A alguien que ya tiene
--    pase tambien se le puede volver preferente (marcar_pase_preferente).
--  * Al escanearlo NO se entrega solo: el escaner ensena su nombre y su
--    nota, y quien escanea confirma que es la persona (eso es de la
--    pantalla; la base entrega igual que cualquier pase).
--  * La nota solo la ve el equipo, no quien abre el enlace del pase.
--  * En Reportes, sus cajas se cuentan aparte (con_pase_preferente), y
--    tambien dentro de "con pase" y del total, como siempre.

--  Darle su pase preferente con lo minimo: nombre, telefono (con lada,
--  opcional) y la nota. Se le crea su codigo CB.
create or replace function crear_pase_preferente(p_nombre text, p_telefono text default null, p_nota text default null)
returns table (codigo_corto text, nombre text, token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_nombre   text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_telefono text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  v_nota     text := nullif(regexp_replace(trim(coalesce(p_nota, '')), '\s+', ' ', 'g'), '');
  v_persona  personas;
  v_pase     pases;
  v_codigo   text;
  v_intentos int := 0;
begin
  perform exigir_permiso('dar_pases');

  if char_length(v_nombre) not between 2 and 80 then
    raise exception 'NOMBRE_INVALIDO';
  end if;
  if v_telefono is not null and v_telefono !~ '^\+[0-9]{8,15}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;
  if char_length(v_nota) > 200 then
    raise exception 'NOTA_MUY_LARGA';
  end if;

  --  Su codigo CB, como en el registro (5 numeros): si sale repetido, otro.
  loop
    v_codigo := 'CB-' || (10000 + floor(random() * 90000))::int::text;
    begin
      insert into personas (codigo_corto, nombre, telefono, sin_domicilio)
      values (v_codigo, v_nombre, v_telefono, true)
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  insert into pases (persona_id, token, motivo, creado_por, preferente, nota)
  values (v_persona.id, encode(gen_random_bytes(24), 'hex'), 'Preferente', auth.uid(), true, v_nota)
  returning * into v_pase;

  return query select v_persona.codigo_corto, v_persona.nombre, v_pase.token;
end;
$$;

revoke execute on function crear_pase_preferente(text, text, text) from public, anon;
grant  execute on function crear_pase_preferente(text, text, text) to authenticated;


--  Volver preferente (o ya no) el pase de alguien, y cambiar su nota.
--  p_nota nula deja la que tenia; vacia la quita.
create or replace function marcar_pase_preferente(p_codigo text, p_preferente boolean, p_nota text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_nota text := regexp_replace(trim(coalesce(p_nota, '')), '\s+', ' ', 'g');
begin
  perform exigir_permiso('dar_pases');

  if char_length(v_nota) > 200 then
    raise exception 'NOTA_MUY_LARGA';
  end if;

  update pases pa
     set preferente = coalesce(p_preferente, false),
         nota       = case when p_nota is null then pa.nota else nullif(v_nota, '') end
    from personas p
   where p.id = pa.persona_id
     and upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo);

  if not found then
    raise exception 'PASE_NO_EXISTE';
  end if;

  return coalesce(p_preferente, false);
end;
$$;

revoke execute on function marcar_pase_preferente(text, boolean, text) from public, anon;
grant  execute on function marcar_pase_preferente(text, boolean, text) to authenticated;

commit;
