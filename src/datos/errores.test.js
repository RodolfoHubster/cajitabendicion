import { describe, expect, it } from 'vitest'
import { clasificarError } from './errores'

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
