import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
      signOut: vi.fn(),
    },
  },
}))

import { supabase } from '../lib/supabase'
import { LLAVE_DESDE, LLAVE_RECORDAR } from './recordarSesion'
import { LIMITE_ENTRAR_MS, iniciarSesion, iniciarSesionConGoogle, obtenerRol, obtenerSesion } from './sesion'

function almacen() {
  const datos = new Map()
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://citas.casadealabanzasd.com' } })
  supabase.rpc.mockReset()
  supabase.auth.signInWithOAuth.mockReset()
  supabase.auth.signInWithPassword.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mantener la sesión activa', () => {
  it('al entrar se guarda si se recuerda (con correo y con Google)', async () => {
    const local = almacen()
    vi.stubGlobal('localStorage', local)
    supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
    await iniciarSesion('a@b.com', 'x', { recordar: false })
    expect(local.getItem(LLAVE_RECORDAR)).toBe('0')
    supabase.auth.signInWithOAuth.mockResolvedValue({ error: null })
    await iniciarSesionConGoogle('/admin')
    expect(local.getItem(LLAVE_RECORDAR)).toBe('1')
    expect(Number(local.getItem(LLAVE_DESDE))).toBeGreaterThan(0)
  })

  it('pasados los 30 días, la sesión se cierra sola', async () => {
    const local = almacen()
    vi.stubGlobal('localStorage', local)
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } })
    local.setItem(LLAVE_DESDE, String(Date.now() - 2 * 86_400_000))
    await expect(obtenerSesion()).resolves.toMatchObject({ user: { id: 'u' } })
    local.setItem(LLAVE_DESDE, String(Date.now() - 31 * 86_400_000))
    await expect(obtenerSesion()).resolves.toBeNull()
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})

describe('entrar con correo y contraseña', () => {
  it('con la contraseña equivocada avisa sin decir si el correo existe', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', status: 400 },
    })
    await expect(iniciarSesion('a@b.com', 'mal')).rejects.toThrow('CREDENCIALES_INVALIDAS')
  })

  it('sin señal en iPhone ("Load failed") dice que no hay conexión', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Load failed' } })
    await expect(iniciarSesion('a@b.com', 'x')).rejects.toThrow('SIN_CONEXION')
  })

  it('si la llamada se queda colgada, no espera para siempre: dice que no hay conexión', async () => {
    vi.useFakeTimers()
    supabase.auth.signInWithPassword.mockReturnValue(new Promise(() => {}))

    const intento = expect(iniciarSesion('a@b.com', 'x')).rejects.toThrow('SIN_CONEXION')
    await vi.advanceTimersByTimeAsync(LIMITE_ENTRAR_MS)
    await intento
    vi.useRealTimers()
  })
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
