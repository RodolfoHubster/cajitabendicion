-- ============================================================
--  Cajita de Bendicion - Pases VIP
--
--  Los suscriptores VIP pasan directo, sin hacer fila. Su pase permanente
--  se marca VIP (marcar_pase_vip, solo admin): el QR sale dorado y el
--  escaner dice "VIP". pase_por_token() y listar_pases() traen si es VIP.
--
--  No cambia nada de los pases que ya existen (todos quedan no VIP) ni de
--  las citas. Se puede correr aunque este la entrega. Se puede repetir.
-- ============================================================

begin;

-- ============================================================
--  40. PASES VIP
-- ============================================================
--  Pedido del pastor, 28 de septiembre de 2026: los suscriptores VIP de
--  Facebook no hacen fila, pasan directo. Su pase permanente (seccion 29)
--  se marca VIP: el QR sale dorado y al escanearlo la pantalla dice "VIP,
--  pasa directo". Todo lo demas es igual que cualquier pase: una caja por
--  dia de entrega, no aparta lugar, se renueva o se quita igual.
--
--  Es del pase y no de la cita porque cada registro publico crea un codigo
--  CB nuevo: marcar una cita se perderia la semana siguiente. Solo el
--  administrador lo pone o lo quita; queda quien y desde cuando.

alter table pases add column if not exists vip       boolean not null default false;
alter table pases add column if not exists vip_por   uuid;
alter table pases add column if not exists vip_desde timestamptz;

--  Hacer VIP (o quitarle lo VIP) el pase de alguien, por su codigo CB.
--  Devuelve como quedo.
create or replace function marcar_pase_vip(p_codigo text, p_vip boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_vip boolean := coalesce(p_vip, false);
  v_id  uuid;
begin
  perform exigir_rol(array['admin']);

  update pases pa
     set vip       = v_vip,
         vip_por   = case when v_vip then auth.uid() end,
         vip_desde = case when v_vip then coalesce(pa.vip_desde, now()) end
    from personas p
   where p.id = pa.persona_id
     and upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
  returning pa.id into v_id;

  if v_id is null then
    raise exception 'PASE_NO_EXISTE';
  end if;

  return v_vip;
end;
$$;

revoke execute on function marcar_pase_vip(text, boolean) from public, anon;
grant  execute on function marcar_pase_vip(text, boolean) to authenticated;

drop function if exists pase_por_token(text);

create or replace function pase_por_token(p_token text)
returns table (
  nombre       text,
  codigo_corto text,
  activo       boolean,
  vip          boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.nombre, p.codigo_corto, pa.activo, pa.vip
    from pases pa
    join personas p on p.id = pa.persona_id
   where pa.token = p_token;
$$;

revoke execute on function pase_por_token(text) from public;
grant  execute on function pase_por_token(text) to anon, authenticated;

drop function if exists listar_pases();

create or replace function listar_pases()
returns table (
  codigo_corto      text,
  nombre            text,
  telefono          text,
  token             text,
  motivo            text,
  activo            boolean,
  creado_en         timestamptz,
  creado_por        text,
  revocado_en       timestamptz,
  motivo_revocacion text,
  cajas_entregadas  int,
  ultima_entrega    date,
  vip               boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('dar_pases');

  return query
  select p.codigo_corto,
         p.nombre,
         p.telefono,
         --  Lo necesita el panel para volver a mostrar su QR si lo perdio.
         pa.token,
         pa.motivo,
         pa.activo,
         pa.creado_en,
         u.email::text,
         pa.revocado_en,
         pa.motivo_revocacion,
         (select count(*)::int from entregas_pase e where e.pase_id = pa.id),
         (select max(e.fecha) from entregas_pase e where e.pase_id = pa.id),
         pa.vip
    from pases pa
    join personas p on p.id = pa.persona_id
    left join auth.users u on u.id = pa.creado_por
   order by pa.activo desc, p.nombre;
end;
$$;

revoke execute on function listar_pases() from public;
grant  execute on function listar_pases() to authenticated;

commit;
