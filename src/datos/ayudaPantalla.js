/**
 * La "Ayuda" del encabezado en lo publico (17 de noviembre de 2026): un mini
 * tutorial de la pantalla en la que esta la persona, sin sacarla de ella.
 * Antes el "?" llevaba a las preguntas frecuentes y quien iba a medio
 * registro perdia el hilo.
 *
 * Cuantos pasos tiene cada pantalla. Los textos: ayudaPantalla.pasos.<pantalla>.<n>
 * en cada idioma.
 */
export const PANTALLAS = {
  inicio: 3,
  calendario: 3,
  horarios: 3,
  registro: 3,
  confirmacion: 3,
  cambiar: 2,
  turno: 3,
  fila: 2,
  pase: 2,
  general: 2,
}

const RUTAS = [
  [/^\/$/, 'inicio'],
  [/^\/calendario\/?$/, 'calendario'],
  [/^\/horarios\/[^/]+\/?$/, 'horarios'],
  [/^\/registro\/?$/, 'registro'],
  [/^\/confirmacion\/[^/]+\/?$/, 'confirmacion'],
  [/^\/cambiar\/[^/]+\/?$/, 'cambiar'],
  [/^\/(turno|a-pie)\/?$/, 'turno'],
  [/^\/fila\/?$/, 'fila'],
  [/^\/pase\/[^/]+\/?$/, 'pase'],
]

/** La pantalla de una ruta ('/horarios/2026-11-19' -> 'horarios'). Si no tiene la suya, 'general'. */
export function pantallaDeRuta(ruta) {
  const limpia = String(ruta ?? '').split(/[?#]/)[0]
  return RUTAS.find(([patron]) => patron.test(limpia))?.[1] ?? 'general'
}

/** Las claves de los pasos de una pantalla, en orden. */
export function pasosDePantalla(pantalla) {
  const clave = PANTALLAS[pantalla] ? pantalla : 'general'
  return Array.from({ length: PANTALLAS[clave] }, (_, i) => `ayudaPantalla.pasos.${clave}.${i + 1}`)
}
