import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Sube al principio de la pagina al cambiar de pantalla.
 *
 * Sin esto, el navegador conserva el scroll: quien toca "Hacer cita"
 * desde el pie de la portada aterriza en el pie del calendario, con el
 * contenido nuevo fuera de la vista y la sensacion de que no paso nada.
 *
 * Al volver con el boton de atras (POP) no se toca el scroll: ahi la
 * persona espera regresar a donde se quedo.
 */
export default function IrArriba() {
  const { pathname } = useLocation()
  const tipo = useNavigationType()

  useEffect(() => {
    if (tipo === 'POP') return

    window.scrollTo(0, 0)
  }, [pathname, tipo])

  return null
}
