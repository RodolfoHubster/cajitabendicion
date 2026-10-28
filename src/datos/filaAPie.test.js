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
  codigoHastaAPie,
  codigoNuncaSePide,
  crearDiaAPie,
  prenderCodigoDeCampos,
  filaAPieParaGuardar,
  otraHoraInicial,
  problemaFilaAPie,
  consultarFilasAPie,
  elegirFila,
  esSinLimite,
  anularTurno,
  buscarTurnos,
  estadoDeTurno,
  cancelarTurnoRepetido,
  deshacerTurnoRepetido,
  estadoFilaAPie,
  filaAlDia,
  haceCuanto,
  horaDeMarca,
  minutosDesde,
  qrDeTurno,
  turnosAPieDeHoy,
  filaDeTurnos,
  filaAPieEnVivo,
  fichasDeLaFila,
  guardarFilaAPie,
  miFilaDeHoy,
  proximaFilaAPie,
  quitarFilaAPie,
  revisarApertura,
  saltarTurno,
  siguienteFilaAPie,
  situacionDelTurno,
  terminarFilaAPie,
  entregarTurno,
  numeroDeTurno,
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

  it('la siguiente después de hoy, para decir cuándo volver', () => {
    const filas = [{ fecha: '2026-10-15' }, { fecha: '2026-10-13' }, { fecha: '2026-10-19' }]
    expect(siguienteFilaAPie(filas, '2026-10-13').fecha).toBe('2026-10-15')
    //  Sin fila hoy: la mas cercana de las que vienen.
    expect(siguienteFilaAPie([{ fecha: '2026-10-19' }, { fecha: '2026-10-15' }], '2026-10-13').fecha).toBe('2026-10-15')
    expect(siguienteFilaAPie([{ fecha: '2026-10-13' }], '2026-10-13')).toBeNull()
    expect(siguienteFilaAPie(null, '2026-10-13')).toBeNull()
  })

  it('al llegar la hora de apertura con la página abierta, ya está abierta', () => {
    vi.useFakeTimers()
    //  1:00 PM en San Diego (UTC-7 en octubre).
    vi.setSystemTime(new Date('2026-10-15T20:00:00Z'))
    const fila = { fecha: '2026-10-15', abierto: false, libres: 50 }
    expect(estadoFilaAPie(filaAlDia({ ...fila, abre_en: '2026-10-15T13:00:01' }))).toBe('por_abrir')
    expect(estadoFilaAPie(filaAlDia({ ...fila, abre_en: '2026-10-15T13:00:00' }))).toBe('abierta')
    expect(estadoFilaAPie(filaAlDia({ ...fila, abre_en: '2026-10-15T12:30:00', libres: 0 }))).toBe('llena')
    //  Lo demas pasa igual.
    expect(filaAlDia(null)).toBeNull()
    expect(filaAlDia({ abierto: false })).toEqual({ abierto: false })
    vi.useRealTimers()
  })

  it('abierta, por abrir o llena', () => {
    expect(estadoFilaAPie(null)).toBe('no_hay')
    expect(estadoFilaAPie({ abierto: false, libres: 10 })).toBe('por_abrir')
    expect(estadoFilaAPie({ abierto: true, libres: 0 })).toBe('llena')
    expect(estadoFilaAPie({ abierto: true, libres: 3 })).toBe('abierta')
  })
})

describe('todo desde el escáner (sección 46)', () => {
  const LISTA = [
    { turno: 1, codigo_corto: 'CB-48213', nombre: 'Turno 1', estado: 'entregada' },
    { turno: 2, codigo_corto: 'CB-4871', nombre: 'Turno 2 · María, chamarra roja', estado: 'reservada' },
    { turno: 12, codigo_corto: 'CB-61002', nombre: 'Turno 12', estado: 'reservada', saltado_en: '2026-10-15T15:05:00' },
    { turno: 20, codigo_corto: 'CB-20001', nombre: 'Turno 20', estado: 'reservada' },
    { turno: 21, codigo_corto: 'CB-77554', nombre: 'Turno 21', estado: 'cancelada', anulado_en: '2026-10-15T15:50:00' },
    { turno: 200, codigo_corto: 'CB-12345', nombre: 'Turno 200', estado: 'reservada' },
  ]
  const turnos = (texto) => buscarTurnos(LISTA, texto).map((fila) => fila.turno)

  it('por número de turno: el exacto primero, luego los que empiezan igual', () => {
    expect(turnos('2')).toEqual([2, 20, 21, 200])
    expect(turnos('20')).toEqual([20, 200])
    expect(turnos('021')).toEqual([21])
    expect(turnos('12')).toEqual([12])
  })

  it('por código: solo el completo (4 o 5 números), con o sin "CB"', () => {
    expect(turnos('48213')).toEqual([1])
    expect(turnos('CB-48213')).toEqual([1])
    expect(turnos('cb 4871')).toEqual([2])
    //  A medias no: el código es lo que prueba de quién es el turno.
    expect(turnos('4821')).toEqual([])
    expect(turnos('2000')).toEqual([])
  })

  it('por seña o nombre, sin acentos', () => {
    expect(turnos('chamarra')).toEqual([2])
    expect(turnos('MARIA roja')).toEqual([2])
    expect(turnos('azul')).toEqual([])
  })

  it('sin nada escrito, nada', () => {
    expect(buscarTurnos(LISTA, '')).toEqual([])
    expect(buscarTurnos(LISTA, '  -  ')).toEqual([])
    expect(buscarTurnos(null, '2')).toEqual([])
  })

  it('cómo está cada turno', () => {
    expect(estadoDeTurno(LISTA[0])).toBe('recibio')
    expect(estadoDeTurno(LISTA[1], 2)).toBe('va')
    expect(estadoDeTurno(LISTA[1], 1)).toBe('esperando')
    expect(estadoDeTurno(LISTA[2], 12)).toBe('saltado')
    expect(estadoDeTurno(LISTA[4])).toBe('anulado')
  })

  it('a qué hora y hace cuánto (hora de San Diego, como la manda la base)', () => {
    vi.useFakeTimers()
    //  3:45 PM en San Diego (UTC-7 en octubre).
    vi.setSystemTime(new Date('2026-10-15T22:45:00Z'))
    expect(horaDeMarca('2026-10-15T15:05:00.123456')).toBe('3:05 PM')
    expect(horaDeMarca(null)).toBe('')
    expect(minutosDesde('2026-10-15T15:05:00.9')).toBe(40)
    expect(minutosDesde('2026-10-15T15:50:00')).toBe(0)
    expect(minutosDesde(null)).toBe(0)
    const t = (clave, o = {}) => `${clave}|${JSON.stringify(o)}`
    expect(haceCuanto(t, '2026-10-15T15:44:40')).toBe('escaneo.turnos.haceUnMomento|{}')
    expect(haceCuanto(t, '2026-10-15T15:05:00')).toBe('escaneo.turnos.haceMin|{"n":40}')
    expect(haceCuanto(t, '2026-10-15T13:25:00')).toBe('escaneo.turnos.haceHoras|{"h":2,"m":20}')
    vi.useRealTimers()
  })

  it('anular, la lista y el QR de un turno', async () => {
    supabase.rpc.mockResolvedValue({ data: 23, error: null })
    await expect(anularTurno('23')).resolves.toBe(23)
    expect(supabase.rpc).toHaveBeenLastCalledWith('anular_turno', { p_turno: 23 })

    supabase.rpc.mockResolvedValue({ data: LISTA, error: null })
    await expect(turnosAPieDeHoy()).resolves.toHaveLength(LISTA.length)
    expect(supabase.rpc).toHaveBeenLastCalledWith('turnos_a_pie_de_hoy', {})
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(turnosAPieDeHoy()).resolves.toEqual([])

    supabase.rpc.mockResolvedValue({ data: 'tok-23', error: null })
    await expect(qrDeTurno(23)).resolves.toBe('tok-23')
    expect(supabase.rpc).toHaveBeenLastCalledWith('qr_de_turno', { p_turno: 23 })

    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: TURNO_NO_EXISTE' } })
    await expect(anularTurno(99)).rejects.toThrow('TURNO_NO_EXISTE')
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
    //  Sección 46: la voluntaria lo anuló porque llegó tarde.
    expect(situacionDelTurno({ ...base, estado: 'cancelada', anulado: true, saltado: true }).tipo).toBe('anulado')
    expect(situacionDelTurno({ ...base, estado: 'entregada', anulado: false }).tipo).toBe('recibida')
    expect(situacionDelTurno({ ...base, cerrada: true }).tipo).toBe('terminada')
    expect(situacionDelTurno({ ...base, cerrada: true, saltado: true }).tipo).toBe('terminada')
    expect(situacionDelTurno({ ...base, cerrada: true, estado: 'entregada' }).tipo).toBe('recibida')
  })

  it('entregar por número de turno, sin QR', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'VALIDO', nombre: 'Turno 23', turno: 23 }], error: null })
    await expect(entregarTurno('23')).resolves.toMatchObject({ resultado: 'VALIDO', turno: 23 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('entregar_turno', { p_turno: 23 })
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: OTRA_FILA' } })
    await expect(entregarTurno(23)).rejects.toThrow('OTRA_FILA')
  })

  it('el número de turno que se escribe', () => {
    expect(numeroDeTurno('23')).toBe(23)
    expect(numeroDeTurno(' 007 ')).toBe(7)
    expect(numeroDeTurno('')).toBeNull()
    expect(numeroDeTurno('0')).toBeNull()
    expect(numeroDeTurno('123456')).toBeNull()
  })

  it('terminar la fila (y deshacerlo)', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })
    await expect(terminarFilaAPie()).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenLastCalledWith('terminar_fila_a_pie', { p_terminada: true })
    await terminarFilaAPie(false)
    expect(supabase.rpc).toHaveBeenLastCalledWith('terminar_fila_a_pie', { p_terminada: false })
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: OTRA_FILA' } })
    await expect(terminarFilaAPie()).rejects.toThrow('OTRA_FILA')
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
    expect(camposFilaAPie()).toEqual({
      hora: '14:00', sinLimite: true, cupo: '100', otraHora: false, abreEn: '',
      codigo: false, codigoConHora: false, codigoHasta: '',
    })
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
      codigo: false, codigoConHora: false, codigoHasta: '',
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

  it('al crearla con el código del día: "hasta las" necesita su hora', () => {
    const bien = { hora: '16:30', sinLimite: true, cupo: '100', otraHora: false, abreEn: '' }
    const sinHora = { ...bien, codigo: true, codigoConHora: true, codigoHasta: '' }
    expect(problemaFilaAPie('2026-09-28', sinHora, true)).toBe('CODIGO_HASTA_REQUERIDA')
    expect(problemaFilaAPie('2026-09-28', { ...sinHora, codigoHasta: '13:00' }, true)).toBeNull()
    expect(problemaFilaAPie('2026-09-28', { ...sinHora, codigoConHora: false }, true)).toBeNull()
    expect(problemaFilaAPie('2026-09-28', { ...sinHora, codigo: false }, true)).toBeNull()
    //  Ya creada, el codigo se cambia en su recuadro: no estorba para guardar.
    expect(problemaFilaAPie('2026-09-28', sinHora)).toBeNull()
  })

  it('avisa si el código dejaría de pedirse antes de abrir los turnos', () => {
    expect(codigoNuncaSePide('2026-10-19', '2026-10-19T13:00', '12:30')).toBe(true)
    expect(codigoNuncaSePide('2026-10-19', '2026-10-19T13:00', '13:00:00')).toBe(true)
    expect(codigoNuncaSePide('2026-10-19', '2026-10-19T09:00', '13:00')).toBe(false)
    //  Los turnos abren el dia anterior: a esa hora del dia ya se pidio.
    expect(codigoNuncaSePide('2026-10-19', '2026-10-18T20:00', '09:00')).toBe(false)
    expect(codigoNuncaSePide('2026-10-19', '2026-10-19T13:00', '')).toBe(false)
    expect(codigoNuncaSePide('2026-10-19', '', '12:00')).toBe(false)
  })

  it('hasta qué hora se pide: leerla, guardarla y regresar a todo el día', async () => {
    supabase.rpc.mockResolvedValue({ data: '13:00:00', error: null })
    await expect(codigoHastaAPie('2026-10-19')).resolves.toBe('13:00:00')
    expect(supabase.rpc).toHaveBeenLastCalledWith('codigo_turno_a_pie_hasta', {
      p_fecha: '2026-10-19', p_cambiar: false, p_hasta: null,
    })
    await codigoHastaAPie('2026-10-19', { cambiar: true, hasta: '13:00' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('codigo_turno_a_pie_hasta', {
      p_fecha: '2026-10-19', p_cambiar: true, p_hasta: '13:00',
    })
    await codigoHastaAPie('2026-10-19', { cambiar: true, hasta: '' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('codigo_turno_a_pie_hasta', {
      p_fecha: '2026-10-19', p_cambiar: true, p_hasta: null,
    })

    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'FILA_A_PIE_NO_EXISTE' } })
    await expect(codigoHastaAPie('2026-10-19')).rejects.toThrow('FILA_A_PIE_NO_EXISTE')
  })

  it('al crear la fila prende el código del día y su hora, solo si se pidió', async () => {
    supabase.rpc.mockResolvedValue({ data: '4821', error: null })
    await expect(prenderCodigoDeCampos('2026-10-19', { codigo: false })).resolves.toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()

    await expect(prenderCodigoDeCampos('2026-10-19', { codigo: true, codigoConHora: false, codigoHasta: '13:00' })).resolves.toBe('4821')
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenLastCalledWith('codigo_turno_a_pie', { p_fecha: '2026-10-19', p_activo: true, p_nuevo: false })

    supabase.rpc.mockClear()
    await prenderCodigoDeCampos('2026-10-19', { codigo: true, codigoConHora: true, codigoHasta: '13:00' })
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
    expect(supabase.rpc).toHaveBeenLastCalledWith('codigo_turno_a_pie_hasta', {
      p_fecha: '2026-10-19', p_cambiar: true, p_hasta: '13:00',
    })
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

describe('la fila en vivo, para cualquiera (sección 51)', () => {
  it('pide los números de hoy; sin fila, null', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ actual: 12, ultimo: 11, atendidos: 11, en_espera: 7, total: 19 }], error: null })
    await expect(filaAPieEnVivo()).resolves.toMatchObject({ actual: 12, en_espera: 7 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('fila_a_pie_en_vivo', {})
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(filaAPieEnVivo()).resolves.toBeNull()
  })
})

describe('la tira de números de /fila', () => {
  it('el último que recibió, el que llaman y el que sigue, en orden', () => {
    expect(fichasDeLaFila({ ultimo: 16, actual: 17, total: 25 })).toEqual([
      { numero: 16, tipo: 'recibio' },
      { numero: 17, tipo: 'llamando' },
      { numero: 18, tipo: 'sigue' },
    ])
  })

  it('no inventa un turno que no se ha dado', () => {
    expect(fichasDeLaFila({ ultimo: 24, actual: 25, total: 25 })).toEqual([
      { numero: 24, tipo: 'recibio' },
      { numero: 25, tipo: 'llamando' },
    ])
  })

  it('si alguien pasó antes de su número, la tira sigue en orden', () => {
    expect(fichasDeLaFila({ ultimo: 18, actual: 17, total: 25 })).toEqual([
      { numero: 17, tipo: 'llamando' },
      { numero: 18, tipo: 'recibio' },
    ])
  })

  it('sin nadie esperando, solo el último; recién abierta, solo el primero', () => {
    expect(fichasDeLaFila({ ultimo: 25, actual: null, total: 25 })).toEqual([{ numero: 25, tipo: 'recibio' }])
    expect(fichasDeLaFila({ ultimo: null, actual: 1, total: 1 })).toEqual([{ numero: 1, tipo: 'llamando' }])
    expect(fichasDeLaFila({ ultimo: null, actual: null, total: 0 })).toEqual([])
  })
})

describe('turno repetido (sección 53)', () => {
  it('el escáner lo distingue de uno anulado', () => {
    expect(estadoDeTurno({ turno: 9, estado: 'cancelada', repetido_en: '2026-10-27T15:00:00' })).toBe('repetido')
    expect(estadoDeTurno({ turno: 9, estado: 'cancelada', anulado_en: '2026-10-27T15:00:00' })).toBe('anulado')
  })

  it('la persona sabe que ya tenía otro, y cuál', () => {
    expect(situacionDelTurno({ turno: 9, estado: 'cancelada', repetido: true, se_queda: 4 })).toEqual({ tipo: 'repetido', seQueda: 4 })
    expect(situacionDelTurno({ turno: 9, estado: 'cancelada', repetido: true })).toEqual({ tipo: 'repetido', seQueda: null })
  })

  it('cancelar y regresar llaman lo suyo; el que se queda, solo si es un número', async () => {
    supabase.rpc.mockResolvedValue({ data: 9, error: null })
    await cancelarTurnoRepetido('9', '4')
    expect(supabase.rpc).toHaveBeenLastCalledWith('cancelar_turno_repetido', { p_turno: 9, p_se_queda: 4 })
    await cancelarTurnoRepetido(9, '')
    expect(supabase.rpc).toHaveBeenLastCalledWith('cancelar_turno_repetido', { p_turno: 9, p_se_queda: null })
    await deshacerTurnoRepetido(9)
    expect(supabase.rpc).toHaveBeenLastCalledWith('deshacer_turno_repetido', { p_turno: 9 })
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'TURNO_QUE_QUEDA_NO_EXISTE' } })
    await expect(cancelarTurnoRepetido(9, 99)).rejects.toThrow('TURNO_QUE_QUEDA_NO_EXISTE')
  })
})
