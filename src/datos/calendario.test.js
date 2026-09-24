import { describe, expect, it } from 'vitest'
import {
  HORAS_AVISO,
  aUtc,
  archivoIcs,
  enlaceGoogleCalendar,
  nombreArchivoCalendario,
  usarGoogleCalendar,
} from './calendario'

const CITA = {
  fecha: '2026-09-24',
  hora: '15:15:00',
  codigo: 'CB-4871',
  titulo: 'Cajita de Bendición: tu cita',
  lugar: 'Iglesia Casa de Alabanza, 4250 El Cajon Blvd, San Diego, CA 92105',
  descripcion: 'Tu código: CB-4871.\nLlega 5 minutos antes; lleva tu QR.',
  enlace: 'https://citas.casadealabanzasd.com/confirmacion/abc123',
  aviso: 'Hoy es tu cita de Cajita de Bendición',
}

describe('la hora de San Diego, en cualquier teléfono', () => {
  it('en septiembre (horario de verano) San Diego va 7 horas atrás de UTC', () => {
    expect(aUtc('2026-09-24', '15:15').toISOString()).toBe('2026-09-24T22:15:00.000Z')
  })

  it('en diciembre (horario de invierno) va 8 horas atrás', () => {
    expect(aUtc('2026-12-03', '15:15').toISOString()).toBe('2026-12-03T23:15:00.000Z')
  })

  it('una cita a las 6:30 PM cae al día siguiente en UTC, y está bien', () => {
    expect(aUtc('2026-09-24', '18:30').toISOString()).toBe('2026-09-25T01:30:00.000Z')
  })
})

describe('el archivo .ics', () => {
  const ics = archivoIcs(CITA, new Date('2026-09-20T12:00:00Z'))

  it('tiene inicio, fin de 15 minutos y el lugar', () => {
    expect(ics).toContain('DTSTART:20260924T221500Z')
    expect(ics).toContain('DTEND:20260924T223000Z')
    //  El renglon del lugar es largo y va doblado: se lee ya desdoblado.
    expect(ics.replace(/\r\n /g, '')).toContain('LOCATION:Iglesia Casa de Alabanza\\, 4250 El Cajon Blvd\\, San Diego\\, CA 92105')
  })

  it(`suena ${HORAS_AVISO} horas antes`, () => {
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain(`TRIGGER:-PT${HORAS_AVISO}H`)
  })

  it('lleva el enlace que abre el código', () => {
    expect(ics.replace(/\r\n /g, '')).toContain('URL:https://citas.casadealabanzasd.com/confirmacion/abc123')
  })

  it('escapa comas y saltos de renglón (si no, el calendario corta el texto)', () => {
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:Tu código: CB-4871.\\nLlega 5 minutos antes; lleva tu QR.'.replace(';', '\\;'))
  })

  it('usa CRLF y ningún renglón pasa de 75 bytes (RFC 5545)', () => {
    const renglones = ics.split('\r\n').filter(Boolean)
    expect(ics.includes('\n') && !ics.replace(/\r\n/g, '').includes('\n')).toBe(true)
    for (const renglon of renglones) expect(new TextEncoder().encode(renglon).length).toBeLessThanOrEqual(75)
  })

  it('doblar un renglón largo no parte las letras con acento', () => {
    const largo = archivoIcs({ ...CITA, descripcion: 'áéíóú ñ '.repeat(30) }, new Date('2026-09-20T12:00:00Z'))
    const desdoblado = largo.replace(/\r\n /g, '')
    expect(desdoblado).toContain('áéíóú ñ áéíóú ñ')
    expect(largo).not.toContain('�')
  })

  it('el mismo código y fecha dan el mismo UID: agregarlo dos veces no duplica', () => {
    expect(ics).toContain('UID:cita-CB-4871-2026-09-24@citas.casadealabanzasd.com')
  })
})

describe('Google Calendar en Android', () => {
  it('arma el enlace con la hora en UTC y la zona de San Diego', () => {
    const url = new URL(enlaceGoogleCalendar(CITA))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('dates')).toBe('20260924T221500Z/20260924T223000Z')
    expect(url.searchParams.get('ctz')).toBe('America/Los_Angeles')
    expect(url.searchParams.get('text')).toBe(CITA.titulo)
  })

  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile', true],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', false],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128', false],
    [undefined, false],
  ])('%s -> Google Calendar: %s', (agente, esperado) => {
    expect(usarGoogleCalendar(agente)).toBe(esperado)
  })

  it('el nombre del archivo solo lleva letras, números y guiones', () => {
    expect(nombreArchivoCalendario('CB-4871')).toBe('cita-cajita-CB-4871.ics')
    expect(nombreArchivoCalendario('../x')).toBe('cita-cajita-x.ics')
  })
})
