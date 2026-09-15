-- ============================================================
--  Cajita de Bendicion - Equipo y accesos desde el panel
--
--  El pastor da y quita accesos, cambia roles y pone su codigo de
--  autorizacion desde el panel, sin entrar a Supabase.
--
--  Requiere haber corrido antes 2026-09-14-personal-con-google.sql.
--  Se puede repetir.
-- ============================================================

-- ============================================================
--  24. ADMINISTRAR AL EQUIPO DESDE EL PANEL
-- ============================================================
--  El pastor da y quita accesos desde el panel, sin entrar a Supabase.
--
--  Por dentro usa definir_personal() y definir_autorizador(), que siguen
--  funcionando en el SQL Editor para recuperar el acceso si algo sale mal.
--  Estas versiones del panel agregan un freno que el SQL Editor no tiene:
--  nadie se quita a si mismo el rol de admin, asi el panel nunca se queda
--  sin quien lo administre.

--  El equipo: quienes tienen cuenta con rol y los correos autorizados que
--  todavia no han entrado. Solo admin.
create or replace function listar_personal()
returns table (
  correo        text,
  rol           text,
  estado        text,
  ultimo_acceso timestamptz,
  es_yo         boolean,
  tiene_codigo  boolean
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
  select u.email::text,
         pe.rol,
         case when pe.activo then 'activo' else 'sin_acceso' end,
         u.last_sign_in_at,
         pe.usuario_id = auth.uid(),
         exists (select 1 from autorizadores a where a.usuario_id = pe.usuario_id and a.activo)
    from personal pe
    join auth.users u on u.id = pe.usuario_id
  union all
  select pp.correo,
         pp.rol,
         'pendiente',
         null::timestamptz,
         false,
         false
    from personal_pendiente pp
   order by 3, 2, 1;
end;
$$;

revoke execute on function listar_personal() from public;
grant  execute on function listar_personal() to authenticated;


--  Da acceso o cambia el rol. Si la persona no ha entrado nunca, queda
--  pendiente hasta que entre con Google (seccion 23).
create or replace function guardar_personal(p_correo text, p_rol text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  perform exigir_rol(array['admin']);

  select u.id into v_usuario from auth.users u where lower(u.email) = v_correo;

  if v_usuario = auth.uid() and p_rol is distinct from 'admin' then
    raise exception 'NO_PUEDES_QUITARTE_ADMIN';
  end if;

  --  definir_personal revisa el rol y el correo, y hace el trabajo.
  return definir_personal(v_correo, p_rol);
end;
$$;

revoke execute on function guardar_personal(text, text) from public;
grant  execute on function guardar_personal(text, text) to authenticated;


--  Quita el acceso. A una cuenta la desactiva (no la borra: queda el
--  historial de quien anoto y escaneo); a un correo pendiente le quita la
--  autorizacion. Tambien apaga su codigo de autorizacion.
create or replace function quitar_acceso_personal(p_correo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  perform exigir_rol(array['admin']);

  delete from personal_pendiente where correo = v_correo;
  if found then
    return 'AUTORIZACION_QUITADA';
  end if;

  select u.id into v_usuario from auth.users u where lower(u.email) = v_correo;

  if v_usuario is null
     or not exists (select 1 from personal pe where pe.usuario_id = v_usuario and pe.activo) then
    raise exception 'PERSONAL_NO_EXISTE';
  end if;

  if v_usuario = auth.uid() then
    raise exception 'NO_PUEDES_QUITARTE_ADMIN';
  end if;

  update personal
     set activo = false, actualizado_en = now()
   where usuario_id = v_usuario;

  update autorizadores
     set activo = false, actualizado_en = now()
   where usuario_id = v_usuario;

  return 'ACCESO_QUITADO';
end;
$$;

revoke execute on function quitar_acceso_personal(text) from public;
grant  execute on function quitar_acceso_personal(text) to authenticated;


--  El admin pone o cambia SU PROPIO codigo de autorizacion: el que le pide
--  un voluntario para entregar una cita de otra fecha. Se guarda cifrado.
create or replace function definir_mi_codigo_autorizacion(p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo text;
begin
  perform exigir_rol(array['admin']);

  select u.email into v_correo from auth.users u where u.id = auth.uid();

  return definir_autorizador(v_correo, p_codigo);
end;
$$;

revoke execute on function definir_mi_codigo_autorizacion(text) from public;
grant  execute on function definir_mi_codigo_autorizacion(text) to authenticated;
