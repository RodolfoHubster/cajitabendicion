/**
 * "Escuchar mi cita": el telefono lee en voz alta el dia, la hora y el
 * codigo.
 *
 * Para quien ve poco o lee con trabajo. Usa la voz que ya trae el telefono
 * (Web Speech API): no se manda nada a ningun servidor. Si el telefono no
 * tiene voz, el boton simplemente no aparece.
 */

//  Una voz de Mexico y Estados Unidos, que es como habla esta comunidad.
export const VOZ_POR_IDIOMA = { es: 'es-MX', en: 'en-US', vi: 'vi-VN' }

export function puedeHablar(ventana = globalThis.window) {
  return Boolean(ventana?.speechSynthesis && typeof ventana.SpeechSynthesisUtterance === 'function')
}

/**
 * "CB-4871" -> "C. B. 4. 8. 7. 1." Letra por letra y con pausas: leido de
 * corrido, "CB-4871" suena a "ce be cuatro mil ochocientos setenta y uno",
 * que no es como lo va a buscar el voluntario.
 */
export function deletrear(codigo) {
  return String(codigo ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .join('. ')
    .concat(codigo ? '.' : '')
}

/**
 * Dice el texto. Corta lo que se estuviera diciendo antes: si la persona
 * toca dos veces, no se enciman dos voces.
 */
export function hablar(texto, idioma = 'es', ventana = globalThis.window) {
  if (!puedeHablar(ventana) || !texto) return false

  const corto = String(idioma).split('-')[0]
  const frase = new ventana.SpeechSynthesisUtterance(texto)
  frase.lang = VOZ_POR_IDIOMA[corto] ?? VOZ_POR_IDIOMA.es
  //  Un poco mas despacio que lo normal: se entiende mejor.
  frase.rate = 0.9

  ventana.speechSynthesis.cancel()
  ventana.speechSynthesis.speak(frase)
  return true
}

export function callar(ventana = globalThis.window) {
  if (puedeHablar(ventana)) ventana.speechSynthesis.cancel()
}
