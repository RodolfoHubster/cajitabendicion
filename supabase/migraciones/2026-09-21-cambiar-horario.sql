-- ============================================================
--  Cajita de Bendicion - Cambiar el horario de una cita
--
--  Hoy, quien quiere otro horario tiene que cancelar y registrarse otra
--  vez: queda con otro codigo, otro QR y duplicado en el padron. Esto lo
--  cambia por un movimiento de verdad, conservando su codigo CB y su QR.
--
--  * movimientos_cita: historial de cada cambio (de que bloque a cual,
--    quien lo hizo y cuando).
--  * mover_mi_cita(): la persona, desde su pantalla de confirmacion.
--    Una sola vez (configurable).
--  * mover_cita_panel(): el admin, sin ese limite, cuando le llaman.
--  * historial_de_cita(): los cambios de una cita, para el panel.
--
--  Requiere 2026-09-14-cancelar-sin-cita-excepcion.sql. Se puede repetir.
-- ============================================================


-- ------------------------------------------------------------
--  Historial
-- ------------------------------------------------------------
--  Una fila por cambio. Nunca se borra: es lo que contesta "esta
--  persona cambio su horario" cuando llega a la hora equivocada.
create table if not exists movimientos_cita (
  id           uuid primary key default gen_random_uuid(),
  cita_id      uuid not null references citas(id)   on delete restrict,
  de_bloque_id uuid not null references bloques(id) on delete restrict,
  a_bloque_id  uuid not null references bloques(id) on delete restrict,

  --  'publico' = lo hizo la persona con su enlace. 'panel' = alguien del
  --  equipo. Solo los de 'publico' gastan el cambio que le toca.
  origen       text not null check (origen in ('publico', 'panel')),
  usuario_id   uuid,
  creado_en    timestamptz not null default now()
);

create index if not exists idx_movimientos_cita on movimientos_cita (cita_id, creado_en);

--  Como todo lo demas: sin politicas, solo se llega por estas funciones.
alter table movimientos_cita enable row level security;

--  Cuantas veces puede cambiar la persona por su cuenta. Se sube desde
--  configuracion si un dia se decide ser mas flexible, sin tocar codigo.
insert into configuracion (clave, valor, nota)
values ('cambios_de_horario_permitidos', '1',
        'Cuantas veces puede una persona cambiar su horario desde su ' ||
        'enlace de confirmacion. El panel no tiene este limite.')
on conflict (clave) do nothing;


-- ------------------------------------------------------------
--  El movimiento
-- ------------------------------------------------------------
--  El candado va en el mismo orden que reservar_cita: primero la cita,
--  luego el bloque de destino. El conteo de ocupados se hace con el
--  bloque ya bloqueado, que es lo que impide el sobrecupo cuando dos
--  personas se mueven al mismo horario al mismo tiempo.
--
--  Si el horario nuevo se lleno justo antes, se levanta BLOQUE_LLENO y
--  la transaccion se deshace entera: la persona se queda con su cita
--  original. Nunca se queda sin nada.
create or replace function mover_cita(
  p_cita_id   uuid,
  p_bloque_id uuid,
  p_origen    text
)
returns citas
language plpgsql
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita     citas;
  v_actual   bloques;
  v_nuevo    bloques;
  v_abre_en  timestamptz;
  v_cerrado  boolean;
  v_ocupados int;
begin
  select * into v_cita from citas where id = p_cita_id for update;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado = 'cancelada' then
    raise exception 'CITA_YA_CANCELADA';
  end if;

  --  Ya la escanearon: no hay nada que mover.
  if v_cita.estado in ('llego', 'entregada') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  select * into v_actual from bloques where id = v_cita.bloque_id;
  if v_actual.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if v_cita.bloque_id = p_bloque_id then
    raise exception 'MISMO_HORARIO';
  end if;

  --  Las demas peticiones sobre el bloque de destino esperan aqui.
  select * into v_nuevo from bloques where id = p_bloque_id for update;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  if v_nuevo.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_nuevo.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  --  El dia de destino tiene que estar abierto, igual que para
  --  registrarse. Si no, mover la cita seria la puerta de atras para
  --  apartar lugar en un dia que todavia no abre.
  select d.abre_en, d.cerrado into v_abre_en, v_cerrado
    from dias_entrega d
   where d.fecha = v_nuevo.fecha;

  if not found or v_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if now() < v_abre_en then
    raise exception 'AUN_NO_ABRE';
  end if;

  --  La propia cita no cuenta: se esta moviendo, no agregando.
  select count(*) into v_ocupados
    from citas c
   where c.bloque_id = p_bloque_id
     and c.estado <> 'cancelada'
     and c.id <> v_cita.id;

  if v_ocupados >= v_nuevo.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  update citas
     set bloque_id = p_bloque_id,
         semana    = date_trunc('week', v_nuevo.fecha)::date
   where id = v_cita.id
  returning * into v_cita;

  insert into movimientos_cita (cita_id, de_bloque_id, a_bloque_id, origen, usuario_id)
  values (v_cita.id, v_actual.id, v_nuevo.id, p_origen, auth.uid());

  return v_cita;

exception
  --  Lo levanta el indice unico parcial: ya tiene otra cita activa en la
  --  semana a la que se quiere mover.
  when unique_violation then
    raise exception 'YA_TIENE_CITA_ESTA_SEMANA';
end;
$$;

--  Solo se llama desde las dos funciones de abajo, que son las que
--  revisan de quien es la cita y cuantos cambios lleva.
revoke execute on function mover_cita(uuid, uuid, text) from public, anon, authenticated;


-- ------------------------------------------------------------
--  La persona, desde su enlace de confirmacion
-- ------------------------------------------------------------
--  Tener el token es ser dueno de la cita, igual que en cancelar_mi_cita.
create or replace function mover_mi_cita(p_token text, p_bloque_id uuid)
returns table (
  fecha              date,
  hora               time,
  codigo_corto       text,
  cambios_restantes  int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita   citas;
  v_limite int;
  v_hechos int;
begin
  select * into v_cita from citas c where c.token_qr = p_token;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  select valor::int into v_limite
    from configuracion
   where clave = 'cambios_de_horario_permitidos';

  v_limite := coalesce(v_limite, 1);

  select count(*) into v_hechos
    from movimientos_cita m
   where m.cita_id = v_cita.id
     and m.origen = 'publico';

  --  Los movimientos que hizo el equipo no le gastan el suyo.
  if v_hechos >= v_limite then
    raise exception 'YA_CAMBIO_HORARIO';
  end if;

  v_cita := mover_cita(v_cita.id, p_bloque_id, 'publico');

  return query
    select b.fecha,
           b.hora,
           p.codigo_corto,
           greatest(v_limite - v_hechos - 1, 0)
      from bloques b
      join personas p on p.id = v_cita.persona_id
     where b.id = v_cita.bloque_id;
end;
$$;

revoke execute on function mover_mi_cita(text, uuid) from public;
grant  execute on function mover_mi_cita(text, uuid) to anon, authenticated;


--  Cuantos cambios le quedan, para avisarle antes de que elija.
create or replace function cambios_restantes(p_token text)
returns int
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_cita_id uuid;
  v_limite  int;
  v_hechos  int;
begin
  select c.id into v_cita_id from citas c where c.token_qr = p_token;
  if not found then
    return 0;
  end if;

  select valor::int into v_limite
    from configuracion
   where clave = 'cambios_de_horario_permitidos';

  select count(*) into v_hechos
    from movimientos_cita m
   where m.cita_id = v_cita_id
     and m.origen = 'publico';

  return greatest(coalesce(v_limite, 1) - v_hechos, 0);
end;
$$;

revoke execute on function cambios_restantes(text) from public;
grant  execute on function cambios_restantes(text) to anon, authenticated;


-- ------------------------------------------------------------
--  El equipo, desde el panel
-- ------------------------------------------------------------
--  Sin limite de cambios: es para cuando le hablan por telefono al
--  pastor. Queda guardado quien lo movio.
create or replace function mover_cita_panel(p_cita_id uuid, p_bloque_id uuid)
returns table (
  fecha        date,
  hora         time,
  codigo_corto text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita citas;
begin
  perform exigir_rol(array['admin']);

  v_cita := mover_cita(p_cita_id, p_bloque_id, 'panel');

  return query
    select b.fecha, b.hora, p.codigo_corto
      from bloques b
      join personas p on p.id = v_cita.persona_id
     where b.id = v_cita.bloque_id;
end;
$$;

revoke execute on function mover_cita_panel(uuid, uuid) from public;
grant  execute on function mover_cita_panel(uuid, uuid) to authenticated;


--  El historial de una cita, para mostrarlo en el panel.
create or replace function historial_de_cita(p_cita_id uuid)
returns table (
  de_fecha  date,
  de_hora   time,
  a_fecha   date,
  a_hora    time,
  origen    text,
  quien     text,
  cuando    timestamptz
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
    select viejo.fecha,
           viejo.hora,
           nuevo.fecha,
           nuevo.hora,
           m.origen,
           u.email::text,
           m.creado_en
      from movimientos_cita m
      join bloques viejo on viejo.id = m.de_bloque_id
      join bloques nuevo on nuevo.id = m.a_bloque_id
      left join auth.users u on u.id = m.usuario_id
     where m.cita_id = p_cita_id
     order by m.creado_en;
end;
$$;

revoke execute on function historial_de_cita(uuid) from public;
grant  execute on function historial_de_cita(uuid) to authenticated;
