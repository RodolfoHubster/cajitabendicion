/**
 * Tamano de la letra: normal, grande o muy grande.
 *
 * Mucha de la gente que usa esto es de la tercera edad. Todo en la pagina
 * se mide en rem (Tailwind), asi que cambiar la letra de <html> agranda
 * todo parejo: textos, botones, el QR. Nada se encima ni se corta.
 *
 * Se guarda solo en este navegador. Si no deja guardar, la pagina sigue
 * en normal. index.html lo aplica antes de pintar, igual que el modo
 * oscuro, para que no brinque al abrir.
 */

export const LLAVE_LETRA = 'cajita-letra'
export const TAMANOS_LETRA = ['normal', 'grande', 'muy_grande']

/** Pixeles de la letra base. 16 es lo del navegador; 18 y 20 son +12% y +25%. */
export const PIXELES_LETRA = { normal: 16, grande: 18, muy_grande: 20 }

export function leerLetra(almacen = globalThis.localStorage) {
  try {
    const valor = almacen?.getItem(LLAVE_LETRA)
    return TAMANOS_LETRA.includes(valor) ? valor : 'normal'
  } catch {
    return 'normal'
  }
}

export function guardarLetra(tamano, almacen = globalThis.localStorage) {
  if (!TAMANOS_LETRA.includes(tamano)) return false
  try {
    if (tamano === 'normal') almacen?.removeItem(LLAVE_LETRA)
    else almacen?.setItem(LLAVE_LETRA, tamano)
    return true
  } catch {
    return false
  }
}

/**
 * Lo pone en la pagina. En normal se quita el tamano puesto: asi manda el
 * del navegador, por si la persona ya lo agrando en su telefono.
 */
export function aplicarLetra(tamano, documento = globalThis.document) {
  const raiz = documento?.documentElement
  if (!raiz) return

  const valido = TAMANOS_LETRA.includes(tamano) ? tamano : 'normal'
  raiz.dataset.letra = valido
  raiz.style.fontSize = valido === 'normal' ? '' : `${PIXELES_LETRA[valido]}px`
}
