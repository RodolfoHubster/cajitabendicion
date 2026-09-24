import { afterEach, describe, expect, it, vi } from 'vitest'
import { clasificarError, conLimiteDeTiempo, esErrorDeConexion } from './errores'

describe('clasificarError', () => {
  it.each([
    [{ code: 'PGRST202', message: 'Could not find the function' }, 'FUNCION_NO_INSTALADA'],
    [{ code: '42501', message: 'SIN_PERMISO' }, 'SIN_PERMISO'],
    [{ code: '42501', message: 'SIN_SESION' }, 'SIN_PERMISO'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'SIN_PERMISO'],
    [{ message: 'TypeError: Failed to fetch' }, 'SIN_CONEXION'],
    [{ message: 'FAILED TO FETCH' }, 'SIN_CONEXION'],
    [{ code: '23505', message: 'duplicate key' }, 'ERROR_DESCONOCIDO'],
    [{}, 'ERROR_DESCONOCIDO'],
    [null, 'ERROR_DESCONOCIDO'],
    [undefined, 'ERROR_DESCONOCIDO'],
  ])('%o -> %s', (error, esperado) => {
    expect(clasificarError(error)).toBe(esperado)
  })
})

//  Antes solo se reconocía el mensaje de Chrome. En el iPhone, con mala
//  señal, salía "error desconocido" en vez de "no hay conexión".
describe('sin red, en cualquier navegador', () => {
  it.each([
    ['Chrome', 'TypeError: Failed to fetch'],
    ['Safari (iPhone)', 'TypeError: Load failed'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
    ['React Native / otros', 'Network request failed'],
    ['nuestro límite de tiempo', 'TIEMPO_AGOTADO'],
  ])('%s: "%s" es falta de conexión', (_navegador, mensaje) => {
    expect(esErrorDeConexion(mensaje)).toBe(true)
    expect(clasificarError({ message: mensaje })).toBe('SIN_CONEXION')
  })

  it('un error de la base no se confunde con falta de red', () => {
    expect(esErrorDeConexion('BLOQUE_LLENO')).toBe(false)
    expect(esErrorDeConexion(undefined)).toBe(false)
  })
})

describe('esperar, pero no para siempre', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('si la respuesta llega a tiempo, es esa', async () => {
    await expect(conLimiteDeTiempo(Promise.resolve({ data: 1, error: null }), 1000)).resolves.toEqual({
      data: 1,
      error: null,
    })
  })

  it('si se tarda de más, se responde como falta de red', async () => {
    vi.useFakeTimers()
    const colgada = new Promise(() => {})
    const respuesta = conLimiteDeTiempo(colgada, 1000)

    vi.advanceTimersByTime(1001)
    const { error } = await respuesta
    expect(clasificarError(error)).toBe('SIN_CONEXION')
  })
})
