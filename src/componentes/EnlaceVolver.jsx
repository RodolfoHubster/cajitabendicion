import { Link } from 'react-router-dom'

/**
 * Enlace para regresar un paso en el flujo publico.
 *
 * Un adulto mayor que eligio la fecha equivocada no tiene por que saber
 * que existe el boton "atras" del navegador.
 */
export default function EnlaceVolver({ a, children }) {
  return (
    <Link
      className="mb-2 inline-flex min-h-14 items-center gap-2 text-base font-semibold text-principal underline-offset-4 hover:underline"
      to={a}
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  )
}
