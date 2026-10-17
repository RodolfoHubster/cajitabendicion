import { useTranslation } from 'react-i18next'
import { LuCircleHelp } from 'react-icons/lu'
import { Link, useLocation } from 'react-router-dom'
import SelectorIdioma from './SelectorIdioma'
import { EVENTO_ABRIR_GUIA } from '../datos/guia'
import { ORGANIZACION } from '../datos/organizacion'
import { useAnchoPagina } from '../rutas/anchoPagina'
import { LogoIglesia } from './Logo'

const CLASE_MARCA =
  'flex min-h-14 min-w-0 items-center gap-2 rounded-xl sm:gap-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60'
const CLASE_AYUDA =
  'flex min-h-12 w-12 items-center justify-center rounded-xl border border-white/30 bg-white/5 text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60 sm:min-h-14 sm:w-14'

/**
 * Arriba de todo: la marca, la ayuda y el idioma.
 *
 * Dentro del panel (y el escaner) el encabezado no saca de el: el logo no es
 * enlace y "?" abre la guia del panel. El 15 de octubre de 2026 un toque al
 * logo a media fila llevaba a la portada del publico.
 */
export default function Encabezado() {
  const { t } = useTranslation()
  const ancho = useAnchoPagina()
  const { pathname } = useLocation()
  const enPanel = (pathname.startsWith('/admin') && pathname !== '/admin/login') || pathname === '/escanear'

  const marca = (
    <>
      <LogoIglesia className="h-10 w-auto shrink-0 sm:h-11" />
      <span aria-hidden="true" className="hidden h-10 w-px shrink-0 bg-white/25 sm:block" />
      <span className="flex min-w-0 flex-col leading-tight">
        {/* Se parte en dos renglones antes que cortarse: con letra grande,
            "Cajita de Ben..." no se entiende. */}
        <span className="font-titulo text-base font-bold leading-tight sm:text-lg">{ORGANIZACION.programa}</span>
        <span className="hidden truncate text-chica text-accion sm:block">{ORGANIZACION.iglesia}</span>
      </span>
    </>
  )

  return (
    // Fijo solo en pantallas anchas. En el celular, quedarse pegado le
    // robaria pantalla a la persona mientras llena el formulario.
    // Con la franja de la base de pruebas, se pega justo debajo de ella
    // (AvisoPruebas pone su alto en --alto-aviso-pruebas; si no hay, 0).
    <header className="z-20 bg-marca text-white shadow-md sm:sticky sm:top-[var(--alto-aviso-pruebas,0px)]">
      <div aria-hidden="true" className="h-1 bg-accion" />

      <div
        className={`mx-auto flex w-full ${ancho} items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3`}
      >
        {/* El combo de marca: el logo de la iglesia y, junto, su ministerio.
            En el panel no es enlace: no saca de el. */}
        {enPanel ? (
          <div className={CLASE_MARCA}>{marca}</div>
        ) : (
          <Link className={CLASE_MARCA} to="/">
            {marca}
          </Link>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {/* Las dudas se resuelven antes de empezar, no a media fila. Va
              aqui y no dentro de la portada para que acompane en todas
              las pantallas. */}
          {enPanel ? (
            <button
              aria-label={t('guia.abrir')}
              className={CLASE_AYUDA}
              onClick={() => globalThis.dispatchEvent?.(new Event(EVENTO_ABRIR_GUIA))}
              title={t('guia.abrir')}
              type="button"
            >
              <LuCircleHelp aria-hidden="true" className="h-6 w-6" />
            </button>
          ) : (
            <Link aria-label={t('preguntas.titulo')} className={CLASE_AYUDA} title={t('preguntas.titulo')} to="/preguntas">
              <LuCircleHelp aria-hidden="true" className="h-6 w-6" />
            </Link>
          )}

          <SelectorIdioma />
        </div>
      </div>
    </header>
  )
}
