-- ============================================================
--  Cajita de Bendicion - Voluntarios: telefono y correo, envio de la
--  credencial y quien los atiende (seccion 49)
--
--  * voluntarios.telefono y voluntarios.correo, por separado. Los que ya
--    estaban en "contacto" se separan solos (si alguno no se puede, se
--    queda como estaba y la pantalla lo ensena para corregirlo).
--  * credenciales_enviadas y marcar_credencial_enviada(): por donde,
--    cuando y quien le mando su credencial.
--  * personal.atiende_voluntarios y guardar_atiende_voluntarios(): quien
--    escanea y registra voluntarios sin ser administrador (Equipo y accesos).
--  * cerrar_dia_voluntarios(), historial_de_credencial().
--  * Cambian registrar_voluntario(), editar_voluntario(), listar_voluntarios(),
--    credencial_voluntario(), nuevo_qr_voluntario(), marcar_asistencia(),
--    deshacer_asistencia(), asistencias_del_dia(), mis_permisos() y
--    listar_personal().
--
--  Requiere la del 20 de octubre (voluntarios). No toca citas ni cupos: se
--  puede correr aunque este la entrega. Correrla ANTES de subir las
--  pantallas nuevas. Se puede repetir.
-- ============================================================

begin;

alter table voluntarios add column if not exists telefono         text;
alter table voluntarios add column if not exists correo           text;
alter table voluntarios add column if not exists credencial_desde timestamptz not null default now();

--  Pedido del 23 de octubre de 2026:
--
--  * Telefono y correo por separado (antes, un solo "contacto"). El
--    telefono va con lada ("+16195550101"), listo para WhatsApp.
--  * La credencial se manda uno por uno desde el telefono de quien la
--    manda (WhatsApp o correo, con el mensaje ya escrito), igual que las
--    invitaciones de "sin cita": nada se manda solo. Al confirmar que se
--    envio, queda anotado por donde, cuando y quien (credenciales_enviadas).
--    Al cambiarle el QR, lo enviado antes ya no cuenta.
--  * "Atiende voluntarios": un ajuste POR PERSONA en Equipo y accesos (no
--    una palomita de Permisos, que vale para todos los voluntarios a la
--    vez). Quien lo tiene escanea su entrada y salida, los registra, les
--    corrige el nombre o el contacto, les manda su credencial y cierra el
--    dia. Dar de baja, cambiar el QR, ver y corregir horas siguen siendo
--    solo del administrador.
--  * Cerrar el dia: marcar la salida, a una hora, de quienes siguen adentro.
--  * Con el enlace de su credencial, el voluntario ve sus horas.

alter table personal add column if not exists atiende_voluntarios boolean not null default false;

--  Admin, o voluntario con "atiende voluntarios" prendido.
create or replace function exigir_atender_voluntarios()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rol     text;
  v_atiende boolean;
begin
  if auth.uid() is null then
    raise exception 'SIN_SESION' using errcode = '42501';
  end if;

  select pe.rol, pe.atiende_voluntarios into v_rol, v_atiende
    from personal pe
   where pe.usuario_id = auth.uid()
     and pe.activo;

  if v_rol = 'admin' or (v_rol = 'voluntario' and v_atiende) then
    return v_rol;
  end if;

  raise exception 'SIN_PERMISO' using errcode = '42501';
end;
$$;

revoke execute on function exigir_atender_voluntarios() from public, anon, authenticated;


--  El telefono y el correo, revisados. p_telefono ya viene con lada desde
--  la pantalla. p_contacto: como se mandaba antes (seccion 48), todo junto;
--  si trae "@" es correo, si no, telefono (10 digitos: +52 si empieza con
--  664 o 665, Tijuana y Tecate; si no, +1).
create or replace function contacto_de_voluntario(p_contacto text, p_telefono text, p_correo text)
returns table (telefono text, correo text)
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v_tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9+]', '', 'g'), '');
  v_cor text := nullif(lower(trim(coalesce(p_correo, ''))), '');
  v_txt text := nullif(trim(coalesce(p_contacto, '')), '');
  v_dig text;
begin
  if v_tel is null and v_cor is null and v_txt is not null then
    if v_txt like '%@%' then
      v_cor := lower(v_txt);
    else
      v_dig := regexp_replace(v_txt, '\D', '', 'g');
      v_tel := case
                 when char_length(v_dig) = 10 then (case when v_dig ~ '^66[45]' then '+52' else '+1' end) || v_dig
                 when char_length(v_dig) between 11 and 15 then '+' || v_dig
               end;
      if v_tel is null then
        raise exception 'TELEFONO_INVALIDO';
      end if;
    end if;
  end if;

  if v_tel is not null and v_tel !~ '^\+[0-9]{8,15}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  if v_cor is not null and (char_length(v_cor) > 120 or v_cor !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'CORREO_INVALIDO';
  end if;

  return query select v_tel, v_cor;
end;
$$;

revoke execute on function contacto_de_voluntario(text, text, text) from public, anon, authenticated;


--  Por donde, cuando y quien le mando su credencial.
create table if not exists credenciales_enviadas (
  id            bigint generated always as identity primary key,
  voluntario_id uuid not null references voluntarios(id) on delete restrict,
  --  whatsapp o correo, o impresa (se la dieron en papel).
  medio         text not null check (medio in ('whatsapp', 'correo', 'impresa')),
  enviada_en    timestamptz not null default now(),
  enviada_por   uuid
);

create index if not exists idx_credenciales_enviadas on credenciales_enviadas (voluntario_id, enviada_en);
alter table credenciales_enviadas enable row level security;

--  Lo anota quien la mando, al confirmar que si se envio. Desde una pagina
--  no se puede saber si el mensaje salio: por eso lo confirma una persona.
create or replace function marcar_credencial_enviada(p_voluntario uuid, p_medio text)
returns timestamp
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_en timestamptz;
begin
  perform exigir_atender_voluntarios();

  if p_medio is null or p_medio not in ('whatsapp', 'correo', 'impresa') then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if not exists (select 1 from voluntarios v where v.id = p_voluntario) then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  insert into credenciales_enviadas (voluntario_id, medio, enviada_por)
  values (p_voluntario, p_medio, auth.uid())
  returning enviada_en into v_en;

  return v_en at time zone 'America/Los_Angeles';
end;
$$;

revoke execute on function marcar_credencial_enviada(uuid, text) from public, anon;
grant  execute on function marcar_credencial_enviada(uuid, text) to authenticated;


--  Cerrar el dia: la salida, a la hora que se diga (hora de San Diego; sin
--  hora, ahora mismo), de quienes entraron hoy y siguen adentro. Quien
--  entro despues de esa hora se queda adentro. Devuelve cuantos salieron.
create or replace function cerrar_dia_voluntarios(p_hora time default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_salida timestamptz := coalesce((current_date + p_hora) at time zone 'America/Los_Angeles', now());
  v_cuantos int;
begin
  perform exigir_atender_voluntarios();

  if v_salida > now() then
    raise exception 'HORA_FUTURA';
  end if;

  update asistencias_voluntarios a
     set salida_en  = v_salida,
         salida_por = auth.uid(),
         estado     = 'salio'
   where a.estado = 'dentro'
     and (a.entrada_en at time zone 'America/Los_Angeles')::date = current_date
     and a.entrada_en < v_salida;

  get diagnostics v_cuantos = row_count;
  return v_cuantos;
end;
$$;

revoke execute on function cerrar_dia_voluntarios(time) from public, anon;
grant  execute on function cerrar_dia_voluntarios(time) to authenticated;


--  Con el enlace de su credencial, el voluntario ve sus ultimas 30 visitas
--  completas (las que suman horas). Quien tiene el enlace es el dueno.
create or replace function historial_de_credencial(p_token text)
returns table (fecha date, entrada timestamp, salida timestamp, minutos int)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select (a.entrada_en at time zone 'America/Los_Angeles')::date,
         a.entrada_en at time zone 'America/Los_Angeles',
         a.salida_en at time zone 'America/Los_Angeles',
         floor(extract(epoch from a.salida_en - a.entrada_en) / 60)::int
    from asistencias_voluntarios a
    join voluntarios v on v.id = a.voluntario_id
   where v.token = lower(trim(coalesce(p_token, '')))
     and a.estado = 'salio'
   order by a.entrada_en desc
   limit 30;
$$;

revoke execute on function historial_de_credencial(text) from public;
grant  execute on function historial_de_credencial(text) to anon, authenticated;


--  Prender o apagar "atiende voluntarios" a alguien del equipo. Solo el
--  administrador, como todo lo de Equipo y accesos.
create or replace function guardar_atiende_voluntarios(p_correo text, p_activo boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_correo  text := lower(trim(coalesce(p_correo, '')));
  v_usuario uuid;
begin
  perform exigir_rol(array['admin']);

  update personal pe
     set atiende_voluntarios = coalesce(p_activo, false),
         actualizado_en      = now()
    from auth.users u
   where u.id = pe.usuario_id
     and lower(u.email) = v_correo
  returning pe.usuario_id into v_usuario;

  if v_usuario is null then
    raise exception 'PERSONAL_NO_EXISTE';
  end if;

  return coalesce(p_activo, false);
end;
$$;

revoke execute on function guardar_atiende_voluntarios(text, boolean) from public, anon;
grant  execute on function guardar_atiende_voluntarios(text, boolean) to authenticated;


--  Separar lo que ya estaba en "contacto". El que no se pueda, se queda.
do $separar$
declare
  r record;
begin
  for r in select v.id, v.contacto from voluntarios v
            where v.contacto is not null and v.telefono is null and v.correo is null loop
    begin
      update voluntarios v
         set telefono = c.telefono, correo = c.correo
        from contacto_de_voluntario(r.contacto, null, null) c
       where v.id = r.id;
    exception when others then
      null;
    end;
  end loop;
end
$separar$;


--  p_telefono (con lada) y p_correo, los dos opcionales (seccion 49).
--  p_contacto: como se llamaba antes, todo junto; se separa solo.
drop function if exists registrar_voluntario(text, text);

create or replace function registrar_voluntario(
  p_nombre   text,
  p_contacto text default null,
  p_telefono text default null,
  p_correo   text default null
)
returns table (id uuid, nombre text, token text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_vol voluntarios;
  v_tel text;
  v_cor text;
begin
  perform exigir_atender_voluntarios();

  select c.telefono, c.correo into v_tel, v_cor
    from contacto_de_voluntario(p_contacto, p_telefono, p_correo) c;

  insert into voluntarios (nombre, telefono, correo, token, creado_por)
  values (limpiar_nombre_voluntario(p_nombre),
          v_tel,
          v_cor,
          'vol' || encode(gen_random_bytes(24), 'hex'),
          auth.uid())
  returning * into v_vol;

  return query select v_vol.id, v_vol.nombre, v_vol.token;
end;
$$;

revoke execute on function registrar_voluntario(text, text, text, text) from public, anon;
grant  execute on function registrar_voluntario(text, text, text, text) to authenticated;


--  Cambiar el nombre, el telefono o el correo (seccion 49: por separado;
--  p_contacto, como antes, todo junto).
drop function if exists editar_voluntario(uuid, text, text);

create or replace function editar_voluntario(
  p_id       uuid,
  p_nombre   text,
  p_contacto text default null,
  p_telefono text default null,
  p_correo   text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_tel text;
  v_cor text;
begin
  perform exigir_atender_voluntarios();

  select c.telefono, c.correo into v_tel, v_cor
    from contacto_de_voluntario(p_contacto, p_telefono, p_correo) c;

  update voluntarios v
     set nombre         = limpiar_nombre_voluntario(p_nombre),
         telefono       = v_tel,
         correo         = v_cor,
         contacto       = null,
         actualizado_en = now()
   where v.id = p_id;

  if not found then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  return 'GUARDADO';
end;
$$;

revoke execute on function editar_voluntario(uuid, text, text, text, text) from public, anon;
grant  execute on function editar_voluntario(uuid, text, text, text, text) to authenticated;


--  Todos, los activos primero. dentro_desde: si hoy esta adentro, desde
--  cuando. sin_salida: cuantas veces se fue sin marcar y falta corregir.
--  Seccion 49: telefono y correo por separado (contacto_viejo: lo de antes
--  que no se pudo separar), cuando se registro y la ultima vez que se le
--  mando su credencial actual (enviada_en, enviada_medio).
drop function if exists listar_voluntarios();

create or replace function listar_voluntarios()
returns table (
  id             uuid,
  nombre         text,
  telefono       text,
  correo         text,
  contacto_viejo text,
  token          text,
  activo         boolean,
  creado_en      timestamp,
  dentro_desde   timestamp,
  ultima_entrada timestamp,
  sin_salida     int,
  enviada_en     timestamp,
  enviada_medio  text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_atender_voluntarios();

  return query
  select v.id, v.nombre, v.telefono, v.correo,
         case when v.telefono is null and v.correo is null then v.contacto end,
         v.token, v.activo,
         v.creado_en at time zone 'America/Los_Angeles',
         (select a.entrada_en at time zone 'America/Los_Angeles'
            from asistencias_voluntarios a
           where a.voluntario_id = v.id and a.estado = 'dentro'
             and (a.entrada_en at time zone 'America/Los_Angeles')::date = current_date),
         (select max(a.entrada_en) at time zone 'America/Los_Angeles'
            from asistencias_voluntarios a
           where a.voluntario_id = v.id and a.estado <> 'anulada'),
         (select count(*)::int
            from asistencias_voluntarios a
           where a.voluntario_id = v.id
             and (a.estado = 'sin_salida'
                  or (a.estado = 'dentro' and (a.entrada_en at time zone 'America/Los_Angeles')::date < current_date))),
         env.enviada_en at time zone 'America/Los_Angeles',
         env.medio
    from voluntarios v
    left join lateral (
      select e.enviada_en, e.medio
        from credenciales_enviadas e
       where e.voluntario_id = v.id and e.enviada_en >= v.credencial_desde
       order by e.enviada_en desc
       limit 1
    ) env on true
   order by v.activo desc, v.nombre;
end;
$$;

revoke execute on function listar_voluntarios() from public, anon;
grant  execute on function listar_voluntarios() to authenticated;


--  Lo que ve el voluntario con el enlace de su credencial: su nombre y, desde
--  la seccion 49, cuantos dias vino y cuantos minutos suma (solo las
--  completas). Quien tiene el enlace es el dueno, como con los pases.
drop function if exists credencial_voluntario(text);

create or replace function credencial_voluntario(p_token text)
returns table (nombre text, activo boolean, dias int, minutos int)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select v.nombre, v.activo,
         (select count(distinct (a.entrada_en at time zone 'America/Los_Angeles')::date)::int
            from asistencias_voluntarios a where a.voluntario_id = v.id and a.estado = 'salio'),
         (select coalesce(sum(floor(extract(epoch from a.salida_en - a.entrada_en) / 60)), 0)::int
            from asistencias_voluntarios a where a.voluntario_id = v.id and a.estado = 'salio')
    from voluntarios v
   where v.token = lower(trim(coalesce(p_token, '')));
$$;

revoke execute on function credencial_voluntario(text) from public;
grant  execute on function credencial_voluntario(text) to anon, authenticated;


create or replace function nuevo_qr_voluntario(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_token text;
begin
  perform exigir_rol(array['admin']);

  update voluntarios v
     set token = 'vol' || encode(gen_random_bytes(24), 'hex'), credencial_desde = now(), actualizado_en = now()
   where v.id = p_id
  returning v.token into v_token;

  if v_token is null then
    raise exception 'VOLUNTARIO_NO_EXISTE';
  end if;

  return v_token;
end;
$$;

revoke execute on function nuevo_qr_voluntario(uuid) from public, anon;
grant  execute on function nuevo_qr_voluntario(uuid) to authenticated;


create or replace function marcar_asistencia(p_token text default null, p_voluntario uuid default null)
returns table (
  resultado     text,
  asistencia_id bigint,
  voluntario_id uuid,
  nombre        text,
  entrada_en    timestamp,
  salida_en     timestamp,
  minutos       int,
  olvido        date
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
declare
  v_vol     voluntarios;
  v_abierta asistencias_voluntarios;
  v_ultima  asistencias_voluntarios;
  v_olvido  date;
begin
  perform exigir_atender_voluntarios();

  --  Bloquear al voluntario: dos escaneos al mismo tiempo van en fila.
  select * into v_vol
    from voluntarios v
   where (p_voluntario is not null and v.id = p_voluntario)
      or (p_voluntario is null and v.token = lower(trim(coalesce(p_token, ''))))
     for update;

  if v_vol.id is null then
    return query select 'NO_EXISTE'::text, null::bigint, null::uuid, null::text,
                        null::timestamp, null::timestamp, null::int, null::date;
    return;
  end if;

  if not v_vol.activo then
    return query select 'INACTIVO'::text, null::bigint, v_vol.id, v_vol.nombre,
                        null::timestamp, null::timestamp, null::int, null::date;
    return;
  end if;

  select * into v_abierta
    from asistencias_voluntarios a
   where a.voluntario_id = v_vol.id and a.estado = 'dentro';

  --  Una entrada de otro dia: se fue sin marcar salida. Queda para corregir.
  if v_abierta.id is not null and (v_abierta.entrada_en at time zone 'America/Los_Angeles')::date < current_date then
    update asistencias_voluntarios a set estado = 'sin_salida' where a.id = v_abierta.id;
    v_olvido := (v_abierta.entrada_en at time zone 'America/Los_Angeles')::date;
    v_abierta := null;
  end if;

  if v_abierta.id is not null then
    if v_abierta.entrada_en > now() - interval '2 minutes' then
      return query select 'YA_ENTRO'::text, v_abierta.id, v_vol.id, v_vol.nombre,
                          v_abierta.entrada_en at time zone 'America/Los_Angeles',
                          null::timestamp, null::int, null::date;
      return;
    end if;

    update asistencias_voluntarios a
       set salida_en = now(), salida_por = auth.uid(), estado = 'salio'
     where a.id = v_abierta.id
    returning * into v_abierta;

    return query select 'SALIDA'::text, v_abierta.id, v_vol.id, v_vol.nombre,
                        v_abierta.entrada_en at time zone 'America/Los_Angeles',
                        v_abierta.salida_en at time zone 'America/Los_Angeles',
                        floor(extract(epoch from v_abierta.salida_en - v_abierta.entrada_en) / 60)::int,
                        null::date;
    return;
  end if;

  --  Acaba de salir: es el mismo telefono leido otra vez.
  select * into v_ultima
    from asistencias_voluntarios a
   where a.voluntario_id = v_vol.id and a.estado = 'salio'
     and a.salida_en > now() - interval '2 minutes'
   order by a.salida_en desc
   limit 1;

  if v_ultima.id is not null then
    return query select 'YA_SALIO'::text, v_ultima.id, v_vol.id, v_vol.nombre,
                        v_ultima.entrada_en at time zone 'America/Los_Angeles',
                        v_ultima.salida_en at time zone 'America/Los_Angeles',
                        floor(extract(epoch from v_ultima.salida_en - v_ultima.entrada_en) / 60)::int,
                        null::date;
    return;
  end if;

  insert into asistencias_voluntarios (voluntario_id, entrada_por)
  values (v_vol.id, auth.uid())
  returning * into v_abierta;

  return query select 'ENTRADA'::text, v_abierta.id, v_vol.id, v_vol.nombre,
                      v_abierta.entrada_en at time zone 'America/Los_Angeles',
                      null::timestamp, null::int, v_olvido;
end;
$$;

revoke execute on function marcar_asistencia(text, uuid) from public, anon;
grant  execute on function marcar_asistencia(text, uuid) to authenticated;


create or replace function deshacer_asistencia(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_a asistencias_voluntarios;
begin
  perform exigir_atender_voluntarios();

  select * into v_a from asistencias_voluntarios a where a.id = p_id for update;

  if v_a.id is null then
    raise exception 'ASISTENCIA_NO_EXISTE';
  end if;

  if v_a.estado = 'salio' and v_a.corregida_en is null and v_a.salida_en > now() - interval '2 minutes'
     and not exists (select 1 from asistencias_voluntarios a
                      where a.voluntario_id = v_a.voluntario_id and a.estado = 'dentro') then
    update asistencias_voluntarios a
       set salida_en = null, salida_por = null, estado = 'dentro'
     where a.id = p_id;
    return 'SALIDA_DESHECHA';
  end if;

  if v_a.estado = 'dentro' and v_a.entrada_en > now() - interval '2 minutes' then
    delete from asistencias_voluntarios a where a.id = p_id;
    return 'ENTRADA_DESHECHA';
  end if;

  raise exception 'FUERA_DE_PLAZO';
end;
$$;

revoke execute on function deshacer_asistencia(bigint) from public, anon;
grant  execute on function deshacer_asistencia(bigint) to authenticated;


create or replace function asistencias_del_dia(p_fecha date default null)
returns table (
  id            bigint,
  voluntario_id uuid,
  nombre        text,
  entrada       timestamp,
  salida        timestamp,
  minutos       int,
  estado        text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_atender_voluntarios();

  return query
  select a.id, v.id, v.nombre,
         a.entrada_en at time zone 'America/Los_Angeles',
         a.salida_en at time zone 'America/Los_Angeles',
         floor(extract(epoch from a.salida_en - a.entrada_en) / 60)::int,
         a.estado
    from asistencias_voluntarios a
    join voluntarios v on v.id = a.voluntario_id
   where (a.entrada_en at time zone 'America/Los_Angeles')::date = coalesce(p_fecha, current_date)
     and a.estado <> 'anulada'
   order by a.entrada_en;
end;
$$;

revoke execute on function asistencias_del_dia(date) from public, anon;
grant  execute on function asistencias_del_dia(date) to authenticated;


create or replace function mis_permisos()
returns table (
  clave  text,
  activo boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_rol text;
begin
  v_rol := exigir_rol(array['admin', 'voluntario']);

  --  Seccion 49: "atender_voluntarios" no es una palomita de todos: es de
  --  cada persona (Equipo y accesos). Se manda aqui para que el panel la
  --  trate igual que las demas.
  return query
  select p.clave, case when v_rol = 'admin' then true else p.activo end
    from permisos p
  union all
  select 'atender_voluntarios'::text,
         v_rol = 'admin'
         or coalesce((select pe.atiende_voluntarios from personal pe
                       where pe.usuario_id = auth.uid() and pe.activo), false)
   order by 1;
end;
$$;

revoke execute on function mis_permisos() from public;
grant  execute on function mis_permisos() to authenticated;


drop function if exists listar_personal();

create or replace function listar_personal()
returns table (
  correo        text,
  rol           text,
  estado        text,
  ultimo_acceso timestamptz,
  es_yo         boolean,
  tiene_codigo  boolean,
  fila          text,
  --  Seccion 49: escanea y registra voluntarios sin ser administrador.
  atiende_voluntarios boolean
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
         exists (select 1 from autorizadores a where a.usuario_id = pe.usuario_id and a.activo),
         pe.fila,
         pe.atiende_voluntarios
    from personal pe
    join auth.users u on u.id = pe.usuario_id
  union all
  select pp.correo,
         pp.rol,
         'pendiente',
         null::timestamptz,
         false,
         false,
         'ambas'::text,
         false
    from personal_pendiente pp
   order by 3, 2, 1;
end;
$$;


revoke execute on function listar_personal() from public;
grant  execute on function listar_personal() to authenticated;

commit;
