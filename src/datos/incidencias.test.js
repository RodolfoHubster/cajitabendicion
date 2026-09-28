import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import {
  anunciarRetraso,
  cancelarEntrega,
  enlaceWhatsApp,
  horaConRetraso,
  incidenciaDeCita,
  incidenciaVigente,
  incidenciasPublicas,
  moverEntrega,
  textoWhatsApp,
} from './incidencias'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('llamadas a la base', () => {
  it('retraso: fecha, minutos como número y el mensaje sin espacios (o null)', async () => {
    supabase.rpc.mockResolvedValue({ data: 'AVISADO', error: null })
    await anunciarRetraso({ fecha: '2026-09-28', minutos: '45', mensaje: '  Llueve ' })
    expect(supabase.rpc).toHaveBeenCalledWith('anunciar_retraso', { p_fecha: '2026-09-28', p_minutos: 45, p_mensaje: 'Llueve' })

    await anunciarRetraso({ fecha: '2026-09-28', minutos: 0, mensaje: '   ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('anunciar_retraso', { p_fecha: '2026-09-28', p_minutos: 0, p_mensaje: null })
  })

  it('mover devuelve cuántas se movieron y cuántas no', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ movidas: 18, sin_mover: 1 }], error: null })
    await expect(moverEntrega({ fecha: '2026-09-28', fechaNueva: '2026-10-03' })).resolves.toEqual({ movidas: 18, sin_mover: 1 })
    expect(supabase.rpc).toHaveBeenCalledWith('mover_entrega', { p_fecha: '2026-09-28', p_fecha_nueva: '2026-10-03', p_mensaje: null })
  })

  it.each(['FECHA_YA_TIENE_ENTREGA', 'DIA_YA_RESUELTO', 'FECHA_NUEVA_INVALIDA'])('%s llega tal cual', async (codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
    await expect(moverEntrega({ fecha: '2026-09-28', fechaNueva: '2026-10-03' })).rejects.toThrow(new RegExp(`^${codigo}$`))
  })

  it('cancelar devuelve cuántas se cancelaron', async () => {
    supabase.rpc.mockResolvedValue({ data: 20, error: null })
    await expect(cancelarEntrega({ fecha: '2026-09-28', mensaje: 'Día festivo' })).resolves.toBe(20)
  })

  it('lo público nunca rompe la página: sin señal o sin migración, no hay aviso', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(incidenciasPublicas()).resolves.toEqual([])
    await expect(incidenciaDeCita('tok')).resolves.toEqual([])
  })
})

describe('horaConRetraso', () => {
  it('suma los minutos, en el mismo orden de siempre', () => {
    expect(horaConRetraso('14:45:00', 30)).toBe('15:15:00')
    expect(horaConRetraso('18:30:00', 90)).toBe('20:00:00')
  })

  it('no se pasa de medianoche', () => {
    expect(horaConRetraso('23:00:00', 180)).toBe('23:59:00')
  })
})

describe('enlaceWhatsApp', () => {
  it('solo los dígitos del teléfono y el texto codificado', () => {
    expect(enlaceWhatsApp('+1 619 555-0101', 'Hola, qué tal')).toBe('https://wa.me/16195550101?text=Hola%2C%20qu%C3%A9%20tal')
  })

  it('sin teléfono no hay enlace', () => {
    expect(enlaceWhatsApp(null, 'x')).toBeNull()
    expect(enlaceWhatsApp('+1', 'x')).toBeNull()
  })
})

describe('textoWhatsApp', () => {
  const enlaces = { cita: 'https://citas.ejemplo/confirmacion/tok', calendario: 'https://citas.ejemplo/calendario' }

  it('retraso: la hora nueva de esa persona y el enlace a su QR, en español y en inglés', () => {
    const texto = textoWhatsApp({ tipo: 'retraso', fecha: '2026-09-28', minutos: 30 }, { hora: '14:45:00' }, enlaces)
    expect(texto).toContain('30 minutos de retraso')
    expect(texto).toContain('3:15 PM')
    expect(texto).toContain(enlaces.cita)
    expect(texto).toContain('running 30 minutes late')
  })

  it('movida: de qué día a qué día, a la misma hora', () => {
    const texto = textoWhatsApp({ tipo: 'movida', fecha: '2026-09-28', fecha_nueva: '2026-10-03', mensaje: 'No llegó el camión' }, { hora: '14:45:00' }, enlaces)
    expect(texto).toMatch(/28 de septiembre se movió al .*3 de octubre, a la misma hora \(2:45 PM\)/)
    expect(texto).toContain('No llegó el camión')
    expect(texto).toContain(enlaces.cita)
  })

  it('cancelada: manda al calendario, no a un QR que ya no sirve', () => {
    const texto = textoWhatsApp({ tipo: 'cancelada', fecha: '2026-09-28' }, { hora: '14:45:00' }, enlaces)
    expect(texto).toContain('se canceló la entrega')
    expect(texto).toContain(enlaces.calendario)
    expect(texto).not.toContain(enlaces.cita)
  })
})

describe('incidenciaVigente', () => {
  it('si ya se movió o se canceló, manda esa sobre el retraso', () => {
    const historial = [
      { tipo: 'retraso', fecha: '2026-09-28', retirada: true },
      { tipo: 'movida', fecha: '2026-09-28', retirada: false },
    ]
    expect(incidenciaVigente(historial, '2026-09-28').tipo).toBe('movida')
  })

  it('un retraso vigente; uno quitado no cuenta', () => {
    expect(incidenciaVigente([{ tipo: 'retraso', fecha: '2026-09-28', retirada: false }], '2026-09-28').tipo).toBe('retraso')
    expect(incidenciaVigente([{ tipo: 'retraso', fecha: '2026-09-28', retirada: true }], '2026-09-28')).toBeNull()
  })

  it('lo que llegó movido de otra fecha no es una incidencia de esta', () => {
    expect(incidenciaVigente([{ tipo: 'movida', fecha: '2026-09-24', fecha_nueva: '2026-09-28', retirada: false }], '2026-09-28')).toBeNull()
  })
})
