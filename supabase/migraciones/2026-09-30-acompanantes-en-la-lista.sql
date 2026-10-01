-- ============================================================
--  Cajita de Bendicion - Acompanantes en la lista del dia
--
--  Citas de hoy dice quien viene de acompanante (en el carro de quien) y
--  cuantos acompanantes trae cada carro: citas_del_dia() devuelve tres
--  columnas mas (en_carro_de, en_carro_de_nombre, acompanantes).
--
--  Solo lectura: no cambia ningun dato. La pagina publicada sigue
--  funcionando (las columnas nuevas no le estorban). Se puede correr
--  aunque este la entrega. Se puede repetir.
--  Requiere 2026-09-28-acompanantes.sql.
-- ============================================================

begin;

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
  motivo_cancelacion text,
  fila               text,
  --  Quien la marco entregada a mano (seccion 35); null si se escaneo.
  marcada_por        text,
  --  Acompanantes (seccion 39): si viene en el carro de alguien, el codigo
  --  y el nombre de quien maneja; si maneja, cuantos trae.
  en_carro_de        text,
  en_carro_de_nombre text,
  acompanantes       int
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
  perform exigir_permiso('ver_citas_del_dia');

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
         c.motivo_cancelacion,
         b.fila,
         (select um.email::text
            from entregas_marcadas m
            left join auth.users um on um.id = m.marcada_por
           where m.cita_id = c.id
           order by m.marcada_en desc
           limit 1),
         pd.codigo_corto,
         pd.nombre,
         (select count(*)::int from citas a
           where a.acompana_a = c.id and a.estado <> 'cancelada')
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.cancelada_por
    left join citas    cd on cd.id = c.acompana_a
    left join personas pd on pd.id = cd.persona_id
   where b.fecha = coalesce(p_fecha, current_date)
   order by b.hora, p.nombre;
end;
$$;


revoke execute on function citas_del_dia(date) from public, anon;
grant  execute on function citas_del_dia(date) to authenticated;

commit;
