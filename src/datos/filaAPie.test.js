import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import esquema from '../../supabase/schema.sql?raw'
import { supabase } from '../lib/supabase'
import {
  CUPO_SIN_LIMITE,
  aperturaDeCampos,
  aperturaRecomendada,
  camposFilaAPie,
  cerrarRegistroAPie,
  crearDiaAPie,
  filaAPieParaGuardar,
  otraHoraInicial,
  problemaFilaAPie,
  consultarFilasAPie,
  elegirFila,
  esSinLimite,
  estadoFilaAPie,
  filaDeTurnos,
  guardarFilaAPie,
  miFilaDeHoy,
  proximaFilaAPie,
  quitarFilaAPie,
  revisarApertura,
  saltarTurno,
  situacionDelTurno,
  turnoAdelantado,
  turnoDeCita,
} from './filaAPie'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('sin límite', () => {
  it('es el mismo número que guarda la base', () => {
    expect(esquema).toMatch(new RegExp(`create or replace function cupo_sin_limite\\(\\)[\\s\\S]*?select ${CUPO_SIN_LIMITE};`))
  })

  it('se reconoce por el cupo', () => {
    expect(esSinLimite(CUPO_SIN_LIMITE)).toBe(true)
    expect(esSinLimite(60)).toBe(false)
    expect(esSinLimite(null)).toBe(false)
  })
})

describe('la fila a pie que ve el público', () => {
  it('pide solo la fila a pie, de hoy a tres semanas', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await consultarFilasAPie('2026-09-28')
    expect(supabase.rpc).toHaveBeenCalledWith('consultar_disponibilidad', {
      p_desde: '2026-09-28',
      p_hasta: '2026-10-19',
      p_fila: 'a_pie',
    })
  })

  it('muestra la más cercana', () => {
    expect(proximaFilaAPie([{ fecha: '2026-10-01' }, { fecha: '2026-09-28' }]).fecha).toBe('2026-09-28')
    expect(proximaFilaAPie([])).toBeNull()
  })

  it('abierta, por abrir o llena', () => {
    expect(estadoFilaAPie(null)).toBe('no_hay')
    expect(estadoFilaAPie({ abierto: false, libres: 10 })).toBe('por_abrir')
    expect(estadoFilaAPie({ abierto: true, libres: 0 })).toBe('llena')
    expect(estadoFilaAPie({ abierto: true, libres: 3 })).toBe('abierta')
  })
})

describe('el turno de la persona', () => {
  it('lo pide por su código y devuelve una sola fila', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ turno: 7, actual: 3 }], error: null })
    await expect(turnoDeCita('tok')).resolves.toEqual({ turno: 7, actual: 3 })
    expect(supabase.rpc).toHaveBeenCalledWith('turno_de_cita', { p_token: 'tok' })

    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(turnoDeCita('tok')).resolves.toBeNull()
  })

  it('qué decirle', () => {
    const base = { turno: 7, estado: 'reservada', saltado: false, actual: 3, antes: 4 }
    expect(situacionDelTurno(null)).toBeNull()
    expect(situacionDelTurno(base)).toEqual({ tipo: 'esperando', antes: 4, actual: 3 })
    expect(situacionDelTurno({ ...base, actual: 7, antes: 0 }).tipo).toBe('tuTurno')
    expect(situacionDelTurno({ ...base, saltado: true }).tipo).toBe('teLlamaron')
    expect(situacionDelTurno({ ...base, estado: 'entregada' }).tipo).toBe('recibida')
    expect(situacionDelTurno({ ...base, estado: 'cancelada' }).tipo).toBe('cancelada')
  })

  it('"ya recibió" gana a "te llamaron": si lo llamaron y después llegó, ya pasó', () => {
    expect(situacionDelTurno({ turno: 2, estado: 'entregada', saltado: true, actual: 5 }).tipo).toBe('recibida')
  })
})

describe('la voluntaria', () => {
  it('la fila en vivo del día', async () => {
    supabase.rpc.mockResolvedValue({ data: { actual: { turno: 4 } }, error: null })
    await expect(filaDeTurnos()).resolves.toEqual({ actual: { turno: 4 } })
    expect(supabase.rpc).toHaveBeenCalledWith('fila_de_turnos', { p_fecha: null })
  })

  it('"no se presentó" y regresarlo, por número de turno', async () => {
    supabase.rpc.mockResolvedValue({ data: 4, error: null })
    await saltarTurno(4)
    expect(supabase.rpc).toHaveBeenLastCalledWith('saltar_turno', { p_turno: 4, p_saltado: true })
    await saltarTurno(4, false)
    expect(supabase.rpc).toHaveBeenLastCalledWith('saltar_turno', { p_turno: 4, p_saltado: false })
  })

  it('los errores de la base llegan con su nombre', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'TURNO_NO_EXISTE' } })
    await expect(saltarTurno(99)).rejects.toThrow('TURNO_NO_EXISTE')
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await expect(filaDeTurnos()).rejects.toThrow('SIN_CONEXION')
  })

  it('elige su fila de hoy', async () => {
    supabase.rpc.mockResolvedValue({ data: 'a_pie', error: null })
    await elegirFila('a_pie')
    expect(supabase.rpc).toHaveBeenCalledWith('elegir_fila', { p_fila: 'a_pie' })
    await expect(miFilaDeHoy()).resolves.toBe('a_pie')
  })

  it('si no ha elegido, o la base no la conoce todavía, no hay fila de hoy', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(miFilaDeHoy()).resolves.toBeNull()
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(miFilaDeHoy()).resolves.toBeNull()
  })

  it('un turno que todavía no llaman se avisa; uno que ya pasó (no estaba) no', () => {
    expect(turnoAdelantado(8, 5)).toBe(true)
    expect(turnoAdelantado(5, 5)).toBe(false)
    expect(turnoAdelantado(3, 5)).toBe(false)
    expect(turnoAdelantado(null, 5)).toBe(false)
    expect(turnoAdelantado(8, null)).toBe(false)
  })
})

describe('el administrador arma la fila del día', () => {
  it('se recomienda abrir una hora antes de empezar', () => {
    expect(aperturaRecomendada('2026-09-28', '16:30:00')).toBe('2026-09-28T15:30')
    expect(aperturaRecomendada('2026-09-28', '00:30')).toBe('2026-09-27T23:30')
  })

  it('avisa si abre antes de lo recomendado y no deja que abra después de empezar', () => {
    const dia = { fecha: '2026-09-28', hora: '16:30:00' }
    expect(revisarApertura({ ...dia, abreEn: '2026-09-28T15:30' })).toBeNull()
    expect(revisarApertura({ ...dia, abreEn: '2026-09-28T16:00' })).toBeNull()
    expect(revisarApertura({ ...dia, abreEn: '2026-09-28T16:30' })).toBeNull()
    expect(revisarApertura({ ...dia, abreEn: '2026-09-28T15:29' })).toBe('MAS_TEMPRANO')
    expect(revisarApertura({ ...dia, abreEn: '2026-09-27T20:00' })).toBe('MAS_TEMPRANO')
    expect(revisarApertura({ ...dia, abreEn: '2026-09-28T16:31' })).toBe('DESPUES_DE_INICIO')
    expect(revisarApertura({ ...dia, abreEn: '' })).toBeNull()
  })

  it('guarda con sin límite y la apertura recomendada como nulos', async () => {
    supabase.rpc.mockResolvedValue({ data: 'id', error: null })
    await guardarFilaAPie({ fecha: '2026-09-28', hora: '16:30' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('guardar_fila_a_pie', {
      p_fecha: '2026-09-28',
      p_hora: '16:30',
      p_cupo: null,
      p_abre_en: null,
    })
    await guardarFilaAPie({ fecha: '2026-09-28', hora: '16:30', cupo: 80, abreEn: '2026-09-28T15:00' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('guardar_fila_a_pie', {
      p_fecha: '2026-09-28',
      p_hora: '16:30',
      p_cupo: 80,
      p_abre_en: '2026-09-28T15:00',
    })
  })

  it('lo de arranque para una fecha nueva: sin límite y los turnos una hora antes', () => {
    expect(camposFilaAPie()).toEqual({ hora: '14:00', sinLimite: true, cupo: '100', otraHora: false, abreEn: '' })
  })

  it('"otra hora" empieza llena: una hora antes, del día de la entrega o de hoy', () => {
    expect(otraHoraInicial('2026-10-05', '14:00', '2026-09-28')).toBe('2026-10-05T13:00')
    expect(otraHoraInicial('', '14:00', '2026-09-28')).toBe('2026-09-28T13:00')
    expect(otraHoraInicial('2026-10-05', '', '2026-09-28')).toBe('')
  })

  it('de un día que ya tiene fila: lo guardado, y "otra hora" solo si no es la recomendada', () => {
    const dia = { fecha: '2026-09-28', a_pie_bloque_id: 'b', a_pie_hora: '16:30:00', a_pie_capacidad: 80 }
    expect(camposFilaAPie({ ...dia, a_pie_abre_en: '2026-09-28T15:30:00' })).toEqual({
      hora: '16:30', sinLimite: false, cupo: '80', otraHora: false, abreEn: '2026-09-28T15:30',
    })
    expect(camposFilaAPie({ ...dia, a_pie_capacidad: 10000, a_pie_abre_en: '2026-09-28T13:00:00' })).toMatchObject({
      sinLimite: true, cupo: '100', otraHora: true, abreEn: '2026-09-28T13:00',
    })
  })

  it('qué falta antes de guardar', () => {
    const bien = { hora: '16:30', sinLimite: true, cupo: '100', otraHora: false, abreEn: '' }
    expect(problemaFilaAPie('2026-09-28', bien)).toBeNull()
    expect(problemaFilaAPie('2026-09-28', { ...bien, hora: '' })).toBe('HORARIO_INVALIDO')
    expect(problemaFilaAPie('2026-09-28', { ...bien, sinLimite: false, cupo: '0' })).toBe('CAPACIDAD_INVALIDA')
    expect(problemaFilaAPie('2026-09-28', { ...bien, sinLimite: false, cupo: '' })).toBe('CAPACIDAD_INVALIDA')
    expect(problemaFilaAPie('2026-09-28', { ...bien, sinLimite: false, cupo: '2.5' })).toBe('CAPACIDAD_INVALIDA')
    expect(problemaFilaAPie('2026-09-28', { ...bien, sinLimite: false, cupo: '40' })).toBeNull()
    expect(problemaFilaAPie('2026-09-28', { ...bien, otraHora: true, abreEn: '' })).toBe('APERTURA_REQUERIDA')
    expect(problemaFilaAPie('2026-09-28', { ...bien, otraHora: true, abreEn: '2026-09-28T17:00' })).toBe(
      'APERTURA_DESPUES_DE_INICIO',
    )
    //  Mas temprano de lo recomendado se puede: solo se avisa.
    expect(problemaFilaAPie('2026-09-28', { ...bien, otraHora: true, abreEn: '2026-09-27T12:00' })).toBeNull()
  })

  it('la apertura: la recomendada o la que se escogió', () => {
    const campos = { hora: '16:30', otraHora: false, abreEn: '2026-09-28T12:00' }
    expect(aperturaDeCampos('2026-09-28', campos)).toBe('2026-09-28T15:30')
    expect(aperturaDeCampos('2026-09-28', { ...campos, otraHora: true })).toBe('2026-09-28T12:00')
    expect(aperturaDeCampos('', campos)).toBe('')
  })

  it('crea una fecha solo a pie con lo capturado', async () => {
    supabase.rpc.mockResolvedValue({ data: 'b', error: null })
    const campos = { hora: '16:30', sinLimite: false, cupo: '60', otraHora: false, abreEn: '2026-09-28T12:00' }
    await crearDiaAPie(filaAPieParaGuardar('2026-10-05', campos))
    expect(supabase.rpc).toHaveBeenLastCalledWith('crear_dia_a_pie', {
      p_fecha: '2026-10-05',
      p_hora: '16:30',
      p_cupo: 60,
      p_abre_en: null,
    })

    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'DIA_YA_EXISTE' } })
    await expect(crearDiaAPie(filaAPieParaGuardar('2026-10-05', campos))).rejects.toThrow('DIA_YA_EXISTE')
  })

  it('quitar y cerrar el registro', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await quitarFilaAPie('2026-09-28')
    expect(supabase.rpc).toHaveBeenLastCalledWith('quitar_fila_a_pie', { p_fecha: '2026-09-28' })
    await cerrarRegistroAPie('b1', true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('actualizar_bloque', { p_bloque_id: 'b1', p_capacidad: null, p_cerrado: true })

    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'BLOQUE_CON_CITAS' } })
    await expect(quitarFilaAPie('2026-09-28')).rejects.toThrow('BLOQUE_CON_CITAS')
  })
})
