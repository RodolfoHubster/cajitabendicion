import { supabase } from '../lib/supabase'

/**
 * Datos del panel administrativo.
 *
 * Todas estas funciones exigen sesion: se otorgaron solo a
 * `authenticated`, nunca a `anon`. Si alguien llama sin haber entrado,
 * la base responde permiso denegado, no una lista vacia.
 */

async function llamar(funcion, fecha) {
  const { data, error } = await supabase.rpc(funcion, { p_fecha: fecha ?? null })

  if (error) {
    throw new Error(clasificar(error))
  }

  return data
}

/**
 * Convierte el error de Postgres en algo que diga que hacer.
 *
 * Un "revisa tu conexion" generico manda a buscar al lugar equivocado
 * cuando el problema es que falta correr una migracion. Cada causa
 * necesita una accion distinta, asi que se distinguen.
 */
function clasificar(error) {
  // La funcion no existe en la base: falta aplicar la migracion.
  if (error.code === 'PGRST202') return 'FUNCION_NO_INSTALADA'

  // Sin permiso. Estas funciones solo se otorgaron a authenticated.
  if (error.code === '42501' || error.code === 'PGRST301') return 'SIN_PERMISO'

  if (error.message?.toLowerCase().includes('failed to fetch')) return 'SIN_CONEXION'

  return 'ERROR_DESCONOCIDO'
}

/** Los cuatro numeros del encabezado. */
export async function resumenDelDia(fecha) {
  const filas = await llamar('resumen_del_dia', fecha)
  return filas?.[0] ?? null
}

/** Las citas del dia, ordenadas por horario. */
export function citasDelDia(fecha) {
  return llamar('citas_del_dia', fecha)
}

/** Los cupos por horario, incluidos los cerrados. */
export function bloquesDelDia(fecha) {
  return llamar('bloques_del_dia', fecha)
}

/** Hoy en San Diego, en formato AAAA-MM-DD. */
export function hoyLocal() {
  const ahora = new Date()
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)

  return partes
}
