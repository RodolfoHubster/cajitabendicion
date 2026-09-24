/**
 * Avisos de sonido y vibracion del escaneo.
 *
 * En la fila de carros el voluntario no esta viendo la pantalla: esta
 * viendo el coche, la ventanilla y la caja. El bip le dice "ya lo lei" sin
 * que tenga que mirar, y el tono del resultado le dice si puede pasar o si
 * hay que detenerse a explicar algo.
 *
 * El tono se sintetiza; no hay archivo de audio que cargar ni que se quede
 * a medias con mala senal. Si el navegador no deja sonar, no se rompe nada:
 * todas estas funciones fallan calladas y la pantalla sigue avisando igual.
 */

let contexto = null

/**
 * Deja el sonido listo. Tiene que llamarse DENTRO de un toque de la
 * persona: ni el iPhone ni Chrome dejan que una pagina suene sola antes de
 * que alguien la haya tocado.
 */
export function prepararSonido(Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext) {
  if (contexto || typeof Constructor !== 'function') return contexto

  try {
    contexto = new Constructor()
    contexto.resume?.()
  } catch {
    contexto = null
  }

  return contexto
}

/** Solo para las pruebas: olvida el contexto preparado. */
export function olvidarSonido() {
  contexto = null
}

/** Un tono corto. Devuelve false si el navegador no deja sonar. */
export function tono({ hz = 880, segundos = 0.12, volumen = 0.15, retraso = 0 } = {}) {
  const ctx = prepararSonido()
  if (!ctx) return false

  try {
    const oscilador = ctx.createOscillator()
    const ganancia = ctx.createGain()
    const empieza = ctx.currentTime + retraso

    oscilador.type = 'sine'
    oscilador.frequency.value = hz

    //  Baja en curva en vez de cortarse en seco: un corte suena a chasquido.
    ganancia.gain.setValueAtTime(volumen, empieza)
    ganancia.gain.exponentialRampToValueAtTime(0.0001, empieza + segundos)

    oscilador.connect(ganancia)
    ganancia.connect(ctx.destination)
    oscilador.start(empieza)
    oscilador.stop(empieza + segundos)

    return true
  } catch {
    return false
  }
}

/** Vibra, donde se pueda: Android si, el iPhone no. */
export function vibrar(patron = 60, navegador = globalThis.navigator) {
  try {
    return Boolean(navegador?.vibrate?.(patron))
  } catch {
    return false
  }
}

/** "Ya lo lei": un bip corto, apenas se lee el codigo. */
export function avisoLeido() {
  vibrar(40)
  return tono({ hz: 880, segundos: 0.1 })
}

/** "Puede pasar": dos bips que suben. */
export function avisoValido() {
  vibrar([40, 60, 40])
  const uno = tono({ hz: 880, segundos: 0.1 })
  const dos = tono({ hz: 1320, segundos: 0.16, retraso: 0.11 })
  return uno && dos
}

/** "Detente": un tono grave y largo, distinto del de pasar. */
export function avisoDetente() {
  vibrar([120, 80, 120])
  return tono({ hz: 320, segundos: 0.45, volumen: 0.18 })
}

//  Que resultado del escaneo suena a que.
export const PUEDE_PASAR = ['VALIDO', 'VALIDO_AUTORIZADO', 'VALIDO_PASE']

/** El aviso que le toca a un resultado del escaneo. */
export function avisoDelResultado(resultado) {
  return PUEDE_PASAR.includes(resultado) ? avisoValido() : avisoDetente()
}
