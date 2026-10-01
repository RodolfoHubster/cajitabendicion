-- ============================================================
--  Cajita de Bendicion - Buscar personas mas rapido
--
--  "Personas" tardaba: por cada persona encontrada se revisaban todas las
--  citas, una por una. Ahora hay un indice de citas por persona y las
--  cuentas se hacen de una vez. buscar_personas() devuelve lo mismo.
--
--  Requiere 2026-09-30-buscar-personas.sql. No cambia ningun dato. Se
--  puede correr aunque este la entrega. Se puede repetir.
-- ============================================================

begin;

--  Las citas de una persona: para buscar personas (y su ficha) sin revisar
--  todas las citas una por una.
create index if not exists idx_citas_persona on citas (persona_id);

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

  --  Las citas y las cajas con pase se cuentan de una vez para todas las
  --  encontradas (con el indice de citas por persona), no persona por
  --  persona: asi tardaba en cuanto habia cientos de registros.
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
  ),
  de_citas as (
    select c.persona_id,
           count(*) filter (where c.estado <> 'cancelada')::int as n_citas,
           count(*) filter (where c.estado = 'entregada')::int  as n_entregadas,
           max(b.fecha) filter (where c.estado <> 'cancelada')  as ultima
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.persona_id in (select e2.id from encontradas e2)
     group by c.persona_id
  ),
  de_pases as (
    select pa2.persona_id,
           pa2.activo,
           pa2.vip,
           (select count(*)::int from entregas_pase ep where ep.pase_id = pa2.id) as n_cajas,
           (select max(ep.fecha) from entregas_pase ep where ep.pase_id = pa2.id) as ultima
      from pases pa2
     where pa2.persona_id in (select e3.id from encontradas e3)
  )
  select e.codigo_corto,
         e.nombre,
         normalizar_texto(e.nombre),
         md5(normalizar_texto(e.nombre) || '|' || coalesce(e.telefono, '')),
         right(regexp_replace(coalesce(e.telefono, ''), '[^0-9]', '', 'g'), 4),
         coalesce(nullif(trim(e.ciudad), ''), nullif(trim(e.municipio), '')),
         e.creado_en,
         coalesce(dc.n_citas, 0),
         coalesce(dc.n_entregadas, 0) + coalesce(dp.n_cajas, 0),
         greatest(dc.ultima, dp.ultima),
         coalesce(dp.activo, false),
         coalesce(dp.activo and dp.vip, false)
    from encontradas e
    left join de_citas dc on dc.persona_id = e.id
    left join de_pases dp on dp.persona_id = e.id
   order by normalizar_texto(e.nombre), e.creado_en desc;
end;
$$;

revoke execute on function buscar_personas(text) from public, anon;
grant  execute on function buscar_personas(text) to authenticated;

commit;
