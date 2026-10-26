-- ============================================================
--  Cajita de Bendicion - Las reglas de la fila a pie, al dia
--
--  La pagina para sacar turno a pie (/turno) traia sus reglas fijas y no
--  leia las de "Textos y reglas > Reglas > Fila a pie": lo que se editaba ahi
--  no se veia en ningun lado. Ahora las lee de la base (seccion
--  registro_a_pie).
--
--  Las que estaban guardadas eran las de antes de los turnos sin datos ("trae
--  tu codigo... da tu numero CB"). Si NADIE las ha editado (son exactamente
--  las de fabrica), se cambian por las de la fila de hoy, que son las que la
--  pagina ensenaba. Si el pastor ya las edito, no se tocan.
--
--  Solo cambia textos. Se puede correr aunque este la entrega. Correrla
--  ANTES de subir la pantalla nueva. Se puede repetir.
-- ============================================================

begin;

do $reglas$
begin
  if (select array_agg(a.texto_es order by a.orden, a.actualizado_en)
        from avisos a where a.seccion = 'registro_a_pie')
     = array[
         'Cada persona de 18 años o más que vaya a recibir una caja necesita su propio turno y su propio código.',
         'Solo puedes sacar un turno por cada día de entrega.',
         'Tu código sirve para una sola caja y se usa una sola vez.',
         'Trae tu código listo, en el teléfono o impreso. Si no se deja leer, da tu número CB.',
         'Espera cerca. Cuando digan tu número, acércate y muestra tu código.'
       ]::text[]
  then
    delete from avisos a where a.seccion = 'registro_a_pie';
  end if;
end
$reglas$;

insert into avisos (seccion, orden, texto_es, texto_en, texto_vi)
select 'registro_a_pie', v.orden, v.texto_es, v.texto_en, v.texto_vi
  from (values
    (1,
     'No te pedimos nombre, edad ni teléfono. Nada de esto se guarda ni se comparte.',
     'We do not ask for your name, age or phone number. None of this is saved or shared.',
     'Chúng tôi không hỏi tên, tuổi hay số điện thoại. Không có gì được lưu hay chia sẻ.'),
    (2,
     'Tu turno es solo para hoy y es para una despensa.',
     'Your number is for today only and for one box.',
     'Số của bạn chỉ dùng hôm nay và cho một thùng.'),
    (3,
     'Deja esta página abierta: aquí ves qué turno va, y tu teléfono suena cuando falten 3 y cuando te toque.',
     'Keep this page open: you can see which number is being served, and your phone rings when you are 3 away and when it is your turn.',
     'Hãy để trang này mở: bạn thấy số đang được gọi, và điện thoại sẽ kêu khi còn 3 người và khi đến lượt bạn.'),
    (4,
     'Si te llaman y no estás, acércate en cuanto puedas. Si tardas mucho, tu turno se anula y tendrás que sacar uno nuevo, al final de la fila.',
     'If your number is called and you''re not here, come over as soon as you can. If you take too long, your number is voided and you''ll need to get a new one, at the end of the line.',
     'Nếu được gọi mà bạn không có mặt, hãy đến ngay khi có thể. Nếu đến quá trễ, số của bạn sẽ bị hủy và bạn phải lấy số mới, ở cuối hàng.'),
    (5,
     'Cada adulto saca su propio turno. Si no tienes teléfono, pídeselo a una voluntaria.',
     'Each adult gets their own number. If you do not have a phone, ask a volunteer.',
     'Mỗi người lớn lấy số riêng. Nếu không có điện thoại, hãy nhờ tình nguyện viên.')
  ) as v(orden, texto_es, texto_en, texto_vi)
 where not exists (select 1 from avisos a where a.seccion = 'registro_a_pie');

commit;
