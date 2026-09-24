import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import {
  citaParaQr,
  citasDePersona,
  citasDelDia,
  detalleDePersona,
  faltaParaRegistrar,
  hoyLocal,
  qrDeCita,
  registrarDesdePanel,
  resumenDelDia,
  sePuedeVerQr,
} from './panel'

const PERSONA = {
  nombres: 'José',
  apellidos: 'Ramírez',
  telefono: '+16195551234',
  email: '',
  domicilio: { pais: 'US', codigoPostal: '92105', colonia: '', calle: '4250 El Cajon Blvd', numero: '', interior: '', sinDomicilio: false },
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

describe('la ficha de una persona', () => {
  it('pide la ficha por codigo y devuelve la primera fila', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ codigo_corto: 'CB-4871', direccion: 'Av. Revolución 1234, 22000 Tijuana' }],
      error: null,
    })

    await expect(detalleDePersona('CB-4871')).resolves.toEqual({
      codigo_corto: 'CB-4871',
      direccion: 'Av. Revolución 1234, 22000 Tijuana',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('detalle_de_persona', { p_codigo: 'CB-4871' })
  })

  it('sin respuesta devuelve null', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(detalleDePersona('CB-4871')).resolves.toBeNull()
  })

  it('un codigo que no existe llega tal cual, para poder avisarlo', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: PERSONA_NO_EXISTE' } })
    await expect(detalleDePersona('CB-0000')).rejects.toThrow('PERSONA_NO_EXISTE')
  })

  it('sin permiso se clasifica como los demas errores', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(detalleDePersona('CB-4871')).rejects.toThrow('SIN_PERMISO')
  })

  it('sus citas llegan como lista; sin datos, lista vacia', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ fecha: '2026-09-21', hora: '14:00:00', estado: 'entregada' }],
      error: null,
    })
    await expect(citasDePersona('CB-4871')).resolves.toHaveLength(1)
    expect(supabase.rpc).toHaveBeenCalledWith('citas_de_persona', { p_codigo: 'CB-4871' })

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(citasDePersona('CB-4871')).resolves.toEqual([])
  })
})

describe('el resumen por fila', () => {
  it('juntas pide el resumen como siempre; una fila la manda', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ con_cita: 1 }], error: null })

    await resumenDelDia('2026-09-24', 'juntas')
    expect(supabase.rpc).toHaveBeenLastCalledWith('resumen_del_dia', { p_fecha: '2026-09-24' })

    await resumenDelDia('2026-09-24', 'carro')
    expect(supabase.rpc).toHaveBeenLastCalledWith('resumen_del_dia', { p_fecha: '2026-09-24', p_fila: 'carro' })
  })
})

describe('qrDeCita (ver el QR desde Citas de hoy)', () => {
  const CITA = { codigo: 'CB-4871', fecha: '2026-09-24', hora: '14:45:00' }

  it('pide la cita por código, fecha y hora, y devuelve su token', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ token: 'tok-1', codigo_corto: 'CB-4871', nombre: 'María', estado: 'reservada' }],
      error: null,
    })

    await expect(qrDeCita(CITA)).resolves.toEqual({
      token: 'tok-1',
      codigo_corto: 'CB-4871',
      nombre: 'María',
      estado: 'reservada',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('qr_de_cita', {
      p_codigo: 'CB-4871',
      p_fecha: '2026-09-24',
      p_hora: '14:45:00',
    })
  })

  it('una cita cancelada o que no existe: CITA_NO_EXISTE', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: CITA_NO_EXISTE' } })
    await expect(qrDeCita(CITA)).rejects.toThrow(/^CITA_NO_EXISTE$/)
  })

  it('si la base no devuelve token, no se dibuja un QR vacío', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(qrDeCita(CITA)).rejects.toThrow(/^CITA_NO_EXISTE$/)
  })

  it('un voluntario que lo intente recibe SIN_PERMISO', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(qrDeCita(CITA)).rejects.toThrow(/^SIN_PERMISO$/)
  })
})

describe('sePuedeVerQr', () => {
  it('el admin ve el QR de las citas vigentes y de las ya entregadas', () => {
    for (const estado of ['reservada', 'llego', 'entregada', 'no_asistio']) {
      expect(sePuedeVerQr('admin', { estado })).toBe(true)
    }
  })

  it('nunca el de una cancelada: ya no sirve', () => {
    expect(sePuedeVerQr('admin', { estado: 'cancelada' })).toBe(false)
  })

  it('un voluntario no, aunque tenga todas las palomitas', () => {
    expect(sePuedeVerQr('voluntario', { estado: 'reservada' })).toBe(false)
    expect(sePuedeVerQr(undefined, { estado: 'reservada' })).toBe(false)
  })

  it('sin cita, nada', () => {
    expect(sePuedeVerQr('admin', null)).toBe(false)
  })
})

describe('citaParaQr (qué QR va en el cuadro de la ficha)', () => {
  const HOY = '2026-09-24'
  const cita = (fecha, hora, estado = 'reservada') => ({ fecha, hora, estado })

  it('la de hoy, aunque tenga otras más adelante', () => {
    const citas = [cita('2026-09-28', '15:00:00'), cita(HOY, '14:45:00'), cita('2026-09-21', '15:00:00', 'entregada')]
    expect(citaParaQr(citas, HOY)).toEqual(cita(HOY, '14:45:00'))
  })

  it('la de hoy aunque ya se haya entregado: es la que el voluntario acaba de escanear', () => {
    expect(citaParaQr([cita(HOY, '14:45:00', 'entregada'), cita('2026-09-28', '15:00:00')], HOY).fecha).toBe(HOY)
  })

  it('sin cita hoy, la próxima (la más cercana, no la última)', () => {
    const citas = [cita('2026-10-05', '15:00:00'), cita('2026-09-28', '16:00:00'), cita('2026-09-21', '15:00:00', 'entregada')]
    expect(citaParaQr(citas, HOY)).toEqual(cita('2026-09-28', '16:00:00'))
  })

  it('sin hoy ni próximas, la más reciente de las que ya pasaron', () => {
    const citas = [cita('2026-09-21', '15:00:00', 'entregada'), cita('2026-09-14', '15:00:00', 'no_asistio')]
    expect(citaParaQr(citas, HOY)).toEqual(cita('2026-09-21', '15:00:00', 'entregada'))
  })

  it('nunca una cancelada: su QR ya no sirve', () => {
    const citas = [cita(HOY, '14:45:00', 'cancelada'), cita('2026-09-28', '15:00:00')]
    expect(citaParaQr(citas, HOY)).toEqual(cita('2026-09-28', '15:00:00'))
    expect(citaParaQr([cita(HOY, '14:45:00', 'cancelada')], HOY)).toBeNull()
  })

  it('sin citas, nada', () => {
    expect(citaParaQr([], HOY)).toBeNull()
    expect(citaParaQr(undefined, HOY)).toBeNull()
  })
})

describe('faltaParaRegistrar (Registrar a una persona, en el panel)', () => {
  it('el pase permanente se registra sin horario', () => {
    expect(faltaParaRegistrar({ tipo: 'pase', bloqueId: '' })).toBeNull()
    expect(faltaParaRegistrar({ tipo: 'pase', bloqueId: null })).toBeNull()
  })

  it('la cita necesita su horario', () => {
    expect(faltaParaRegistrar({ tipo: 'cita', bloqueId: '' })).toBe('FALTA_HORARIO')
    expect(faltaParaRegistrar({ tipo: 'cita', bloqueId: 'bloque-1' })).toBeNull()
  })

  it('el botón no se apaga por falta de horario (en modo pase se quedaba apagado para siempre)', () => {
    const pantalla = readFileSync(new URL('../paginas/admin/RegistrarPersona.jsx', import.meta.url), 'utf8')
    const boton = pantalla.match(/<Boton disabled=\{([^}]*)\} type="submit">/)
    expect(boton?.[1]).toBe('enviando')
  })
})
