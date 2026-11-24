import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleHelp } from 'react-icons/lu'
import { Link, useLocation } from 'react-router-dom'
import AyudaPantalla from './AyudaPantalla'
import SelectorIdioma from './SelectorIdioma'
import { pantallaDeRuta } from '../datos/ayudaPantalla'
import { EVENTO_ABRIR_GUIA } from '../datos/guia'
import { ORGANIZACION } from '../datos/organizacion'
import { useAnchoPagina } from '../rutas/anchoPagina'
import { LogoIglesia } from './Logo'

//  flex-1 desde 0 y sin min-w-0: la marca se aprieta hasta su palabra mas
//  larga ("Cajita de / Bendicion" en dos renglones) y solo si ni asi cabe
//  junto a los botones (zoom del telefono), los botones bajan de renglon.
const CLASE_MARCA =
  'flex min-h-14 flex-1 basis-0 items-center gap-2 rounded-xl sm:gap-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60'
//  El icono y, debajo, la palabra "Ayuda": un "?" solo no todos lo
//  entienden. Apilados caben aun junto al nombre del programa en un
//  telefono de 320 px.
const CLASE_AYUDA =
  'flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-xl border border-white/30 bg-white/5 px-2 py-1 text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60 sm:min-h-14 sm:min-w-14'

/**
 * Arriba de todo: la marca, la ayuda y el idioma.
 *
 * Dentro del panel (y el escaner) el encabezado no saca de el: el logo no es
 * enlace y "Ayuda" abre la guia de la pantalla en la que se esta. El 15 de
 * octubre de 2026 un toque al logo a media fila llevaba a la portada del
 * publico.
 *
 * En lo publico, "Ayuda" abre "¿Que hago aqui?" (17 de noviembre de 2026):
 * los pasos de esa pantalla, sin salir de ella. Antes llevaba a las
 * preguntas y quien iba a medio registro perdia el hilo.
 */
export default function Encabezado() {
  const { t } = useTranslation()
  const ancho = useAnchoPagina()
  const { pathname } = useLocation()
  const enPanel = (pathname.startsWith('/admin') && pathname !== '/admin/login') || pathname === '/escanear'
  //  La pantalla de la que se pidio ayuda, mientras la ventana esta abierta.
  const [ayudaDe, setAyudaDe] = useState(null)

  const marca = (
    <>
      {/* max-w-none: con el max-width: 100% de siempre, al medir cuanto
          necesita la marca el navegador contaba el logo como si midiera 0, y
          el nombre se encimaba con "Ayuda" en vez de bajar los botones. */}
      <LogoIglesia className="h-10 w-auto max-w-none shrink-0 sm:h-11" />
      <span aria-hidden="true" className="hidden h-10 w-px shrink-0 bg-white/25 sm:block" />
      {/* Sin min-w-0: la marca no se encoge por debajo de "Bendicion" entera.
          Con min-w-0, con la letra al 150% salia "Bendi-cion" en vez de bajar
          los botones de renglon (17 de noviembre de 2026). */}
      <span className="flex flex-col leading-tight">
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
        className={`mx-auto flex w-full ${ancho} flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3`}
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
          {/* Las dudas se resuelven donde surgen: va aqui y no dentro de la
              portada para que acompane en todas las pantallas. */}
          {/* Sin aria-label: su nombre es lo que se lee en el boton ("Ayuda"),
              y asi tambien lo encuentra quien le habla al telefono. */}
          <button
            aria-haspopup="dialog"
            className={CLASE_AYUDA}
            onClick={() =>
              enPanel ? globalThis.dispatchEvent?.(new Event(EVENTO_ABRIR_GUIA)) : setAyudaDe(pantallaDeRuta(pathname))
            }
            title={enPanel ? t('guia.abrir') : t('ayudaPantalla.titulo')}
            type="button"
          >
            <LuCircleHelp aria-hidden="true" className="h-5 w-5" />
            <span className="text-chica font-semibold leading-none">{t('ayudaPantalla.boton')}</span>
          </button>

          <SelectorIdioma />
        </div>
      </div>

      {ayudaDe && <AyudaPantalla alCerrar={() => setAyudaDe(null)} pantalla={ayudaDe} />}
    </header>
  )
}
