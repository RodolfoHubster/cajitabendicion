import { useTranslation } from 'react-i18next'
import { LuCircleHelp } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import SelectorIdioma from './SelectorIdioma'
import { ORGANIZACION } from '../datos/organizacion'
import { useAnchoPagina } from '../rutas/anchoPagina'
import { LogoIglesia } from './Logo'

export default function Encabezado() {
  const { t } = useTranslation()
  const ancho = useAnchoPagina()

  return (
    // Fijo solo en pantallas anchas. En el celular, quedarse pegado le
    // robaria pantalla a la persona mientras llena el formulario.
    <header className="z-20 bg-principal text-white shadow-md sm:sticky sm:top-0">
      <div aria-hidden="true" className="h-1 bg-accion" />

      <div
        className={`mx-auto flex w-full ${ancho} items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3`}
      >
        {/* El combo de marca: el logo de la iglesia y, junto, su ministerio. */}
        <Link
          className="flex min-h-14 min-w-0 items-center gap-2 rounded-xl sm:gap-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60"
          to="/"
        >
          <LogoIglesia className="h-10 w-auto shrink-0 sm:h-11" />
          <span aria-hidden="true" className="hidden h-10 w-px shrink-0 bg-white/25 sm:block" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-titulo text-base font-bold sm:text-lg">{ORGANIZACION.programa}</span>
            <span className="hidden truncate text-[15px] text-accion sm:block">{ORGANIZACION.iglesia}</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {/* Las dudas se resuelven antes de empezar, no a media fila. Va
              aqui y no dentro de la portada para que acompane en todas
              las pantallas. */}
          <Link
            aria-label={t('preguntas.titulo')}
            className="flex min-h-12 w-12 items-center justify-center rounded-xl border border-white/30 bg-white/5 text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60 sm:min-h-14 sm:w-14"
            title={t('preguntas.titulo')}
            to="/preguntas"
          >
            <LuCircleHelp aria-hidden="true" className="h-6 w-6" />
          </Link>

          <SelectorIdioma />
        </div>
      </div>
    </header>
  )
}
