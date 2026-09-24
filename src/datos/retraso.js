/**
 * Un retraso a proposito, SOLO con la base de pruebas.
 *
 * La base contesta tan rapido que los esqueletos de carga casi no se ven.
 * Para revisarlos, en .env.pruebas:  VITE_RETRASO_MS=1000
 *
 * Nunca en la app real: mucha gente entra con datos moviles lentos, y un
 * segundo de mas en cada pantalla son varios segundos para sacar una cita.
 * Por eso exige VITE_ENTORNO=pruebas, que Cloudflare no tiene.
 */

export const RETRASO_MAXIMO_MS = 5000

/** Los milisegundos de retraso, o 0 si no aplica. */
export function retrasoDePrueba(env) {
  if (env?.VITE_ENTORNO !== 'pruebas') return 0

  const ms = Number(env.VITE_RETRASO_MS)
  if (!Number.isFinite(ms) || ms <= 0) return 0

  return Math.min(Math.round(ms), RETRASO_MAXIMO_MS)
}

/** Un fetch que espera `ms` antes de salir. */
export function conRetraso(ms, fetchBase = (...args) => globalThis.fetch(...args)) {
  return (...args) => new Promise((listo) => setTimeout(listo, ms)).then(() => fetchBase(...args))
}
