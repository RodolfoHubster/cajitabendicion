-- ============================================================
--  Cajita de Bendicion - Personal que entra con Google
--
--  Permite autorizar el correo de alguien del personal ANTES de que entre
--  por primera vez con Google: el rol se aplica solo al crearse su cuenta.
--
--  Se puede repetir.
--
--  Despues, para el pastor:
--    select definir_personal('correo-del-pastor@gmail.com', 'admin');
-- ============================================================

-- ============================================================
--  23. PERSONAL QUE ENTRA CON GOOGLE
-- ============================================================
--  El personal puede entrar al panel con su cuenta de Google (el publico
--  sigue sin cuenta en la V1). Google solo confirma quien es; el permiso lo
--  sigue dando la tabla personal.
--
--  Con Google, la cuenta no existe hasta la primera vez que la persona
--  entra. Para no obligar al pastor a entrar, ver "sin acceso" y esperar a
--  que alguien corra definir_personal(), su correo se autoriza ANTES: queda
--  aqui pendiente y el rol se aplica solo en cuanto entra.

create table if not exists personal_pendiente (
  correo    text primary key,
  rol       text not null check (rol in ('admin', 'voluntario')),
  creado_en timestamptz not null default now()
);

alter table personal_pendiente enable row level security;


--  Al crearse una cuenta, si su correo estaba autorizado, se le da su rol.
--
--  SOLO si la cuenta se creo entrando con Google, que ya comprobo que el
--  correo es de esa persona. Una cuenta de correo y contrasena con el mismo
--  correo NO recibe el rol: si en Supabase estuviera apagada la confirmacion
--  de correo, cualquiera podria registrarse con el correo del pastor y
--  quedarse con el panel. Esas cuentas se asignan a mano con definir_personal.
create or replace function aplicar_personal_pendiente()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_rol text;
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google'
     or new.email_confirmed_at is null
     or new.email is null then
    return new;
  end if;

  select p.rol into v_rol
    from personal_pendiente p
   where p.correo = lower(new.email);

  if v_rol is not null then
    insert into personal (usuario_id, rol, activo)
    values (new.id, v_rol, true)
    on conflict (usuario_id) do update
       set rol            = excluded.rol,
           activo         = true,
           actualizado_en = now();

    delete from personal_pendiente where correo = lower(new.email);
  end if;

  return new;

exception
  --  Un problema aqui nunca debe impedir que alguien entre: a lo mucho se
  --  queda sin rol y se le asigna a mano.
  when others then
    return new;
end;
$$;

revoke execute on function aplicar_personal_pendiente() from public, anon, authenticated;

drop trigger if exists al_crear_cuenta_aplicar_personal on auth.users;
create trigger al_crear_cuenta_aplicar_personal
  after insert on auth.users
  for each row execute function aplicar_personal_pendiente();


--  definir_personal (seccion 20) ahora deja pendiente el rol si la cuenta
--  todavia no existe.
create or replace function definir_personal(p_correo text, p_rol text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  if p_rol not in ('admin', 'voluntario') then
    raise exception 'ROL_INVALIDO: usa admin o voluntario';
  end if;

  if v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'CORREO_INVALIDO: revisa como esta escrito el correo';
  end if;

  select id into v_usuario
    from auth.users
   where lower(email) = v_correo;

  --  Todavia no tiene cuenta (va a entrar con Google por primera vez): el
  --  correo queda autorizado y el rol se aplica solo al entrar (seccion 23).
  if v_usuario is null then
    insert into personal_pendiente (correo, rol)
    values (v_correo, p_rol)
    on conflict (correo) do update
       set rol       = excluded.rol,
           creado_en = now();

    return 'PENDIENTE: ' || v_correo || ' sera ' || p_rol || ' en cuanto entre con Google';
  end if;

  insert into personal (usuario_id, rol, activo)
  values (v_usuario, p_rol, true)
  on conflict (usuario_id) do update
     set rol            = excluded.rol,
         activo         = true,
         actualizado_en = now();

  delete from personal_pendiente where correo = v_correo;

  return 'PERSONAL_LISTO: ' || p_rol;
end;
$$;

--  Solo desde el SQL Editor.
revoke execute on function definir_personal(text, text) from public, anon, authenticated;
