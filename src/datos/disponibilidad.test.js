import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import {
  aFechaLocal,
  agruparPorFecha,
  ahoraSanDiego,
  consultarBloquesDeFecha,
  consultarDisponibilidad,
  desglosarSegundos,
  elegirProximaEntrega,
  formatearFechaHora,
  formatearHora,
  horasEntre,
  restarHoras,
  segundosHasta,
  sumarDias,
} from './disponibilidad'

beforeEach(() => {
  supabase.rpc.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fechas', () => {
  it('aFechaLocal no se corre al dia anterior por la zona horaria', () => {
    const fecha = aFechaLocal('2026-09-14')
    expect([fecha.getFullYear(), fecha.getMonth(), fecha.getDate()]).toEqual([2026, 8, 14])
  })

  it.each([
    ['2026-09-14', -3, '2026-09-11'],
    ['2026-12-30', 3, '2027-01-02'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-11-01', 0, '2026-11-01'],
  ])('sumarDias(%s, %s) = %s', (fecha, dias, esperado) => {
    expect(sumarDias(fecha, dias)).toBe(esperado)
  })

  it.each([
    ['14:45:00', '2:45 PM'],
    ['00:00:00', '12:00 AM'],
    ['12:00:00', '12:00 PM'],
    ['09:05', '9:05 AM'],
    ['23:59:59', '11:59 PM'],
  ])('formatearHora(%s) = %s', (hora, esperado) => {
    expect(formatearHora(hora)).toBe(esperado)
  })

  it.each([
    ['2026-09-25T12:00', 24, '2026-09-24T12:00'],
    ['2026-10-01T09:30', 48, '2026-09-29T09:30'],
    ['2026-01-01T00:30', 1, '2025-12-31T23:30'],
    ['2026-09-18T18:00', 2, '2026-09-18T16:00'],
    // Dia de cambio de horario: es hora de reloj, no se mueve.
    ['2026-03-08T03:00', 2, '2026-03-08T01:00'],
  ])('restarHoras(%s, %s) = %s', (marca, horas, esperado) => {
    expect(restarHoras(marca, horas)).toBe(esperado)
  })

  it('horasEntre', () => {
    expect(horasEntre('2026-09-24T12:00', '2026-09-25T12:00')).toBe(24)
    expect(horasEntre('2026-09-25T12:00', '2026-09-25T11:00')).toBe(-1)
  })

  it('formatearFechaHora en espanol e ingles', () => {
    const es = formatearFechaHora('2026-09-11T12:00:00', 'es')
    expect(es).toContain('viernes')
    expect(es).toContain('11')
    expect(es).toContain('septiembre')
    expect(es).toContain('12:00 PM')
    expect(formatearFechaHora('2026-09-11T12:00:00', 'en')).toBe('Friday, September 11, 12:00 PM')
    expect(formatearFechaHora(null, 'es')).toBe('')
  })
})

describe('hora de San Diego', () => {
  it.each([
    // Verano (UTC-7)
    ['2026-09-12T16:08:00Z', '2026-09-12T09:08'],
    // Invierno (UTC-8)
    ['2026-01-15T20:00:00Z', '2026-01-15T12:00'],
    // En UTC ya es otro dia, en San Diego todavia no
    ['2026-09-13T05:30:00Z', '2026-09-12T22:30'],
  ])('ahoraSanDiego: %s -> %s', (utc, esperado) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(utc))
    expect(ahoraSanDiego()).toBe(esperado)
  })

  it.each([
    ['2026-09-12T10:08:00', 3600],
    ['2026-09-12T10:08', 3600],
    ['2026-09-13T09:08:00', 86400],
    ['2026-09-12T09:08:30', 30],
    ['2026-09-12T09:07:30', -30],
    ['2026-09-12T02:04:00', -25440],
  ])('segundosHasta(%s) a las 9:08:00 AM = %s', (marca, esperado) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T16:08:00Z'))
    expect(segundosHasta(marca)).toBe(esperado)
  })

  it.each([
    [90061, { dias: 1, horas: 1, minutos: 1, segundos: 1 }],
    [3599, { dias: 0, horas: 0, minutos: 59, segundos: 59 }],
    [0, { dias: 0, horas: 0, minutos: 0, segundos: 0 }],
    [-5, { dias: 0, horas: 0, minutos: 0, segundos: 0 }],
    [259200.7, { dias: 3, horas: 0, minutos: 0, segundos: 0 }],
  ])('desglosarSegundos(%s)', (total, esperado) => {
    expect(desglosarSegundos(total)).toEqual(esperado)
  })
})

describe('agruparPorFecha', () => {
  const bloque = (fecha, libres, extra = {}) => ({ fecha, libres, ...extra })

  it('suma los lugares por fecha y respeta el orden', () => {
    const dias = agruparPorFecha([bloque('2026-09-14', 3), bloque('2026-09-14', 2), bloque('2026-09-17', 0)])
    expect(dias).toMatchObject([
      { fecha: '2026-09-14', libres: 5, bloques: 2 },
      { fecha: '2026-09-17', libres: 0, bloques: 1 },
    ])
  })

  it('primer y ultimo horario del dia', () => {
    const [dia] = agruparPorFecha([
      bloque('2026-09-14', 1, { hora: '14:15:00' }),
      bloque('2026-09-14', 1, { hora: '14:00:00' }),
      bloque('2026-09-14', 1, { hora: '18:30:00' }),
    ])
    expect(dia).toMatchObject({ primeraHora: '14:00:00', ultimaHora: '18:30:00' })
  })

  it('pasa la apertura de cada fecha', () => {
    const [dia] = agruparPorFecha([
      bloque('2026-09-21', 5, { abierto: false, abre_en: '2026-09-18T12:00:00', abre_anticipado_en: '2026-09-18T11:00:00' }),
    ])
    expect(dia).toMatchObject({ abierto: false, abreEn: '2026-09-18T12:00:00', abreAnticipadoEn: '2026-09-18T11:00:00' })
  })

  it('sin el dato de apertura (base sin migrar) se trata como abierta', () => {
    const [dia] = agruparPorFecha([bloque('2026-09-21', 5)])
    expect(dia.abierto).toBe(true)
  })

  it('lista vacia', () => {
    expect(agruparPorFecha([])).toEqual([])
  })
})

describe('elegirProximaEntrega', () => {
  it('la mas cercana, aunque lleguen desordenadas', () => {
    const dias = [
      { fecha: '2026-09-17', libres: 5 },
      { fecha: '2026-09-14', libres: 3 },
    ]
    expect(elegirProximaEntrega(dias).fecha).toBe('2026-09-14')
  })

  it('si la mas cercana esta llena, la siguiente con lugar', () => {
    const dias = [
      { fecha: '2026-09-14', libres: 0 },
      { fecha: '2026-09-17', libres: 5 },
    ]
    expect(elegirProximaEntrega(dias).fecha).toBe('2026-09-17')
  })

  it('una fecha bloqueada con lugares si se muestra (bloqueada)', () => {
    const dias = [
      { fecha: '2026-09-14', libres: 20, abierto: false },
      { fecha: '2026-09-17', libres: 5, abierto: true },
    ]
    expect(elegirProximaEntrega(dias)).toMatchObject({ fecha: '2026-09-14', abierto: false })
  })

  it('si todas estan llenas, la mas cercana (para decir que esta llena)', () => {
    const dias = [
      { fecha: '2026-09-17', libres: 0 },
      { fecha: '2026-09-14', libres: 0 },
    ]
    expect(elegirProximaEntrega(dias).fecha).toBe('2026-09-14')
  })

  it('sin fechas, nada', () => {
    expect(elegirProximaEntrega([])).toBeNull()
  })

  it('no cambia el orden de la lista original', () => {
    const dias = [{ fecha: '2026-09-17', libres: 1 }, { fecha: '2026-09-14', libres: 1 }]
    elegirProximaEntrega(dias)
    expect(dias[0].fecha).toBe('2026-09-17')
  })
})

describe('consultarDisponibilidad', () => {
  it('pide todo sin filtros', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ fecha: '2026-09-14' }], error: null })
    await expect(consultarDisponibilidad()).resolves.toEqual([{ fecha: '2026-09-14' }])
    expect(supabase.rpc).toHaveBeenCalledWith('consultar_disponibilidad', { p_desde: null, p_hasta: null })
  })

  it('una sola fecha', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await consultarBloquesDeFecha('2026-09-14')
    expect(supabase.rpc).toHaveBeenCalledWith('consultar_disponibilidad', { p_desde: '2026-09-14', p_hasta: '2026-09-14' })
  })

  it('sin datos devuelve lista vacia', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(consultarDisponibilidad()).resolves.toEqual([])
  })

  it('con error, falla', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'se cayo' } })
    await expect(consultarDisponibilidad()).rejects.toThrow('se cayo')
  })
})
