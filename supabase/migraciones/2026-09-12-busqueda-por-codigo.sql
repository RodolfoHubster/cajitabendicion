-- ============================================================
--  Cajita de Bendicion - Busqueda manual por codigo en otras fechas
--  Requiere haber corrido antes 2026-09-12-autorizacion-otra-fecha.sql.
--  Se puede repetir.
-- ============================================================

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
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  with busqueda as (select trim(coalesce(p_texto, '')) as texto)
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   cross join busqueda
   where busqueda.texto <> ''
     and c.estado <> 'cancelada'
     and (
       (b.fecha = current_date
        and (p.codigo_corto ilike '%' || busqueda.texto || '%'
             or p.nombre ilike '%' || busqueda.texto || '%'))
       or
       (upper(p.codigo_corto) = upper(busqueda.texto)
        and b.fecha between current_date - 7 and current_date + 14)
     )
   order by (b.fecha = current_date) desc,
            abs(b.fecha - current_date),
            p.nombre
   limit 20;
$$;

revoke execute on function buscar_para_escaneo(text) from public;
grant  execute on function buscar_para_escaneo(text) to authenticated;


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


