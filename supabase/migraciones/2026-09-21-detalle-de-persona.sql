-- ============================================================
--  Cajita de Bendicion - La ficha completa de una persona
--
--  En las listas del dia solo se ve la ciudad. Esto agrega el boton
--  "Ver" del panel: domicilio exacto, telefono, correo, cuando se
--  registro, cuando acepto el aviso y sus citas anteriores.
--
--  Solo admin: un voluntario escanea, no lee el padron.
--
--  No cambia ninguna tabla. Se puede repetir.
-- ============================================================

-- ------------------------------------------------------------
--  Ver a una persona completa
-- ------------------------------------------------------------
--  Las listas del dia muestran solo la ciudad, a proposito: son para
--  trabajar en la fila. Cuando hace falta el domicilio exacto (aclarar
--  una entrega, corregir un dato) se abre esta ficha.
--
--  Solo admin. Un voluntario escanea, no lee el padron: es la misma
--  regla que ya aplican citas_del_dia() y los reportes.
create or replace function detalle_de_persona(p_codigo text)
returns table (
  codigo_corto         text,
  nombre               text,
  nombres              text,
  apellidos            text,
  telefono             text,
  email                text,
  pais                 text,
  direccion            text,
  calle                text,
  numero_exterior      text,
  numero_interior      text,
  colonia              text,
  ciudad               text,
  municipio            text,
  estado               text,
  codigo_postal        text,
  sin_domicilio        boolean,
  acepto_privacidad_en timestamptz,
  registrada_en        timestamptz,
  citas_totales        int,
  cajas_recibidas      int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  perform exigir_rol(array['admin']);

  if v_codigo = '' then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  return query
  select p.codigo_corto,
         p.nombre,
         p.nombres,
         p.apellidos,
         p.telefono,
         p.email,
         p.pais,
         p.direccion,
         p.calle,
         p.numero_exterior,
         p.numero_interior,
         p.colonia,
         p.ciudad,
         p.municipio,
         p.estado,
         p.codigo_postal,
         p.sin_domicilio,
         p.acepto_privacidad_en,
         p.creado_en,
         (select count(*)::int from citas c
           where c.persona_id = p.id and c.estado <> 'cancelada'),
         (select count(*)::int from citas c
           where c.persona_id = p.id and c.estado = 'entregada')
    from personas p
   where upper(p.codigo_corto) = v_codigo;

  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;
end;
$$;

revoke execute on function detalle_de_persona(text) from public;
grant  execute on function detalle_de_persona(text) to authenticated;


--  Sus citas, de la mas reciente para atras. Se marca "no asistio" igual
--  que en la lista del dia: no se guarda asi, se calcula al leer.
create or replace function citas_de_persona(p_codigo text)
returns table (
  fecha    date,
  hora     time,
  estado   text,
  usado_en timestamptz
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
  select b.fecha,
         b.hora,
         case
           when c.estado = 'reservada' and b.fecha < current_date then 'no_asistio'
           else c.estado
         end,
         c.usado_en
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
   order by b.fecha desc, b.hora desc
   limit 30;
end;
$$;

revoke execute on function citas_de_persona(text) from public;
grant  execute on function citas_de_persona(text) to authenticated;
