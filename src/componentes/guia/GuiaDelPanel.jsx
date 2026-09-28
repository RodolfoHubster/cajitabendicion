import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuArrowLeft, LuArrowRight, LuX } from 'react-icons/lu'
import Escena from './Escenas'

const ENFOCABLES = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * La guia del panel, paso a paso, con una escena animada en cada paso.
 *
 * Se abre sola la primera vez que alguien del equipo entra (y despues solo
 * si hay novedades); se vuelve a abrir desde el menu, en "Guia de uso".
 * Cerrarla o saltarla cuenta como vista: que no le salga cada vez a quien
 * entra con prisa el dia de la entrega. Quien quiera, la abre del menu.
 *
 * pasos: los de datos/guia.js que le tocan a esta cuenta.
 * novedades: true si solo son los pasos nuevos desde la ultima vez.
 */
export default function GuiaDelPanel({ pasos, novedades = false, alCerrar }) {
  const { t } = useTranslation()
  const [indice, setIndice] = useState(0)
  const caja = useRef(null)

  const total = pasos.length
  const paso = pasos[Math.min(indice, total - 1)]
  const ultimo = indice >= total - 1

  //  Al abrir: el foco adentro, y la pagina de atras quieta.
  useEffect(() => {
    caja.current?.focus()
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  //  Teclado: Esc cierra, las flechas cambian de paso y el tabulador no se
  //  sale de la guia hacia la pagina de atras.
  useEffect(() => {
    function teclas(evento) {
      if (evento.key === 'Escape') {
        alCerrar()
      } else if (evento.key === 'ArrowRight') {
        setIndice((n) => Math.min(n + 1, total - 1))
      } else if (evento.key === 'ArrowLeft') {
        setIndice((n) => Math.max(n - 1, 0))
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
  }, [alCerrar, total])

  if (!paso) return null

  return (
    <div
      aria-labelledby="guia-titulo"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-principal/50 sm:items-center sm:p-4"
      role="dialog"
    >
      <div
        className="flex max-h-[100dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-superficie shadow-elevada outline-none sm:max-h-[92vh] sm:rounded-3xl"
        ref={caja}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-principal/70">
            {novedades && (
              <span className="rounded-full bg-accion/20 px-2.5 py-0.5 font-bold text-principal">{t('guia.novedades')}</span>
            )}
            {t('guia.paso', { actual: indice + 1, total })}
          </p>
          <button
            aria-label={t('guia.cerrar')}
            className="-mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-principal transition hover:bg-principal/10"
            onClick={alCerrar}
            type="button"
          >
            <LuX aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>

        {/* Con key: al cambiar de paso, la escena empieza desde el principio. */}
        <div className="guia-paso px-5" key={paso.clave}>
          <div aria-hidden="true" className="mt-2 overflow-hidden rounded-2xl bg-principal/5 ring-1 ring-principal/10">
            <Escena clave={paso.clave} />
          </div>
          <div aria-live="polite">
            <h2 className="mt-4 font-titulo text-2xl font-bold leading-tight text-principal" id="guia-titulo">
              {t(`guia.pasos.${paso.clave}.titulo`)}
            </h2>
            <p className="mt-2 text-lg leading-relaxed text-principal/80">{t(`guia.pasos.${paso.clave}.texto`)}</p>
          </div>
        </div>

        {total > 1 && (
          <div className="mt-4 flex flex-wrap justify-center gap-0.5 px-5">
            {pasos.map((p, n) => (
              <button
                aria-current={n === indice ? 'step' : undefined}
                aria-label={t('guia.irAlPaso', { n: n + 1 })}
                className="flex h-8 items-center px-1"
                key={p.clave}
                onClick={() => setIndice(n)}
                type="button"
              >
                <span
                  className={`block h-2.5 rounded-full transition-all ${n === indice ? 'w-7 bg-marca' : 'w-2.5 bg-principal/25'}`}
                />
              </button>
            ))}
          </div>
        )}

        {/* Pegados abajo: con la letra grande en un telefono chico, "Siguiente"
            no se esconde debajo del texto. */}
        <div className="sticky bottom-0 mt-auto grid grid-cols-2 gap-3 border-t border-principal/10 bg-superficie p-5">
          {indice === 0 ? (
            <button
              className="min-h-14 rounded-xl px-3 text-base font-semibold text-principal underline underline-offset-4"
              onClick={alCerrar}
              type="button"
            >
              {t('guia.saltar')}
            </button>
          ) : (
            <button
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-3 text-base font-bold text-principal transition hover:border-principal"
              onClick={() => setIndice((n) => Math.max(n - 1, 0))}
              type="button"
            >
              <LuArrowLeft aria-hidden="true" className="h-5 w-5 shrink-0" />
              {t('guia.anterior')}
            </button>
          )}
          <button
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accion px-3 text-base font-bold text-sobre-accion shadow-tarjeta transition hover:brightness-105"
            onClick={() => (ultimo ? alCerrar() : setIndice((n) => n + 1))}
            type="button"
          >
            {ultimo ? t('guia.empezar') : t('guia.siguiente')}
            {!ultimo && <LuArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />}
          </button>
        </div>
      </div>
    </div>
  )
}
