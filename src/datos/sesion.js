import { clasificarError, conLimiteDeTiempo, esErrorDeConexion } from './errores'
import { marcarInicio, olvidarInicio, sesionVencida } from './recordarSesion'
import { supabase } from '../lib/supabase'

/**
 * Sesion del personal: admin y voluntario.
 *
 * Las familias no tienen cuenta: en la V1 se registran sin crear usuario.
 * El login de Google para el publico es V2; el personal ya puede usarlo.
 */

//  Con mala senal la llamada se puede quedar colgada y el boton se quedaba
//  en "Entrando..." para siempre. Pasado esto se avisa que no hay conexion.
export const LIMITE_ENTRAR_MS = 20000

//  recordar: "Mantener la sesion activa" (30 dias en este telefono) o solo
//  mientras la pestana este abierta. Se marca antes de entrar: asi Supabase
//  guarda la sesion en el lugar que toca.
export async function iniciarSesion(correo, contrasena, { recordar = true } = {}) {
  marcarInicio(recordar)
  const { data, error } = await conLimiteDeTiempo(
    supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    }),
    LIMITE_ENTRAR_MS,
  )

  if (error) {
    throw new Error(traducirError(error))
  }

  return data.user
}

/**
 * Entrar con Google: lleva a la pagina de Google y regresa al panel.
 *
 * Google solo confirma quien es; el permiso lo da la tabla personal. Si la
 * cuenta no tiene rol, el panel muestra "sin acceso" y no deja hacer nada.
 */
export async function iniciarSesionConGoogle(destino = '/admin', { recordar = true } = {}) {
  marcarInicio(recordar)
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${destino}`,
      // Siempre deja escoger la cuenta: en la computadora de la iglesia
      // puede haber varias cuentas de Google abiertas.
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error) {
    throw new Error(traducirError(error))
  }
}

export async function cerrarSesion() {
  await supabase.auth.signOut()
  olvidarInicio()
}

/** La sesion guardada, o null. Pasados los 30 dias se cierra sola. */
export async function obtenerSesion() {
  const { data } = await supabase.auth.getSession()
  if (data.session && sesionVencida()) {
    await cerrarSesion()
    return null
  }
  return data.session
}

/**
 * El rol de la cuenta con sesion: 'admin', 'voluntario', o null si la
 * cuenta no es del personal.
 *
 * Sirve para decidir que pantallas mostrar. El permiso real lo revisa la
 * base de datos en cada funcion; esto solo evita ensenar una pantalla que
 * de todos modos fallaria.
 */
export async function obtenerRol() {
  const { data, error } = await conLimiteDeTiempo(supabase.rpc('mi_rol'), LIMITE_ENTRAR_MS)

  if (error) throw new Error(clasificarError(error))

  return data ?? null
}

/**
 * Avisa cuando la sesion cambia: al entrar, al salir, y cuando el token
 * se renueva solo (evento 'TOKEN_REFRESHED'). callback(sesion, evento).
 * Devuelve la funcion para dejar de escuchar.
 */
export function alCambiarSesion(callback) {
  const { data } = supabase.auth.onAuthStateChange((evento, sesion) => callback(sesion, evento))
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
  //  "Failed to fetch" en Chrome, "Load failed" en iPhone, o el tiempo agotado.
  if (esErrorDeConexion(error.message)) return 'SIN_CONEXION'

  return 'ERROR_DESCONOCIDO'
}
