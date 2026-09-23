-- ============================================================
--  Cajita de Bendicion - Preguntas frecuentes y "Quienes somos"
--
--  Los avisos ya se editaban desde el panel. Esto agrega dos secciones
--  mas y un titulo, porque una pregunta frecuente son dos cosas: la
--  pregunta y la respuesta.
--
--   * 'preguntas' -> pagina /preguntas. titulo = la pregunta, texto = la
--     respuesta.
--   * 'quienes'   -> pagina /quienes-somos. Cada fila es un parrafo; el
--     titulo es opcional y sirve de encabezado.
--
--  Requiere 2026-09-23-avisos-editables.sql. Se puede repetir.
-- ============================================================

alter table avisos add column if not exists titulo_es text;
alter table avisos add column if not exists titulo_en text;
alter table avisos add column if not exists titulo_vi text;

--  Dos secciones mas. El nombre de la restriccion lo pone Postgres solo
--  al crear la tabla; se quita por nombre y se vuelve a poner.
alter table avisos drop constraint if exists avisos_seccion_check;
alter table avisos add constraint avisos_seccion_check
  check (seccion in ('inicio', 'registro', 'preguntas', 'quienes'));


--  Las tres cambian sus columnas de entrada o de salida, asi que se
--  borran antes: "create or replace" no puede cambiarlas.
drop function if exists avisos_publicos(text);

create or replace function avisos_publicos(p_seccion text)
returns table (
  id        uuid,
  orden     int,
  titulo_es text,
  titulo_en text,
  titulo_vi text,
  texto_es  text,
  texto_en  text,
  texto_vi  text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select a.id, a.orden, a.titulo_es, a.titulo_en, a.titulo_vi,
         a.texto_es, a.texto_en, a.texto_vi
    from avisos a
   where a.seccion = p_seccion
     and a.activo
   order by a.orden, a.actualizado_en;
$$;

revoke execute on function avisos_publicos(text) from public;
grant  execute on function avisos_publicos(text) to anon, authenticated;


drop function if exists listar_avisos();

create or replace function listar_avisos()
returns table (
  id              uuid,
  seccion         text,
  orden           int,
  titulo_es       text,
  titulo_en       text,
  titulo_vi       text,
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
  select a.id, a.seccion, a.orden, a.titulo_es, a.titulo_en, a.titulo_vi,
         a.texto_es, a.texto_en, a.texto_vi,
         a.activo, a.actualizado_en, u.email::text
    from avisos a
    left join auth.users u on u.id = a.actualizado_por
   order by a.seccion, a.orden, a.actualizado_en;
end;
$$;

revoke execute on function listar_avisos() from public;
grant  execute on function listar_avisos() to authenticated;


drop function if exists guardar_aviso(text, text, uuid, text, text, boolean);

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
  perform exigir_rol(array['admin']);

  if p_seccion not in ('inicio', 'registro', 'preguntas', 'quienes') then
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
--  Con lo que arrancan las dos secciones nuevas
-- ------------------------------------------------------------
--  Solo si esa seccion esta vacia, para no pisarle al pastor lo que haya
--  escrito. Los datos de la iglesia salen de su propio sitio
--  (casadealabanzasd.com) y de su recaudacion en GoFundMe.
insert into avisos (seccion, orden, titulo_es, titulo_en, titulo_vi, texto_es, texto_en, texto_vi)
select v.* from (values
  ('preguntas', 1,
   '¿Cuánto cuesta?', 'How much does it cost?', 'Chi phí bao nhiêu?',
   'Nada. Los alimentos son gratuitos y tu cita no depende de ninguna donación.',
   'Nothing. The food is free and your appointment does not depend on any donation.',
   'Không mất gì cả. Thực phẩm là miễn phí và lịch hẹn của bạn không phụ thuộc vào việc quyên góp.'),
  ('preguntas', 2,
   '¿Qué días hay entrega?', 'Which days is there a delivery?', 'Những ngày nào có phát quà?',
   'Lunes y jueves.',
   'Mondays and Thursdays.',
   'Thứ Hai và thứ Năm.'),
  ('preguntas', 3,
   '¿Tengo que registrarme cada vez?', 'Do I have to register every time?', 'Tôi có phải đăng ký mỗi lần không?',
   'Sí. Necesitas un registro para cada día de entrega al que vayas a venir.',
   'Yes. You need a registration for each delivery day you plan to come to.',
   'Có. Bạn cần đăng ký cho mỗi ngày phát quà mà bạn định đến.'),
  ('preguntas', 4,
   '¿Qué llevo el día de la entrega?', 'What do I bring on delivery day?', 'Ngày phát quà tôi cần mang gì?',
   'Tu código QR, en el teléfono o impreso. Si no se deja leer, da tu número CB y te encontramos igual.',
   'Your QR code, on your phone or printed. If it will not scan, give your CB number and we will still find you.',
   'Mã QR của bạn, trên điện thoại hoặc in ra. Nếu không quét được, hãy đọc số CB và chúng tôi vẫn tìm được bạn.'),
  ('preguntas', 5,
   '¿Puedo recoger la caja de otra persona?', 'Can I pick up someone else''s box?', 'Tôi có thể nhận phần quà của người khác không?',
   'Cada persona de 18 años o más que vaya a recibir una caja necesita su propio registro y su propio código.',
   'Each person 18 or older who will receive a box needs their own registration and their own code.',
   'Mỗi người từ 18 tuổi trở lên nhận phần quà cần đăng ký riêng và có mã riêng.'),
  ('preguntas', 6,
   '¿Puedo cambiar mi horario?', 'Can I change my time?', 'Tôi có thể đổi giờ không?',
   'Sí, una sola vez. Entra al enlace de tu código y toca «Cambiar mi horario».',
   'Yes, once. Open your code''s link and tap “Change my time”.',
   'Có, một lần duy nhất. Hãy mở đường dẫn mã của bạn và bấm «Đổi giờ hẹn của tôi».'),
  ('preguntas', 7,
   '¿Y si ya no voy a poder ir?', 'What if I can no longer come?', 'Nếu tôi không thể đến thì sao?',
   'Cancela tu cita desde el enlace de tu código. Así otra persona puede ocupar tu lugar.',
   'Cancel your appointment from your code''s link. That way someone else can take your spot.',
   'Hãy hủy lịch hẹn từ đường dẫn mã của bạn. Như vậy người khác có thể nhận chỗ đó.'),
  ('preguntas', 8,
   '¿Qué pasa con mi información?', 'What happens with my information?', 'Thông tin của tôi được dùng thế nào?',
   'Solo se usa para el registro interno de Cajita de Bendición y para organizar la entrega. No la compartimos con nadie, tampoco con las autoridades.',
   'It is used only for Cajita de Bendición''s internal records and to organize the delivery. We do not share it with anyone, not with the authorities either.',
   'Chỉ dùng cho hồ sơ nội bộ của Cajita de Bendición và để tổ chức việc phát quà. Chúng tôi không chia sẻ với bất kỳ ai, kể cả nhà chức trách.'),
  ('preguntas', 9,
   '¿Necesito documentos?', 'Do I need documents?', 'Tôi có cần giấy tờ không?',
   'No. El registro pide tu nombre, tu teléfono y tu domicilio. No se piden documentos migratorios.',
   'No. Registration asks for your name, your phone and your address. No immigration documents are requested.',
   'Không. Đăng ký chỉ hỏi tên, số điện thoại và địa chỉ của bạn. Không yêu cầu giấy tờ di trú.'),
  ('preguntas', 10,
   'Perdí mi código, ¿qué hago?', 'I lost my code, what do I do?', 'Tôi mất mã rồi, phải làm sao?',
   'Ven de todos modos el día de tu cita. Con tu nombre te podemos encontrar en la lista.',
   'Come anyway on the day of your appointment. We can find you on the list with your name.',
   'Bạn cứ đến vào ngày hẹn. Chúng tôi có thể tìm bạn trong danh sách bằng tên của bạn.'),

  ('quienes', 1,
   'Cajita de Bendición', 'Cajita de Bendición', 'Cajita de Bendición',
   'Cajita de Bendición es el banco de alimentos de la Iglesia Casa de Alabanza, en City Heights, San Diego. Cada lunes y jueves se entrega despensa gratuita a quien la necesita, sin costo y sin condiciones.',
   'Cajita de Bendición is the food bank of Iglesia Casa de Alabanza, in City Heights, San Diego. Every Monday and Thursday we hand out free groceries to whoever needs them, at no cost and with no strings attached.',
   'Cajita de Bendición là ngân hàng thực phẩm của Iglesia Casa de Alabanza, ở City Heights, San Diego. Mỗi thứ Hai và thứ Năm, chúng tôi phát thực phẩm miễn phí cho những ai cần, không tốn phí và không điều kiện.'),
  ('quienes', 2,
   'La iglesia', 'The church', 'Nhà thờ',
   'Casa de Alabanza — Comunidad en Cristo la fundaron en 2009 los pastores Raúl y Teresa Villalobos, originarios de Tecate, Baja California. Los pastores de jóvenes son David y Jennifer Villalobos. La iglesia está en 4250 El Cajon Blvd.',
   'Casa de Alabanza — Comunidad en Cristo was founded in 2009 by pastors Raúl and Teresa Villalobos, originally from Tecate, Baja California. The youth pastors are David and Jennifer Villalobos. The church is at 4250 El Cajon Blvd.',
   'Casa de Alabanza — Comunidad en Cristo được thành lập năm 2009 bởi mục sư Raúl và Teresa Villalobos, quê ở Tecate, Baja California. Mục sư thanh niên là David và Jennifer Villalobos. Nhà thờ ở số 4250 El Cajon Blvd.'),
  ('quienes', 3,
   'Más de 4,000 familias al mes', 'More than 4,000 families a month', 'Hơn 4.000 gia đình mỗi tháng',
   'Hoy la iglesia alimenta a más de 4,000 familias cada mes, y su trabajo no termina en la comida: acompaña a las familias, guía a los jóvenes y sostiene a la comunidad.',
   'Today the church feeds more than 4,000 families every month, and its work does not end with food: it walks with families, mentors young people and holds the community together.',
   'Hiện nay nhà thờ nuôi hơn 4.000 gia đình mỗi tháng, và công việc không dừng ở thực phẩm: đồng hành cùng các gia đình, dìu dắt người trẻ và gắn kết cộng đồng.'),
  ('quienes', 4,
   'Un espacio más grande', 'A bigger space', 'Một không gian lớn hơn',
   'El lugar actual ya no alcanza. La iglesia está juntando fondos para comprar un edificio que le permita seguir creciendo; sin él, el banco de alimentos está en riesgo.',
   'The current space is no longer enough. The church is raising funds to buy a building that will let it keep growing; without it, the food bank is at risk.',
   'Không gian hiện tại không còn đủ. Nhà thờ đang gây quỹ để mua một tòa nhà cho phép tiếp tục phát triển; nếu không, ngân hàng thực phẩm sẽ gặp rủi ro.'),
  ('quienes', 5,
   'Esta página', 'This page', 'Trang này',
   'Este sitio existe para una sola cosa: que apartar tu lugar sea sencillo y que nadie pierda la tarde formado sin necesidad. Tu información se usa solo para organizar la entrega.',
   'This site exists for one thing: to make saving your spot simple, so nobody loses an afternoon standing in line for nothing. Your information is used only to organize the delivery.',
   'Trang này tồn tại vì một điều: giúp bạn giữ chỗ dễ dàng, để không ai phải mất cả buổi chiều xếp hàng vô ích. Thông tin của bạn chỉ dùng để tổ chức việc phát quà.')
) as v(seccion, orden, titulo_es, titulo_en, titulo_vi, texto_es, texto_en, texto_vi)
 where not exists (select 1 from avisos a where a.seccion in ('preguntas', 'quienes'));
