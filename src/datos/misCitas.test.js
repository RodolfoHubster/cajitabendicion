import { describe, expect, it } from 'vitest'
import {
  LLAVE_MIS_CITAS,
  MAXIMO_MIS_CITAS,
  citasDelDiaGuardadas,
  citasProximas,
  guardarMiCita,
  leerMisCitas,
  nombreCorto,
  quitarMiCita,
} from './misCitas'

function almacen(inicial = {}) {
  const datos = { ...inicial }
  return {
    getItem: (llave) => (llave in datos ? datos[llave] : null),
    setItem: (llave, valor) => {
      datos[llave] = String(valor)
    },
    datos,
  }
}

const bloqueado = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

const HOY = '2026-09-24'
const cita = (token, fecha = HOY, hora = '15:15:00', nombre = 'María José Pérez García') => ({
  token,
  codigo: `CB-${token}`,
  fecha,
  hora,
  nombre,
})

describe('el nombre en el teléfono va corto', () => {
  it.each([
    ['María José Pérez García', 'María G.'],
    ['Juan Pérez', 'Juan P.'],
    ['María de la Luz', 'María L.'],
    ['Rosa', 'Rosa'],
    ['  ana   lopez  ', 'ana L.'],
    ['', ''],
    [null, ''],
  ])('%s -> %s', (nombre, esperado) => {
    expect(nombreCorto(nombre)).toBe(esperado)
  })
})

describe('guardar y leer', () => {
  it('se guarda la cita y se vuelve a leer, sin el nombre completo', () => {
    const local = almacen()
    expect(guardarMiCita(cita('1111'), HOY, local)).toBe(true)

    const [guardada] = leerMisCitas(local)
    expect(guardada).toMatchObject({ token: '1111', codigo: 'CB-1111', fecha: HOY, hora: '15:15', nombre: 'María G.' })
    expect(local.datos[LLAVE_MIS_CITAS]).not.toContain('José')
  })

  it('guardar la misma cita dos veces no la repite', () => {
    const local = almacen()
    guardarMiCita(cita('1111'), HOY, local)
    guardarMiCita(cita('1111', HOY, '16:00:00'), HOY, local)

    const lista = leerMisCitas(local)
    expect(lista).toHaveLength(1)
    expect(lista[0].hora).toBe('16:00')
  })

  it('las de días pasados se tiran solas al guardar otra', () => {
    const local = almacen()
    guardarMiCita(cita('vieja', '2026-09-21'), '2026-09-21', local)
    guardarMiCita(cita('nueva'), HOY, local)

    expect(leerMisCitas(local).map((c) => c.token)).toEqual(['nueva'])
  })

  it(`no se juntan más de ${MAXIMO_MIS_CITAS}: se quedan las más cercanas`, () => {
    const local = almacen()
    for (let i = 0; i < MAXIMO_MIS_CITAS + 3; i++) {
      guardarMiCita(cita(`t${i}`, `2026-10-${String(10 + i).padStart(2, '0')}`), HOY, local)
    }

    const lista = leerMisCitas(local)
    expect(lista).toHaveLength(MAXIMO_MIS_CITAS)
    expect(lista[0].fecha).toBe('2026-10-10')
  })

  it('lo que no se entiende se ignora, no truena', () => {
    expect(leerMisCitas(almacen({ [LLAVE_MIS_CITAS]: 'no es json' }))).toEqual([])
    expect(leerMisCitas(almacen({ [LLAVE_MIS_CITAS]: '{"a":1}' }))).toEqual([])
    expect(leerMisCitas(almacen({ [LLAVE_MIS_CITAS]: '[{"token":"x"}]' }))).toEqual([])
  })

  it('una cita sin token o sin fecha no se guarda', () => {
    const local = almacen()
    expect(guardarMiCita({ token: '', fecha: HOY, hora: '15:00' }, HOY, local)).toBe(false)
    expect(guardarMiCita({ token: 'x', fecha: 'mañana', hora: '15:00' }, HOY, local)).toBe(false)
    expect(leerMisCitas(local)).toEqual([])
  })

  //  En ventana privada o con datos bloqueados: la página sigue, sin lista.
  it('si el navegador no deja guardar, no truena', () => {
    expect(leerMisCitas(bloqueado)).toEqual([])
    expect(guardarMiCita(cita('1111'), HOY, bloqueado)).toBe(false)
    expect(quitarMiCita('1111', bloqueado)).toBe(false)
    expect(leerMisCitas(undefined)).toEqual([])
  })
})

describe('quitar y consultar', () => {
  it('"quitar de este teléfono" la borra solo a ella', () => {
    const local = almacen()
    guardarMiCita(cita('1111'), HOY, local)
    guardarMiCita(cita('2222'), HOY, local)

    expect(quitarMiCita('1111', local)).toBe(true)
    expect(leerMisCitas(local).map((c) => c.token)).toEqual(['2222'])
    expect(quitarMiCita('no-esta', local)).toBe(false)
  })

  it('las próximas, de la más cercana a la más lejana; las pasadas no', () => {
    const lista = [
      cita('b', '2026-09-28', '15:00'),
      cita('a', HOY, '16:00'),
      cita('c', HOY, '15:00'),
      cita('x', '2026-09-21', '15:00'),
    ]
    expect(citasProximas(lista, HOY).map((c) => c.token)).toEqual(['c', 'a', 'b'])
  })

  it('las de un día, para ofrecerlas cuando el registro dice "ya tienes cita"', () => {
    const local = almacen()
    guardarMiCita(cita('1111', '2026-09-28'), HOY, local)
    guardarMiCita(cita('2222', HOY), HOY, local)

    expect(citasDelDiaGuardadas('2026-09-28', local).map((c) => c.token)).toEqual(['1111'])
    expect(citasDelDiaGuardadas('2026-10-01', local)).toEqual([])
  })
})
