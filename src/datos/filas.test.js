import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vi_ from '../i18n/vi.json'
import { supabase } from '../lib/supabase'
import {
  CODIGOS_FILAS,
  FILAS,
  FILAS_PERSONAL,
  VISTAS,
  conFila,
  esDeOtraFila,
  filaDe,
  filaParaConsulta,
  filtrarPorFila,
  guardarFila,
  miFila,
} from './filas'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('qué se le pide a la base', () => {
  it('juntas no manda fila; carro y a pie sí', () => {
    expect(filaParaConsulta('juntas')).toBeNull()
    expect(filaParaConsulta('carro')).toBe('carro')
    expect(filaParaConsulta('a_pie')).toBe('a_pie')
  })

  it('una vista inventada se toma como juntas, no como fila', () => {
    expect(filaParaConsulta('bici')).toBeNull()
    expect(filaParaConsulta(undefined)).toBeNull()
  })

  //  Si el codigo sale antes que la migracion, "juntas" tiene que seguir
  //  llamando a la funcion con los mismos parametros de siempre.
  it('con juntas, los parámetros quedan exactamente como antes', () => {
    expect(conFila({ p_fecha: '2026-09-24' }, 'juntas')).toEqual({ p_fecha: '2026-09-24' })
    expect(conFila({ p_fecha: '2026-09-24' }, 'a_pie')).toEqual({ p_fecha: '2026-09-24', p_fila: 'a_pie' })
  })
})

describe('de qué fila es cada cosa', () => {
  it('lo que trae fila, la suya', () => {
    expect(filaDe({ fila: 'a_pie' })).toBe('a_pie')
    expect(filaDe({ fila: 'carro' })).toBe('carro')
  })

  it('lo que llega sin fila (base sin migrar) es de carro, la única que había', () => {
    expect(filaDe({})).toBe('carro')
    expect(filaDe(null)).toBe('carro')
    expect(filaDe({ fila: 'rara' })).toBe('carro')
  })

  const citas = [
    { nombre: 'Ana', fila: 'carro' },
    { nombre: 'Beto', fila: 'a_pie' },
    { nombre: 'Carla' },
  ]

  it('filtrar por fila deja solo esa fila', () => {
    expect(filtrarPorFila(citas, 'a_pie').map((c) => c.nombre)).toEqual(['Beto'])
    expect(filtrarPorFila(citas, 'carro').map((c) => c.nombre)).toEqual(['Ana', 'Carla'])
  })

  it('juntas = carro + a pie, sin que se pierda ni se repita nadie', () => {
    const juntas = filtrarPorFila(citas, 'juntas')
    expect(juntas).toHaveLength(filtrarPorFila(citas, 'carro').length + filtrarPorFila(citas, 'a_pie').length)
    expect(juntas).toEqual(citas)
  })

  it('sin lista no truena', () => {
    expect(filtrarPorFila(null, 'carro')).toEqual([])
    expect(filtrarPorFila(undefined, 'juntas')).toEqual([])
  })
})

describe('a quién se le dice "ve a la otra fila"', () => {
  it('al de carros con un código a pie, y al revés', () => {
    expect(esDeOtraFila('carro', 'a_pie')).toBe(true)
    expect(esDeOtraFila('a_pie', 'carro')).toBe(true)
  })

  it('en su propia fila, no', () => {
    expect(esDeOtraFila('carro', 'carro')).toBe(false)
    expect(esDeOtraFila('a_pie', 'a_pie')).toBe(false)
  })

  it('a quien escanea en las dos, nunca', () => {
    expect(esDeOtraFila('ambas', 'a_pie')).toBe(false)
    expect(esDeOtraFila('ambas', 'carro')).toBe(false)
  })

  it('si no se sabe la fila del código, no se adivina', () => {
    expect(esDeOtraFila('carro', undefined)).toBe(false)
  })
})

describe('la fila de quien escanea', () => {
  it('la que diga la base', async () => {
    supabase.rpc.mockResolvedValue({ data: 'a_pie', error: null })
    await expect(miFila()).resolves.toBe('a_pie')
    expect(supabase.rpc).toHaveBeenCalledWith('mi_fila')
  })

  //  Sin la migracion la funcion no existe. El escaneo tiene que seguir
  //  como estaba, no romperse.
  it('si la base no la conoce todavía, las dos, como antes', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(miFila()).resolves.toBe('ambas')

    supabase.rpc.mockResolvedValue({ data: 'otra cosa', error: null })
    await expect(miFila()).resolves.toBe('ambas')
  })
})

describe('asignar la fila', () => {
  it('manda el correo limpio y la fila', async () => {
    supabase.rpc.mockResolvedValue({ data: 'carro', error: null })

    await guardarFila('  voluntario@gmail.com ', 'carro')
    expect(supabase.rpc).toHaveBeenCalledWith('guardar_fila_personal', {
      p_correo: 'voluntario@gmail.com',
      p_fila: 'carro',
    })
  })

  it.each(CODIGOS_FILAS)('%s llega tal cual y tiene su mensaje', async (codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
    await expect(guardarFila('a@b.com', 'carro')).rejects.toThrow(codigo)
    expect(es.equipo.errores[codigo]).toBeTruthy()
  })

  it('lo que no es de negocio se clasifica', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(guardarFila('a@b.com', 'carro')).rejects.toThrow('SIN_PERMISO')
  })
})

describe('los textos de las filas', () => {
  it('cada fila, cada vista y cada opción del equipo tienen nombre en los tres idiomas', () => {
    for (const [idioma, textos] of [
      ['es', es],
      ['en', en],
      ['vi', vi_],
    ]) {
      for (const fila of FILAS_PERSONAL) expect(textos.filas.nombre[fila], `filas.nombre.${fila} (${idioma})`).toBeTruthy()
      for (const vista of VISTAS) expect(textos.filas.vista[vista], `filas.vista.${vista} (${idioma})`).toBeTruthy()
    }
  })

  it('las filas de verdad son dos', () => {
    expect(FILAS).toEqual(['carro', 'a_pie'])
  })
})
