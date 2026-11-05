-- ============================================================
--  El escaner: cuantas cajas van hoy (seccion 55 de schema.sql)
-- ============================================================
--  Trae cajas_de_hoy(): cuantas cajas van hoy en todas las filas, en una
--  fila, y cuantas citas faltan por llegar. Solo numeros. La usa cualquiera
--  que escanee. Solo lectura: no toca citas, cupos ni registrar_entrega().
--  Correrla antes de subir la pantalla del escaner. Se puede correr dos veces.
-- ============================================================

-- ============================================================
--  55. EL ESCANER: CUANTAS CAJAS VAN HOY
-- ============================================================
--  Arriba de la camara (5 de noviembre de 2026): cuantas cajas van hoy en
--  todas las filas (lo que se le reporta al banco de alimentos), cuantas en
--  la fila de quien escanea y, en esa fila, cuantas citas faltan por llegar.
--  Es lo que el equipo pregunta todo el dia.
--
--  Solo numeros, nada de nadie: la puede usar cualquiera que escanee, sin
--  la palomita de "Citas de hoy" que pide resumen_del_dia(). Las cajas son
--  las mismas que suma Citas de hoy en "Juntas": citas entregadas, entradas
--  sin cita (sin las anuladas) y pases.

create or replace function cajas_de_hoy(p_fila text default null)
returns table (
  cajas       int,
  cajas_fila  int,
  faltan_fila int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if p_fila is not null and p_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  return query
  with de_hoy as (
    select b.fila, c.estado
      from citas c
      join bloques b on b.id = c.bloque_id
     where b.fecha = current_date
  ), entregadas as (
    select d.fila from de_hoy d where d.estado = 'entregada'
    union all
    select s.fila from entradas_sin_cita s where s.fecha = current_date and s.anulada_en is null
    union all
    select e.fila from entregas_pase e where e.fecha = current_date
  )
  select (select count(*)::int from entregadas),
         (select count(*)::int from entregadas x where p_fila is null or x.fila = p_fila),
         (select count(*)::int from de_hoy d
           where d.estado in ('reservada', 'llego') and (p_fila is null or d.fila = p_fila));
end;
$$;

revoke execute on function cajas_de_hoy(text) from public, anon;
grant  execute on function cajas_de_hoy(text) to authenticated;
