-- ============================================================
--  Cajita de Bendicion - Cancelar cita, "entro sin cita" y excepcion
--  de segunda cita en la semana
--
--  Requiere haber corrido antes 2026-09-12-nombre-y-telefono.sql.
--  Se puede repetir.
--
--  Despues, para revisar todas las reglas: supabase/pruebas/reglas.sql
-- ============================================================

-- ============================================================
--  22. CANCELAR, ENTRO SIN CITA Y EXCEPCION SEMANAL
-- ============================================================
--  Tres reglas del Pastor David que completan la V1:
--    * Cancelar una cita libera el lugar al momento y deja reagendar esa
--      semana. La persona cancela desde su enlace; el admin, desde el panel.
--    * "Entro sin cita" suma uno al conteo del dia. No guarda nombre ni
--      telefono; guarda quien lo anoto y a que hora.
--    * Una segunda cita en la misma semana solo con autorizacion del admin,
--      guardando el motivo y quien la autorizo.

--  Quien cancelo, cuando y por que. cancelada_por nulo: la propia persona.
alter table citas add column if not exists cancelada_en       timestamptz;
alter table citas add column if not exists cancelada_por      uuid;
alter table citas add column if not exists motivo_cancelacion text;

--  Una cita autorizada como excepcion apunta a su autorizacion.
alter table citas add column if not exists excepcion_id uuid references excepciones(id);

--  La regla de una cita por semana (seccion 3) deja fuera las citas de
--  excepcion. Esas tienen su propio indice: UNA excepcion activa por persona
--  por semana. En total, como maximo dos citas esa semana, y la segunda
--  siempre autorizada.
drop index if exists una_cita_activa_por_semana;
create unique index una_cita_activa_por_semana
  on citas (persona_id, semana)
  where estado in ('reservada','llego','entregada') and excepcion_id is null;

create unique index if not exists una_excepcion_activa_por_semana
  on citas (persona_id, semana)
  where estado in ('reservada','llego','entregada') and excepcion_id is not null;


--  La persona cancela su propia cita desde /confirmacion/:token.
--
--  Tener el token es ser dueno de la cita: son 24 bytes al azar que solo
--  estan en su QR y en su enlace. El candado de fila es el mismo que usa el
--  escaneo: cancelar y escanear al mismo tiempo no pueden pasar los dos.
create or replace function cancelar_mi_cita(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita  citas;
  v_fecha date;
begin
  select * into v_cita from citas c where c.token_qr = p_token for update;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado = 'cancelada' then
    raise exception 'CITA_YA_CANCELADA';
  end if;

  if v_cita.estado in ('entregada', 'llego') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  select b.fecha into v_fecha from bloques b where b.id = v_cita.bloque_id;
  if v_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  update citas
     set estado        = 'cancelada',
         cancelada_en  = now(),
         cancelada_por = null
   where id = v_cita.id;

  return 'CANCELADA';
end;
$$;

revoke execute on function cancelar_mi_cita(text) from public;
grant  execute on function cancelar_mi_cita(text) to anon, authenticated;


--  El administrador cancela una cita desde Citas de hoy.
--
--  Se identifica con el codigo de la persona, la fecha y la hora, que es lo
--  que muestra la lista. Asi el token del QR no tiene que viajar al panel.
create or replace function cancelar_cita_panel(
  p_codigo text,
  p_fecha  date,
  p_hora   time,
  p_motivo text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_cita    citas;
begin
  perform exigir_rol(array['admin']);

  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')))
     and b.fecha = p_fecha
     and b.hora  = p_hora
     and c.estado <> 'cancelada'
   limit 1
     for update of c;

  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado in ('entregada', 'llego') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  update citas
     set estado             = 'cancelada',
         cancelada_en       = now(),
         cancelada_por      = v_usuario,
         motivo_cancelacion = nullif(trim(p_motivo), '')
   where id = v_cita.id;

  return 'CANCELADA';
end;
$$;

revoke execute on function cancelar_cita_panel(text, date, time, text) from public;
grant  execute on function cancelar_cita_panel(text, date, time, text) to authenticated;


--  "Entro sin cita": suma una persona al conteo de hoy. Devuelve el total.
--
--  Solo admin: CLAUDE.md pide que el boton nunca este al alcance del
--  publico ni de los voluntarios. No se guarda nombre ni telefono.
create or replace function registrar_entrada_sin_cita()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
begin
  perform exigir_rol(array['admin']);

  insert into entradas_sin_cita (fecha, registrado_por)
  values (current_date, v_usuario);

  return (select count(*)::int from entradas_sin_cita s where s.fecha = current_date);
end;
$$;

revoke execute on function registrar_entrada_sin_cita() from public;
grant  execute on function registrar_entrada_sin_cita() to authenticated;


--  Deshace la ultima entrada sin cita, para cuando se pico de mas.
--
--  Solo la propia y de los ultimos 10 minutos: no sirve para borrar el
--  conteo de otro ni para maquillar el dia despues.
create or replace function deshacer_entrada_sin_cita()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_id uuid;
begin
  perform exigir_rol(array['admin']);

  select s.id into v_id
    from entradas_sin_cita s
   where s.fecha = current_date
     and s.registrado_por = auth.uid()
     and s.registrado_en > now() - interval '10 minutes'
   order by s.registrado_en desc
   limit 1
     for update;

  if v_id is null then
    raise exception 'NADA_QUE_DESHACER';
  end if;

  delete from entradas_sin_cita where id = v_id;

  return (select count(*)::int from entradas_sin_cita s where s.fecha = current_date);
end;
$$;

revoke execute on function deshacer_entrada_sin_cita() from public;
grant  execute on function deshacer_entrada_sin_cita() to authenticated;


--  Segunda cita en la misma semana, autorizada por el administrador.
--
--  Para una persona que YA tiene su cita de la semana (se busca por su
--  codigo CB). Guarda el motivo y quien la autorizo en "excepciones".
--
--  No llama a reservar_cita(): esa rechaza, a proposito, una segunda cita
--  en la semana. Repite su candado de fila sobre el bloque ("for update")
--  para que el cupo no se pueda pasar ni con dos excepciones al mismo
--  tiempo. NO usar el patron de "consulto y despues inserto" sin el candado.
create or replace function reservar_con_excepcion(
  p_codigo    text,
  p_bloque_id uuid,
  p_motivo    text
)
returns table (
  codigo_corto text,
  token_qr     text,
  fecha        date,
  hora         time
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario   uuid := auth.uid();
  v_persona   personas;
  v_bloque    bloques;
  v_semana    date;
  v_ocupados  int;
  v_excepcion uuid;
  v_cita      citas;
begin
  perform exigir_rol(array['admin']);

  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_persona
    from personas p
   where upper(p.codigo_corto) = upper(trim(coalesce(p_codigo, '')));
  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  --  El mismo candado que reservar_cita(): las demas reservas sobre este
  --  horario esperan aqui.
  select * into v_bloque from bloques b where b.id = p_bloque_id for update;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  if v_bloque.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_bloque.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
    raise exception 'DIA_CERRADO';
  end if;

  v_semana := date_trunc('week', v_bloque.fecha)::date;

  --  La excepcion es para una SEGUNDA cita. Sin cita esa semana no hace falta.
  if not exists (select 1 from citas c
                  where c.persona_id = v_persona.id
                    and c.semana = v_semana
                    and c.estado in ('reservada', 'llego', 'entregada')
                    and c.excepcion_id is null) then
    raise exception 'NO_NECESITA_EXCEPCION';
  end if;

  if exists (select 1 from citas c
              where c.persona_id = v_persona.id
                and c.semana = v_semana
                and c.estado in ('reservada', 'llego', 'entregada')
                and c.excepcion_id is not null) then
    raise exception 'YA_TIENE_EXCEPCION_ESTA_SEMANA';
  end if;

  select count(*) into v_ocupados
    from citas c
   where c.bloque_id = p_bloque_id
     and c.estado <> 'cancelada';

  if v_ocupados >= v_bloque.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  insert into excepciones (persona_id, semana, motivo, autorizado_por)
  values (v_persona.id, v_semana, trim(p_motivo), v_usuario)
  returning id into v_excepcion;

  insert into citas (persona_id, bloque_id, semana, token_qr, excepcion_id, registrado_por)
  values (v_persona.id, p_bloque_id, v_semana, encode(gen_random_bytes(24), 'hex'), v_excepcion, v_usuario)
  returning * into v_cita;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;

exception
  --  Lo lanza el indice de una excepcion por semana si dos llegan juntas.
  when unique_violation then
    raise exception 'YA_TIENE_EXCEPCION_ESTA_SEMANA';
end;
$$;

revoke execute on function reservar_con_excepcion(text, uuid, text) from public;
grant  execute on function reservar_con_excepcion(text, uuid, text) to authenticated;
