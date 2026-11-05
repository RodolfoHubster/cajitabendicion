import { LuArrowLeft } from 'react-icons/lu'
import { Link } from 'react-router-dom'

/**
 * Boton para regresar un paso en el flujo publico.
 *
 * Un adulto mayor que eligio la fecha equivocada no tiene por que saber
 * que existe el boton "atras" del navegador (en el iPhone ni se ve). Con
 * borde y flecha, para que se reconozca como boton: como texto suelto no
 * lo encontraban (29 de octubre de 2026).
 */
export default function EnlaceVolver({ a, children }) {
  return (
    <Link
      className="mb-3 inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-4 text-base font-semibold text-principal shadow-sm transition hover:border-principal"
      to={a}
    >
      <LuArrowLeft aria-hidden="true" className="h-5 w-5 shrink-0" />
      {children}
    </Link>
  )
}
