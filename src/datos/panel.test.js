import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import { citasDelDia, hoyLocal, registrarDesdePanel, resumenDelDia } from './panel'

const PERSONA = {
  nombres: 'José',
  apellidos: 'Ramírez',
  telefono: '+16195551234',
  email: '',
  domicilio: { pais: 'US', codigoPostal: '92105', colonia: '', calle: 'El Cajon Blvd', numero: '4250', interior: '', sinDomicilio: false },
  aceptoPrivacidad: true,
  bloqueId: 'bloque-1',
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('registrarDesdePanel', () => {
  it('manda nombres y apellidos separados, el correo opcional como null y el domicilio completo', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo_corto: 'CB-1', token_qr: 't' }], error: null })

    await expect(registrarDesdePanel(PERSONA)).resolves.toEqual({ codigo_corto: 'CB-1', token_qr: 't' })
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_desde_panel', {
      p_nombre: 'José',
      p_apellidos: 'Ramírez',
      p_telefono: '+16195551234',
      p_bloque_id: 'bloque-1',
      p_email: null,
      p_pais: 'US',
      p_codigo_postal: '92105',
      p_colonia: null,
      p_calle: 'El Cajon Blvd',
      p_numero: '4250',
      p_numero_interior: null,
      p_sin_domicilio: false,
      p_acepto_privacidad: true,
    })
  })

  it.each(['APELLIDOS_REQUERIDOS', 'TELEFONO_INVALIDO', 'NOMBRE_INVALIDO', 'DIA_CERRADO', 'BLOQUE_LLENO'])(
    'error de negocio %s pasa tal cual',
    async (codigo) => {
      supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
      await expect(registrarDesdePanel(PERSONA)).rejects.toThrow(new RegExp(`^${codigo}$`))
    },
  )

  it('un voluntario que lo intenta recibe SIN_PERMISO', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(registrarDesdePanel(PERSONA)).rejects.toThrow('SIN_PERMISO')
  })

  it('sin respuesta devuelve null', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(registrarDesdePanel(PERSONA)).resolves.toBeNull()
  })
})

describe('numeros y listas del dia', () => {
  it('resumen: primera fila, o null si no hay', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [{ con_cita: 5 }], error: null })
    await expect(resumenDelDia()).resolves.toEqual({ con_cita: 5 })
    expect(supabase.rpc).toHaveBeenCalledWith('resumen_del_dia', { p_fecha: null })

    supabase.rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(resumenDelDia('2026-09-14')).resolves.toBeNull()
  })

  it('sin permiso, la lista falla con SIN_PERMISO', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(citasDelDia('2026-09-14')).rejects.toThrow('SIN_PERMISO')
  })
})

describe('hoyLocal', () => {
  it.each([
    ['2026-09-13T05:30:00Z', '2026-09-12'],
    ['2026-09-13T07:30:00Z', '2026-09-13'],
    ['2026-01-01T07:59:00Z', '2025-12-31'],
  ])('%s en UTC es %s en San Diego', (utc, esperado) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(utc))
    expect(hoyLocal()).toBe(esperado)
  })
})
