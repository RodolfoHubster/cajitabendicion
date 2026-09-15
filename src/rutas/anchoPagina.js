import { useLocation } from 'react-router-dom'

/**
 * Ancho de la pagina segun la ruta.
 *
 * Lo publico va angosto: se lee desde el celular y, en una computadora, un
 * renglon larguisimo cansa. El panel va ancho: tablas, filtros y tarjetas
 * lado a lado. El login sigue angosto aunque viva bajo /admin.
 *
 * Las clases van escritas completas para que Tailwind las encuentre.
 */
export const ANCHO_PUBLICO = 'max-w-3xl'
export const ANCHO_PANEL = 'max-w-7xl'

/** '/admin/equipo' y '/escanear' son del panel; '/admin/login' y lo publico, no. */
export function esRutaPanel(ruta) {
  const limpia = String(ruta ?? '').replace(/\/+$/, '') || '/'
  if (limpia === '/admin/login') return false

  return ['/admin', '/escanear'].some((base) => limpia === base || limpia.startsWith(`${base}/`))
}

export function anchoPagina(ruta) {
  return esRutaPanel(ruta) ? ANCHO_PANEL : ANCHO_PUBLICO
}

/** El ancho de la ruta actual, para el encabezado, el contenido y el pie. */
export function useAnchoPagina() {
  return anchoPagina(useLocation().pathname)
}
