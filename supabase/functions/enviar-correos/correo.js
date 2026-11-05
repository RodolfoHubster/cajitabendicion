/**
 * Los correos de Cajita de Bendicion: textos, plantilla y el mensaje MIME.
 *
 * JavaScript puro, sin nada de Deno ni de Node: lo usa la funcion que los
 * manda (index.js, en Supabase) y lo prueban las pruebas de siempre
 * (src/datos/correo.test.js).
 *
 * Dos correos (decision del 28 de octubre de 2026):
 *   - confirmacion: al hacer la cita, con su QR dentro y un boton a su cita.
 *   - entrega_cancelada / entrega_movida: cuando la iglesia cancela o mueve
 *     la entrega de ese dia (seccion 36).
 * Nadie los contesta: el pie dice que no se responda y da el telefono.
 *
 * Idiomas: los diez de la app. Fuera de espanol e ingles, ninguno lo ha
 * revisado un hablante nativo (src/i18n/idiomas.js, enDesarrollo).
 */

export const TELEFONO = '(619) 734-5886'
export const DIRECCION = '4250 El Cajon Blvd, San Diego, CA 92105'
export const NOMBRE_REMITENTE = 'Cajita de Bendición'

//  Los colores del logo (los mismos de la app).
const AZUL = '#1B3A6B'
const NARANJA = '#F5A03C'

//  El criollo haitiano no viene en Intl: su fecha sale en frances.
const LOCALES = {
  es: 'es-MX',
  en: 'en-US',
  vi: 'vi-VN',
  zh: 'zh-CN',
  tl: 'fil-PH',
  ko: 'ko-KR',
  ht: ['ht', 'fr-FR'],
  ru: 'ru-RU',
  so: 'so-SO',
  fr: 'fr-FR',
}

export const TEXTOS = {
  es: {
    asunto: 'Tu cita en Cajita de Bendición: {fecha}, {hora}',
    hola: 'Hola, {nombre}:',
    listo: 'Tu cita quedó lista. Te esperamos.',
    fecha: 'Fecha',
    hora: 'Hora',
    fila: 'Fila',
    lugar: 'Lugar',
    enCarro: 'En carro',
    aPie: 'A pie',
    aPieTurno: 'A pie (turno {turno})',
    qr: 'Muestra este código al llegar. Sirve para una sola caja y es solo tuyo.',
    siNoSeLee: 'Si el código no se lee, da este número:',
    verCita: 'Ver mi cita',
    siNoPuedes: 'Si ya no puedes venir, cancela tu cita desde ese botón para que otra persona use el lugar.',
    asuntoCancelada: 'Se canceló la entrega del {fecha}',
    cancelada: 'La entrega de Cajita de Bendición del {fecha} se canceló. Tu cita de las {hora} ya no es válida.',
    asuntoMovida: 'Tu cita cambió de día: ahora es el {fechaNueva}',
    movida: 'La entrega del {fecha} se movió al {fechaNueva}, a la misma hora ({hora}). Tu mismo código sirve.',
    mensaje: 'Mensaje de la iglesia:',
    otraCita: 'Puedes hacer una cita para otro día:',
    hacerOtra: 'Hacer otra cita',
    noResponder: 'Este correo se envía solo; por favor no lo respondas. ¿Dudas? Llama al {telefono}.',
    privacidad: 'Tu información es privada: no la compartimos con nadie, tampoco con las autoridades.',
  },
  en: {
    asunto: 'Your Cajita de Bendición appointment: {fecha}, {hora}',
    hola: 'Hi {nombre},',
    listo: 'Your appointment is confirmed. We look forward to seeing you.',
    fecha: 'Date',
    hora: 'Time',
    fila: 'Line',
    lugar: 'Place',
    enCarro: 'By car',
    aPie: 'On foot',
    aPieTurno: 'On foot (number {turno})',
    qr: 'Show this code when you arrive. It is good for one box only, and it is just for you.',
    siNoSeLee: 'If the code can’t be read, give this number:',
    verCita: 'See my appointment',
    siNoPuedes: 'If you can no longer come, cancel your appointment with that button so someone else can use the spot.',
    asuntoCancelada: 'The {fecha} distribution was cancelled',
    cancelada: 'The Cajita de Bendición distribution on {fecha} was cancelled. Your {hora} appointment is no longer valid.',
    asuntoMovida: 'Your appointment moved to {fechaNueva}',
    movida: 'The {fecha} distribution moved to {fechaNueva}, at the same time ({hora}). Your same code works.',
    mensaje: 'Message from the church:',
    otraCita: 'You can book an appointment for another day:',
    hacerOtra: 'Book another appointment',
    noResponder: 'This email is sent automatically; please do not reply. Questions? Call {telefono}.',
    privacidad: 'Your information is private: we don’t share it with anyone, including the authorities.',
  },
  vi: {
    asunto: 'Lịch hẹn của bạn tại Cajita de Bendición: {fecha}, {hora}',
    hola: 'Chào {nombre},',
    listo: 'Lịch hẹn của bạn đã được xác nhận. Hẹn gặp bạn.',
    fecha: 'Ngày',
    hora: 'Giờ',
    fila: 'Hàng',
    lugar: 'Địa điểm',
    enCarro: 'Bằng xe hơi',
    aPie: 'Đi bộ',
    aPieTurno: 'Đi bộ (số {turno})',
    qr: 'Hãy đưa mã này khi bạn đến. Mã chỉ dùng cho một thùng và chỉ dành riêng cho bạn.',
    siNoSeLee: 'Nếu không quét được mã, hãy đọc số này:',
    verCita: 'Xem lịch hẹn của tôi',
    siNoPuedes: 'Nếu bạn không thể đến, hãy hủy lịch hẹn bằng nút đó để người khác có thể dùng chỗ này.',
    asuntoCancelada: 'Buổi phát ngày {fecha} đã bị hủy',
    cancelada: 'Buổi phát của Cajita de Bendición ngày {fecha} đã bị hủy. Lịch hẹn lúc {hora} của bạn không còn hiệu lực.',
    asuntoMovida: 'Lịch hẹn của bạn đã dời sang {fechaNueva}',
    movida: 'Buổi phát ngày {fecha} đã dời sang {fechaNueva}, cùng giờ ({hora}). Mã của bạn vẫn dùng được.',
    mensaje: 'Lời nhắn từ nhà thờ:',
    otraCita: 'Bạn có thể đặt lịch hẹn cho ngày khác:',
    hacerOtra: 'Đặt lịch hẹn khác',
    noResponder: 'Email này được gửi tự động; vui lòng không trả lời. Có thắc mắc? Gọi số {telefono}.',
    privacidad: 'Thông tin của bạn được giữ riêng tư: chúng tôi không chia sẻ với bất kỳ ai, kể cả cơ quan chức năng.',
  },
  zh: {
    asunto: '您在 Cajita de Bendición 的预约：{fecha}，{hora}',
    hola: '{nombre}，您好：',
    listo: '您的预约已确认。我们等您来。',
    fecha: '日期',
    hora: '时间',
    fila: '队伍',
    lugar: '地点',
    enCarro: '开车',
    aPie: '步行',
    aPieTurno: '步行（号码 {turno}）',
    qr: '到达时请出示这个二维码。它只能领一个食品箱，只限您本人使用。',
    siNoSeLee: '如果二维码扫不出来，请报这个号码：',
    verCita: '查看我的预约',
    siNoPuedes: '如果您来不了，请用这个按钮取消预约，把名额留给别人。',
    asuntoCancelada: '{fecha} 的发放取消了',
    cancelada: 'Cajita de Bendición {fecha} 的发放取消了。您 {hora} 的预约已经失效。',
    asuntoMovida: '您的预约改到了 {fechaNueva}',
    movida: '{fecha} 的发放改到了 {fechaNueva}，时间不变（{hora}）。您原来的二维码照样能用。',
    mensaje: '教会的留言：',
    otraCita: '您可以预约别的日子：',
    hacerOtra: '重新预约',
    noResponder: '这封邮件是自动发送的，请不要回复。有问题请打 {telefono}。',
    privacidad: '您的信息是保密的：我们不会告诉任何人，包括政府部门。',
  },
  tl: {
    asunto: 'Ang appointment mo sa Cajita de Bendición: {fecha}, {hora}',
    hola: 'Magandang araw, {nombre}:',
    listo: 'Kumpirmado na ang appointment mo. Hinihintay ka namin.',
    fecha: 'Petsa',
    hora: 'Oras',
    fila: 'Pila',
    lugar: 'Lugar',
    enCarro: 'Naka-kotse',
    aPie: 'Naglalakad',
    aPieTurno: 'Naglalakad (numero {turno})',
    qr: 'Ipakita ang code na ito pagdating mo. Para sa isang kahon lang ito, at para sa iyo lang.',
    siNoSeLee: 'Kung hindi mabasa ang code, ibigay ang numerong ito:',
    verCita: 'Tingnan ang appointment ko',
    siNoPuedes: 'Kung hindi ka na makakapunta, i-cancel ang appointment mo gamit ang button na iyon para magamit ng iba ang puwesto.',
    asuntoCancelada: 'Kinansela ang pamimigay sa {fecha}',
    cancelada: 'Kinansela ang pamimigay ng Cajita de Bendición sa {fecha}. Hindi na valid ang appointment mo nang {hora}.',
    asuntoMovida: 'Inilipat ang appointment mo sa {fechaNueva}',
    movida: 'Inilipat ang pamimigay sa {fecha} sa {fechaNueva}, parehong oras ({hora}). Gumagana pa rin ang code mo.',
    mensaje: 'Mensahe mula sa simbahan:',
    otraCita: 'Puwede kang mag-appointment sa ibang araw:',
    hacerOtra: 'Mag-appointment ulit',
    noResponder: 'Kusang ipinadala ang email na ito; huwag itong sagutin. May tanong? Tumawag sa {telefono}.',
    privacidad: 'Pribado ang impormasyon mo: hindi namin ito ibinabahagi kaninuman, pati sa mga awtoridad.',
  },
  ko: {
    asunto: 'Cajita de Bendición 예약 안내: {fecha}, {hora}',
    hola: '{nombre}님, 안녕하세요.',
    listo: '예약이 확정되었습니다. 기다리고 있겠습니다.',
    fecha: '날짜',
    hora: '시간',
    fila: '줄',
    lugar: '장소',
    enCarro: '차로',
    aPie: '걸어서',
    aPieTurno: '걸어서 (번호 {turno})',
    qr: '도착하시면 이 코드를 보여 주세요. 상자 하나에만 쓸 수 있고, 본인만 쓸 수 있습니다.',
    siNoSeLee: '코드가 읽히지 않으면 이 번호를 말씀해 주세요:',
    verCita: '내 예약 보기',
    siNoPuedes: '오실 수 없게 되면 이 버튼으로 예약을 취소해 주세요. 다른 분이 그 자리를 쓸 수 있습니다.',
    asuntoCancelada: '{fecha} 배부가 취소되었습니다',
    cancelada: 'Cajita de Bendición의 {fecha} 배부가 취소되었습니다. {hora} 예약은 더 이상 쓸 수 없습니다.',
    asuntoMovida: '예약이 {fechaNueva}(으)로 바뀌었습니다',
    movida: '{fecha} 배부가 {fechaNueva}(으)로 옮겨졌습니다. 시간은 같습니다({hora}). 코드도 그대로 쓰면 됩니다.',
    mensaje: '교회에서 전하는 말:',
    otraCita: '다른 날로 예약할 수 있습니다:',
    hacerOtra: '다른 날 예약하기',
    noResponder: '이 메일은 자동으로 보내졌습니다. 답장하지 마세요. 문의: {telefono}',
    privacidad: '개인 정보는 비공개입니다. 정부 기관을 포함해 누구와도 공유하지 않습니다.',
  },
  ht: {
    asunto: 'Randevou ou nan Cajita de Bendición: {fecha}, {hora}',
    hola: 'Bonjou {nombre},',
    listo: 'Randevou ou konfime. N ap tann ou.',
    fecha: 'Dat',
    hora: 'Lè',
    fila: 'Liy',
    lugar: 'Kote',
    enCarro: 'An machin',
    aPie: 'Apye',
    aPieTurno: 'Apye (nimewo {turno})',
    qr: 'Montre kòd sa a lè ou rive. Li bon pou yon sèl bwat, e se pou ou sèlman.',
    siNoSeLee: 'Si yo pa ka li kòd la, bay nimewo sa a:',
    verCita: 'Gade randevou mwen',
    siNoPuedes: 'Si ou pa ka vini ankò, anile randevou ou ak bouton sa a pou yon lòt moun ka pran plas la.',
    asuntoCancelada: 'Yo anile distribisyon {fecha} an',
    cancelada: 'Yo anile distribisyon Cajita de Bendición {fecha} an. Randevou ou a {hora} pa bon ankò.',
    asuntoMovida: 'Randevou ou chanje jou: kounye a se {fechaNueva}',
    movida: 'Distribisyon {fecha} an deplase pou {fechaNueva}, menm lè a ({hora}). Menm kòd ou a bon toujou.',
    mensaje: 'Mesaj legliz la:',
    otraCita: 'Ou ka pran yon randevou pou yon lòt jou:',
    hacerOtra: 'Pran yon lòt randevou',
    noResponder: 'Imèl sa a voye pou kont li; tanpri pa reponn li. Ou gen kesyon? Rele {telefono}.',
    privacidad: 'Enfòmasyon ou yo prive: nou pa pataje yo ak pèsonn, menm ak otorite yo.',
  },
  ru: {
    asunto: 'Ваша запись в Cajita de Bendición: {fecha}, {hora}',
    hola: 'Здравствуйте, {nombre}!',
    listo: 'Ваша запись подтверждена. Ждём вас.',
    fecha: 'Дата',
    hora: 'Время',
    fila: 'Очередь',
    lugar: 'Место',
    enCarro: 'На машине',
    aPie: 'Пешком',
    aPieTurno: 'Пешком (номер {turno})',
    qr: 'Покажите этот код, когда придёте. Он действует на одну коробку и только для вас.',
    siNoSeLee: 'Если код не сканируется, назовите этот номер:',
    verCita: 'Открыть мою запись',
    siNoPuedes: 'Если вы не сможете прийти, отмените запись этой кнопкой, чтобы место досталось другому человеку.',
    asuntoCancelada: 'Раздача отменена: {fecha}',
    cancelada: 'Раздача Cajita de Bendición ({fecha}) отменена. Ваша запись на {hora} больше не действует.',
    asuntoMovida: 'Ваша запись перенесена на {fechaNueva}',
    movida: 'Раздача ({fecha}) перенесена на {fechaNueva}, в то же время ({hora}). Ваш код по-прежнему действует.',
    mensaje: 'Сообщение от церкви:',
    otraCita: 'Можно записаться на другой день:',
    hacerOtra: 'Записаться на другой день',
    noResponder: 'Это письмо отправлено автоматически, отвечать на него не нужно. Есть вопросы? Звоните: {telefono}.',
    privacidad: 'Ваши данные конфиденциальны: мы никому их не передаём, в том числе властям.',
  },
  so: {
    asunto: 'Ballantaada Cajita de Bendición: {fecha}, {hora}',
    hola: 'Salaan {nombre},',
    listo: 'Ballantaada waa la xaqiijiyay. Waan ku sugaynaa.',
    fecha: 'Taariikhda',
    hora: 'Waqtiga',
    fila: 'Safka',
    lugar: 'Goobta',
    enCarro: 'Baabuur',
    aPie: 'Lug',
    aPieTurno: 'Lug (lambarka {turno})',
    qr: 'Tus koodkan marka aad timaado. Hal sanduuq oo keliya ayuu ku siinayaa, adiga oo keliya ayuuna kuu yahay.',
    siNoSeLee: 'Haddii koodka la akhrin waayo, sheeg lambarkan:',
    verCita: 'Eeg ballantayda',
    siNoPuedes: 'Haddii aadan imaan karin, badhankaas ku jooji ballantaada si qof kale meesha u isticmaalo.',
    asuntoCancelada: 'Qaybinta {fecha} waa la joojiyay',
    cancelada: 'Qaybinta Cajita de Bendición ee {fecha} waa la joojiyay. Ballantaada {hora} hadda ma shaqeyso.',
    asuntoMovida: 'Ballantaada waxaa loo wareejiyay {fechaNueva}',
    movida: 'Qaybinta {fecha} waxaa loo wareejiyay {fechaNueva}, isla waqtigii ({hora}). Koodkaagu wali wuu shaqeeyaa.',
    mensaje: 'Fariinta kaniisadda:',
    otraCita: 'Waxaad ballan u qabsan kartaa maalin kale:',
    hacerOtra: 'Qabso ballan kale',
    noResponder: 'Iimaylkan si toos ah ayaa loo diray; fadlan ha ka jawaabin. Su’aal ma qabtaa? Wac {telefono}.',
    privacidad: 'Xogtaadu waa qarsoodi: cidna lama wadaagno, oo ay ku jiraan maamulka dawladda.',
  },
  fr: {
    asunto: 'Votre rendez-vous à Cajita de Bendición : {fecha}, {hora}',
    hola: 'Bonjour {nombre},',
    listo: 'Votre rendez-vous est confirmé. Nous vous attendons.',
    fecha: 'Date',
    hora: 'Heure',
    fila: 'File',
    lugar: 'Lieu',
    enCarro: 'En voiture',
    aPie: 'À pied',
    aPieTurno: 'À pied (numéro {turno})',
    qr: 'Montrez ce code à votre arrivée. Il vaut pour un seul colis et il est à vous seul.',
    siNoSeLee: 'Si le code ne se lit pas, donnez ce numéro :',
    verCita: 'Voir mon rendez-vous',
    siNoPuedes: 'Si vous ne pouvez plus venir, annulez votre rendez-vous avec ce bouton pour qu’une autre personne profite de la place.',
    asuntoCancelada: 'La distribution du {fecha} est annulée',
    cancelada: 'La distribution de Cajita de Bendición du {fecha} est annulée. Votre rendez-vous de {hora} n’est plus valable.',
    asuntoMovida: 'Votre rendez-vous est déplacé au {fechaNueva}',
    movida: 'La distribution du {fecha} est déplacée au {fechaNueva}, à la même heure ({hora}). Votre code reste valable.',
    mensaje: 'Message de l’église :',
    otraCita: 'Vous pouvez prendre rendez-vous pour un autre jour :',
    hacerOtra: 'Prendre un autre rendez-vous',
    noResponder: 'Cet e-mail est envoyé automatiquement ; merci de ne pas y répondre. Des questions ? Appelez le {telefono}.',
    privacidad: 'Vos informations sont confidentielles : nous ne les partageons avec personne, y compris les autorités.',
  },
}

const poner = (texto, valores) => texto.replace(/\{(\w+)\}/g, (_, k) => valores[k] ?? '')

export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "2026-11-02" -> "lunes, 2 de noviembre" (sin que la zona horaria lo mueva un dia). */
export function fechaLarga(fecha, idioma = 'es') {
  if (!fecha) return ''
  const [anio, mes, dia] = String(fecha).slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(LOCALES[idioma] ?? LOCALES.es, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(anio, mes - 1, dia)))
}

/** "15:15:00" -> "3:15 PM", como en la app. */
export function horaCorta(hora) {
  if (!hora) return ''
  const [h, m] = String(hora).split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/**
 * El correo de una fila de correos_por_enviar(): { asunto, texto, html }.
 * c: { tipo, idioma, nombre, fecha, hora, fila, turno, codigo_corto,
 *      token_qr, fecha_anterior, mensaje }
 * opciones.sitio: https://citas.casadealabanzasd.com (sin / al final)
 */
export function armarCorreo(c, { sitio }) {
  const idioma = TEXTOS[c.idioma] ? c.idioma : 'es'
  const t = TEXTOS[idioma]
  const nombre = (c.nombre ?? '').trim().split(/\s+/)[0] || ''
  const hora = horaCorta(c.hora)
  const enlaceCita = `${sitio}/confirmacion/${encodeURIComponent(c.token_qr ?? '')}`
  const enlaceCalendario = `${sitio}/calendario`
  const pie = [poner(t.noResponder, { telefono: TELEFONO }), t.privacidad]

  if (c.tipo === 'entrega_cancelada') {
    const fecha = fechaLarga(c.fecha, idioma)
    const parrafos = [poner(t.cancelada, { fecha, hora })]
    return completar({
      asunto: poner(t.asuntoCancelada, { fecha }),
      hola: poner(t.hola, { nombre }),
      parrafos,
      mensaje: c.mensaje ? { titulo: t.mensaje, texto: c.mensaje } : null,
      despues: t.otraCita,
      boton: { texto: t.hacerOtra, href: enlaceCalendario },
      pie,
      sitio,
      idioma,
    })
  }

  if (c.tipo === 'entrega_movida') {
    const fecha = fechaLarga(c.fecha_anterior, idioma)
    const fechaNueva = fechaLarga(c.fecha, idioma)
    return completar({
      asunto: poner(t.asuntoMovida, { fechaNueva }),
      hola: poner(t.hola, { nombre }),
      parrafos: [poner(t.movida, { fecha, fechaNueva, hora })],
      mensaje: c.mensaje ? { titulo: t.mensaje, texto: c.mensaje } : null,
      boton: { texto: t.verCita, href: enlaceCita },
      pie,
      sitio,
      idioma,
    })
  }

  //  Confirmacion.
  const fecha = fechaLarga(c.fecha, idioma)
  const fila = c.fila === 'a_pie' ? (c.turno ? poner(t.aPieTurno, { turno: c.turno }) : t.aPie) : t.enCarro
  return completar({
    asunto: poner(t.asunto, { fecha, hora }),
    hola: poner(t.hola, { nombre }),
    parrafos: [t.listo],
    datos: [
      [t.fecha, fecha],
      ...(c.fila === 'a_pie' ? [] : [[t.hora, hora]]),
      [t.fila, fila],
      [t.lugar, DIRECCION],
    ],
    qr: { texto: t.qr, siNoSeLee: t.siNoSeLee, codigo: c.codigo_corto },
    boton: { texto: t.verCita, href: enlaceCita },
    despues: t.siNoPuedes,
    pie,
    sitio,
    idioma,
  })
}

//  El telefono no se parte en dos renglones.
const conTelefonoEntero = (html) =>
  html.replace(escaparHtml(TELEFONO), `<span style="white-space:nowrap">${escaparHtml(TELEFONO)}</span>`)

//  Texto plano y HTML del mismo contenido.
function completar(p) {
  const texto = [
    p.hola,
    '',
    ...p.parrafos,
    ...(p.datos ? ['', ...p.datos.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(p.qr ? ['', p.qr.texto, `${p.qr.siNoSeLee} ${p.qr.codigo}`] : []),
    ...(p.mensaje ? ['', `${p.mensaje.titulo} ${p.mensaje.texto}`] : []),
    ...(p.despues && !p.qr ? ['', p.despues] : []),
    '',
    `${p.boton.texto}: ${p.boton.href}`,
    ...(p.despues && p.qr ? ['', p.despues] : []),
    '',
    '--',
    ...p.pie,
    `${NOMBRE_REMITENTE} · Iglesia Casa de Alabanza · ${DIRECCION}`,
  ].join('\n')

  const e = escaparHtml
  const parrafo = (x) => `<p style="margin:0 0 14px;font-size:17px;line-height:1.5;color:${AZUL}">${e(x)}</p>`
  const html = `<!doctype html>
<html lang="${e(p.idioma)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(p.asunto)}</title></head>
<body style="margin:0;padding:0;background:#F3F5F9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F9">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="padding:28px 24px 8px">
<img src="${e(p.sitio)}/logos/cajita-correo.jpg" width="96" height="96" alt="${e(NOMBRE_REMITENTE)}" style="display:block;border-radius:48px">
</td></tr>
<tr><td style="padding:16px 28px 8px">
${parrafo(p.hola)}
${p.parrafos.map(parrafo).join('\n')}
</td></tr>
${
  p.datos
    ? `<tr><td style="padding:0 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F5F9;border-radius:12px">
${p.datos
  .map(
    ([k, v]) =>
      `<tr><td style="padding:10px 16px;font-size:15px;color:#4A5A75;width:30%">${e(k)}</td><td style="padding:10px 16px;font-size:17px;font-weight:bold;color:${AZUL}">${e(v)}</td></tr>`,
  )
  .join('\n')}
</table>
</td></tr>`
    : ''
}
${
  p.qr
    ? `<tr><td align="center" style="padding:24px 28px 8px">
<img src="cid:qr@cajita" width="240" height="240" alt="QR" style="display:block;border:4px solid ${NARANJA};border-radius:12px">
<p style="margin:14px 0 6px;font-size:16px;line-height:1.5;color:${AZUL}">${e(p.qr.texto)}</p>
<p style="margin:0;font-size:15px;color:#4A5A75">${e(p.qr.siNoSeLee)}</p>
<p style="margin:4px 0 0;font-size:30px;font-weight:bold;letter-spacing:2px;color:${AZUL}">${e(p.qr.codigo)}</p>
</td></tr>`
    : ''
}
${
  p.mensaje
    ? `<tr><td style="padding:8px 28px 0">
<p style="margin:0;padding:14px 16px;background:#FFF4E6;border-radius:12px;font-size:16px;line-height:1.5;color:${AZUL}"><strong>${e(p.mensaje.titulo)}</strong> ${e(p.mensaje.texto)}</p>
</td></tr>`
    : ''
}
${p.despues && !p.qr ? `<tr><td style="padding:18px 28px 0">${parrafo(p.despues)}</td></tr>` : ''}
<tr><td align="center" style="padding:20px 28px 8px">
<a href="${e(p.boton.href)}" style="display:inline-block;padding:16px 32px;background:${NARANJA};color:${AZUL};font-size:18px;font-weight:bold;text-decoration:none;border-radius:12px">${e(p.boton.texto)}</a>
</td></tr>
${p.despues && p.qr ? `<tr><td style="padding:12px 28px 0">${parrafo(p.despues)}</td></tr>` : ''}
<tr><td style="padding:16px 28px 28px;border-top:1px solid #E3E8F0">
${p.pie.map((x) => `<p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#4A5A75">${conTelefonoEntero(e(x))}</p>`).join('\n')}
<p style="margin:12px 0 0;font-size:15px;color:#4A5A75">${e(NOMBRE_REMITENTE)} · Iglesia Casa de Alabanza<br>${e(DIRECCION)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { asunto: p.asunto, texto, html }
}

// ------------------------------------------------------------
//  MIME: el correo tal cual se le entrega a Amazon SES
// ------------------------------------------------------------

const utf8 = (texto) => new TextEncoder().encode(texto)

/** Bytes o texto a base64 (btoa existe en Deno, en Node y en el navegador). */
export function aBase64(datos) {
  const bytes = typeof datos === 'string' ? utf8(datos) : datos
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

//  Las lineas de un correo no pasan de 76 caracteres.
const enLineas = (b64) => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd()

/**
 * Un encabezado con acentos (RFC 2047): "=?UTF-8?B?...?=", partido en
 * pedazos sin cortar una letra a la mitad.
 */
export function encabezado(texto) {
  if (/^[\x20-\x7e]*$/.test(texto)) return texto
  const pedazos = []
  let actual = ''
  for (const letra of texto) {
    if (utf8(actual + letra).length > 45) {
      pedazos.push(actual)
      actual = ''
    }
    actual += letra
  }
  if (actual) pedazos.push(actual)
  return pedazos.map((p) => `=?UTF-8?B?${aBase64(p)}?=`).join('\r\n ')
}

/**
 * El mensaje completo. qr: los bytes del PNG (o null). Devuelve texto con
 * saltos CRLF, listo para SES (Content.Raw.Data, en base64).
 */
export function armarMime({ de, para, asunto, texto, html, qr = null, fecha = new Date() }) {
  const id = Math.random().toString(36).slice(2, 12)
  const mixto = `cajita-r-${id}`
  const alterno = `cajita-a-${id}`
  const lineas = [
    `From: ${encabezado(NOMBRE_REMITENTE)} <${de}>`,
    `To: <${para}>`,
    `Subject: ${encabezado(asunto)}`,
    `Date: ${fecha.toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${mixto}"`,
    '',
    `--${mixto}`,
    `Content-Type: multipart/alternative; boundary="${alterno}"`,
    '',
    `--${alterno}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    enLineas(aBase64(texto)),
    `--${alterno}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    enLineas(aBase64(html)),
    `--${alterno}--`,
  ]
  if (qr) {
    lineas.push(
      `--${mixto}`,
      'Content-Type: image/png; name="codigo-qr.png"',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <qr@cajita>',
      'Content-Disposition: inline; filename="codigo-qr.png"',
      '',
      enLineas(aBase64(qr)),
    )
  }
  lineas.push(`--${mixto}--`, '')
  return lineas.join('\r\n')
}
