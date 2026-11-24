import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { LuCircleHelp, LuMessageCircleQuestion, LuPhone, LuX } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import { pasosDePantalla } from '../datos/ayudaPantalla'
import { ORGANIZACION } from '../datos/organizacion'

const ENFOCABLES = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
//  El telefono no se parte en dos renglones ("734-" y "5886"): espacio y
//  guion que no cortan.
const TELEFONO = ORGANIZACION.telefono.replace(/ /g, '\u00a0').replace(/-/g, '\u2011')
const CIRCULO = 'flex h-[min(2.75rem,13.75vw)] w-[min(2.75rem,13.75vw)] shrink-0 items-center justify-center rounded-full'
const OPCION =
  'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-4 py-2 text-center text-base font-bold text-principal transition hover:border-principal focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/50'

/**
 * "¿Que hago aqui?": lo que abre la Ayuda del encabezado en lo publico. Dos o
 * tres pasos cortos de la pantalla en la que esta la persona, con numeros
 * grandes, y si aun tiene dudas: llamar a la iglesia o ver todas las
 * preguntas. Sube desde abajo, como las otras ventanas, y no saca de la
 * pantalla: quien iba a medio registro sigue donde estaba.
 *
 * pantalla: la de datos/ayudaPantalla.js (pantallaDeRuta).
 *
 * Va fuera del encabezado (portal): asi nada de la pagina le queda encima.
 */
export default function AyudaPantalla({ pantalla, alCerrar }) {
  const { t } = useTranslation()
  const caja = useRef(null)
  const pasos = pasosDePantalla(pantalla)

  //  Al abrir: el foco adentro y la pagina de atras quieta.
  useEffect(() => {
    caja.current?.focus()
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  //  Esc cierra; el tabulador no se sale hacia la pagina de atras.
  useEffect(() => {
    function teclas(evento) {
      if (evento.key === 'Escape') {
        alCerrar()
      } else if (evento.key === 'Tab' && caja.current) {
        const enfocables = [...caja.current.querySelectorAll(ENFOCABLES)]
        if (enfocables.length === 0) return
        const primero = enfocables[0]
        const final = enfocables[enfocables.length - 1]
        if (evento.shiftKey && (document.activeElement === primero || document.activeElement === caja.current)) {
          evento.preventDefault()
          final.focus()
        } else if (!evento.shiftKey && document.activeElement === final) {
          evento.preventDefault()
          primero.focus()
        }
      }
    }

    document.addEventListener('keydown', teclas)
    return () => document.removeEventListener('keydown', teclas)
  }, [alCerrar])

  return createPortal(
    <div
      aria-labelledby="ayuda-pantalla-titulo"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-principal/50 sm:items-center sm:p-4"
      // Un toque en lo oscuro de atras tambien cierra.
      onPointerDown={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
      role="dialog"
    >
      <div
        className="ventana-sube flex max-h-[100dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-superficie text-principal shadow-elevada outline-none sm:max-h-[92vh] sm:rounded-3xl"
        ref={caja}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 className="flex min-w-0 items-center gap-3 text-2xl font-bold leading-tight" id="ayuda-pantalla-titulo">
            <span aria-hidden="true" className={`${CIRCULO} bg-accion/20`}>
              <LuCircleHelp className="h-7 w-7" />
            </span>
            <span className="min-w-0">{t('ayudaPantalla.titulo')}</span>
          </h2>
          <button
            aria-label={t('ayudaPantalla.cerrar')}
            className="-mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition hover:bg-principal/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/50"
            onClick={alCerrar}
            type="button"
          >
            <LuX aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>

        {/* Numeros grandes y una idea por paso: se entiende de un vistazo. */}
        <ol className="mt-4 space-y-3 px-5">
          {pasos.map((clave, indice) => (
            <li className="flex items-start gap-3 rounded-2xl bg-principal/5 p-3" key={clave}>
              <span aria-hidden="true" className={`${CIRCULO} bg-marca font-titulo text-xl font-bold text-white`}>
                {indice + 1}
              </span>
              <span className="min-w-0 self-center text-lg leading-snug">{t(clave)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 px-5">
          <p className="text-base font-semibold text-principal/80">{t('ayudaPantalla.dudas')}</p>
          <div className="mt-2 grid gap-2">
            {/* Muchos prefieren preguntarle a una persona: el telefono, a un toque. */}
            <a className={OPCION} href={ORGANIZACION.telefonoEnlace}>
              <LuPhone aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
              <span className="min-w-0">{t('ayudaPantalla.llamar', { telefono: TELEFONO })}</span>
            </a>
            <Link className={OPCION} onClick={alCerrar} to="/preguntas">
              <LuMessageCircleQuestion aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
              <span className="min-w-0">{t('ayudaPantalla.todas')}</span>
            </Link>
          </div>
        </div>

        {/* Pegado abajo: con la letra grande no se esconde debajo del texto. */}
        <div className="sticky bottom-0 mt-5 border-t border-principal/10 bg-superficie p-5">
          <button
            className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-accion px-4 text-base font-bold text-sobre-accion shadow-tarjeta transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-principal/30"
            onClick={alCerrar}
            type="button"
          >
            {t('ayuda.entendido')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
