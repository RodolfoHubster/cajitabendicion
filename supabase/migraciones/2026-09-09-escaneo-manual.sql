-- ============================================================
--  Cajita de Bendicion - Escaneo: respaldo manual
--  Correr sobre la base que ya existe. Se puede repetir.
-- ============================================================

-- ============================================================
--  18. ESCANEO: RESPALDO MANUAL
-- ============================================================
--  Cuando el QR no se deja leer -- pantalla rota, sol de frente, el
--  senor que no trae el telefono -- el voluntario busca por nombre o
--  por el codigo corto. Es el plan B que exige CLAUDE.md, y la razon
--  de que el codigo corto exista.

--  Busca entre las citas de HOY. No es un buscador del padron: fuera
--  del dia de entrega no devuelve nada, y nunca expone telefono,
--  correo ni direccion.
create or replace function buscar_para_escaneo(p_texto text)
returns table (
  nombre       text,
  codigo_corto text,
  hora         time,
  estado       text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.nombre, p.codigo_corto, b.hora, c.estado
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where b.fecha = current_date
     and c.estado <> 'cancelada'
     and coalesce(trim(p_texto), '') <> ''
     and (
       p.codigo_corto ilike '%' || trim(p_texto) || '%'
       or p.nombre     ilike '%' || trim(p_texto) || '%'
     )
   order by p.nombre
   limit 20;
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


