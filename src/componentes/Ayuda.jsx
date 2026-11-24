import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { LuCircleHelp } from 'react-icons/lu'

//  Abrir un globo cierra el que estuviera abierto: nunca dos encimados.
const EVENTO_ABIERTA = 'cajita:ayuda-abierta'
//  Separacion entre el globo y la orilla de la pantalla.
const MARGEN = 12

/**
 * El "?" que explica algo sin llenar la pantalla de texto (17 de noviembre de
 * 2026): un toque abre un globo junto al boton; "Entendido", un toque fuera
 * o Esc lo cierran. Para la gente que no anda leyendo: lo de todos los dias
 * se queda a la vista y la explicacion, a un toque.
 *
 * titulo: la pregunta ("¿Para que es este numero?"). Es tambien el nombre
 *   del boton para los lectores de pantalla.
 * children: la respuesta, corta.
 * tono: 'claro' sobre blanco; 'oscuro' sobre el azul de la marca.
 *
 * El globo va fuera de la pagina (portal) y se acomoda a lo ancho de la
 * pantalla: con la letra grande del telefono cabe igual, sin salirse.
 */
export default function Ayuda({ titulo, children, tono = 'claro', className = '' }) {
  const { t } = useTranslation()
  const id = useId()
  const boton = useRef(null)
  const globo = useRef(null)
  const [abierta, setAbierta] = useState(false)
  const [lugar, setLugar] = useState(null)

  const cerrar = useCallback((devolverFoco = true) => {
    setAbierta(false)
    setLugar(null)
    if (devolverFoco) boton.current?.focus()
  }, [])

  function alternar() {
    if (abierta) {
      cerrar()
      return
    }
    globalThis.dispatchEvent?.(new CustomEvent(EVENTO_ABIERTA, { detail: id }))
    setAbierta(true)
  }

  //  Si se abre otro "?", este se cierra.
  useEffect(() => {
    const otro = (evento) => {
      if (evento.detail !== id) {
        setAbierta(false)
        setLugar(null)
      }
    }
    globalThis.addEventListener?.(EVENTO_ABIERTA, otro)
    return () => globalThis.removeEventListener?.(EVENTO_ABIERTA, otro)
  }, [id])

  //  Donde va: debajo del boton, a todo lo ancho que deje la pantalla (hasta
  //  24rem), con la flechita apuntando al "?". En coordenadas de la pagina:
  //  al hacer scroll se va con el boton sin recalcular.
  useLayoutEffect(() => {
    if (!abierta) return undefined

    function colocar() {
      const r = boton.current?.getBoundingClientRect()
      if (!r) return
      const anchoPantalla = document.documentElement.clientWidth
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const ancho = Math.min(anchoPantalla - MARGEN * 2, 24 * rem)
      const centro = r.left + r.width / 2
      const izquierda = Math.max(MARGEN, Math.min(centro - ancho / 2, anchoPantalla - MARGEN - ancho))
      setLugar({
        top: r.bottom + globalThis.scrollY + 12,
        left: izquierda + globalThis.scrollX,
        ancho,
        //  La flechita, sin pegarse a las esquinas redondas del globo.
        flecha: Math.max(20, Math.min(centro - izquierda, ancho - 20)),
      })
    }

    colocar()
    globalThis.addEventListener?.('resize', colocar)
    return () => globalThis.removeEventListener?.('resize', colocar)
  }, [abierta])

  //  Ya colocado: que se vea completo y que el lector de pantalla lo lea. Si
  //  no cabe abajo, la pagina sube lo justo; si es mas alto que la pantalla
  //  (letra muy grande), que se vea desde su titulo.
  useEffect(() => {
    if (!abierta || !lugar || !globo.current) return
    globo.current.focus({ preventScroll: true })
    const r = globo.current.getBoundingClientRect()
    const alto = globalThis.innerHeight ?? 0
    let mover = r.bottom > alto - MARGEN ? r.bottom - alto + MARGEN : 0
    if (r.top - mover < MARGEN) mover = r.top - MARGEN
    if (mover > 0) {
      const quieto = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      globalThis.scrollBy?.({ top: mover, behavior: quieto ? 'auto' : 'smooth' })
    }
  }, [abierta, lugar])

  //  Un toque fuera lo cierra (sin robarle el foco a lo que se toco); Esc
  //  tambien.
  useEffect(() => {
    if (!abierta) return undefined

    function fuera(evento) {
      if (globo.current?.contains(evento.target) || boton.current?.contains(evento.target)) return
      cerrar(false)
    }
    function tecla(evento) {
      if (evento.key === 'Escape') cerrar()
    }

    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierta, cerrar])

  const estiloBoton =
    tono === 'oscuro'
      ? 'bg-white/10 text-white ring-white/40 hover:bg-white/20'
      : 'bg-accion/20 text-principal ring-accion/60 hover:bg-accion/30'

  return (
    <>
      <button
        aria-controls={abierta ? `${id}-globo` : undefined}
        aria-expanded={abierta}
        aria-label={titulo}
        className={`inline-flex h-[min(2.75rem,13.75vw)] w-[min(2.75rem,13.75vw)] shrink-0 items-center justify-center rounded-full ring-1 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60 ${estiloBoton} ${className}`}
        onClick={alternar}
        ref={boton}
        title={titulo}
        type="button"
      >
        <LuCircleHelp aria-hidden="true" className="h-7 w-7" />
      </button>

      {abierta &&
        lugar &&
        createPortal(
          <div
            aria-labelledby={`${id}-titulo`}
            className="globo-ayuda absolute z-50 rounded-2xl border-2 border-accion bg-superficie p-4 text-left text-principal shadow-elevada outline-none"
            id={`${id}-globo`}
            ref={globo}
            role="dialog"
            style={{ top: lugar.top, left: lugar.left, width: lugar.ancho }}
            tabIndex={-1}
          >
            <span
              aria-hidden="true"
              className="absolute -top-[9px] h-4 w-4 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-accion bg-superficie"
              style={{ left: lugar.flecha }}
            />
            <p className="flex items-start gap-2 text-lg font-bold leading-snug" id={`${id}-titulo`}>
              <LuCircleHelp aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-accion" />
              <span className="min-w-0">{titulo}</span>
            </p>
            <div className="mt-2 space-y-2 text-base leading-relaxed text-principal/90">{children}</div>
            <button
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-marca px-4 text-base font-bold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/50"
              onClick={() => cerrar()}
              type="button"
            >
              {t('ayuda.entendido')}
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
