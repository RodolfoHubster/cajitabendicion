import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Las dos filas de la entrega: carro y a pie.
 *
 * Cada horario es de una fila, y una cita es de la fila de su horario.
 * Cada quien del equipo escanea en la suya ('ambas' si en las dos). Las
 * cuentas del dia se ven por fila o juntas, y juntas es siempre la suma:
 * es el numero que se le reporta al banco de alimentos.
 *
 * La regla de verdad esta en la base (seccion 32 de schema.sql): un codigo
 * a pie en la fila de carros responde OTRA_FILA y no se quema.
 */

export const FILAS = ['carro', 'a_pie']

/** Las opciones del selector de las cuentas, en el orden de la pantalla. */
export const VISTAS = ['juntas', 'carro', 'a_pie']

/** En que fila puede escanear alguien del equipo. */
export const FILAS_PERSONAL = ['ambas', 'carro', 'a_pie']

/**
 * Lo que se le pide a la base: la fila, o null para "juntas".
 *
 * Con "juntas" NO se manda el parametro. Asi, si el codigo se publica
 * antes de aplicar la migracion, la vista de siempre sigue funcionando.
 */
export function filaParaConsulta(vista) {
  return FILAS.includes(vista) ? vista : null
}

/** Agrega p_fila a los parametros solo cuando hay una fila escogida. */
export function conFila(parametros, vista) {
  const fila = filaParaConsulta(vista)
  return fila ? { ...parametros, p_fila: fila } : parametros
}

/**
 * La fila de una cita, un horario o una entrada. Lo que llega sin fila
 * (una base todavia sin la migracion) es de carro: era la unica.
 */
export function filaDe(algo) {
  return FILAS.includes(algo?.fila) ? algo.fila : 'carro'
}

/** Solo los de esa fila; con "juntas", todos. */
export function filtrarPorFila(lista, vista) {
  const fila = filaParaConsulta(vista)
  const todos = lista ?? []

  return fila ? todos.filter((algo) => filaDe(algo) === fila) : todos
}

/**
 * Si quien escanea en `miFila` debe mandar a la otra fila a quien trae
 * un codigo de `filaDelCodigo`. El administrador ('ambas') nunca.
 */
export function esDeOtraFila(miFila, filaDelCodigo) {
  if (!FILAS.includes(miFila)) return false
  return FILAS.includes(filaDelCodigo) && filaDelCodigo !== miFila
}

/**
 * La fila de quien tiene la sesion. Si la base todavia no tiene la
 * migracion, 'ambas': que es exactamente como funcionaba antes.
 */
export async function miFila() {
  const { data, error } = await supabase.rpc('mi_fila')

  if (error) return 'ambas'

  return FILAS_PERSONAL.includes(data) ? data : 'ambas'
}

export const CODIGOS_FILAS = ['FILA_INVALIDA', 'PERSONAL_NO_EXISTE']

/** En que fila escanea alguien del equipo. Solo admin. */
export async function guardarFila(correo, fila) {
  const { data, error } = await supabase.rpc('guardar_fila_personal', {
    p_correo: String(correo ?? '').trim(),
    p_fila: fila,
  })

  if (error) {
    const deNegocio = CODIGOS_FILAS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}
