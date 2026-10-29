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
 */

export const TELEFONO = '(619) 734-5886'
export const DIRECCION = '4250 El Cajon Blvd, San Diego, CA 92105'
export const NOMBRE_REMITENTE = 'Cajita de Bendición'

//  Los colores del logo (los mismos de la app).
const AZUL = '#1B3A6B'
const NARANJA = '#F5A03C'

const LOCALES = { es: 'es-MX', en: 'en-US', vi: 'vi-VN' }

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
