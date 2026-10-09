import { describe, expect, it } from 'vitest'
import {
  DIAS_SESION,
  LLAVE_RECORDAR,
  crearAlmacenSesion,
  marcarInicio,
  olvidarInicio,
  quiereRecordar,
  sesionVencida,
} from './recordarSesion'

function almacen() {
  const datos = new Map()
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    datos,
  }
}

const DIA = 86_400_000

describe('mantener la sesión activa', () => {
  it('de fábrica se recuerda; sin palomita, no', () => {
    const local = almacen()
    expect(quiereRecordar(local)).toBe(true)
    marcarInicio(false, { local })
    expect(quiereRecordar(local)).toBe(false)
    marcarInicio(true, { local })
    expect(quiereRecordar(local)).toBe(true)
  })

  it('recordada, la sesión se guarda en el teléfono; si no, solo en la pestaña', () => {
    const local = almacen()
    const pestana = almacen()
    const sesion = crearAlmacenSesion({ local, pestana })

    marcarInicio(true, { local })
    sesion.setItem('sb-token', 'A')
    expect(local.getItem('sb-token')).toBe('A')
    expect(pestana.getItem('sb-token')).toBeNull()

    marcarInicio(false, { local })
    sesion.setItem('sb-token', 'B')
    expect(pestana.getItem('sb-token')).toBe('B')
    //  La del teléfono se borra: no queda una sesión vieja escondida.
    expect(local.getItem('sb-token')).toBeNull()
    expect(sesion.getItem('sb-token')).toBe('B')

    sesion.removeItem('sb-token')
    expect(sesion.getItem('sb-token')).toBeNull()
  })

  it(`dura ${DIAS_SESION} días desde que se entró`, () => {
    const local = almacen()
    marcarInicio(true, { local, ahora: 1_000 })
    expect(sesionVencida({ local, ahora: 1_000 + 29 * DIA })).toBe(false)
    expect(sesionVencida({ local, ahora: 1_000 + 31 * DIA })).toBe(true)
    olvidarInicio(local)
    expect(sesionVencida({ local, ahora: 1_000 + 31 * DIA })).toBe(false)
    //  Al salir, la preferencia de la casilla se queda.
    expect(local.getItem(LLAVE_RECORDAR)).toBe('1')
  })

  it('una sesión de antes (sin fecha) no se vence sola', () => {
    expect(sesionVencida({ local: almacen(), ahora: 10 * DIA })).toBe(false)
  })

  it('sin almacén (ventana privada que lo bloquea) no truena', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(quiereRecordar(roto)).toBe(true)
    expect(() => marcarInicio(true, { local: roto })).not.toThrow()
    const sesion = crearAlmacenSesion({ local: roto, pestana: roto })
    expect(sesion.getItem('x')).toBeNull()
    expect(() => sesion.setItem('x', 'y')).not.toThrow()
  })
})
