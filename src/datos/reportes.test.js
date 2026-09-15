import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import {
  CODIGOS,
  COLUMNAS,
  MAXIMO_DIAS,
  PERIODOS,
  aCsv,
  diasEntre,
  nombreArchivoReporte,
  periodoActivo,
  porcentaje,
  rangoDePeriodo,
  reportePorDias,
  totalesReporte,
  validarRango,
} from './reportes'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('diasEntre', () => {
  it.each([
    ['2026-09-01', '2026-09-01', 0],
    ['2026-09-01', '2026-09-30', 29],
    ['2026-03-01', '2026-03-10', 9], // cambio de horario de marzo
    ['2026-11-01', '2026-11-02', 1], // y el de noviembre
    ['2024-02-28', '2024-03-01', 2], // año bisiesto
    ['2026-09-10', '2026-09-01', -9],
  ])('%s a %s -> %i', (desde, hasta, dias) => {
    expect(diasEntre(desde, hasta)).toBe(dias)
  })
})

describe('validarRango', () => {
  it.each([
    ['2026-09-01', '2026-09-30', null],
    ['2026-09-01', '2026-09-01', null],
    ['2026-01-01', '2026-12-31', null],
    ['2024-01-01', '2024-12-31', null],
    ['2025-09-15', '2026-09-16', null], // 366 dias: el maximo
    ['2025-09-15', '2026-09-17', 'RANGO_MUY_LARGO'],
    ['2026-09-30', '2026-09-01', 'RANGO_INVALIDO'],
    ['', '2026-09-01', 'RANGO_INVALIDO'],
    ['2026-09-01', undefined, 'RANGO_INVALIDO'],
    ['01/09/2026', '2026-09-30', 'RANGO_INVALIDO'],
  ])('%j a %j -> %j', (desde, hasta, esperado) => {
    expect(validarRango(desde, hasta)).toBe(esperado)
  })

  it('el maximo es un año, igual que en la base', () => {
    expect(MAXIMO_DIAS).toBe(366)
  })
})

describe('rangoDePeriodo', () => {
  it.each([
    ['esteMes', '2026-09-15', '2026-09-01', '2026-09-30'],
    ['esteMes', '2024-02-10', '2024-02-01', '2024-02-29'],
    ['mesPasado', '2026-09-15', '2026-08-01', '2026-08-31'],
    ['mesPasado', '2026-01-05', '2025-12-01', '2025-12-31'],
    ['mesPasado', '2026-03-31', '2026-02-01', '2026-02-28'],
    ['ultimos30', '2026-09-15', '2026-08-17', '2026-09-15'],
    ['ultimos30', '2026-03-10', '2026-02-09', '2026-03-10'],
    ['esteAnio', '2026-09-15', '2026-01-01', '2026-12-31'],
    ['otro', '2026-09-15', '2026-09-01', '2026-09-30'],
  ])('%s con hoy %s -> %s a %s', (periodo, hoy, desde, hasta) => {
    expect(rangoDePeriodo(periodo, hoy)).toEqual({ desde, hasta })
  })

  it.each(PERIODOS)('%s siempre da un rango valido', (periodo) => {
    for (const hoy of ['2026-01-01', '2026-02-28', '2024-02-29', '2026-12-31']) {
      const { desde, hasta } = rangoDePeriodo(periodo, hoy)
      expect(validarRango(desde, hasta)).toBeNull()
    }
  })

  it('periodoActivo reconoce el boton que corresponde', () => {
    expect(periodoActivo('2026-09-01', '2026-09-30', '2026-09-15')).toBe('esteMes')
    expect(periodoActivo('2026-01-01', '2026-12-31', '2026-09-15')).toBe('esteAnio')
    expect(periodoActivo('2026-09-02', '2026-09-30', '2026-09-15')).toBeNull()
  })
})

describe('totalesReporte y porcentaje', () => {
  const filas = [
    { fecha: '2026-09-14', capacidad: 300, con_cita: 99, recibieron: 80, no_asistieron: 19, pendientes: 0, canceladas: 3, con_excepcion: 1, sin_cita: 13, cajas: 93, intentos_repetidos: 2 },
    { fecha: '2026-09-17', capacidad: '300', con_cita: '120', recibieron: '0', no_asistieron: 0, pendientes: 120, canceladas: 1, con_excepcion: 0, sin_cita: 0, cajas: 0, intentos_repetidos: 0 },
  ]

  it('suma cada columna (aunque llegue como texto) y cuenta los dias', () => {
    expect(totalesReporte(filas)).toEqual({
      capacidad: 600,
      con_cita: 219,
      recibieron: 80,
      no_asistieron: 19,
      pendientes: 120,
      canceladas: 4,
      con_excepcion: 1,
      sin_cita: 13,
      cajas: 93,
      intentos_repetidos: 2,
      dias: 2,
    })
  })

  it('sin filas, todo en cero', () => {
    expect(totalesReporte([])).toMatchObject({ cajas: 0, dias: 0 })
    expect(totalesReporte(null)).toMatchObject({ cajas: 0, dias: 0 })
  })

  it.each([
    [9, 10, 90],
    [2, 3, 67],
    [0, 5, 0],
    [0, 0, null],
  ])('porcentaje(%i, %i) -> %j', (parte, total, esperado) => {
    expect(porcentaje(parte, total)).toBe(esperado)
  })
})

describe('aCsv', () => {
  const columnas = [
    { clave: 'fecha', titulo: 'Fecha' },
    { clave: 'cajas', titulo: 'Cajas, total' },
  ]

  it('encabezados, renglones con \\r\\n y comillas donde hacen falta', () => {
    const texto = aCsv(
      [
        { fecha: '2026-09-14', cajas: 93 },
        { fecha: 'Total "periodo"', cajas: null },
      ],
      columnas,
    )

    expect(texto).toBe('Fecha,"Cajas, total"\r\n2026-09-14,93\r\n"Total ""periodo""",\r\n')
  })

  it('sin filas, solo encabezados', () => {
    expect(aCsv([], columnas)).toBe('Fecha,"Cajas, total"\r\n')
  })

  it('el nombre del archivo lleva las fechas', () => {
    expect(nombreArchivoReporte('2026-09-01', '2026-09-30')).toBe('cajita-reporte-2026-09-01_a_2026-09-30.csv')
  })

  it('la fecha va primero y las cajas estan incluidas', () => {
    expect(COLUMNAS[0]).toBe('fecha')
    expect(COLUMNAS).toContain('cajas')
  })
})

describe('reportePorDias', () => {
  it('pide las fechas a la base; sin datos, lista vacia', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [{ fecha: '2026-09-14', cajas: 93 }], error: null })
    await expect(reportePorDias('2026-09-01', '2026-09-30')).resolves.toEqual([{ fecha: '2026-09-14', cajas: 93 }])
    expect(supabase.rpc).toHaveBeenCalledWith('reporte_por_dias', { p_desde: '2026-09-01', p_hasta: '2026-09-30' })

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(reportePorDias('2026-09-01', '2026-09-30')).resolves.toEqual([])
  })

  it.each([
    [{ message: 'P0001: RANGO_MUY_LARGO' }, 'RANGO_MUY_LARGO'],
    [{ message: 'P0001: RANGO_INVALIDO' }, 'RANGO_INVALIDO'],
    [{ code: '42501', message: 'SIN_PERMISO' }, 'SIN_PERMISO'],
    [{ code: 'PGRST202', message: 'Could not find the function' }, 'FUNCION_NO_INSTALADA'],
  ])('%j -> %s', async (error, codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error })
    await expect(reportePorDias('2026-09-01', '2026-09-30')).rejects.toThrow(new RegExp(`^${codigo}$`))
  })
})

describe('textos en pantalla', () => {
  it.each([...CODIGOS, 'FUNCION_NO_INSTALADA', 'SIN_PERMISO', 'SIN_CONEXION', 'ERROR_DESCONOCIDO'])(
    'el error %s tiene su mensaje',
    (codigo) => {
      expect(es.reportes.errores[codigo]).toBeTruthy()
    },
  )

  it('cada columna y cada periodo tienen su nombre', () => {
    for (const columna of COLUMNAS) expect(es.reportes.col[columna]).toBeTruthy()
    for (const periodo of PERIODOS) expect(es.reportes.periodos[periodo]).toBeTruthy()
  })
})
