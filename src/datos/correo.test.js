import { describe, expect, it } from 'vitest'
import {
  aBase64,
  armarCorreo,
  armarMime,
  encabezado,
  fechaLarga,
  horaCorta,
} from '../../supabase/functions/enviar-correos/correo.js'

const SITIO = 'https://citas.casadealabanzasd.com'

const CITA = {
  tipo: 'confirmacion',
  idioma: 'es',
  nombre: 'María José',
  fecha: '2026-11-02',
  hora: '15:15:00',
  fila: 'carro',
  turno: null,
  codigo_corto: 'CB-48712',
  token_qr: 'tok123',
  fecha_anterior: null,
  mensaje: null,
}

//  Lo que dice una parte base64 del mensaje, ya decodificada.
function parte(mime, tipo) {
  const bloque = mime.split(`Content-Type: ${tipo}`)[1]
  const cuerpo = bloque.split('\r\n\r\n')[1].split('\r\n--')[0]
  return Buffer.from(cuerpo.replace(/\r\n/g, ''), 'base64').toString('utf8')
}

describe('armarCorreo: confirmacion', () => {
  it('lleva fecha, hora, su codigo, su QR y el boton a su cita', () => {
    const c = armarCorreo(CITA, { sitio: SITIO })

    expect(c.asunto).toBe('Tu cita en Cajita de Bendición: lunes, 2 de noviembre, 3:15 PM')
    expect(c.texto).toContain('Hola, María:')
    expect(c.texto).toContain('Hora: 3:15 PM')
    expect(c.texto).toContain('Fila: En carro')
    expect(c.texto).toContain('CB-48712')
    expect(c.texto).toContain(`${SITIO}/confirmacion/tok123`)
    expect(c.html).toContain('src="cid:qr@cajita"')
    expect(c.html).toContain(`href="${SITIO}/confirmacion/tok123"`)
    expect(c.html).toContain('<html lang="es">')
  })

  it('dice que no se responda y que la informacion no se comparte', () => {
    const c = armarCorreo(CITA, { sitio: SITIO })
    expect(c.texto).toContain('no lo respondas')
    expect(c.texto).toContain('(619) 734-5886')
    expect(c.texto).toContain('tampoco con las autoridades')
  })

  it('sale en el idioma de la persona; uno que no hay, en espanol', () => {
    expect(armarCorreo({ ...CITA, idioma: 'en' }, { sitio: SITIO }).asunto).toBe(
      'Your Cajita de Bendición appointment: Monday, November 2, 3:15 PM',
    )
    expect(armarCorreo({ ...CITA, idioma: 'vi' }, { sitio: SITIO }).asunto).toMatch(/^Lịch hẹn của bạn/)
    expect(armarCorreo({ ...CITA, idioma: 'fr' }, { sitio: SITIO }).asunto).toMatch(/^Tu cita/)
  })

  it('a pie dice su turno y no una hora', () => {
    const c = armarCorreo({ ...CITA, fila: 'a_pie', turno: 17 }, { sitio: SITIO })
    expect(c.texto).toContain('Fila: A pie (turno 17)')
    expect(c.texto).not.toContain('Hora:')
  })

  it('un nombre con simbolos no se cuela como HTML', () => {
    const c = armarCorreo({ ...CITA, nombre: '<b>Ana</b> López' }, { sitio: SITIO })
    expect(c.html).toContain('&lt;b&gt;Ana&lt;/b&gt;')
    expect(c.html).not.toContain('<b>Ana')
  })
})

describe('armarCorreo: avisos de la entrega', () => {
  it('cancelada: el dia, el mensaje de la iglesia y el boton para otra cita; sin QR', () => {
    const c = armarCorreo({ ...CITA, tipo: 'entrega_cancelada', mensaje: 'Por lluvia' }, { sitio: SITIO })
    expect(c.asunto).toBe('Se canceló la entrega del lunes, 2 de noviembre')
    expect(c.texto).toContain('Tu cita de las 3:15 PM ya no es válida.')
    expect(c.texto).toContain('Mensaje de la iglesia: Por lluvia')
    expect(c.texto).toContain(`${SITIO}/calendario`)
    expect(c.html).not.toContain('cid:qr@cajita')
  })

  it('movida: de que dia a que dia, a la misma hora', () => {
    const c = armarCorreo(
      { ...CITA, tipo: 'entrega_movida', idioma: 'en', fecha: '2026-11-05', fecha_anterior: '2026-11-02' },
      { sitio: SITIO },
    )
    expect(c.asunto).toBe('Your appointment moved to Thursday, November 5')
    expect(c.texto).toContain('The Monday, November 2 distribution moved to Thursday, November 5, at the same time (3:15 PM).')
    expect(c.texto).toContain(`${SITIO}/confirmacion/tok123`)
  })
})

describe('fechas y horas', () => {
  it('la fecha no se recorre un dia por la zona horaria', () => {
    expect(fechaLarga('2026-11-02')).toBe('lunes, 2 de noviembre')
    expect(fechaLarga('2026-11-02T00:00:00')).toBe('lunes, 2 de noviembre')
  })

  it('la hora como en la app', () => {
    expect(horaCorta('15:15:00')).toBe('3:15 PM')
    expect(horaCorta('00:05')).toBe('12:05 AM')
    expect(horaCorta('12:00')).toBe('12:00 PM')
  })
})

describe('MIME', () => {
  it('un encabezado con acentos va codificado, en pedazos cortos, y se lee igual', () => {
    expect(encabezado('Hola')).toBe('Hola')
    const asunto = 'Tu cita en Cajita de Bendición: miércoles, 2 de diciembre, 3:15 PM — ñandú'
    const codificado = encabezado(asunto)
    const pedazos = codificado.split('\r\n ')
    expect(pedazos.every((p) => p.length <= 75 && p.startsWith('=?UTF-8?B?') && p.endsWith('?='))).toBe(true)
    const leido = pedazos.map((p) => Buffer.from(p.slice(10, -2), 'base64').toString('utf8')).join('')
    expect(leido).toBe(asunto)
  })

  it('base64 de bytes igual que el de Node', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64])
    expect(aBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })

  it('el mensaje trae texto, HTML y el QR adentro; lineas cortas y CRLF', () => {
    const c = armarCorreo(CITA, { sitio: SITIO })
    const qr = new Uint8Array(2000).map((_, i) => i % 256)
    const mime = armarMime({ de: 'citas@envios.casadealabanzasd.com', para: 'maria@gmail.com', ...c, qr })

    expect(mime).toContain('From: =?UTF-8?B?')
    expect(mime).toContain('<citas@envios.casadealabanzasd.com>')
    expect(mime).toContain('To: <maria@gmail.com>')
    expect(mime).toContain('Content-ID: <qr@cajita>')
    expect(mime.split('\r\n').every((linea) => linea.length <= 998)).toBe(true)
    expect(mime.replace(/\r\n/g, '')).not.toContain('\n')
    expect(parte(mime, 'text/plain; charset=UTF-8')).toBe(c.texto)
    expect(parte(mime, 'text/html; charset=UTF-8')).toBe(c.html)
    const imagen = mime.split('Content-Disposition: inline; filename="codigo-qr.png"\r\n\r\n')[1].split('\r\n--')[0]
    expect(new Uint8Array(Buffer.from(imagen.replace(/\r\n/g, ''), 'base64'))).toEqual(qr)
  })

  it('sin QR no lleva imagen', () => {
    const c = armarCorreo({ ...CITA, tipo: 'entrega_cancelada' }, { sitio: SITIO })
    const mime = armarMime({ de: 'citas@envios.casadealabanzasd.com', para: 'maria@gmail.com', ...c })
    expect(mime).not.toContain('image/png')
  })
})
