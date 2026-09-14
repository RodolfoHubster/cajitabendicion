import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Datos del panel administrativo.
 *
 * Todas estas funciones exigen sesion y rol de admin: la base de datos lo
 * revisa. Si alguien sin permiso llama, responde permiso denegado, no una
 * lista vacia.
 */

async function llamar(funcion, fecha) {
  const { data, error } = await supabase.rpc(funcion, { p_fecha: fecha ?? null })

  if (error) {
    throw new Error(clasificarError(error))
  }

  return data
}

/** Los numeros del encabezado del panel. */
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

// Errores de negocio que la base lanza como texto (BLOQUE_LLENO, etc.).
const CODIGOS_REGISTRO = [
  'BLOQUE_LLENO',
  'BLOQUE_CERRADO',
  'BLOQUE_NO_EXISTE',
  'FECHA_PASADA',
  'YA_TIENE_CITA_ESTA_SEMANA',
  'NOMBRE_REQUERIDO',
  'APELLIDOS_REQUERIDOS',
  'NOMBRE_INVALIDO',
  'TELEFONO_REQUERIDO',
  'TELEFONO_INVALIDO',
  'EMAIL_INVALIDO',
  'SIN_CODIGOS_DISPONIBLES',
  'DIA_CERRADO',
]

/**
 * Registra a una persona desde el panel (solo admin). Sin limite por
 * dispositivo y con correo opcional. telefono llega en formato
 * internacional (+526641234567).
 */
export async function registrarDesdePanel({ nombres, apellidos, telefono, email, ciudad, bloqueId }) {
  const { data, error } = await supabase.rpc('registrar_desde_panel', {
    p_nombre: nombres,
    p_apellidos: apellidos,
    p_telefono: telefono,
    p_bloque_id: bloqueId,
    p_email: email || null,
    p_ciudad: ciudad || null,
  })

  if (error) {
    const deNegocio = CODIGOS_REGISTRO.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return (Array.isArray(data) ? data[0] : data) ?? null
}

/** Hoy en San Diego, en formato AAAA-MM-DD. */
export function hoyLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
