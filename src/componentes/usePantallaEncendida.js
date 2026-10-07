import { useEffect } from 'react'

/**
 * Que la pantalla no se apague sola mientras la persona espera su turno: si
 * se apaga, deja de ver la fila y no oye cuando le toca. Funciona en Android
 * y en iPhone (Safari 16.4 en adelante); donde no se puede, no pasa nada.
 * Al regresar a la pagina se vuelve a pedir: el telefono lo suelta al salir.
 */
export default function usePantallaEncendida(activo) {
  useEffect(() => {
    const candado = globalThis.navigator?.wakeLock
    if (!activo || !candado) return undefined

    let vivo = true
    let actual = null

    const pedir = async () => {
      try {
        actual = await candado.request('screen')
      } catch {
        actual = null
      }
    }
    const alVolver = () => {
      if (vivo && document.visibilityState === 'visible') pedir()
    }

    pedir()
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alVolver)
      actual?.release?.().catch(() => {})
    }
  }, [activo])
}
