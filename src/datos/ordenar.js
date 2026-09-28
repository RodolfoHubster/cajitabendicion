/**
 * Ordenar arrastrando (Textos y reglas): las cuentas, sin pantalla.
 *
 * Se arrastra con el dedo o con el mouse desde la agarradera. Mientras se
 * mueve, los demas se hacen a un lado; al soltar se guarda el orden nuevo.
 */

/**
 * A que lugar cae lo que se arrastra: tantos lugares como renglones queden
 * arriba de su centro. `centros`: el centro de cada renglon antes de mover.
 */
export function indiceDestino(centros, desde, centro) {
  let destino = 0
  centros.forEach((otro, i) => {
    if (i !== desde && otro < centro) destino += 1
  })
  return destino
}

/** La lista con el de `desde` puesto en `hasta`. No cambia la original. */
export function moverEnLista(lista, desde, hasta) {
  const nueva = [...lista]
  if (desde === hasta || desde < 0 || desde >= nueva.length) return nueva
  const [movido] = nueva.splice(desde, 1)
  nueva.splice(Math.max(0, Math.min(hasta, nueva.length)), 0, movido)
  return nueva
}

/**
 * Cuantos pasos y hacia donde, para guardarlo con mover_aviso() (que sube o
 * baja uno a la vez).
 */
export function pasosParaMover(desde, hasta) {
  return { hacia: hasta < desde ? 'arriba' : 'abajo', veces: Math.abs(hasta - desde) }
}

/**
 * Cuanto se corre cada renglon mientras se arrastra: el arrastrado sigue al
 * dedo y los que quedan entre donde estaba y donde va se hacen a un lado.
 */
export function desplazamiento(indice, arrastre) {
  if (!arrastre) return 0
  const { desde, sobre, dy, alto } = arrastre
  if (indice === desde) return dy
  if (desde < sobre && indice > desde && indice <= sobre) return -alto
  if (desde > sobre && indice >= sobre && indice < desde) return alto
  return 0
}
