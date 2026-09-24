import { describe, expect, it } from 'vitest'
import { LLAVE_BORRADOR, MINUTOS_BORRADOR, borrarBorrador, guardarBorrador, leerBorrador } from './borrador'

function almacen() {
  const datos = {}
  return {
    getItem: (llave) => (llave in datos ? datos[llave] : null),
    setItem: (llave, valor) => {
      datos[llave] = String(valor)
    },
    removeItem: (llave) => {
      delete datos[llave]
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
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

const ESCRITO = {
  nombres: 'María',
  apellidos: 'Pérez',
  pais: 'US',
  telefono: '619 555 1234',
  email: 'maria@gmail.com',
  domicilio: { pais: 'US', codigoPostal: '92105', calle: 'El Cajon Blvd', sinDomicilio: false },
  //  Esto NO se guarda: las casillas se marcan cada vez.
  acepto: true,
}

describe('lo escrito sobrevive a que la página se recargue', () => {
  it('se guarda y se vuelve a leer igual', () => {
    const sesion = almacen()
    expect(guardarBorrador(ESCRITO, sesion, 1000)).toBe(true)

    const leido = leerBorrador(sesion, 2000)
    expect(leido).toMatchObject({
      nombres: 'María',
      apellidos: 'Pérez',
      telefono: '619 555 1234',
      email: 'maria@gmail.com',
      domicilio: { codigoPostal: '92105', calle: 'El Cajon Blvd' },
    })
  })

  it('las casillas de aceptar no se guardan: se marcan cada vez', () => {
    const sesion = almacen()
    guardarBorrador(ESCRITO, sesion, 1000)
    expect(leerBorrador(sesion, 2000).acepto).toBeUndefined()
    expect(sesion.datos[LLAVE_BORRADOR]).not.toContain('acepto')
  })

  it(`caduca a los ${MINUTOS_BORRADOR} minutos, y lo caducado se borra`, () => {
    const sesion = almacen()
    guardarBorrador(ESCRITO, sesion, 0)
    expect(leerBorrador(sesion, MINUTOS_BORRADOR * 60000 - 1)).not.toBeNull()
    expect(leerBorrador(sesion, MINUTOS_BORRADOR * 60000)).toBeNull()
    expect(LLAVE_BORRADOR in sesion.datos).toBe(false)
  })

  it('un formulario vacío no deja borrador (solo el país no cuenta)', () => {
    const sesion = almacen()
    guardarBorrador(ESCRITO, sesion, 1000)
    expect(guardarBorrador({ pais: 'MX', domicilio: { pais: 'MX', sinDomicilio: false } }, sesion, 2000)).toBe(false)
    expect(LLAVE_BORRADOR in sesion.datos).toBe(false)
  })

  it('"empezar de nuevo" lo borra', () => {
    const sesion = almacen()
    guardarBorrador(ESCRITO, sesion, 1000)
    borrarBorrador(sesion)
    expect(leerBorrador(sesion, 2000)).toBeNull()
  })

  it('lo que no se entiende se ignora', () => {
    const sesion = almacen()
    sesion.setItem(LLAVE_BORRADOR, 'no es json')
    expect(leerBorrador(sesion, 1000)).toBeNull()
    sesion.setItem(LLAVE_BORRADOR, JSON.stringify({ nombres: 'X' }))
    expect(leerBorrador(sesion, 1000)).toBeNull()
  })

  it('si el navegador no deja guardar, el registro sigue igual', () => {
    expect(guardarBorrador(ESCRITO, bloqueado)).toBe(false)
    expect(leerBorrador(bloqueado)).toBeNull()
    expect(() => borrarBorrador(bloqueado)).not.toThrow()
  })
})
