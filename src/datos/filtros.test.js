import { describe, expect, it } from 'vitest'
import {
  FILTROS_CITAS,
  FILTROS_SIN_CITA,
  SIN_VALOR,
  TAMANOS_PAGINA,
  coincideTexto,
  contarPor,
  cuantosFiltros,
  enRango,
  filtrarCitas,
  filtrarSinCita,
  hayFiltros,
  hayVacios,
  horaLocal,
  minutosDeHora,
  normalizarTexto,
  paginar,
  paginasVisibles,
  valoresUnicos,
} from './filtros'

// Septiembre: San Diego esta en UTC-7.
const CITAS = [
  {
    nombre: 'María López',
    codigo_corto: 'CB-1001',
    ciudad: 'Chula Vista',
    hora: '14:45:00',
    estado: 'entregada',
    usado_en: '2026-09-14T21:50:00Z', // 14:50
  },
  { nombre: 'José Núñez', codigo_corto: 'CB-1002', ciudad: null, hora: '14:45:00', estado: 'reservada', usado_en: null },
  {
    nombre: 'Ana María Pérez',
    codigo_corto: 'CB-2003',
    ciudad: 'San Diego',
    hora: '15:00:00',
    estado: 'entregada',
    usado_en: '2026-09-14T22:20:00Z', // 15:20
  },
  { nombre: 'Luis Gómez', codigo_corto: 'CB-2004', ciudad: 'Chula Vista', hora: '15:15:00', estado: 'no_asistio', usado_en: null },
]

const SIN_CITA = [
  // 16:10
  { codigo: 'SC-0003', nombre: 'Pedro Ruiz', registrado_en: '2026-09-14T23:10:00Z', anotado_por: 'pastor@gmail.com', anulada: false },
  // 15:40
  { codigo: 'SC-0002', nombre: 'Rosa Ávila', registrado_en: '2026-09-14T22:40:00Z', anotado_por: 'maria@gmail.com', anulada: true },
  // 14:55
  { codigo: 'SC-0001', nombre: 'Juan Ávalos', registrado_en: '2026-09-14T21:55:00Z', anotado_por: 'pastor@gmail.com', anulada: false },
  // 14:00, anotada antes de que hubiera nombre y codigo
  { codigo: null, nombre: null, registrado_en: '2026-09-14T21:00:00Z', anotado_por: null, anulada: false },
]

const nombres = (filas) => filas.map((fila) => fila.nombre)

describe('normalizarTexto', () => {
  it.each([
    ['María  LÓPEZ ', 'maria lopez'],
    ['Ñúñez', 'nunez'],
    ['  varios\tespacios\n', 'varios espacios'],
    [null, ''],
    [undefined, ''],
    [4871, '4871'],
  ])('%j -> %j', (entrada, salida) => {
    expect(normalizarTexto(entrada)).toBe(salida)
  })
})

describe('coincideTexto', () => {
  const campos = ['María José López', 'CB-4871']

  it.each([
    ['', true],
    ['   ', true],
    ['maria', true],
    ['MARÍA', true],
    ['lopez maria', true],
    ['jose lop', true],
    ['4871', true],
    ['cb4871', true],
    ['CB-4871', true],
    ['cb 4871', true],
    ['maria perez', false],
    ['4872', false],
    ['sc-', false],
  ])('%j -> %s', (busqueda, esperado) => {
    expect(coincideTexto(campos, busqueda)).toBe(esperado)
  })

  it('aguanta campos vacios', () => {
    expect(coincideTexto([null, 'SC-0001'], 'sc0001')).toBe(true)
    expect(coincideTexto([null, undefined], 'x')).toBe(false)
    expect(coincideTexto([null], '')).toBe(true)
  })
})

describe('minutosDeHora', () => {
  it.each([
    ['14:45:00', 885],
    ['14:45', 885],
    ['9:05', 545],
    ['00:00', 0],
    ['23:59', 1439],
    ['', null],
    [null, null],
    ['24:00', null],
    ['12:60', null],
    ['abc', null],
  ])('%j -> %j', (hora, minutos) => {
    expect(minutosDeHora(hora)).toBe(minutos)
  })
})

describe('horaLocal', () => {
  it('pasa a la hora de San Diego en 24 horas', () => {
    expect(horaLocal('2026-09-14T21:05:00Z')).toBe('14:05')
    expect(horaLocal('2026-12-14T21:05:00Z')).toBe('13:05') // horario de invierno
  })

  it('la medianoche es 00, no 24', () => {
    expect(horaLocal('2026-09-15T07:30:00Z')).toBe('00:30')
  })

  it('sin marca, null', () => {
    expect(horaLocal(null)).toBeNull()
    expect(horaLocal('')).toBeNull()
  })
})

describe('enRango', () => {
  it.each([
    ['14:30', '', '', true],
    [null, '', '', true],
    [null, '14:00', '', false],
    ['14:30', '14:00', '15:00', true],
    ['14:00', '14:00', '15:00', true],
    ['15:00', '14:00', '15:00', true],
    ['15:01', '14:00', '15:00', false],
    ['13:59', '14:00', '', false],
    ['23:00', '14:00', '', true],
    ['10:00', '', '12:00', true],
    ['12:01', '', '12:00', false],
    ['14:30', '15:00', '14:00', true],
    ['14:30', 'basura', '', true],
  ])('%j entre %j y %j -> %s', (hora, desde, hasta, esperado) => {
    expect(enRango(hora, desde, hasta)).toBe(esperado)
  })
})

describe('filtrarCitas', () => {
  it('sin filtros pasan todas; sin lista, vacia', () => {
    expect(filtrarCitas(CITAS)).toHaveLength(4)
    expect(filtrarCitas(CITAS, FILTROS_CITAS)).toHaveLength(4)
    expect(filtrarCitas(null, FILTROS_CITAS)).toEqual([])
  })

  it('busca por nombre sin acentos y por codigo', () => {
    expect(nombres(filtrarCitas(CITAS, { ...FILTROS_CITAS, texto: 'maria' }))).toEqual(['María López', 'Ana María Pérez'])
    expect(nombres(filtrarCitas(CITAS, { ...FILTROS_CITAS, texto: 'nunez' }))).toEqual(['José Núñez'])
    expect(nombres(filtrarCitas(CITAS, { ...FILTROS_CITAS, texto: '2004' }))).toEqual(['Luis Gómez'])
  })

  it('por horario, con o sin segundos', () => {
    expect(filtrarCitas(CITAS, { ...FILTROS_CITAS, hora: '14:45:00' })).toHaveLength(2)
    expect(filtrarCitas(CITAS, { ...FILTROS_CITAS, hora: '14:45' })).toHaveLength(2)
    expect(filtrarCitas(CITAS, { ...FILTROS_CITAS, hora: '16:00:00' })).toHaveLength(0)
  })

  it('por estado y por ciudad, incluidas las que no dieron ciudad', () => {
    expect(filtrarCitas(CITAS, { ...FILTROS_CITAS, estado: 'entregada' })).toHaveLength(2)
    expect(filtrarCitas(CITAS, { ...FILTROS_CITAS, ciudad: 'Chula Vista' })).toHaveLength(2)
    expect(nombres(filtrarCitas(CITAS, { ...FILTROS_CITAS, ciudad: SIN_VALOR }))).toEqual(['José Núñez'])
  })

  it('por la hora en que pasaron: las que no han pasado quedan fuera', () => {
    expect(nombres(filtrarCitas(CITAS, { ...FILTROS_CITAS, desde: '15:00', hasta: '15:30' }))).toEqual(['Ana María Pérez'])
    expect(nombres(filtrarCitas(CITAS, { ...FILTROS_CITAS, desde: '15:00' }))).toEqual(['Ana María Pérez'])
    expect(nombres(filtrarCitas(CITAS, { ...FILTROS_CITAS, hasta: '14:50' }))).toEqual(['María López'])
  })

  it('los filtros se combinan', () => {
    const filtros = { ...FILTROS_CITAS, texto: 'maria', estado: 'entregada', ciudad: 'Chula Vista' }
    expect(nombres(filtrarCitas(CITAS, filtros))).toEqual(['María López'])
    expect(filtrarCitas(CITAS, { ...filtros, hora: '15:00:00' })).toEqual([])
  })

  it('las canceladas no salen salvo que se pidan', () => {
    const conCancelada = [
      ...CITAS,
      { nombre: 'Rosa Cancelada', codigo_corto: 'CB-3005', ciudad: null, hora: '15:15:00', estado: 'cancelada', usado_en: null },
    ]

    expect(filtrarCitas(conCancelada)).toHaveLength(4)
    expect(filtrarCitas(conCancelada, { ...FILTROS_CITAS, texto: 'rosa' })).toEqual([])
    expect(nombres(filtrarCitas(conCancelada, { ...FILTROS_CITAS, ciudad: SIN_VALOR }))).toEqual(['José Núñez'])
    expect(nombres(filtrarCitas(conCancelada, { ...FILTROS_CITAS, estado: 'cancelada' }))).toEqual(['Rosa Cancelada'])
    expect(nombres(filtrarCitas(conCancelada, { ...FILTROS_CITAS, estado: 'cancelada', texto: 'rosa' }))).toEqual([
      'Rosa Cancelada',
    ])
  })
})

describe('filtrarSinCita', () => {
  it('sin filtros pasan todas, en el mismo orden', () => {
    expect(filtrarSinCita(SIN_CITA)).toEqual(SIN_CITA)
    expect(filtrarSinCita(undefined)).toEqual([])
  })

  it('busca por nombre sin acentos y por codigo', () => {
    expect(nombres(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, texto: 'avila' }))).toEqual(['Rosa Ávila'])
    expect(nombres(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, texto: 'av' }))).toEqual(['Rosa Ávila', 'Juan Ávalos'])
    expect(nombres(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, texto: 'sc0001' }))).toEqual(['Juan Ávalos'])
  })

  it('por la hora en que se anoto (hora de San Diego)', () => {
    expect(nombres(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, desde: '14:30', hasta: '15:45' }))).toEqual([
      'Rosa Ávila',
      'Juan Ávalos',
    ])
  })

  it('por quien la anoto, incluidas las que no lo guardaron', () => {
    expect(nombres(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, anotadoPor: 'pastor@gmail.com' }))).toEqual([
      'Pedro Ruiz',
      'Juan Ávalos',
    ])
    expect(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, anotadoPor: SIN_VALOR })).toEqual([SIN_CITA[3]])
  })

  it('las que cuentan o las anuladas', () => {
    expect(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, estado: 'cuentan' })).toHaveLength(3)
    expect(nombres(filtrarSinCita(SIN_CITA, { ...FILTROS_SIN_CITA, estado: 'anuladas' }))).toEqual(['Rosa Ávila'])
  })

  it('los filtros se combinan', () => {
    const filtros = { ...FILTROS_SIN_CITA, anotadoPor: 'pastor@gmail.com', desde: '15:00' }
    expect(nombres(filtrarSinCita(SIN_CITA, filtros))).toEqual(['Pedro Ruiz'])
  })
})

describe('opciones de los filtros', () => {
  it('valoresUnicos: ordenados y sin vacios', () => {
    expect(valoresUnicos(CITAS, 'ciudad')).toEqual(['Chula Vista', 'San Diego'])
    expect(valoresUnicos(CITAS, 'hora')).toEqual(['14:45:00', '15:00:00', '15:15:00'])
    expect(valoresUnicos(null, 'hora')).toEqual([])
  })

  it('hayVacios', () => {
    expect(hayVacios(CITAS, 'ciudad')).toBe(true)
    expect(hayVacios(CITAS, 'hora')).toBe(false)
    expect(hayVacios([], 'ciudad')).toBe(false)
  })

  it('contarPor: sin contar los vacios', () => {
    expect(contarPor(CITAS, 'estado')).toEqual({ entregada: 2, reservada: 1, no_asistio: 1 })
    expect(contarPor(CITAS, 'ciudad')).toEqual({ 'Chula Vista': 2, 'San Diego': 1 })
    expect(contarPor(undefined, 'ciudad')).toEqual({})
  })

  it('hayFiltros y cuantosFiltros: espacios solos no cuentan', () => {
    expect(hayFiltros(FILTROS_CITAS)).toBe(false)
    expect(hayFiltros({ ...FILTROS_CITAS, texto: '   ' })).toBe(false)
    expect(hayFiltros({ ...FILTROS_SIN_CITA, estado: 'anuladas' })).toBe(true)

    const filtros = { ...FILTROS_CITAS, texto: 'x', hora: '14:45:00', estado: 'entregada' }
    expect(cuantosFiltros(filtros)).toBe(3)
    expect(cuantosFiltros(filtros, ['texto'])).toBe(2)
  })

  it('los filtros vacios no se pueden modificar por accidente', () => {
    expect(Object.isFrozen(FILTROS_CITAS)).toBe(true)
    expect(Object.isFrozen(FILTROS_SIN_CITA)).toBe(true)
  })
})

describe('paginar', () => {
  const lista = Array.from({ length: 60 }, (_, i) => i + 1)

  it('los tamanos de pagina', () => {
    expect(TAMANOS_PAGINA).toEqual([25, 50, 100])
  })

  it('primera pagina', () => {
    expect(paginar(lista, 1, 25)).toEqual({
      filas: lista.slice(0, 25),
      pagina: 1,
      totalPaginas: 3,
      total: 60,
      desde: 1,
      hasta: 25,
    })
  })

  it('ultima pagina, incompleta', () => {
    const resultado = paginar(lista, 3, 25)
    expect(resultado.filas).toEqual(lista.slice(50))
    expect([resultado.desde, resultado.hasta]).toEqual([51, 60])
  })

  it('una pagina que ya no existe se acomoda a la ultima', () => {
    expect(paginar(lista, 99, 25).pagina).toBe(3)
    // Al filtrar quedaron 10: la pagina 3 pasa a ser la 1.
    expect(paginar(lista.slice(0, 10), 3, 25)).toMatchObject({ pagina: 1, totalPaginas: 1, desde: 1, hasta: 10 })
  })

  it.each([0, -2, Number.NaN, undefined])('pagina invalida (%s) -> 1', (pagina) => {
    expect(paginar(lista, pagina, 25).pagina).toBe(1)
  })

  it.each([0, -5, undefined, Number.NaN])('tamano invalido (%s) -> 25', (porPagina) => {
    expect(paginar(lista, 1, porPagina).filas).toHaveLength(25)
  })

  it('exacto en el limite no agrega una pagina vacia', () => {
    expect(paginar(lista.slice(0, 50), 1, 25).totalPaginas).toBe(2)
    expect(paginar(lista, 1, 100)).toMatchObject({ totalPaginas: 1, hasta: 60 })
  })

  it('lista vacia o sin lista', () => {
    const vacia = { filas: [], pagina: 1, totalPaginas: 1, total: 0, desde: 0, hasta: 0 }
    expect(paginar([], 1, 25)).toEqual(vacia)
    expect(paginar(null)).toEqual(vacia)
  })
})

describe('paginasVisibles', () => {
  it.each([
    [1, 1, [1]],
    [1, 3, [1, 2, 3]],
    [1, 7, [1, 2, '…', 7]],
    [4, 7, [1, 2, 3, 4, 5, 6, 7]],
    [3, 20, [1, 2, 3, 4, '…', 20]],
    [4, 20, [1, 2, 3, 4, 5, '…', 20]],
    [5, 20, [1, '…', 4, 5, 6, '…', 20]],
    [7, 20, [1, '…', 6, 7, 8, '…', 20]],
    [20, 20, [1, '…', 19, 20]],
  ])('pagina %i de %i -> %j', (pagina, total, esperado) => {
    expect(paginasVisibles(pagina, total)).toEqual(esperado)
  })
})
