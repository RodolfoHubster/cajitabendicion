import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Equipo y accesos: quien puede entrar al panel y con que rol.
 *
 * Todo es solo del administrador; la base lo revisa. Tampoco deja que el
 * pastor se quite a si mismo el rol de admin.
 */

// Errores de negocio que la base lanza como texto.
export const CODIGOS = [
  'CORREO_INVALIDO',
  'ROL_INVALIDO',
  'NO_PUEDES_QUITARTE_ADMIN',
  'PERSONAL_NO_EXISTE',
  'CODIGO_MUY_CORTO',
  'NO_ES_ADMIN',
  'FILA_INVALIDA',
]

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

/** El equipo: activos, pendientes de entrar y sin acceso. */
export async function listarEquipo() {
  return (await llamar('listar_personal', {})) ?? []
}

/**
 * Da acceso o cambia el rol. Devuelve 'pendiente' si la persona todavia no
 * ha entrado (el rol se aplica en cuanto entre con Google) o 'listo'.
 */
export async function guardarAcceso(correo, rol) {
  const respuesta = await llamar('guardar_personal', { p_correo: correo.trim(), p_rol: rol })
  return String(respuesta ?? '').startsWith('PENDIENTE') ? 'pendiente' : 'listo'
}

/** Quita el acceso (o la autorizacion, si aun no habia entrado). */
export function quitarAcceso(correo) {
  return llamar('quitar_acceso_personal', { p_correo: correo })
}

/**
 * "Atiende voluntarios" (seccion 49): escanea su entrada y salida, los
 * registra y les manda su credencial, sin ser administrador. Es de cada
 * persona, no una palomita para todos.
 */
export function guardarAtiendeVoluntarios(correo, activo) {
  return llamar('guardar_atiende_voluntarios', { p_correo: correo, p_activo: Boolean(activo) })
}

/** El admin pone o cambia su propio codigo de autorizacion. */
export function guardarMiCodigo(codigo) {
  return llamar('definir_mi_codigo_autorizacion', { p_codigo: codigo })
}
