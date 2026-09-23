import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import {
  CODIGOS_AVISOS,
  avisosPublicos,
  eliminarAviso,
  guardarAviso,
  listarAvisos,
  moverAviso,
  textoDeAviso,
} from './avisos'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('el idioma del aviso', () => {
  const completo = { texto_es: 'Llega 5 minutos antes.', texto_en: 'Arrive 5 minutes early.', texto_vi: 'Đến sớm 5 phút.' }

  it.each([
    ['es', 'Llega 5 minutos antes.'],
    ['en', 'Arrive 5 minutes early.'],
    ['vi', 'Đến sớm 5 phút.'],
    ['es-MX', 'Llega 5 minutos antes.'],
    ['vi-VN', 'Đến sớm 5 phút.'],
  ])('en %s muestra su texto', (idioma, esperado) => {
    expect(textoDeAviso(completo, idioma)).toBe(esperado)
  })

  it('sin vietnamita cae a inglés, como el resto de la app', () => {
    expect(textoDeAviso({ ...completo, texto_vi: null }, 'vi')).toBe('Arrive 5 minutes early.')
  })

  it('sin inglés ni vietnamita, todos ven el español', () => {
    const soloEs = { texto_es: 'Solo español', texto_en: null, texto_vi: null }
    expect(textoDeAviso(soloEs, 'vi')).toBe('Solo español')
    expect(textoDeAviso(soloEs, 'en')).toBe('Solo español')
  })

  it('una traducción vacía cuenta como si no estuviera', () => {
    expect(textoDeAviso({ ...completo, texto_en: '' }, 'en')).toBe('Llega 5 minutos antes.')
  })

  it('sin aviso devuelve texto vacío, no truena', () => {
    expect(textoDeAviso(null, 'es')).toBe('')
    expect(textoDeAviso(undefined, 'vi')).toBe('')
  })
})

describe('leer avisos', () => {
  it('los públicos se piden por sección; sin datos, lista vacía', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [{ texto_es: 'Una regla' }], error: null })
    await expect(avisosPublicos('registro')).resolves.toHaveLength(1)
    expect(supabase.rpc).toHaveBeenCalledWith('avisos_publicos', { p_seccion: 'registro' })

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(avisosPublicos('inicio')).resolves.toEqual([])
  })

  it('la lista del panel llega completa', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'a', activo: false }], error: null })
    await expect(listarAvisos()).resolves.toEqual([{ id: 'a', activo: false }])
  })
})

describe('guardar', () => {
  it('sin id crea, y las traducciones vacías van como null', async () => {
    supabase.rpc.mockResolvedValue({ data: 'id-1', error: null })

    await guardarAviso({ seccion: 'registro', textoEs: 'Llega antes', textoEn: '  ', textoVi: '' })
    expect(supabase.rpc).toHaveBeenCalledWith('guardar_aviso', {
      p_id: null,
      p_seccion: 'registro',
      p_texto_es: 'Llega antes',
      p_texto_en: null,
      p_texto_vi: null,
      p_activo: true,
      p_titulo_es: null,
      p_titulo_en: null,
      p_titulo_vi: null,
    })
  })

  it('con id modifica y respeta el apagado', async () => {
    supabase.rpc.mockResolvedValue({ data: 'id-1', error: null })

    await guardarAviso({ id: 'id-1', seccion: 'inicio', textoEs: 'Otra', textoEn: 'Another', activo: false })
    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({
      p_id: 'id-1',
      p_texto_en: 'Another',
      p_activo: false,
    })
  })

  it('mover y quitar mandan lo que toca', async () => {
    supabase.rpc.mockResolvedValue({ data: 'MOVIDO', error: null })
    await moverAviso('id-1', 'arriba')
    expect(supabase.rpc).toHaveBeenCalledWith('mover_aviso', { p_id: 'id-1', p_hacia: 'arriba' })

    supabase.rpc.mockResolvedValue({ data: 'ELIMINADO', error: null })
    await eliminarAviso('id-1')
    expect(supabase.rpc).toHaveBeenCalledWith('eliminar_aviso', { p_id: 'id-1' })
  })
})

describe('errores', () => {
  it.each(CODIGOS_AVISOS)('%s llega tal cual y tiene su mensaje', async (codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
    await expect(listarAvisos()).rejects.toThrow(codigo)
    expect(es.avisos.errores[codigo]).toBeTruthy()
  })

  it('lo que no es de negocio se clasifica', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(listarAvisos()).rejects.toThrow('SIN_PERMISO')
  })
})
