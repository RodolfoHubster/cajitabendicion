-- ============================================================
--  Cajita de Bendicion - Buscar personas
--
--  "Personas" en el panel busca en todos los registros por nombre, telefono
--  o codigo CB, y junta los registros de la misma persona (mismo nombre y
--  mismo telefono): buscar_personas(). Citas de hoy y Reportes escogen el
--  dia de una lista de dias de entrega en vez de un calendario:
--  fechas_de_entrega().
--
--  Solo agrega dos funciones de lectura: no cambia ningun dato ni ninguna
--  regla. Se puede correr aunque este la entrega. Se puede repetir.
-- ============================================================

begin;

-- ============================================================
--  41. BUSCAR PERSONAS Y LOS DIAS DE ENTREGA
-- ============================================================
--  Pedido del 30 de septiembre de 2026. El pastor da nombres para hacerlos
--  VIP, y para encontrar su codigo CB habia que revisar dia por dia en
--  Reportes y Citas de hoy. Ahora "Personas" busca en todos los registros
--  por nombre, telefono o codigo CB.
--
--  Cada registro publico crea un codigo CB nuevo, asi que la misma persona
--  sale varias veces. La pantalla junta los registros con el MISMO nombre
--  (sin acentos ni mayusculas) y el MISMO telefono (columna "grupo"). El
--  mismo nombre con otro telefono va aparte: puede ser otra persona.
--
--  Para distinguirlas basta lo minimo: los ultimos 4 digitos del telefono,
--  la ciudad y cuando se registro. El domicilio exacto sigue en la ficha
--  (detalle_de_persona), con el mismo permiso.

create or replace function buscar_personas(p_texto text)
returns table (
  codigo_corto   text,
  nombre         text,
  --  El nombre sin acentos ni mayusculas: dos grupos con el mismo son
  --  "mismo nombre, otro telefono".
  nombre_clave   text,
  --  Mismo nombre y mismo telefono = mismo grupo. Va cifrado: no expone
  --  el telefono completo.
  grupo          text,
  telefono_final text,
  ciudad         text,
  registrada_en  timestamptz,
  citas          int,
  --  Con cita y con pase permanente.
  cajas          int,
  ultima_fecha   date,
  pase_activo    boolean,
  vip            boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_texto    text   := trim(coalesce(p_texto, ''));
  --  "cb 4871" o "4871" se buscan como CB-4871 (seccion 33).
  v_codigo   text   := normalizar_codigo_corto(p_texto);
  --  Sin acentos y en cualquier orden: "chavez oscar" encuentra a
  --  "Óscar A. Chávez".
  v_palabras text[] := array_remove(string_to_array(normalizar_texto(p_texto), ' '), '');
  --  Solo numeros (y espacios o guiones): se busca por telefono.
  v_digitos  text   := regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g');
  v_es_telefono boolean;
begin
  perform exigir_permiso('ver_personas');

  if char_length(v_texto) < 2 then
    return;
  end if;

  v_es_telefono := v_texto !~ '[[:alpha:]]' and char_length(v_digitos) >= 4;

  return query
  with encontradas as (
    select p.*
      from personas p
     where upper(p.codigo_corto) = v_codigo
        or (v_es_telefono
            and regexp_replace(coalesce(p.telefono, ''), '[^0-9]', '', 'g') like '%' || v_digitos || '%')
        or (not v_es_telefono
            and cardinality(v_palabras) > 0
            and not exists (select 1 from unnest(v_palabras) w
                             where normalizar_texto(p.nombre) not like '%' || w || '%'))
     order by p.creado_en desc
     limit 150
  )
  select e.codigo_corto,
         e.nombre,
         normalizar_texto(e.nombre),
         md5(normalizar_texto(e.nombre) || '|' || coalesce(e.telefono, '')),
         right(regexp_replace(coalesce(e.telefono, ''), '[^0-9]', '', 'g'), 4),
         coalesce(nullif(trim(e.ciudad), ''), nullif(trim(e.municipio), '')),
         e.creado_en,
         (select count(*)::int from citas c
           where c.persona_id = e.id and c.estado <> 'cancelada'),
         (select count(*)::int from citas c
           where c.persona_id = e.id and c.estado = 'entregada')
           + (select count(*)::int from entregas_pase ep
               where ep.pase_id = pa.id),
         greatest((select max(b.fecha) from citas c join bloques b on b.id = c.bloque_id
                    where c.persona_id = e.id and c.estado <> 'cancelada'),
                  (select max(ep.fecha) from entregas_pase ep where ep.pase_id = pa.id)),
         coalesce(pa.activo, false),
         coalesce(pa.activo and pa.vip, false)
    from encontradas e
    left join pases pa on pa.persona_id = e.id
   order by normalizar_texto(e.nombre), e.creado_en desc;
end;
$$;

revoke execute on function buscar_personas(text) from public, anon;
grant  execute on function buscar_personas(text) to authenticated;


--  Los dias de entrega, de la mas reciente para atras (las que vienen
--  primero). Para escoger el dia en Citas de hoy y en Reportes sin un
--  calendario: solo salen los lunes y jueves que de verdad hubo o habra.
--  Son solo fechas: cualquiera del equipo las puede ver.
create or replace function fechas_de_entrega()
returns table (
  fecha   date,
  --  Dia cancelado o cerrado: se ve, pero se marca.
  cerrado boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  return query
  select f.dia, coalesce(d.cerrado, false)
    from (select d2.fecha as dia from dias_entrega d2
           union
          select b.fecha from bloques b) f
    left join dias_entrega d on d.fecha = f.dia
   order by f.dia desc
   limit 400;
end;
$$;

revoke execute on function fechas_de_entrega() from public, anon;
grant  execute on function fechas_de_entrega() to authenticated;


commit;
