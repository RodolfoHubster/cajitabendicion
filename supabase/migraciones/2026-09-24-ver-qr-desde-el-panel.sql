-- ============================================================
--  Cajita de Bendicion - Ver el QR desde el panel
--
--  * qr_de_cita(codigo, fecha, hora): el token de una cita, SOLO para el
--    administrador, de uno en uno.
--  * Tabla qr_vistos: quien vio que QR y cuando.
--
--  No toca ninguna funcion que ya existe. Requiere
--  2026-09-24-errores-humanos.sql (normalizar_codigo_corto). Se puede repetir.
-- ============================================================

begin;

-- ============================================================
--  34. VER EL QR DESDE EL PANEL
-- ============================================================
--  Para las pruebas, y para quien perdio el suyo y esta en la fila: el
--  administrador ve el QR de una cita en la ficha de la persona (Ver). Sale borroso y
--  se ve al tocarlo.
--
--  El QR vale una caja. Por eso:
--    * Solo el administrador. Ninguna palomita se lo abre a un voluntario:
--      con el QR de otro en la pantalla, cualquiera se lleva su caja.
--    * La lista del dia (citas_del_dia) sigue sin traer tokens: el token
--      se pide de uno en uno, al tocar, y no antes.
--    * Queda quien lo vio y cuando (qr_vistos).

create table if not exists qr_vistos (
  id         uuid primary key default gen_random_uuid(),
  cita_id    uuid not null references citas(id) on delete cascade,
  visto_por  uuid not null,
  visto_en   timestamptz not null default now()
);

alter table qr_vistos enable row level security;

create index if not exists idx_qr_vistos_cita on qr_vistos (cita_id);

--  La misma cita que cancelar_cita_panel(): codigo, fecha y hora. Las
--  canceladas no: su QR ya no sirve.
create or replace function qr_de_cita(p_codigo text, p_fecha date, p_hora time)
returns table (
  token        text,
  codigo_corto text,
  nombre       text,
  estado       text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita    citas;
  v_persona personas;
begin
  perform exigir_rol(array['admin']);

  select c.* into v_cita
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
     and b.fecha = p_fecha
     and b.hora  = p_hora
     and c.estado <> 'cancelada'
   order by c.creada_en desc
   limit 1;

  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  select * into v_persona from personas where id = v_cita.persona_id;

  insert into qr_vistos (cita_id, visto_por) values (v_cita.id, auth.uid());

  return query select v_cita.token_qr, v_persona.codigo_corto, v_persona.nombre, v_cita.estado;
end;
$$;

revoke execute on function qr_de_cita(text, date, time) from public, anon;
grant  execute on function qr_de_cita(text, date, time) to authenticated;

commit;
