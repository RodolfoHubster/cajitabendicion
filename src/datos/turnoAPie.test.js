import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('./registro', () => ({ obtenerDispositivo: () => 'tel-de-prueba' }))

import { supabase } from '../lib/supabase'
import {
  avisoQueToca,
  darTurnoSinTelefono,
  dispositivoParaTurno,
  filaAPieHoy,
  guardarMiTurno,
  leerMiTurno,
  olvidarMiTurno,
  relojDeEspera,
  sacarTurnoAPie,
  traeTurno,
} from './turnoAPie'

function almacen() {
  const datos = new Map()
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  }
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('sacar el turno', () => {
  it('manda solo el identificador del teléfono (nada personal)', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'NUEVO', token_qr: 't', codigo: 'CB-1', turno: 7 }], error: null })
    await expect(sacarTurnoAPie()).resolves.toMatchObject({ resultado: 'NUEVO', turno: 7 })
    expect(supabase.rpc).toHaveBeenCalledWith('sacar_turno_a_pie', { p_dispositivo: 'tel-de-prueba', p_cambiar_carro: false })
  })

  it('al cambiarse de carro a pie lo dice', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'NUEVO', token_qr: 't' }], error: null })
    await sacarTurnoAPie({ cambiarCarro: true })
    expect(supabase.rpc.mock.calls[0][1].p_cambiar_carro).toBe(true)
  })

  it('con su código CB de carro (sección 46): solo los números, con su CB-, y solo si lo escribió', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'TIENE_CITA_EN_CARRO' }], error: null })
    await sacarTurnoAPie({ codigoCarro: ' cb-48213 ' })
    expect(supabase.rpc.mock.calls[0][1].p_codigo_carro).toBe('CB-48213')
    await sacarTurnoAPie({ codigoCarro: '' })
    expect(supabase.rpc.mock.calls[1][1]).not.toHaveProperty('p_codigo_carro')
    await sacarTurnoAPie()
    expect(supabase.rpc.mock.calls[2][1]).not.toHaveProperty('p_codigo_carro')
  })

  it('sin la actualización de la base lo dice; sin señal, también', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
    await expect(sacarTurnoAPie()).rejects.toThrow('FUNCION_NO_INSTALADA')
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await expect(sacarTurnoAPie()).rejects.toThrow('SIN_CONEXION')
  })

  it('sin almacén en el teléfono usa uno por visita (siempre el mismo)', () => {
    const uno = dispositivoParaTurno(() => null)
    expect(uno).toMatch(/^sin-almacen-/)
    expect(dispositivoParaTurno(() => null)).toBe(uno)
  })

  it('solo NUEVO y YA_TENIA traen turno', () => {
    expect(traeTurno({ resultado: 'NUEVO', token_qr: 't' })).toBe(true)
    expect(traeTurno({ resultado: 'YA_TENIA', token_qr: 't' })).toBe(true)
    expect(traeTurno({ resultado: 'TIENE_CITA_EN_CARRO', token_qr: null })).toBe(false)
    expect(traeTurno(null)).toBe(false)
  })

  it('la voluntaria da turno a quien no tiene teléfono', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ token_qr: 't', codigo: 'CB-4821', turno: 24 }], error: null })
    await expect(darTurnoSinTelefono()).resolves.toEqual({ token_qr: 't', codigo: 'CB-4821', turno: 24 })
    expect(supabase.rpc).toHaveBeenCalledWith('dar_turno_sin_telefono', {})
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: OTRA_FILA' } })
    await expect(darTurnoSinTelefono()).rejects.toThrow('OTRA_FILA')
  })

  it('con una seña (opcional, recortada)', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ token_qr: 't', turno: 25, nombre: 'Turno 25 · chamarra roja' }], error: null })
    await darTurnoSinTelefono('  chamarra roja ')
    expect(supabase.rpc).toHaveBeenLastCalledWith('dar_turno_sin_telefono', { p_sena: 'chamarra roja' })
    await darTurnoSinTelefono('x'.repeat(60))
    expect(supabase.rpc.mock.lastCall[1].p_sena).toHaveLength(40)
    await darTurnoSinTelefono('   ')
    expect(supabase.rpc).toHaveBeenLastCalledWith('dar_turno_sin_telefono', {})
  })
})

describe('el código del día', () => {
  it('se manda solo si se escribió, y solo los números', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'NUEVO', token_qr: 't' }], error: null })
    await sacarTurnoAPie({ codigo: ' 48 21 ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('sacar_turno_a_pie', { p_dispositivo: 'tel-de-prueba', p_cambiar_carro: false, p_codigo: '4821' })
    await sacarTurnoAPie({ codigo: '' })
    expect(supabase.rpc.mock.lastCall[1]).not.toHaveProperty('p_codigo')
  })

  it('el código bueno también sirve al cambiarse de carro a pie', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'NUEVO', token_qr: 't' }], error: null })
    await sacarTurnoAPie({ cambiarCarro: true, codigo: '4821' })
    expect(supabase.rpc.mock.lastCall[1]).toMatchObject({ p_cambiar_carro: true, p_codigo: '4821' })
  })

  it('sin turno con el código mal o frenado', () => {
    expect(traeTurno({ resultado: 'CODIGO_INCORRECTO', token_qr: null })).toBe(false)
    expect(traeTurno({ resultado: 'DEMASIADOS_INTENTOS', espera: 120 })).toBe(false)
  })

  it('la cuenta regresiva del freno', () => {
    expect(relojDeEspera(300)).toBe('5:00')
    expect(relojDeEspera(299)).toBe('4:59')
    expect(relojDeEspera(9.2)).toBe('0:10')
    expect(relojDeEspera(-3)).toBe('0:00')
    expect(relojDeEspera(null)).toBe('0:00')
  })

  it('la página sabe si hoy se pide (sin saber cuál es)', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ hora: '14:00:00', abierta: true, cerrada: false, pide_codigo: true }], error: null })
    await expect(filaAPieHoy()).resolves.toMatchObject({ pide_codigo: true })
    expect(supabase.rpc).toHaveBeenLastCalledWith('fila_a_pie_hoy', {})
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(filaAPieHoy()).resolves.toBeNull()
  })
})

describe('el turno de hoy guardado en el teléfono', () => {
  it('se recuerda solo el mismo día', () => {
    const a = almacen()
    guardarMiTurno({ fecha: '2026-10-08', token: 't', turno: 5, codigo: 'CB-1' }, a)
    expect(leerMiTurno('2026-10-08', a)).toMatchObject({ turno: 5, token: 't' })
    expect(leerMiTurno('2026-10-12', a)).toBeNull()
    olvidarMiTurno(a)
    expect(leerMiTurno('2026-10-08', a)).toBeNull()
  })

  it('lo que no se entiende se ignora', () => {
    const a = almacen()
    a.setItem('cajita-mi-turno', '{roto')
    expect(leerMiTurno('2026-10-08', a)).toBeNull()
  })
})

describe('cuándo sonar y vibrar', () => {
  const esperando = (antes) => ({ tipo: 'esperando', antes, actual: 1 })

  it('cuando le toca, una vez', () => {
    expect(avisoQueToca(esperando(0), { tipo: 'tuTurno' })).toBe('turno')
    expect(avisoQueToca({ tipo: 'tuTurno' }, { tipo: 'tuTurno' })).toBeNull()
  })

  it('cuando faltan 3, una vez', () => {
    expect(avisoQueToca(esperando(5), esperando(3))).toBe('cerca')
    expect(avisoQueToca(esperando(3), esperando(2))).toBeNull()
    expect(avisoQueToca(esperando(6), esperando(4))).toBeNull()
  })

  it('al abrir la página no suena (es para el cambio)', () => {
    expect(avisoQueToca(null, { tipo: 'tuTurno' })).toBeNull()
    expect(avisoQueToca(null, esperando(1))).toBeNull()
  })
})
