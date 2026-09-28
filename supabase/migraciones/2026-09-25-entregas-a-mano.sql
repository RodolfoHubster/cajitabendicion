-- ============================================================
--  Cajita de Bendicion - Marcar entregas a mano y deshacer la propia
--
--  El 24 de septiembre los voluntarios escaneaban y no tocaban "Registrar
--  entrega". Desde ahora escanear entrega de una vez (la pantalla), y:
--
--  * marcar_entregada_panel(codigo, fecha, hora, motivo): el admin marca
--    como entregada una cita de hoy o de dias pasados que no quedo
--    registrada. Queda en la tabla entregas_marcadas (quien, cuando, por
--    que) y cuenta el dia de su cita.
--  * anular_entrega(): quien escaneo puede deshacer SU entrega durante el
--    primer minuto, sin la palomita (FUERA_DE_PLAZO despues).
--  * citas_del_dia() dice quien la marco a mano (marcada_por).
--
--  Requiere 2026-09-24-errores-humanos.sql. Se puede repetir.
-- ============================================================

begin;

-- ============================================================
--  35. ENTREGAS: MARCARLAS A MANO
-- ============================================================
--  El 24 de septiembre de 2026 los voluntarios escaneaban y no tocaban
--  "Registrar entrega": dos o tres horas de cajas entregadas que el sistema
--  no conto. Desde entonces escanear entrega de una vez (la pantalla), y
--  aqui el administrador marca las que se entregaron sin quedar
--  registradas.
--
--  Queda quien la marco, cuando y por que (entregas_marcadas). La fecha de
--  entrega es la de su cita: reporte_por_dias cuenta por usado_en, y la caja
--  se dio ese dia, no el dia en que se marco.

create table if not exists entregas_marcadas (
  id          uuid primary key default gen_random_uuid(),
  cita_id     uuid not null references citas(id) on delete cascade,
  marcada_por uuid not null,
  marcada_en  timestamptz not null default now(),
  motivo      text
);

alter table entregas_marcadas enable row level security;
revoke all on entregas_marcadas from anon, authenticated;

create index if not exists idx_entregas_marcadas_cita on entregas_marcadas (cita_id);

--  Solo el administrador: cuenta una caja en el reporte al banco de
--  alimentos sin que nadie haya escaneado. Ninguna palomita lo abre.
create or replace function marcar_entregada_panel(
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
  v_bloque  bloques;
begin
  perform exigir_rol(array['admin']);

  if p_fecha > current_date then
    raise exception 'FECHA_FUTURA';
  end if;

  --  El mismo candado que registrar_entrega(): si justo la estan
  --  escaneando, una espera a la otra y ya la ve entregada. Una sola caja.
  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
     and b.fecha = p_fecha
     and b.hora  = p_hora
     and c.estado <> 'cancelada'
   order by c.creada_en desc
   limit 1
     for update of c;

  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado = 'entregada' then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  select * into v_bloque from bloques where id = v_cita.bloque_id;

  --  La hora exacta no se sabe: va la de su cita (o ahora, si su hora
  --  todavia no llega). entregas_marcadas dice que fue a mano.
  update citas
     set estado   = 'entregada',
         usado_en = least(now(), (v_bloque.fecha + v_bloque.hora) at time zone 'America/Los_Angeles')
   where id = v_cita.id;

  insert into entregas_marcadas (cita_id, marcada_por, motivo)
  values (v_cita.id, v_usuario, nullif(regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g'), ''));

  return 'MARCADA';
end;
$$;

revoke execute on function marcar_entregada_panel(text, date, time, text) from public, anon;
grant  execute on function marcar_entregada_panel(text, date, time, text) to authenticated;


drop function if exists citas_del_dia(date);

create or replace function citas_del_dia(p_fecha date default null)
returns table (
  nombre             text,
  codigo_corto       text,
  ciudad             text,
  hora               time,
  estado             text,
  usado_en           timestamptz,
  cancelada_en       timestamptz,
  cancelada_por      text,
  motivo_cancelacion text,
  fila               text,
  --  Quien la marco entregada a mano (seccion 35); null si se escaneo.
  marcada_por        text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  -- La lista de personas es solo del administrador: un voluntario no ve
  -- el padron, solo lo necesario para escanear.
  perform exigir_permiso('ver_citas_del_dia');

  return query
  select p.nombre,
         p.codigo_corto,
         p.ciudad,
         b.hora,
         case when c.estado in ('reservada', 'llego') and b.fecha < current_date
              then 'no_asistio'
              else c.estado
         end,
         c.usado_en,
         c.cancelada_en,
         u.email::text,
         c.motivo_cancelacion,
         b.fila,
         (select um.email::text
            from entregas_marcadas m
            left join auth.users um on um.id = m.marcada_por
           where m.cita_id = c.id
           order by m.marcada_en desc
           limit 1)
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.cancelada_por
   where b.fecha = coalesce(p_fecha, current_date)
   order by b.hora, p.nombre;
end;
$$;


revoke execute on function citas_del_dia(date) from public, anon;
grant  execute on function citas_del_dia(date) to authenticated;


create or replace function anular_entrega(p_codigo text, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario      uuid := auth.uid();
  v_codigo       text := normalizar_codigo_corto(p_codigo);
  v_motivo       text := regexp_replace(trim(coalesce(p_motivo, '')), '\s+', ' ', 'g');
  v_cita         citas;
  v_pase         entregas_pase;
  v_con_palomita boolean;
begin
  --  Con la palomita anular_entregas (el admin siempre), cualquier entrega
  --  de hoy. Sin ella, quien escaneo deshace SU entrega durante el primer
  --  minuto (seccion 35): escanear ya entrega de una vez, y equivocarse de
  --  telefono se arregla ahi mismo, no una hora despues.
  perform exigir_rol(array['admin', 'voluntario']);

  begin
    perform exigir_permiso('anular_entregas');
    v_con_palomita := true;
  exception when insufficient_privilege then
    v_con_palomita := false;
  end;

  if v_motivo = '' then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  --  El mismo candado que registrar_entrega(): mientras se deshace, nadie
  --  la puede entregar a medias.
  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
   where upper(p.codigo_corto) = v_codigo
     and c.estado = 'entregada'
     and c.usado_en::date = current_date
   order by c.usado_en desc
   limit 1
     for update of c;

  if found then
    if not v_con_palomita and not exists (
         select 1
           from escaneos e
          where e.cita_id = v_cita.id
            and e.usuario_id = v_usuario
            and e.resultado in ('VALIDO', 'VALIDO_AUTORIZADO')
            and e.escaneado_en > now() - interval '1 minute') then
      raise exception 'FUERA_DE_PLAZO';
    end if;

    update citas
       set estado   = 'reservada',
           usado_en = null
     where id = v_cita.id;

    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'ANULADA');

    insert into anulaciones_entrega (cita_id, fecha, entregada_en, anulada_por, motivo)
    values (v_cita.id, current_date, v_cita.usado_en, v_usuario, v_motivo);

    return 'ANULADA';
  end if;

  --  Un pase permanente: se quita la caja de hoy, y el pase vuelve a
  --  servir hoy.
  select e.* into v_pase
    from entregas_pase e
    join pases    pa on pa.id = e.pase_id
    join personas p  on p.id  = pa.persona_id
   where upper(p.codigo_corto) = v_codigo
     and e.fecha = current_date
     for update of e;

  if found then
    if not v_con_palomita
       and not (v_pase.usuario_id = v_usuario and v_pase.entregada_en > now() - interval '1 minute') then
      raise exception 'FUERA_DE_PLAZO';
    end if;

    insert into anulaciones_entrega (pase_id, fecha, entregada_en, anulada_por, motivo)
    values (v_pase.pase_id, v_pase.fecha, v_pase.entregada_en, v_usuario, v_motivo);

    delete from entregas_pase where id = v_pase.id;

    return 'ANULADA';
  end if;

  raise exception 'ENTREGA_NO_EXISTE';
end;
$$;

revoke execute on function anular_entrega(text, text) from public, anon;
grant  execute on function anular_entrega(text, text) to authenticated;

commit;
