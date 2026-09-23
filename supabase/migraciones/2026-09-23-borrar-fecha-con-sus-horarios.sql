-- ============================================================
--  Cajita de Bendicion - Al borrar una fecha se van sus horarios
--
--  eliminar_dia_entrega() borraba la fila de dias_entrega y dejaba los
--  bloques de ese dia en la tabla. No los veia nadie --todo lo publico
--  pasa por dias_entrega-- pero se acumulaban, y si alguien volvia a
--  crear la misma fecha reaparecian con su capacidad vieja.
--
--  Sigue sin poderse borrar una fecha con citas: eso no cambia.
--
--  Solo cambia esa funcion. Se puede repetir.
-- ============================================================

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

  --  Los horarios se van con su fecha. Antes se quedaban huerfanos: no
  --  los veia nadie, porque todo lo publico pasa por dias_entrega, pero
  --  seguian en la tabla y reaparecian si alguien volvia a crear esa
  --  misma fecha. Aqui ya se sabe que ninguno tiene citas.
  delete from bloques where fecha = p_fecha;

  delete from dias_entrega where fecha = p_fecha;

  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;
end;
$$;

