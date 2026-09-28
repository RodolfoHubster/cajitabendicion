/**
 * Llama `fn` ahora y despues cada `ms`, sin encimarse: la siguiente vuelta
 * se programa hasta que termina la anterior. Con mala senal una respuesta
 * puede tardar mas que el intervalo, y encimadas se pisarian.
 *
 * Con la pantalla apagada o en otra pestana no pregunta (no gasta datos ni
 * bateria); al volver pregunta de inmediato. Devuelve la funcion que lo
 * detiene. Un error de `fn` no detiene nada: se intenta en la siguiente.
 */
export function repetirCadaRato(fn, ms, { documento = globalThis.document } = {}) {
  let reloj = null
  let vivo = true
  let enCurso = false

  const oculto = () => documento?.visibilityState === 'hidden'

  async function vuelta() {
    clearTimeout(reloj)
    if (!vivo || enCurso) return
    enCurso = true
    try {
      if (!oculto()) await fn()
    } catch {
      // Se vuelve a intentar en la siguiente vuelta.
    } finally {
      enCurso = false
    }
    if (vivo) reloj = setTimeout(vuelta, ms)
  }

  const alVolver = () => {
    if (!oculto()) vuelta()
  }

  documento?.addEventListener?.('visibilitychange', alVolver)
  vuelta()

  return () => {
    vivo = false
    clearTimeout(reloj)
    documento?.removeEventListener?.('visibilitychange', alVolver)
  }
}
