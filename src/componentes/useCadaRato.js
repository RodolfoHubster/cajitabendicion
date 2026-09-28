import { useEffect, useRef } from 'react'
import { repetirCadaRato } from '../datos/cadaRato'

/**
 * Llama `fn` ahora y despues cada `ms` mientras el componente este en
 * pantalla y `activo` sea verdadero (ver datos/cadaRato.js). Con `clave`
 * distinta vuelve a empezar: sirve para preguntar de inmediato despues de
 * algo que cambio la respuesta (una entrega, un "no se presento").
 */
export default function useCadaRato(fn, ms, { activo = true, clave = null } = {}) {
  const ultima = useRef(fn)

  useEffect(() => {
    ultima.current = fn
  })

  useEffect(() => {
    if (!activo) return undefined
    return repetirCadaRato(() => ultima.current(), ms)
  }, [ms, activo, clave])
}
