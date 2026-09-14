import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import { guardarCodigoAnticipado } from './anticipado'
import { CODIGOS, obtenerDispositivo, registrarYReservar, traducirError } from './registro'

function crearAlmacen() {
  const datos = new Map()
  return {
    getItem: (llave) => (datos.has(llave) ? datos.get(llave) : null),
    setItem: (llave, valor) => datos.set(llave, String(valor)),
    removeItem: (llave) => datos.delete(llave),
    clear: () => datos.clear(),
  }
}

const PERSONA = {
  nombres: 'María José',
  apellidos: 'Pérez López',
  telefono: '+526641234567',
  email: 'maria@gmail.com',
  ciudad: 'Tijuana',
  bloqueId: 'bloque-1',
  fecha: '2026-09-14',
}

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

beforeEach(() => {
  vi.stubGlobal('localStorage', crearAlmacen())
  vi.stubGlobal('sessionStorage', crearAlmacen())
  supabase.rpc.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('obtenerDispositivo', () => {
  it('crea un identificador la primera vez y despues reutiliza el mismo', () => {
    const primero = obtenerDispositivo()
    expect(primero).toMatch(/^[0-9a-f-]{36}$/)
    expect(obtenerDispositivo()).toBe(primero)
  })

  it('si el navegador bloquea el almacenamiento, manda null (sin tope)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
    })
    expect(obtenerDispositivo()).toBeNull()
  })
})

describe('registrarYReservar', () => {
  it('manda nombres y apellidos separados, el telefono internacional y el dispositivo', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo_corto: 'CB-1234', token_qr: 'token' }], error: null })

    const cita = await registrarYReservar(PERSONA)

    expect(cita).toEqual({ codigo_corto: 'CB-1234', token_qr: 'token' })
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_y_reservar', {
      p_nombre: 'María José',
      p_apellidos: 'Pérez López',
      p_telefono: '+526641234567',
      p_bloque_id: 'bloque-1',
      p_email: 'maria@gmail.com',
      p_ciudad: 'Tijuana',
      p_dispositivo: obtenerDispositivo(),
      p_codigo_anticipado: null,
    })
  })

  it('manda el codigo de suscriptor guardado para esa fecha, ya normalizado', async () => {
    supabase.rpc.mockResolvedValue({ data: [{}], error: null })
    guardarCodigoAnticipado('2026-09-14', ' k7mp2q ')

    await registrarYReservar(PERSONA)

    expect(supabase.rpc.mock.calls[0][1].p_codigo_anticipado).toBe('K7MP2Q')
  })

  it('el codigo de otra fecha no se manda', async () => {
    supabase.rpc.mockResolvedValue({ data: [{}], error: null })
    guardarCodigoAnticipado('2026-09-17', 'K7MP2Q')

    await registrarYReservar(PERSONA)

    expect(supabase.rpc.mock.calls[0][1].p_codigo_anticipado).toBeNull()
  })

  it('correo y zona vacios van como null', async () => {
    supabase.rpc.mockResolvedValue({ data: [{}], error: null })

    await registrarYReservar({ ...PERSONA, email: '', ciudad: '' })

    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({ p_email: null, p_ciudad: null })
  })

  it('acepta la respuesta como objeto suelto', async () => {
    supabase.rpc.mockResolvedValue({ data: { codigo_corto: 'CB-1' }, error: null })
    await expect(registrarYReservar(PERSONA)).resolves.toEqual({ codigo_corto: 'CB-1' })
  })

  it('sin respuesta falla con ERROR_DESCONOCIDO', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(registrarYReservar(PERSONA)).rejects.toThrow('ERROR_DESCONOCIDO')
  })

  it.each(CODIGOS)('traduce el error %s de la base', async (codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
    await expect(registrarYReservar(PERSONA)).rejects.toThrow(new RegExp(`^${codigo}$`))
  })

  it.each([...CODIGOS, 'ERROR_DESCONOCIDO'])('%s tiene su mensaje en pantalla', (codigo) => {
    expect(es.registro.errores[codigo]).toBeTruthy()
  })
})

describe('traducirError', () => {
  it('no confunde codigos parecidos', () => {
    expect(traducirError('NOMBRE_INVALIDO')).toBe('NOMBRE_INVALIDO')
    expect(traducirError('NOMBRE_REQUERIDO')).toBe('NOMBRE_REQUERIDO')
    expect(traducirError('TELEFONO_INVALIDO')).toBe('TELEFONO_INVALIDO')
    expect(traducirError('DIA_CERRADO')).toBe('DIA_CERRADO')
    expect(traducirError('BLOQUE_CERRADO')).toBe('BLOQUE_CERRADO')
  })

  it('lo desconocido no se muestra crudo', () => {
    expect(traducirError('duplicate key value violates unique constraint')).toBe('ERROR_DESCONOCIDO')
    expect(traducirError(undefined)).toBe('ERROR_DESCONOCIDO')
  })
})

describe('personas al mismo tiempo (del lado de la pagina)', () => {
  // El candado de verdad esta en la base y se prueba con
  // scripts/prueba-concurrencia.mjs. Aqui se revisa que la pagina, con
  // muchas respuestas llegando revueltas, no pierda ni invente ninguna.

  it('50 registros a la vez en un horario de 2 lugares: 2 citas y 48 "lleno"', async () => {
    let ocupados = 0
    let fila = Promise.resolve()

    supabase.rpc.mockImplementation((_, parametros) => {
      // Servidor simulado que atiende de uno en uno, como el bloqueo de fila.
      const respuesta = fila.then(async () => {
        await esperar(Math.random() * 3)
        if (ocupados >= 2) return { data: null, error: { message: 'P0001: BLOQUE_LLENO' } }
        ocupados += 1
        return { data: [{ codigo_corto: `CB-000${ocupados}`, token_qr: parametros.p_apellidos }], error: null }
      })
      fila = respuesta
      return respuesta
    })

    const resultados = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) => registrarYReservar({ ...PERSONA, apellidos: `Persona ${i}` })),
    )

    const aceptados = resultados.filter((r) => r.status === 'fulfilled')
    const rechazados = resultados.filter((r) => r.status === 'rejected')

    expect(aceptados).toHaveLength(2)
    expect(rechazados).toHaveLength(48)
    expect(rechazados.every((r) => r.reason.message === 'BLOQUE_LLENO')).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledTimes(50)
    expect(new Set(supabase.rpc.mock.calls.map(([, p]) => p.p_apellidos)).size).toBe(50)
  })

  it('11 registros a la vez desde el mismo telefono con tope de 10: el 11 se rechaza', async () => {
    const porDispositivo = new Map()
    let fila = Promise.resolve()

    supabase.rpc.mockImplementation((_, parametros) => {
      const respuesta = fila.then(async () => {
        await esperar(Math.random() * 3)
        const usadas = porDispositivo.get(parametros.p_dispositivo) ?? 0
        if (usadas >= 10) return { data: null, error: { message: 'P0001: LIMITE_DISPOSITIVO' } }
        porDispositivo.set(parametros.p_dispositivo, usadas + 1)
        return { data: [{ codigo_corto: 'CB-1' }], error: null }
      })
      fila = respuesta
      return respuesta
    })

    const resultados = await Promise.allSettled(
      Array.from({ length: 11 }, (_, i) => registrarYReservar({ ...PERSONA, apellidos: `Persona ${i}` })),
    )

    // Todas salieron con el mismo identificador de este navegador.
    expect(new Set(supabase.rpc.mock.calls.map(([, p]) => p.p_dispositivo)).size).toBe(1)
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(10)
    expect(resultados.filter((r) => r.status === 'rejected').map((r) => r.reason.message)).toEqual([
      'LIMITE_DISPOSITIVO',
    ])
  })
})
