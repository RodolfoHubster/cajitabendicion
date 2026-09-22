import { Link } from 'react-router-dom'
import SelectorIdioma from './SelectorIdioma'
import { ORGANIZACION } from '../datos/organizacion'
import { useAnchoPagina } from '../rutas/anchoPagina'
import { LogoIglesia } from './Logo'

export default function Encabezado() {
  const ancho = useAnchoPagina()

  return (
    // Fijo solo en pantallas anchas. En el celular, quedarse pegado le
    // robaria pantalla a la persona mientras llena el formulario.
    <header className="z-20 bg-principal text-white shadow-md sm:sticky sm:top-0">
      <div aria-hidden="true" className="h-1 bg-accion" />

      <div
        className={`mx-auto flex w-full ${ancho} items-center justify-between gap-3 px-4 py-2 sm:py-3`}
      >
        {/* El combo de marca: el logo de la iglesia y, junto, su ministerio. */}
        <Link
          className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60"
          to="/"
        >
          <LogoIglesia className="h-11 w-auto shrink-0" />
          <span aria-hidden="true" className="h-10 w-px shrink-0 bg-white/25" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-titulo text-lg font-bold">{ORGANIZACION.programa}</span>
            <span className="truncate text-[15px] text-accion">{ORGANIZACION.iglesia}</span>
          </span>
        </Link>

        <SelectorIdioma />
      </div>
    </header>
  )
}
