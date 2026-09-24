/**
 * Modo claro u oscuro.
 *
 * La primera vez se sigue al telefono: quien ya tiene su celular en
 * oscuro no se encuentra la pagina brillando de noche. En cuanto alguien
 * toca el boton del pie, se respeta lo que escogio.
 *
 * Lo escogido se guarda solo en este navegador. Si el navegador no deja
 * guardar (ventana privada, datos bloqueados), la pagina funciona igual y
 * nada mas se olvida al cerrar.
 *
 * El mismo calculo esta repetido en index.html, que pone el modo ANTES de
 * que cargue React; si no, la pagina parpadea en blanco al abrir.
 */

export const LLAVE_TEMA = 'cajita-tema'
export const TEMAS = ['claro', 'oscuro']

/** El color de la barra del navegador: el azul del encabezado en cada modo. */
export const COLOR_BARRA = { claro: '#1B3A6B', oscuro: '#1F4380' }

/** Lo que se ve: lo escogido si es valido, y si no, lo del telefono. */
export function temaEfectivo(guardado, sistemaOscuro) {
  if (TEMAS.includes(guardado)) return guardado
  return sistemaOscuro ? 'oscuro' : 'claro'
}

export function temaContrario(tema) {
  return tema === 'oscuro' ? 'claro' : 'oscuro'
}

export function leerTemaGuardado(almacen = globalThis.localStorage) {
  try {
    const valor = almacen?.getItem(LLAVE_TEMA)
    return TEMAS.includes(valor) ? valor : null
  } catch {
    return null
  }
}

export function guardarTema(tema, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(LLAVE_TEMA, tema)
    return true
  } catch {
    return false
  }
}

export function sistemaEnOscuro(ventana = globalThis.window) {
  try {
    return Boolean(ventana?.matchMedia?.('(prefers-color-scheme: dark)').matches)
  } catch {
    return false
  }
}

/**
 * Lo pone en la pagina. Con `suave`, un fundido de colores de un tercio de
 * segundo; sin el, de golpe (al abrir no se quiere animacion).
 */
export function aplicarTema(tema, { suave = false, documento = globalThis.document } = {}) {
  const raiz = documento?.documentElement
  if (!raiz) return

  if (suave) {
    raiz.classList.add('cambiando-tema')
    setTimeout(() => raiz.classList.remove('cambiando-tema'), 350)
  }

  raiz.dataset.tema = tema

  // La barra del navegador del telefono, del mismo azul que el encabezado.
  const barra = documento.querySelector?.('meta[name="theme-color"]')
  if (barra) barra.content = COLOR_BARRA[tema]
}
