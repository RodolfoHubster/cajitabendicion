import { useEffect, useState } from 'react'
import { buscarCodigoPostal, normalizarCodigoPostal, validarCodigoPostal } from '../datos/domicilio'

/**
 * Busca el codigo postal en el catalogo en cuanto tiene 5 digitos.
 * Devuelve { estado: 'vacio' | 'buscando' | 'listo' | 'fallo', filas }.
 *
 * El resultado guarda de que codigo es: si la persona sigue escribiendo, lo
 * de antes no se muestra como si fuera del codigo nuevo.
 */
export default function useCodigoPostal(pais, texto) {
  const codigo = normalizarCodigoPostal(texto)
  const clave = validarCodigoPostal(codigo) ? null : `${pais}-${codigo}`
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    if (!clave) return

    let vigente = true

    buscarCodigoPostal(pais, codigo)
      .then((filas) => {
        if (vigente) setResultado({ clave, filas })
      })
      .catch(() => {
        if (vigente) setResultado({ clave, fallo: true })
      })

    return () => {
      vigente = false
    }
  }, [clave, pais, codigo])

  if (!clave) return { estado: 'vacio', filas: [] }
  if (resultado?.clave !== clave) return { estado: 'buscando', filas: [] }
  if (resultado.fallo) return { estado: 'fallo', filas: [] }

  return { estado: 'listo', filas: resultado.filas }
}
