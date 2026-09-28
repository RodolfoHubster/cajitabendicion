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
 * Las voces que trae el telefono para ese idioma ({ id, nombre }). El
 * telefono las carga poco a poco: al principio la lista puede venir vacia
 * (ver alCambiarVoces).
 */
export function vocesDelIdioma(idioma = 'es', ventana = globalThis.window) {
  if (!puedeHablar(ventana)) return []
  const corto = String(idioma).split('-')[0].toLowerCase()
  return ventana.speechSynthesis
    .getVoices()
    .filter((voz) => String(voz.lang).toLowerCase().startsWith(corto))
    .map((voz) => ({ id: voz.voiceURI, nombre: voz.name }))
}

/** Avisa cuando el telefono termina de cargar sus voces. Devuelve con que dejar de escuchar. */
export function alCambiarVoces(fn, ventana = globalThis.window) {
  if (!puedeHablar(ventana) || !ventana.speechSynthesis.addEventListener) return () => {}
  ventana.speechSynthesis.addEventListener('voiceschanged', fn)
  return () => ventana.speechSynthesis.removeEventListener('voiceschanged', fn)
}

/**
 * Dice el texto. Corta lo que se estuviera diciendo antes: si la persona
 * toca dos veces, no se enciman dos voces. `voz`: el id de una voz de
 * vocesDelIdioma(); si no esta, la del idioma que escoja el telefono.
 */
export function hablar(texto, idioma = 'es', ventana = globalThis.window, { voz = null } = {}) {
  if (!puedeHablar(ventana) || !texto) return false

  const corto = String(idioma).split('-')[0]
  const frase = new ventana.SpeechSynthesisUtterance(texto)
  frase.lang = VOZ_POR_IDIOMA[corto] ?? VOZ_POR_IDIOMA.es
  const escogida = voz && ventana.speechSynthesis.getVoices?.().find((v) => v.voiceURI === voz)
  if (escogida) frase.voice = escogida
  //  Un poco mas despacio que lo normal: se entiende mejor.
  frase.rate = 0.9

  ventana.speechSynthesis.cancel()
  ventana.speechSynthesis.speak(frase)
  return true
}

export function callar(ventana = globalThis.window) {
  if (puedeHablar(ventana)) ventana.speechSynthesis.cancel()
}

// ------------------------------------------------------------
//  Anunciar los turnos de la fila a pie
// ------------------------------------------------------------
//  Se guarda en ESTE telefono: es la voluntaria que llama los turnos la que
//  lo prende, no todo el equipo.
const LLAVE_ANUNCIAR = 'cajita-anunciar-turnos'
const LLAVE_VOZ = 'cajita-voz-turnos'

export function leerAnuncio(almacen = globalThis.localStorage) {
  try {
    return { activo: almacen.getItem(LLAVE_ANUNCIAR) === 'si', voz: almacen.getItem(LLAVE_VOZ) || null }
  } catch {
    return { activo: false, voz: null }
  }
}

export function guardarAnuncio({ activo, voz }, almacen = globalThis.localStorage) {
  try {
    almacen.setItem(LLAVE_ANUNCIAR, activo ? 'si' : 'no')
    if (voz) almacen.setItem(LLAVE_VOZ, voz)
    else almacen.removeItem(LLAVE_VOZ)
  } catch {
    // Sin almacenamiento: vale mientras la pagina este abierta.
  }
}

/**
 * Si hay que anunciar: cuando cambia el turno que va (no en cada vuelta de
 * la fila, que se pide cada pocos segundos, ni cuando ya no hay nadie).
 */
export function turnoParaAnunciar(anunciado, actual) {
  return Number.isInteger(actual) && actual !== anunciado ? actual : null
}
