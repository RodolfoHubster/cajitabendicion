import { supabase } from '../lib/supabase'

/**
 * Sesion del personal administrativo.
 *
 * Solo el personal tiene cuenta. Las familias no: en la V1 se registran
 * sin crear usuario. El login de Google para el publico es V2.
 */

export async function iniciarSesion(correo, contrasena) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  })

  if (error) {
    throw new Error(traducirError(error))
  }

  return data.user
}

export async function cerrarSesion() {
  await supabase.auth.signOut()
}

export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * Avisa cuando la sesion cambia: al entrar, al salir, y cuando el token
 * se renueva solo. Devuelve la funcion para dejar de escuchar.
 */
export function alCambiarSesion(callback) {
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => callback(sesion))
  return () => data.subscription.unsubscribe()
}

/**
 * Supabase devuelve los errores en ingles y con jerga. Se traducen a
 * codigos propios para que la pantalla los muestre en el idioma que
 * toque, sin revelar si el correo existe o no.
 */
function traducirError(error) {
  const mensaje = error.message?.toLowerCase() ?? ''

  if (mensaje.includes('invalid login credentials')) return 'CREDENCIALES_INVALIDAS'
  if (mensaje.includes('email not confirmed')) return 'CORREO_SIN_CONFIRMAR'
  if (mensaje.includes('too many requests') || error.status === 429) return 'DEMASIADOS_INTENTOS'
  if (mensaje.includes('failed to fetch')) return 'SIN_CONEXION'

  return 'ERROR_DESCONOCIDO'
}
