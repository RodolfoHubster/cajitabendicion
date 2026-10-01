import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Los dias de entrega, para escoger un dia en Citas de hoy y en Reportes
 * sin un calendario: solo salen los lunes y jueves que de verdad hubo o
 * habra. Con un calendario habia que adivinar en cual dia hubo entrega.
 */

/** [{ fecha: 'AAAA-MM-DD', cerrado }], de la mas reciente para atras. */
export async function fechasDeEntrega() {
  const { data, error } = await supabase.rpc('fechas_de_entrega')

  if (error) {
    throw new Error(clasificarError(error))
  }

  return data ?? []
}

const diasEntre = (a, b) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5

/**
 * El dia que se abre al entrar: hoy si hay entrega; si no, el dia de
 * entrega mas cercano. Si quedan a la misma distancia, el que ya paso:
 * el martes se quiere ver como fue el lunes.
 */
export function fechaPorDefecto(fechas, hoy) {
  const lista = (fechas ?? []).filter(Boolean)
  if (lista.length === 0) return hoy
  if (lista.includes(hoy)) return hoy

  return [...lista].sort((a, b) => diasEntre(a, hoy) - diasEntre(b, hoy) || a.localeCompare(b))[0]
}

/** El dia de entrega de antes y el de despues, para las flechas. */
export function fechasVecinas(fechas, fecha) {
  const orden = [...new Set((fechas ?? []).filter(Boolean))].sort()
  const anterior = orden.filter((f) => f < fecha).at(-1) ?? null
  const siguiente = orden.find((f) => f > fecha) ?? null
  return { anterior, siguiente }
}

/**
 * Un periodo de Reportes ("este mes") va del 1 al 30, que casi nunca son
 * dias de entrega. Para la lista se muestra el primero y el ultimo dia de
 * entrega dentro del periodo; la cuenta sale igual, porque solo los dias
 * de entrega tienen renglones. Sin ninguno dentro, null.
 */
export function rangoEnFechas({ desde, hasta }, fechas) {
  const dentro = (fechas ?? []).filter((f) => f && f >= desde && f <= hasta).sort()
  if (dentro.length === 0) return { desde: null, hasta: null }
  return { desde: dentro[0], hasta: dentro.at(-1) }
}
