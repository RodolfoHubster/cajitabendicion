import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LuArrowRight } from 'react-icons/lu'
import PresentacionCajita from '../../componentes/PresentacionCajita'
import { TechoSvg } from '../../componentes/Logo'
import { IDIOMAS } from '../../i18n/config'
import { ORGANIZACION } from '../../datos/organizacion'

const parametros = () => new URLSearchParams(globalThis.location?.search ?? '')

/** Si la pagina se ve dentro de otra (el video sobre la pagina de la iglesia). */
function estaInsertado() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * /video (27 de octubre de 2026): que es Cajita de Bendicion, como un video
 * corto, a pantalla completa y sin el encabezado ni el pie del sistema. Lo
 * abre public/cajita-video.js encima de la pagina de la iglesia
 * (casadealabanzasd.com), o se abre directo con su enlace.
 *
 * ?lng=es|en|vi: el idioma del telefono de quien lo abrio. ?insertado=1:
 * deja lugar arriba a la derecha para la X de cerrar. Dentro de la pagina
 * de la iglesia, "Haz tu cita" se abre en otra pestana (asi no se pierde la
 * pagina) y Esc le pide a la pagina que cierre el video.
 */
export default function Video() {
  const { t, i18n } = useTranslation()
  const insertado = estaInsertado()
  const dejarLugar = parametros().get('insertado') === '1'

  //  El idioma que mando la pagina de la iglesia, si es uno de los tres.
  useEffect(() => {
    const pedido = parametros().get('lng')
    if (IDIOMAS.some((idioma) => idioma.codigo === pedido) && i18n.resolvedLanguage !== pedido) i18n.changeLanguage(pedido)
  }, [i18n])

  useEffect(() => {
    if (!insertado) return undefined
    const tecla = (evento) => {
      if (evento.key === 'Escape') window.parent.postMessage({ cajita: 'cerrar' }, '*')
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [insertado])

  const encabezado = (
    <div className={`flex shrink-0 items-center justify-between gap-2 px-4 pt-3 ${dejarLugar ? 'pr-16' : ''}`}>
      {/* Solo el techo: el nombre ya va grande en la primera escena, y aqui
          no cabia junto a los tres idiomas. */}
      <span className="flex shrink-0 items-center">
        <TechoSvg className="h-7 w-auto text-accion" />
        <span className="sr-only">{ORGANIZACION.programa}</span>
      </span>
      {/* Los tres idiomas a la vista, cada uno escrito en el suyo. */}
      <div aria-label={t('video.idioma')} className="flex shrink-0 gap-1" role="group">
        {IDIOMAS.map(({ codigo, nombre }) => {
          const activo = i18n.resolvedLanguage === codigo
          return (
            <button
              aria-pressed={activo}
              className={`min-h-10 rounded-full px-2.5 text-chica font-semibold transition ${
                activo ? 'bg-white/90 text-marca' : 'text-white/85 ring-1 ring-white/25 hover:bg-white/10'
              }`}
              key={codigo}
              lang={codigo}
              onClick={() => i18n.changeLanguage(codigo)}
              type="button"
            >
              {nombre}
            </button>
          )
        })}
      </div>
    </div>
  )

  const accion = (
    <a
      className="group flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-lg font-bold text-sobre-accion shadow-lg shadow-black/25 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
      href={`${window.location.origin}/`}
      rel={insertado ? 'noopener' : undefined}
      target={insertado ? '_blank' : undefined}
    >
      {t('video.hazTuCita')}
      <LuArrowRight aria-hidden="true" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
    </a>
  )

  return (
    <div className="h-dvh bg-marca">
      <PresentacionCajita accion={accion} encabezado={encabezado} />
    </div>
  )
}
