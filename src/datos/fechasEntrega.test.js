import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import { fechaPorDefecto, fechasDeEntrega, fechasVecinas, rangoEnFechas } from './fechasEntrega'

//  Lunes y jueves de septiembre y octubre de 2026.
const FECHAS = ['2026-10-01', '2026-09-28', '2026-09-24', '2026-09-21', '2026-09-17']

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('fechasDeEntrega', () => {
  it('pregunta a la base y devuelve la lista', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ fecha: '2026-09-29', cerrado: false }], error: null })
    await expect(fechasDeEntrega()).resolves.toEqual([{ fecha: '2026-09-29', cerrado: false }])
    expect(supabase.rpc).toHaveBeenCalledWith('fechas_de_entrega')
  })

  it('sin la actualización de la base lo dice (la pantalla vuelve al calendario)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } })
    await expect(fechasDeEntrega()).rejects.toThrow('FUNCION_NO_INSTALADA')
  })
})

describe('fechaPorDefecto', () => {
  it('el día de entrega, abre en hoy', () => {
    expect(fechaPorDefecto(FECHAS, '2026-09-28')).toBe('2026-09-28')
  })

  it('el martes abre en el lunes que acaba de pasar (el más cercano)', () => {
    expect(fechaPorDefecto(FECHAS, '2026-09-29')).toBe('2026-09-28')
  })

  it('el miércoles abre en el jueves que viene (está más cerca)', () => {
    expect(fechaPorDefecto(['2026-10-01', '2026-09-28'], '2026-09-30')).toBe('2026-10-01')
  })

  it('a la misma distancia, gana el que ya pasó', () => {
    expect(fechaPorDefecto(['2026-10-02', '2026-09-28'], '2026-09-30')).toBe('2026-09-28')
  })

  it('sin días de entrega, hoy', () => {
    expect(fechaPorDefecto([], '2026-09-30')).toBe('2026-09-30')
  })
})

describe('fechasVecinas', () => {
  it('el anterior y el siguiente día de entrega', () => {
    expect(fechasVecinas(FECHAS, '2026-09-24')).toEqual({ anterior: '2026-09-21', siguiente: '2026-09-28' })
  })

  it('en las puntas no hay a dónde ir', () => {
    expect(fechasVecinas(FECHAS, '2026-10-01')).toEqual({ anterior: '2026-09-28', siguiente: null })
    expect(fechasVecinas(FECHAS, '2026-09-17')).toEqual({ anterior: null, siguiente: '2026-09-21' })
  })

  it('desde un día sin entrega también sabe cuál sigue', () => {
    expect(fechasVecinas(FECHAS, '2026-09-30')).toEqual({ anterior: '2026-09-28', siguiente: '2026-10-01' })
  })
})

describe('rangoEnFechas', () => {
  it('"este mes" muestra el primer y el último día de entrega del mes', () => {
    expect(rangoEnFechas({ desde: '2026-09-01', hasta: '2026-09-30' }, FECHAS)).toEqual({
      desde: '2026-09-17',
      hasta: '2026-09-28',
    })
  })

  it('sin días de entrega en el periodo, vacío', () => {
    expect(rangoEnFechas({ desde: '2026-08-01', hasta: '2026-08-31' }, FECHAS)).toEqual({ desde: null, hasta: null })
  })
})
