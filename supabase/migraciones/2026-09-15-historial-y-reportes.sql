-- ============================================================
--  Cajita de Bendicion - Dias pasados y reportes
--
--  * citas_del_dia(): incluye las canceladas (quien, cuando y por que) y
--    en dias pasados marca "no_asistio" a quien nunca se escaneo.
--  * resumen_del_dia(): agrega no asistieron y canceladas.
--  * reporte_por_dias(): cajas y asistencia por dia, para Reportes.
--
--  Requiere 2026-09-14-cancelar-sin-cita-excepcion.sql y
--  2026-09-14-sin-cita-con-nombre.sql. Se puede repetir.
-- ============================================================

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
         coalesce(en.n, 0) + coalesce(sc.n, 0),
         coalesce(re.n, 0)
    from dias d
    left join cupos        cu on cu.dia = d.dia
    left join agenda       ag on ag.dia = d.dia
    left join entregas     en on en.dia = d.dia
    left join sin_cita_dia sc on sc.dia = d.dia
    left join repetidos    re on re.dia = d.dia
   order by d.dia;
end;
$$;

revoke execute on function reporte_por_dias(date, date) from public;
grant  execute on function reporte_por_dias(date, date) to authenticated;
