/**
 * "Agregar a mi calendario": la cita en el calendario del telefono, con un
 * recordatorio antes.
 *
 * Mucha gente hace su cita dias antes y se le olvida. El evento lleva el
 * enlace que abre su codigo: del recordatorio al QR en un toque.
 *
 * En Android se abre Google Calendar (es lo que trae casi todo Android, y
 * un archivo .ics ahi solo se descarga sin decir nada). En iPhone y en
 * computadora se descarga el archivo estandar .ics, que el iPhone abre
 * directo en su Calendario.
 *
 * Todo se arma aqui, en el telefono. No se manda nada a ningun lado: el
 * evento lo guarda la persona en su propio calendario.
 */

const ZONA = 'America/Los_Angeles'

/** Cuanto dura en el calendario: lo que dura un horario. */
export const MINUTOS_CITA = 15

/** Cuanto antes suena el recordatorio. */
export const HORAS_AVISO = 2

/**
 * La hora de San Diego ('2026-09-24', '15:15') convertida a UTC, sin
 * importar en que zona este el telefono. Respeta el horario de verano.
 */
export function aUtc(fecha, hora) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const [h, m] = String(hora).split(':').map(Number)

  //  Se adivina con UTC y se corrige por la diferencia que tenga San Diego
  //  en ese momento (7 horas en verano, 8 en invierno).
  const supuesta = Date.UTC(anio, mes - 1, dia, h, m)
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(supuesta))
      .map(({ type, value }) => [type, value]),
  )
  const comoSeVe = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute)

  return new Date(supuesta + (supuesta - comoSeVe))
}

/** Fecha en el formato de los calendarios: 20260924T221500Z. */
function formatoCalendario(fecha) {
  return fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** RFC 5545: comas, puntos y coma, diagonales y saltos van escapados. */
function escapar(texto) {
  return String(texto ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545: ningun renglon pasa de 75 bytes; los largos siguen en el
 * siguiente con un espacio al inicio. Se corta por caracteres completos
 * para no partir una letra con acento a la mitad.
 */
function doblar(renglon) {
  const bytes = (texto) => new TextEncoder().encode(texto).length
  if (bytes(renglon) <= 75) return renglon

  const partes = []
  let actual = ''
  for (const letra of renglon) {
    const limite = partes.length === 0 ? 75 : 74
    if (bytes(actual + letra) > limite) {
      partes.push(actual)
      actual = letra
    } else {
      actual += letra
    }
  }
  partes.push(actual)
  return partes.join('\r\n ')
}

/**
 * El archivo .ics. `ahora` se pasa para que las pruebas den siempre lo
 * mismo.
 */
export function archivoIcs({ fecha, hora, codigo, titulo, lugar, descripcion, enlace, aviso }, ahora = new Date()) {
  const inicio = aUtc(fecha, hora)
  const fin = new Date(inicio.getTime() + MINUTOS_CITA * 60000)

  const renglones = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Iglesia Casa de Alabanza//Cajita de Bendicion//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:cita-${escapar(codigo)}-${fecha}@citas.casadealabanzasd.com`,
    `DTSTAMP:${formatoCalendario(ahora)}`,
    `DTSTART:${formatoCalendario(inicio)}`,
    `DTEND:${formatoCalendario(fin)}`,
    `SUMMARY:${escapar(titulo)}`,
    `LOCATION:${escapar(lugar)}`,
    `DESCRIPTION:${escapar(descripcion)}`,
    enlace ? `URL:${enlace}` : null,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-PT${HORAS_AVISO}H`,
    `DESCRIPTION:${escapar(aviso ?? titulo)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return renglones.map(doblar).join('\r\n') + '\r\n'
}

/** El enlace que abre Google Calendar con la cita ya llena. */
export function enlaceGoogleCalendar({ fecha, hora, titulo, lugar, descripcion }) {
  const inicio = aUtc(fecha, hora)
  const fin = new Date(inicio.getTime() + MINUTOS_CITA * 60000)

  const parametros = new URLSearchParams({
    action: 'TEMPLATE',
    text: titulo,
    dates: `${formatoCalendario(inicio)}/${formatoCalendario(fin)}`,
    details: descripcion,
    location: lugar,
    ctz: ZONA,
  })

  return `https://calendar.google.com/calendar/render?${parametros.toString()}`
}

/** Android abre Google Calendar; lo demas descarga el .ics. */
export function usarGoogleCalendar(agente = globalThis.navigator?.userAgent) {
  return /android/i.test(String(agente ?? ''))
}

export function nombreArchivoCalendario(codigo) {
  return `cita-cajita-${String(codigo ?? 'cita').replace(/[^A-Za-z0-9-]/g, '')}.ics`
}
