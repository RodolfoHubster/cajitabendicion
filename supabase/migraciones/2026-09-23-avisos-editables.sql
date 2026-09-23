-- ============================================================
--  Cajita de Bendicion - Avisos y reglas editables desde el panel
--
--  Lo que la gente lee --"Antes de empezar" en la portada y las reglas
--  que acepta antes de que se le genere el QR-- deja de estar escrito en
--  el codigo y pasa a la base, para que el pastor lo cambie desde
--  "Textos y reglas" sin esperar a que alguien publique el sitio.
--
--  Ojo: estos textos EXPLICAN las reglas, no las aplican. La regla de
--  verdad sigue viviendo en las funciones de esta base. Borrar un aviso
--  no cambia lo que el sistema hace, solo deja de decirlo.
--
--  No cambia ninguna tabla existente. Se puede repetir.
-- ============================================================

-- ------------------------------------------------------------
--  Avisos y reglas que el pastor edita desde el panel
-- ------------------------------------------------------------
--  Hasta ahora, cambiar "una cita por semana" en la portada era cambiar
--  un archivo de traducciones y volver a publicar el sitio. Las reglas de
--  la entrega cambian solas con el tiempo --la de la semana ya cambio-- y
--  el pastor no deberia necesitar a un programador para eso.
--
--  Estos textos NO son reglas que el sistema aplique: son lo que la gente
--  lee. La regla de verdad vive en las funciones de esta misma base. Si
--  alguien borra el aviso de "una caja por codigo", el sistema lo sigue
--  cumpliendo; nada mas deja de explicarlo.
create table if not exists avisos (
  id       uuid primary key default gen_random_uuid(),

  --  'inicio'   -> la lista de "Antes de empezar" en la portada
  --  'registro' -> lo que hay que leer y aceptar antes de sacar el QR
  seccion  text not null check (seccion in ('inicio', 'registro')),
  orden    int  not null default 0,

  --  El espanol es el unico obligatorio: es el idioma en el que el pastor
  --  escribe. Si falta la traduccion, la pantalla muestra el espanol antes
  --  que dejar un hueco.
  texto_es text not null,
  texto_en text,
  texto_vi text,

  activo   boolean not null default true,

  actualizado_por uuid,
  actualizado_en  timestamptz not null default now()
);

create index if not exists idx_avisos_seccion on avisos (seccion, orden);

alter table avisos enable row level security;


--  Lo que ve el publico: solo los activos, en orden.
create or replace function avisos_publicos(p_seccion text)
returns table (
  id       uuid,
  orden    int,
  texto_es text,
  texto_en text,
  texto_vi text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select a.id, a.orden, a.texto_es, a.texto_en, a.texto_vi
    from avisos a
   where a.seccion = p_seccion
     and a.activo
   order by a.orden, a.actualizado_en;
$$;

revoke execute on function avisos_publicos(text) from public;
grant  execute on function avisos_publicos(text) to anon, authenticated;


--  Todos, incluidos los apagados, para la pantalla que los administra.
create or replace function listar_avisos()
returns table (
  id              uuid,
  seccion         text,
  orden           int,
  texto_es        text,
  texto_en        text,
  texto_vi        text,
  activo          boolean,
  actualizado_en  timestamptz,
  actualizado_por text
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
  select a.id, a.seccion, a.orden, a.texto_es, a.texto_en, a.texto_vi,
         a.activo, a.actualizado_en, u.email::text
    from avisos a
    left join auth.users u on u.id = a.actualizado_por
   order by a.seccion, a.orden, a.actualizado_en;
end;
$$;

revoke execute on function listar_avisos() from public;
grant  execute on function listar_avisos() to authenticated;


--  Crear o cambiar uno. Sin id crea; con id, modifica.
create or replace function guardar_aviso(
  p_seccion  text,
  p_texto_es text,
  p_id       uuid    default null,
  p_texto_en text    default null,
  p_texto_vi text    default null,
  p_activo   boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id    uuid;
  v_texto text := regexp_replace(trim(coalesce(p_texto_es, '')), '\s+', ' ', 'g');
begin
  perform exigir_rol(array['admin']);

  if p_seccion not in ('inicio', 'registro') then
    raise exception 'SECCION_INVALIDA';
  end if;

  if v_texto = '' then
    raise exception 'TEXTO_REQUERIDO';
  end if;

  if length(v_texto) > 400 then
    raise exception 'TEXTO_LARGO';
  end if;

  if p_id is null then
    insert into avisos (seccion, orden, texto_es, texto_en, texto_vi, activo, actualizado_por)
    values (p_seccion,
            --  Va al final de su seccion.
            coalesce((select max(a.orden) + 1 from avisos a where a.seccion = p_seccion), 1),
            v_texto,
            nullif(trim(coalesce(p_texto_en, '')), ''),
            nullif(trim(coalesce(p_texto_vi, '')), ''),
            coalesce(p_activo, true),
            auth.uid())
    returning id into v_id;

    return v_id;
  end if;

  update avisos
     set seccion         = p_seccion,
         texto_es        = v_texto,
         texto_en        = nullif(trim(coalesce(p_texto_en, '')), ''),
         texto_vi        = nullif(trim(coalesce(p_texto_vi, '')), ''),
         activo          = coalesce(p_activo, true),
         actualizado_por = auth.uid(),
         actualizado_en  = now()
   where id = p_id
  returning id into v_id;

  if v_id is null then
    raise exception 'AVISO_NO_EXISTE';
  end if;

  return v_id;
end;
$$;

revoke execute on function guardar_aviso(text, text, uuid, text, text, boolean) from public;
grant  execute on function guardar_aviso(text, text, uuid, text, text, boolean) to authenticated;


--  Subirlo o bajarlo en su seccion: se intercambia el orden con el vecino.
create or replace function mover_aviso(p_id uuid, p_hacia text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_aviso  avisos;
  v_vecino avisos;
begin
  perform exigir_rol(array['admin']);

  if p_hacia not in ('arriba', 'abajo') then
    raise exception 'DIRECCION_INVALIDA';
  end if;

  select * into v_aviso from avisos where id = p_id;
  if not found then
    raise exception 'AVISO_NO_EXISTE';
  end if;

  if p_hacia = 'arriba' then
    select * into v_vecino
      from avisos a
     where a.seccion = v_aviso.seccion and a.orden < v_aviso.orden
     order by a.orden desc
     limit 1;
  else
    select * into v_vecino
      from avisos a
     where a.seccion = v_aviso.seccion and a.orden > v_aviso.orden
     order by a.orden
     limit 1;
  end if;

  --  Ya esta en la punta: no es un error, simplemente no se mueve.
  if not found then
    return 'SIN_CAMBIO';
  end if;

  update avisos set orden = v_vecino.orden where id = v_aviso.id;
  update avisos set orden = v_aviso.orden  where id = v_vecino.id;

  return 'MOVIDO';
end;
$$;

revoke execute on function mover_aviso(uuid, text) from public;
grant  execute on function mover_aviso(uuid, text) to authenticated;


create or replace function eliminar_aviso(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform exigir_rol(array['admin']);

  delete from avisos where id = p_id;

  if not found then
    raise exception 'AVISO_NO_EXISTE';
  end if;

  return 'ELIMINADO';
end;
$$;

revoke execute on function eliminar_aviso(uuid) from public;
grant  execute on function eliminar_aviso(uuid) to authenticated;


-- ------------------------------------------------------------
--  Con lo que arranca
-- ------------------------------------------------------------
--  Solo si la tabla esta vacia. Asi la migracion se puede repetir sin
--  pisarle al pastor lo que haya escrito.
insert into avisos (seccion, orden, texto_es, texto_en, texto_vi)
select v.seccion, v.orden, v.texto_es, v.texto_en, v.texto_vi
  from (values
    ('registro', 1,
     'Llega 5 minutos antes de tu hora. Es obligatorio.',
     'Arrive 5 minutes before your time. This is required.',
     'Hãy đến sớm 5 phút trước giờ hẹn. Đây là bắt buộc.'),
    ('registro', 2,
     'Cada persona de 18 años o más que vaya a recibir una caja necesita su propio registro y su propio código.',
     'Each person 18 or older who will receive a box needs their own registration and their own code.',
     'Mỗi người từ 18 tuổi trở lên nhận phần quà cần đăng ký riêng và có mã riêng.'),
    ('registro', 3,
     'Solo puedes hacer un registro por cada día de entrega.',
     'You can only make one registration per delivery day.',
     'Mỗi ngày phát quà bạn chỉ được đăng ký một lần.'),
    ('registro', 4,
     'Puedes cambiar tu horario una sola vez.',
     'You can change your time only once.',
     'Bạn chỉ có thể đổi giờ một lần.'),
    ('registro', 5,
     'Tu código sirve para una sola caja y se usa una sola vez.',
     'Your code is good for one box and can be used only once.',
     'Mã của bạn chỉ dùng cho một phần quà và chỉ dùng được một lần.'),
    ('registro', 6,
     'Trae tu código listo, en el teléfono o impreso. Si no se deja leer, da tu número CB.',
     'Have your code ready, on your phone or printed. If it will not scan, give your CB number.',
     'Hãy chuẩn bị sẵn mã, trên điện thoại hoặc in ra. Nếu không quét được, hãy đọc số CB của bạn.'),
    ('registro', 7,
     'Quédate en tu carro y abre la cajuela cuando te toque.',
     'Stay in your car and open the trunk when it is your turn.',
     'Hãy ngồi trong xe và mở cốp khi đến lượt bạn.'),
    ('registro', 8,
     'Si ya no vas a poder venir, cancela tu cita para que otra persona ocupe tu lugar.',
     'If you can no longer come, cancel your appointment so someone else can take your spot.',
     'Nếu bạn không thể đến, hãy hủy lịch hẹn để người khác nhận chỗ của bạn.'),
    ('inicio', 1,
     'Cada persona de 18 años o más que reciba una caja necesita su propio registro y su propio código.',
     'Each person 18 or older who receives a box needs their own registration and their own code.',
     'Mỗi người từ 18 tuổi trở lên nhận phần quà cần đăng ký riêng và có mã riêng.'),
    ('inicio', 2,
     'Llega 5 minutos antes de la hora de tu cita.',
     'Arrive 5 minutes before your appointment time.',
     'Hãy đến sớm 5 phút trước giờ hẹn.'),
    ('inicio', 3,
     'Guarda tu código en el teléfono o imprímelo: lo necesitas el día de la entrega.',
     'Save your code on your phone or print it: you need it on delivery day.',
     'Hãy lưu mã vào điện thoại hoặc in ra: bạn cần nó vào ngày phát quà.')
  ) as v(seccion, orden, texto_es, texto_en, texto_vi)
 where not exists (select 1 from avisos);
