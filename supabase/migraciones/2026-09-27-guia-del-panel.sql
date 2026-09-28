-- ============================================================
--  Cajita de Bendicion - La guia del panel
--
--  Tabla guias_vistas y las funciones mis_guias_vistas() y
--  marcar_guia_vista(guia, version): quien del equipo ya vio la guia paso
--  a paso del panel, por cuenta y no por telefono.
--
--  Sin esta migracion la guia igual funciona: se recuerda solo en cada
--  telefono. No toca nada de lo que ya existe. Se puede repetir.
-- ============================================================

begin;

-- ============================================================
--  37. LA GUIA DEL PANEL: QUIEN YA LA VIO
-- ============================================================
--  La primera vez que alguien del equipo entra al panel se le abre una guia
--  paso a paso (src/componentes/guia/). Se guarda por CUENTA y no solo en
--  el telefono: el dia de la entrega un mismo telefono o tableta pasa de mano
--  en mano, y el voluntario que llega segundo tambien la necesita.
--
--  version: cuando cambia algo en como se trabaja (como el 24 de septiembre
--  de 2026, cuando escanear paso a entregar de una vez), la guia sube de
--  version y a quien ya la vio se le ensenan solo las novedades.

create table if not exists guias_vistas (
  usuario_id uuid        not null,
  guia       text        not null check (guia in ('admin', 'voluntario')),
  version    int         not null check (version between 1 and 1000),
  vista_en   timestamptz not null default now(),
  primary key (usuario_id, guia)
);

alter table guias_vistas enable row level security;
revoke all on guias_vistas from anon, authenticated;

--  Las guias que ya vio quien pregunta. Nadie ve las de otros.
create or replace function mis_guias_vistas()
returns table (
  guia     text,
  version  int,
  vista_en timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  return query
  select g.guia, g.version, g.vista_en
    from guias_vistas g
   where g.usuario_id = auth.uid();
end;
$$;

revoke execute on function mis_guias_vistas() from public, anon;
grant  execute on function mis_guias_vistas() to authenticated;

--  Ya la vio (o la salto). Nunca baja de version: un telefono con la app
--  vieja no le vuelve a ensenar lo que ya vio. Devuelve la version guardada.
create or replace function marcar_guia_vista(p_guia text, p_version int)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_version int;
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if p_guia is null or p_guia not in ('admin', 'voluntario') then
    raise exception 'GUIA_INVALIDA';
  end if;

  if p_version is null or p_version < 1 or p_version > 1000 then
    raise exception 'VERSION_INVALIDA';
  end if;

  insert into guias_vistas as g (usuario_id, guia, version)
  values (auth.uid(), p_guia, p_version)
  on conflict (usuario_id, guia) do update
     set version  = greatest(g.version, excluded.version),
         vista_en = now()
  returning g.version into v_version;

  return v_version;
end;
$$;

revoke execute on function marcar_guia_vista(text, int) from public, anon;
grant  execute on function marcar_guia_vista(text, int) to authenticated;

commit;
