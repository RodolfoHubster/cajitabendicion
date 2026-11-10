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

/**
 * La letra base, en porcentaje de la del navegador: 100 es lo del telefono;
 * grande y muy grande, +12.5% y +25%. En porcentaje y no en pixeles: si la
 * persona ya agrando la letra en su telefono (24 px en vez de 16), "A+" la
 * agranda mas en vez de bajarla a 18 px.
 */
export const PORCENTAJE_LETRA = { normal: 100, grande: 112.5, muy_grande: 125 }

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
  raiz.style.fontSize = valido === 'normal' ? '' : `${PORCENTAJE_LETRA[valido]}%`
}
