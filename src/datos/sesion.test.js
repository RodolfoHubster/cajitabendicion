import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
    },
  },
}))

import { supabase } from '../lib/supabase'
import { iniciarSesion, iniciarSesionConGoogle, obtenerRol } from './sesion'

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://citas.casadealabanzasd.com' } })
  supabase.rpc.mockReset()
  supabase.auth.signInWithOAuth.mockReset()
  supabase.auth.signInWithPassword.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('entrar con Google', () => {
  it('lleva a Google, deja escoger la cuenta y regresa al panel', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })

    await iniciarSesionConGoogle()

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://citas.casadealabanzasd.com/admin',
        queryParams: { prompt: 'select_account' },
      },
    })
  })

  it('regresa a la pantalla que se habia pedido', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })

    await iniciarSesionConGoogle('/escanear')

    expect(supabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe(
      'https://citas.casadealabanzasd.com/escanear',
    )
  })

  it('en la computadora local regresa a localhost', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } })
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null })

    await iniciarSesionConGoogle()

    expect(supabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe('http://localhost:5173/admin')
  })

  it('sin conexion, lo dice', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    await expect(iniciarSesionConGoogle()).rejects.toThrow('SIN_CONEXION')
  })
})

describe('entrar con correo y contrasena', () => {
  it('devuelve el usuario', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })

    await expect(iniciarSesion('pastor@correo.com', 'secreta')).resolves.toEqual({ id: 'u1' })
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'pastor@correo.com', password: 'secreta' })
  })

  it.each([
    [{ message: 'Invalid login credentials' }, 'CREDENCIALES_INVALIDAS'],
    [{ message: 'Email not confirmed' }, 'CORREO_SIN_CONFIRMAR'],
    [{ message: 'Too many requests' }, 'DEMASIADOS_INTENTOS'],
    [{ message: 'rate limit', status: 429 }, 'DEMASIADOS_INTENTOS'],
    [{ message: 'Failed to fetch' }, 'SIN_CONEXION'],
    [{ message: 'algo raro' }, 'ERROR_DESCONOCIDO'],
  ])('traduce %o', async (error, codigo) => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error })
    await expect(iniciarSesion('a@b.co', 'x')).rejects.toThrow(new RegExp(`^${codigo}$`))
  })
})

describe('obtenerRol', () => {
  it.each([
    ['admin', 'admin'],
    ['voluntario', 'voluntario'],
    [null, null],
  ])('la base dice %s', async (data, esperado) => {
    supabase.rpc.mockResolvedValue({ data, error: null })
    await expect(obtenerRol()).resolves.toBe(esperado)
    expect(supabase.rpc).toHaveBeenCalledWith('mi_rol')
  })

  it('con la base sin migrar, lo dice', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } })
    await expect(obtenerRol()).rejects.toThrow('FUNCION_NO_INSTALADA')
  })
})
