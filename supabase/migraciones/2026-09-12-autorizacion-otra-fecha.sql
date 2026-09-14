-- ============================================================
--  Cajita de Bendicion - Autorizar entregas de otra fecha
--  Correr sobre la base que ya existe. Se puede repetir.
--
--  Despues, dar de alta a quien puede autorizar:
--    select definir_autorizador('correo@de-la-cuenta.com', 'codigo-personal');
-- ============================================================

-- ============================================================
--  19. AUTORIZAR UNA ENTREGA DE OTRA FECHA
-- ============================================================
--  A veces el administrador decide entregar a alguien cuya cita era de
--  otro dia: llego un dia antes, o se le paso la fecha. Se permite, pero
--  solo con el codigo personal de quien autoriza, y queda en la bitacora
--  quien lo autorizo.
--
--  Solo se salta la FECHA. Lo demas no se negocia: un codigo ya usado
--  sigue siendo YA_USADO y una cita cancelada sigue sin proceder.
--  1 QR = 1 caja.

--  Quien puede autorizar. Se da de alta desde el SQL Editor con
--  definir_autorizador(): un voluntario no puede darse de alta a si mismo.
--  El codigo se guarda cifrado con bcrypt, nunca en claro.
create table if not exists autorizadores (
  usuario_id     uuid primary key references auth.users(id) on delete cascade,
  codigo_hash    text not null,
  activo         boolean not null default true,
  actualizado_en timestamptz not null default now()
);

alter table autorizadores enable row level security;

--  Intentos de autorizacion, para frenar a quien quiera adivinar un codigo.
create table if not exists intentos_autorizacion (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  exitoso    boolean not null,
  creado_en  timestamptz not null default now()
);

alter table intentos_autorizacion enable row level security;

create index if not exists idx_intentos_autorizacion
  on intentos_autorizacion (usuario_id, creado_en);

--  Quien autorizo cada entrega fuera de fecha. Nulo en las entregas normales.
alter table escaneos add column if not exists autorizado_por uuid;


--  Da de alta (o cambia el codigo de) una persona que puede autorizar.
--
--  Uso, en el SQL Editor:
--    select definir_autorizador('pastor@correo.com', 'su-codigo-personal');
--
--  Para quitarle el permiso:
--    update autorizadores set activo = false
--     where usuario_id = (select id from auth.users where email = 'pastor@correo.com');
create or replace function definir_autorizador(p_correo text, p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_usuario uuid;
begin
  if length(coalesce(p_codigo, '')) < 6 then
    raise exception 'CODIGO_MUY_CORTO: el codigo debe tener al menos 6 caracteres';
  end if;

  select id into v_usuario
    from auth.users
   where lower(email) = lower(trim(p_correo));

  if v_usuario is null then
    raise exception 'USUARIO_NO_EXISTE: primero crea la cuenta en Authentication';
  end if;

  insert into autorizadores (usuario_id, codigo_hash, activo, actualizado_en)
  values (v_usuario, crypt(p_codigo, gen_salt('bf')), true, now())
  on conflict (usuario_id) do update
     set codigo_hash    = excluded.codigo_hash,
         activo         = true,
         actualizado_en = now();

  return 'AUTORIZADOR_LISTO';
end;
$$;

--  Solo desde el SQL Editor. No se otorga a nadie mas.
revoke execute on function definir_autorizador(text, text) from public, anon, authenticated;


--  Registra la entrega de una cita de otra fecha, con codigo de autorizacion.
create or replace function registrar_entrega_autorizada(p_token text, p_codigo text)
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
  v_usuario     uuid := auth.uid();
  v_autorizador uuid;
  v_fallidos    int;
  v_cita        citas;
  v_persona     personas;
  v_bloque      bloques;
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  -- Freno contra adivinar: 5 intentos fallidos en 15 minutos dejan a esa
  -- cuenta sin poder intentar durante otros 15. Sin esto, un codigo de 6
  -- caracteres se prueba por fuerza bruta en poco tiempo.
  select count(*) into v_fallidos
    from intentos_autorizacion
   where usuario_id = v_usuario
     and not exitoso
     and creado_en > now() - interval '15 minutes';

  if v_fallidos >= 5 then
    return query select 'BLOQUEADO'::text, null::text, null::text, null::time;
    return;
  end if;

  select a.usuario_id into v_autorizador
    from autorizadores a
   where a.activo
     and a.codigo_hash = crypt(coalesce(p_codigo, ''), a.codigo_hash)
   limit 1;

  if v_autorizador is null then
    -- Se registra y se RESPONDE (no se lanza error): un error desharia el
    -- registro del intento fallido y el freno nunca se activaria.
    insert into intentos_autorizacion (usuario_id, exitoso) values (v_usuario, false);
    return query select 'CODIGO_INVALIDO'::text, null::text, null::text, null::time;
    return;
  end if;

  insert into intentos_autorizacion (usuario_id, exitoso) values (v_usuario, true);

  -- Mismo candado de fila que registrar_entrega(): dos escaneos
  -- simultaneos del mismo codigo no pueden entregar dos cajas.
  select * into v_cita
    from citas
   where token_qr = p_token
     for update;

  if not found then
    return query select 'NO_EXISTE'::text, null::text, null::text, null::time;
    return;
  end if;

  select * into v_persona from personas where id = v_cita.persona_id;
  select * into v_bloque  from bloques  where id = v_cita.bloque_id;

  if v_cita.estado = 'entregada' then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'YA_USADO');

    return query select 'YA_USADO'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  if v_cita.estado = 'cancelada' then
    return query select 'CANCELADA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  update citas
     set estado   = 'entregada',
         usado_en = now()
   where id = v_cita.id;

  insert into escaneos (cita_id, usuario_id, resultado, autorizado_por)
  values (v_cita.id, v_usuario, 'VALIDO_AUTORIZADO', v_autorizador);

  return query select 'VALIDO_AUTORIZADO'::text, v_persona.nombre,
                      v_persona.codigo_corto, v_bloque.hora;
end;
$$;

revoke execute on function registrar_entrega_autorizada(text, text) from public;
grant  execute on function registrar_entrega_autorizada(text, text) to authenticated;


