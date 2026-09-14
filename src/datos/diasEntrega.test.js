import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import {
  ANTICIPOS,
  OPCIONES_ANTICIPO,
  actualizarBloque,
  actualizarDiaEntrega,
  anticipoDe,
  calcularAnticipado,
  crearDiaEntrega,
  listarDiasEntrega,
  suscriptoresSinEfecto,
} from './diasEntrega'

beforeEach(() => {
  supabase.rpc.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('acceso de suscriptores', () => {
  it('opciones: 1 hora, 2 horas, 1 dia u otra fecha', () => {
    expect(ANTICIPOS).toEqual({ unaHora: 1, dosHoras: 2, unDia: 24 })
    expect(OPCIONES_ANTICIPO).toEqual(['unaHora', 'dosHoras', 'unDia', 'personalizado'])
  })

  it.each([
    ['unaHora', '2026-09-18T17:00'],
    ['dosHoras', '2026-09-18T16:00'],
    ['unDia', '2026-09-17T18:00'],
  ])('calcularAnticipado con %s', (anticipo, esperado) => {
    expect(calcularAnticipado('2026-09-18T18:00', anticipo)).toBe(esperado)
  })

  it('otra fecha y hora usa la que se escribio', () => {
    expect(calcularAnticipado('2026-09-18T18:00', 'personalizado', '2026-09-16T09:00')).toBe('2026-09-16T09:00')
    expect(calcularAnticipado('2026-09-18T18:00', 'personalizado', '')).toBeNull()
  })

  it('sin apertura o con una opcion que no existe no hay acceso anticipado', () => {
    expect(calcularAnticipado('', 'unaHora')).toBeNull()
    expect(calcularAnticipado('2026-09-18T18:00', 'nada')).toBeNull()
  })

  it.each([
    ['2026-09-18T17:00:00', 'unaHora'],
    ['2026-09-18T16:00:00', 'dosHoras'],
    ['2026-09-17T18:00:00', 'unDia'],
    ['2026-09-18T15:00:00', 'personalizado'],
  ])('anticipoDe reconoce %s como %s', (anticipado, esperado) => {
    expect(anticipoDe('2026-09-18T18:00:00', anticipado)).toBe(esperado)
  })

  it('sin acceso anticipado propone 1 dia al activarlo', () => {
    expect(anticipoDe('2026-09-18T18:00:00', null)).toBe('unDia')
  })

  it('calcular y reconocer son inversos para cada opcion fija', () => {
    for (const opcion of Object.keys(ANTICIPOS)) {
      expect(anticipoDe('2026-09-18T18:00', calcularAnticipado('2026-09-18T18:00', opcion))).toBe(opcion)
    }
  })
})

describe('suscriptoresSinEfecto (el caso del jueves 17)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 12 de septiembre, 9:08 AM en San Diego
    vi.setSystemTime(new Date('2026-09-12T16:08:00Z'))
  })

  it('apertura que ya paso: activar suscriptores no serviria', () => {
    expect(suscriptoresSinEfecto(true, '2026-09-12T02:04:00')).toBe(true)
  })

  it('apertura en este mismo minuto tampoco', () => {
    expect(suscriptoresSinEfecto(true, '2026-09-12T09:08')).toBe(true)
  })

  it('apertura en el futuro: si sirve', () => {
    expect(suscriptoresSinEfecto(true, '2026-09-12T18:00')).toBe(false)
  })

  it('sin suscriptores activados no hay nada que avisar', () => {
    expect(suscriptoresSinEfecto(false, '2026-09-12T02:04:00')).toBe(false)
    expect(suscriptoresSinEfecto(true, '')).toBe(false)
  })
})

describe('llamadas a la base', () => {
  it('crear una fecha manda cada dato y devuelve el codigo', async () => {
    supabase.rpc.mockResolvedValue({ data: 'K7MP2Q', error: null })

    const codigo = await crearDiaEntrega({
      fecha: '2026-09-21',
      horaInicio: '14:00',
      horaFin: '18:30',
      capacidad: 20,
      abreEn: '2026-09-18T12:00',
      abreAnticipadoEn: '',
    })

    expect(codigo).toBe('K7MP2Q')
    expect(supabase.rpc).toHaveBeenCalledWith('crear_dia_entrega', {
      p_fecha: '2026-09-21',
      p_hora_inicio: '14:00',
      p_hora_fin: '18:30',
      p_capacidad: 20,
      p_abre_en: '2026-09-18T12:00',
      p_abre_anticipado_en: null,
    })
  })

  it.each([
    [{ message: 'P0001: DIA_YA_EXISTE' }, 'DIA_YA_EXISTE'],
    [{ message: 'ANTICIPADO_DESPUES_DE_APERTURA' }, 'ANTICIPADO_DESPUES_DE_APERTURA'],
    [{ code: 'PGRST202', message: 'Could not find the function' }, 'FUNCION_NO_INSTALADA'],
    [{ code: '42501', message: 'SIN_PERMISO' }, 'SIN_PERMISO'],
    [{ message: 'TypeError: Failed to fetch' }, 'SIN_CONEXION'],
    [{ message: 'algo raro' }, 'ERROR_DESCONOCIDO'],
  ])('traduce el error %o a %s', async (error, codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error })
    await expect(actualizarDiaEntrega({ fecha: '2026-09-21', abreEn: '2026-09-18T12:00' })).rejects.toThrow(codigo)
  })

  it('listar sin datos devuelve lista vacia', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(listarDiasEntrega()).resolves.toEqual([])
  })

  it('actualizar un horario sin decir que cambia manda null (no toca ese dato)', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await actualizarBloque({ bloqueId: 'b1', cerrado: true })
    expect(supabase.rpc).toHaveBeenCalledWith('actualizar_bloque', { p_bloque_id: 'b1', p_capacidad: null, p_cerrado: true })
  })
})
