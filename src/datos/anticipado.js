import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Codigo de suscriptor de Facebook para entrar antes de la apertura.
 *
 * Se guarda por fecha en sessionStorage: sobrevive a pasar de horarios a
 * registro y a recargar, pero se olvida al cerrar el navegador. La base lo
 * vuelve a revisar al reservar, asi que guardarlo aqui no da ningun acceso
 * por si solo.
 */

const llave = (fecha) => `cb_codigo_anticipado_${fecha}`

export function normalizarCodigo(codigo) {
  return (codigo ?? '').trim().toUpperCase()
}

export function leerCodigoAnticipado(fecha) {
  try {
    return sessionStorage.getItem(llave(fecha))
  } catch {
    return null
  }
}

export function guardarCodigoAnticipado(fecha, codigo) {
  try {
    sessionStorage.setItem(llave(fecha), normalizarCodigo(codigo))
  } catch {
    // Sin almacenamiento del navegador: se tendra que escribir otra vez.
  }
}

/** Para un codigo que ya no sirve (se cambio o vencio). */
export function borrarCodigoAnticipado(fecha) {
  try {
    sessionStorage.removeItem(llave(fecha))
  } catch {
    // Nada que borrar si no hay almacenamiento.
  }
}

/** true si el codigo sirve AHORA para esa fecha. Nunca revela el codigo. */
export async function validarCodigoAnticipado(fecha, codigo) {
  const { data, error } = await supabase.rpc('validar_codigo_anticipado', {
    p_fecha: fecha,
    p_codigo: normalizarCodigo(codigo),
  })

  if (error) throw new Error(clasificarError(error))

  return data === true
}
