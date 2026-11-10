-- ============================================================
--  La lista de quienes recibieron, para Excel, PDF y CSV
--  (seccion 58 de schema.sql)
-- ============================================================
--  Para demostrarle al banco de alimentos y a quienes apoyan que la comida
--  si se entrega: quienes recibieron (lo que se escaneo), dia por dia, con
--  sus datos. Solo administradores. Dos versiones: la completa (uso
--  interno) y la de compartir, sin telefono, correo ni calle. Cada
--  descarga queda anotada en descargas_lista.
--
--  Agrega la tabla descargas_lista y la funcion lista_de_personas(). No
--  cambia ninguna funcion que ya exista. Se puede correr dos veces y a
--  cualquier hora. Correrla antes de subir la pantalla de Reportes.
-- ============================================================

-- ============================================================
--  58. LA LISTA DE QUIENES RECIBIERON (EXCEL, PDF Y CSV)
-- ============================================================
--  Pedido del 9 de noviembre de 2026: el pastor necesita demostrarle al
--  banco de alimentos y a quienes apoyan que la comida si se entrega: la
--  lista de quienes recibieron (lo que se escaneo), dia por dia, con sus
--  datos. Sale de Reportes, de las fechas que se escojan.
--
--  * Solo administradores: trae nombre, telefono, correo y domicilio.
--    Aunque un voluntario tenga "Ver reportes", esta lista no la baja.
--  * Dos versiones. El aviso de privacidad promete "no la compartimos con
--    nadie": la completa es para uso interno; la de compartir (p_version
--    = 'compartir') sale de aqui SIN telefono, correo ni calle, para que
--    no dependa de que la pantalla los quite.
--  * Queda anotado quien la bajo, cuando, de que fechas, que incluia y
--    que version (descargas_lista).
--  * Recibieron: las citas entregadas (por el dia en que se entregaron) y
--    los pases permanentes. Aparte, si se piden: los que tenian cita en
--    carro y no vinieron (solo dias que ya pasaron) y la fila a pie (casi
--    siempre "Turno 12" y su codigo: ahi no se dan datos). "Entro sin
--    cita" no va: no hay persona registrada.

create table if not exists descargas_lista (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null,
  descargada_en timestamptz not null default now(),
  desde         date not null,
  hasta         date not null,
  incluye       text[] not null,
  version       text not null check (version in ('completa', 'compartir')),
  renglones     int not null
);

alter table descargas_lista enable row level security;

create or replace function lista_de_personas(
  p_desde        date,
  p_hasta        date,
  p_recibieron   boolean default true,
  p_no_vinieron  boolean default false,
  p_a_pie        boolean default false,
  p_version      text    default 'completa'
)
returns table (
  fecha            date,
  fila             text,
  situacion        text,
  tipo             text,
  codigo_corto     text,
  nombres          text,
  apellidos        text,
  nombre           text,
  telefono         text,
  email            text,
  calle            text,
  numero_exterior  text,
  numero_interior  text,
  colonia          text,
  direccion        text,
  ciudad           text,
  municipio        text,
  estado_domicilio text,
  codigo_postal    text,
  pais             text,
  hora_cita        time,
  recibio_en       timestamp,
  turno            int,
  en_carro_de      text
)
language plpgsql
volatile
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
declare
  v_completa boolean;
  v_n        int;
begin
  perform exigir_rol(array['admin']);

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'RANGO_MUY_LARGO';
  end if;

  if p_version is null or p_version not in ('completa', 'compartir') then
    raise exception 'VERSION_INVALIDA';
  end if;

  v_completa := p_version = 'completa';

  --  Con la zona de San Diego puesta, usado_en::date es la fecha de San Diego.
  return query
  with filas as (
    --  Recibieron con su cita (el acompanante tambien: su propio QR, su caja).
    select c.usado_en::date as dia, b.fila as fila_, 'recibio'::text as sit,
           case when c.acompana_a is not null then 'acompanante' else 'cita' end as tip,
           c.persona_id, b.hora, c.usado_en as cuando, c.turno as turno_, c.acompana_a
      from citas c
      join bloques b on b.id = c.bloque_id
     where coalesce(p_recibieron, true)
       and c.estado = 'entregada'
       and c.usado_en::date between p_desde and p_hasta
       and (b.fila = 'carro' or coalesce(p_a_pie, false))
    union all
    --  Recibieron con su pase permanente.
    select e.fecha, e.fila, 'recibio', 'pase', pa.persona_id, null::time, e.entregada_en, null::int, null::uuid
      from entregas_pase e
      join pases pa on pa.id = e.pase_id
     where coalesce(p_recibieron, true)
       and e.fecha between p_desde and p_hasta
       and (e.fila = 'carro' or coalesce(p_a_pie, false))
    union all
    --  Tenian cita en carro y no vinieron (de dias que ya pasaron).
    select b.fecha, b.fila, 'no_vino',
           case when c.acompana_a is not null then 'acompanante' else 'cita' end,
           c.persona_id, b.hora, null::timestamptz, c.turno, c.acompana_a
      from citas c
      join bloques b on b.id = c.bloque_id
     where coalesce(p_no_vinieron, false)
       and b.fila = 'carro'
       and b.fecha between p_desde and p_hasta
       and b.fecha < current_date
       and c.estado in ('no_asistio', 'reservada', 'llego')
  )
  select f.dia,
         f.fila_,
         f.sit,
         f.tip,
         pe.codigo_corto,
         pe.nombres,
         pe.apellidos,
         pe.nombre,
         case when v_completa then pe.telefono end,
         case when v_completa then pe.email end,
         case when v_completa then pe.calle end,
         case when v_completa then pe.numero_exterior end,
         case when v_completa then pe.numero_interior end,
         case when v_completa then pe.colonia end,
         case when v_completa then pe.direccion end,
         pe.ciudad,
         pe.municipio,
         pe.estado,
         pe.codigo_postal,
         pe.pais,
         f.hora,
         f.cuando::timestamp,
         f.turno_,
         (select pd.codigo_corto from citas cd join personas pd on pd.id = cd.persona_id where cd.id = f.acompana_a)
    from filas f
    join personas pe on pe.id = f.persona_id
   order by f.dia, f.sit, f.fila_,
            lower(coalesce(nullif(trim(pe.apellidos), ''), pe.nombre)),
            lower(coalesce(pe.nombres, '')),
            f.turno_;

  get diagnostics v_n = row_count;

  insert into descargas_lista (usuario_id, desde, hasta, incluye, version, renglones)
  values (
    auth.uid(), p_desde, p_hasta,
    array_remove(array[
      case when coalesce(p_recibieron, true) then 'recibieron' end,
      case when coalesce(p_no_vinieron, false) then 'no_vinieron' end,
      case when coalesce(p_a_pie, false) then 'a_pie' end
    ], null),
    p_version, v_n
  );
end;
$$;

revoke execute on function lista_de_personas(date, date, boolean, boolean, boolean, text) from public, anon;
grant  execute on function lista_de_personas(date, date, boolean, boolean, boolean, text) to authenticated;
