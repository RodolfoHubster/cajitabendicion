-- ============================================================
--  Cajita de Bendicion - Las reglas de la fila a pie
--
--  Antes de sacar turno a pie se leen y aceptan sus propias reglas, no las
--  de carros (a pie no hay horario que cambiar, ni cajuela, ni cita que
--  cancelar). Una seccion nueva de avisos, 'registro_a_pie', editable en
--  "Textos y reglas", con las reglas de arranque.
--
--  No toca las reglas de carros ni nada de lo que el pastor ya escribio.
--  Requiere 2026-09-28-fila-a-pie-turnos.sql. Se puede repetir.
-- ============================================================

begin;

--  El nombre de la restriccion lo pone Postgres al crear la tabla; se quita
--  por nombre y se vuelve a poner con la seccion nueva.
alter table avisos drop constraint if exists avisos_seccion_check;
alter table avisos add constraint avisos_seccion_check
  check (seccion in ('inicio', 'registro', 'registro_a_pie', 'preguntas', 'quienes'));

--  Crear o cambiar uno. Sin id crea; con id, modifica.
create or replace function guardar_aviso(
  p_seccion   text,
  p_texto_es  text,
  p_id        uuid    default null,
  p_texto_en  text    default null,
  p_texto_vi  text    default null,
  p_activo    boolean default true,
  p_titulo_es text    default null,
  p_titulo_en text    default null,
  p_titulo_vi text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id     uuid;
  v_texto  text := regexp_replace(trim(coalesce(p_texto_es, '')), '\s+', ' ', 'g');
  v_titulo text := nullif(regexp_replace(trim(coalesce(p_titulo_es, '')), '\s+', ' ', 'g'), '');
begin
  perform exigir_permiso('editar_textos');

  if p_seccion not in ('inicio', 'registro', 'registro_a_pie', 'preguntas', 'quienes') then
    raise exception 'SECCION_INVALIDA';
  end if;

  if v_texto = '' then
    raise exception 'TEXTO_REQUERIDO';
  end if;

  --  Las respuestas de las preguntas frecuentes son mas largas que un
  --  aviso de una linea, por eso el tope sube.
  if length(v_texto) > 1200 then
    raise exception 'TEXTO_LARGO';
  end if;

  --  Una pregunta sin pregunta no se entiende.
  if p_seccion = 'preguntas' and v_titulo is null then
    raise exception 'TITULO_REQUERIDO';
  end if;

  if p_id is null then
    insert into avisos (seccion, orden, titulo_es, titulo_en, titulo_vi,
                        texto_es, texto_en, texto_vi, activo, actualizado_por)
    values (p_seccion,
            coalesce((select max(a.orden) + 1 from avisos a where a.seccion = p_seccion), 1),
            v_titulo,
            nullif(trim(coalesce(p_titulo_en, '')), ''),
            nullif(trim(coalesce(p_titulo_vi, '')), ''),
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
         titulo_es       = v_titulo,
         titulo_en       = nullif(trim(coalesce(p_titulo_en, '')), ''),
         titulo_vi       = nullif(trim(coalesce(p_titulo_vi, '')), ''),
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

revoke execute on function guardar_aviso(text, text, uuid, text, text, boolean, text, text, text) from public;
grant  execute on function guardar_aviso(text, text, uuid, text, text, boolean, text, text, text) to authenticated;

-- ------------------------------------------------------------
--  Las reglas de la fila a pie (28 de septiembre de 2026)
-- ------------------------------------------------------------
--  Antes de sacar turno a pie se leen estas, no las de carros: a pie no hay
--  horario que cambiar, ni cajuela, ni cita que cancelar. Solo si esa
--  seccion esta vacia, para no pisarle al pastor lo que haya escrito.
insert into avisos (seccion, orden, texto_es, texto_en, texto_vi)
select 'registro_a_pie', v.orden, v.texto_es, v.texto_en, v.texto_vi
  from (values
    (1,
     'Cada persona de 18 años o más que vaya a recibir una caja necesita su propio turno y su propio código.',
     'Each person 18 or older who will receive a box needs their own number and their own code.',
     'Mỗi người từ 18 tuổi trở lên nhận thùng cần có số và mã riêng.'),
    (2,
     'Solo puedes sacar un turno por cada día de entrega.',
     'You can only get one number per delivery day.',
     'Mỗi ngày phát bạn chỉ được lấy một số.'),
    (3,
     'Tu código sirve para una sola caja y se usa una sola vez.',
     'Your code is good for one box and can be used only once.',
     'Mã của bạn chỉ dùng cho một thùng và chỉ dùng được một lần.'),
    (4,
     'Trae tu código listo, en el teléfono o impreso. Si no se deja leer, da tu número CB.',
     'Have your code ready, on your phone or printed. If it will not scan, give your CB number.',
     'Hãy chuẩn bị sẵn mã, trên điện thoại hoặc in ra. Nếu không quét được, hãy đọc số CB của bạn.'),
    (5,
     'Espera cerca. Cuando digan tu número, acércate y muestra tu código.',
     'Wait nearby. When your number is called, come up and show your code.',
     'Hãy chờ ở gần. Khi gọi đến số của bạn, hãy đến và đưa mã.')
  ) as v(orden, texto_es, texto_en, texto_vi)
 where not exists (select 1 from avisos a where a.seccion = 'registro_a_pie');

commit;
