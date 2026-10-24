-- ============================================================
--  Cajita de Bendicion - Mandar la credencial por SMS (seccion 49)
--
--  Algunos voluntarios no tienen WhatsApp: su credencial tambien se les
--  manda por mensaje de texto, desde el telefono de quien la manda, y se
--  anota igual (credenciales_enviadas.medio = 'sms').
--
--  * credenciales_enviadas acepta "sms".
--  * marcar_credencial_enviada() acepta "sms".
--  * listar_voluntarios(): si se anotaron dos envios al mismo tiempo, cuenta
--    el ultimo que se anoto.
--
--  Requiere la del 23 de octubre. No toca citas ni cupos. Correrla antes de
--  subir la pantalla nueva. Se puede repetir.
-- ============================================================

begin;

alter table credenciales_enviadas drop constraint if exists credenciales_enviadas_medio_check;
alter table credenciales_enviadas add constraint credenciales_enviadas_medio_check
  check (medio in ('whatsapp', 'sms', 'correo', 'impresa'));


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

  if p_medio is null or p_medio not in ('whatsapp', 'sms', 'correo', 'impresa') then
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
       order by e.enviada_en desc, e.id desc
       limit 1
    ) env on true
   order by v.activo desc, v.nombre;
end;
$$;

revoke execute on function listar_voluntarios() from public, anon;
grant  execute on function listar_voluntarios() to authenticated;

commit;
