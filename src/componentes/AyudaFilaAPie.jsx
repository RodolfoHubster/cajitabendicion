import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBookOpen, LuCircleHelp, LuListOrdered, LuMessageCircle, LuPlay, LuX } from 'react-icons/lu'
import {
  CASOS,
  PALABRAS,
  PARTES_VIDEO,
  PASOS_DEL_DIA,
  PORTADA_AYUDA,
  VIDEO_AYUDA,
  inicioDe,
  parteEn,
  reloj,
} from '../datos/ayudaFilaAPie'

const PESTANAS = [
  { clave: 'video', Icono: LuPlay },
  { clave: 'pasos', Icono: LuListOrdered },
  { clave: 'casos', Icono: LuCircleHelp },
  { clave: 'palabras', Icono: LuBookOpen },
]

const ENFOCABLES = 'button:not([disabled]), a[href], video, summary, [tabindex]:not([tabindex="-1"])'

/**
 * La ayuda de la fila a pie, a pantalla completa encima del escaner (ver
 * datos/ayudaFilaAPie.js). Cuatro pestanas grandes: el video por partes, un
 * dia normal paso a paso, "¿Que hago si...?" y las palabras.
 *
 * Desde un paso o un caso, "Ver en el video" lleva a la pestana del video y
 * lo pone en esa parte. Al cerrar se regresa al escaner tal como estaba.
 */
export default function AyudaFilaAPie({ alCerrar }) {
  const { t } = useTranslation()
  const [pestana, setPestana] = useState('video')
  //  La parte que se pidio desde un paso o un caso: se pone al abrir el video.
  const [irA, setIrA] = useState(null)
  const caja = useRef(null)
  const contenido = useRef(null)
  const botones = useRef({})

  //  Al abrir: el foco adentro, y el escaner de atras quieto.
  useEffect(() => {
    caja.current?.focus()
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  //  Esc cierra, y el tabulador no se sale hacia el escaner de atras.
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

  function cambiar(clave) {
    setPestana(clave)
    contenido.current?.scrollTo?.({ top: 0 })
  }

  //  Las flechas pasan de una pestana a otra, como en cualquier lista de pestanas.
  function flechas(evento, indice) {
    const paso = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0
    if (!paso) return
    evento.preventDefault()
    const siguiente = PESTANAS[(indice + paso + PESTANAS.length) % PESTANAS.length].clave
    cambiar(siguiente)
    botones.current[siguiente]?.focus()
  }

  //  `vez` cuenta: pedir otra vez la misma parte la vuelve a poner.
  function verParte(parte) {
    setIrA((antes) => ({ parte, vez: (antes?.vez ?? 0) + 1 }))
    cambiar('video')
  }

  return (
    <div
      aria-labelledby="ayuda-a-pie-titulo"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-center bg-principal/50 sm:items-center sm:p-4"
      role="dialog"
    >
      <div
        className="flex h-[100dvh] w-full max-w-2xl flex-col bg-superficie shadow-elevada outline-none sm:h-auto sm:max-h-[94vh] sm:rounded-3xl"
        ref={caja}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between gap-3 border-b border-principal/10 px-4 pt-3 sm:px-5">
          <h2 className="flex items-center gap-2 text-xl font-bold text-principal" id="ayuda-a-pie-titulo">
            <LuCircleHelp aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
            <span className="min-w-0">{t('ayudaAPie.titulo')}</span>
          </h2>
          <button
            aria-label={t('ayudaAPie.cerrar')}
            className="-mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-principal transition hover:bg-principal/10"
            onClick={alCerrar}
            type="button"
          >
            <LuX aria-hidden="true" className="h-7 w-7" />
          </button>
        </div>

        {/* Las pestanas, grandes y siempre a la vista. */}
        <div aria-label={t('ayudaAPie.titulo')} className="grid grid-cols-4 gap-1 border-b border-principal/10 px-2 py-2" role="tablist">
          {PESTANAS.map(({ clave, Icono }, indice) => {
            const activa = pestana === clave
            return (
              <button
                aria-controls={`ayuda-panel-${clave}`}
                aria-selected={activa}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-base font-bold transition ${
                  activa ? 'bg-marca text-white shadow-sm' : 'text-principal hover:bg-principal/5'
                }`}
                id={`ayuda-pestana-${clave}`}
                key={clave}
                onClick={() => cambiar(clave)}
                onKeyDown={(evento) => flechas(evento, indice)}
                ref={(nodo) => {
                  botones.current[clave] = nodo
                }}
                role="tab"
                tabIndex={activa ? 0 : -1}
                type="button"
              >
                <Icono aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
                <span className="min-w-0">{t(`ayudaAPie.pestanas.${clave}`)}</span>
              </button>
            )
          })}
        </div>

        <div
          aria-labelledby={`ayuda-pestana-${pestana}`}
          className="flex-1 overflow-y-auto px-4 pb-6 pt-4 sm:px-5"
          id={`ayuda-panel-${pestana}`}
          ref={contenido}
          role="tabpanel"
        >
          {pestana === 'video' && <PestanaVideo irA={irA} />}
          {pestana === 'pasos' && <PestanaPasos alVer={verParte} />}
          {pestana === 'casos' && <PestanaCasos alVer={verParte} />}
          {pestana === 'palabras' && <PestanaPalabras />}
        </div>

        <div className="border-t border-principal/10 p-3 sm:px-5">
          <button
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-lg font-bold text-sobre-accion shadow-sm transition hover:brightness-95"
            onClick={alCerrar}
            type="button"
          >
            {t('ayudaAPie.cerrar')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** "Ver en el video (4:58)": lleva a esa parte. */
function VerEnVideo({ parte, alVer }) {
  const { t } = useTranslation()
  const inicio = inicioDe(parte)
  //  Un caso sin parte en el video no lleva el enlace.
  if (!Number.isFinite(inicio)) return null
  return (
    <button
      className="mt-2 inline-flex min-h-12 items-center gap-2 text-base font-semibold text-principal underline underline-offset-4"
      onClick={() => alVer(parte)}
      type="button"
    >
      <LuPlay aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
      <span className="min-w-0">{t('ayudaAPie.verEnVideo', { tiempo: reloj(inicio) })}</span>
    </button>
  )
}

function PestanaVideo({ irA }) {
  const { t } = useTranslation()
  const video = useRef(null)
  const [enParte, setEnParte] = useState(null)
  const [error, setError] = useState(false)

  function irAParte(clave) {
    const inicio = inicioDe(clave)
    const v = video.current
    if (!v || inicio === null) return
    v.currentTime = inicio
    setEnParte(clave)
    //  Algunos telefonos no dejan que empiece solo: se queda listo en esa parte.
    v.play?.()?.catch?.(() => {})
  }

  //  Se pidio una parte desde un paso o un caso.
  useEffect(() => {
    if (irA) irAParte(irA.parte)
  }, [irA])

  return (
    <div>
      <h3 className="text-lg font-bold text-principal">{t('ayudaAPie.video.titulo')}</h3>
      <p className="mt-1 text-base text-principal/80">{t('ayudaAPie.video.ayuda')}</p>

      <video
        className="mx-auto mt-3 max-h-[60vh] w-full rounded-2xl bg-principal/10 ring-1 ring-principal/15"
        controls
        onError={() => setError(true)}
        onTimeUpdate={(e) => setEnParte(parteEn(e.currentTarget.currentTime))}
        playsInline
        poster={PORTADA_AYUDA}
        preload="none"
        ref={video}
        src={VIDEO_AYUDA}
      >
        {t('ayudaAPie.video.sinVideo')}
      </video>
      {error && (
        <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t('ayudaAPie.video.sinVideo')}
        </p>
      )}

      <h4 className="mt-5 text-base font-bold text-principal">{t('ayudaAPie.video.partes')}</h4>
      <ol className="mt-2 divide-y divide-principal/10 overflow-hidden rounded-xl border border-principal/15">
        {PARTES_VIDEO.map((parte, n) => {
          const aqui = enParte === parte.clave
          return (
            <li key={parte.clave}>
              <button
                aria-current={aqui ? 'true' : undefined}
                className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-base transition ${
                  aqui ? 'bg-accion/15 font-bold' : 'hover:bg-principal/5'
                } text-principal`}
                onClick={() => irAParte(parte.clave)}
                type="button"
              >
                <span className="w-7 shrink-0 text-center font-titulo text-lg font-bold text-principal/70">{n + 1}</span>
                <span className="min-w-0 flex-1">{t(`ayudaAPie.partes.${parte.clave}`)}</span>
                <span className="shrink-0 text-chica text-principal/70">{reloj(parte.inicio)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function PestanaPasos({ alVer }) {
  const { t } = useTranslation()
  return (
    <div>
      <h3 className="text-lg font-bold text-principal">{t('ayudaAPie.pasos.titulo')}</h3>
      <ol className="mt-3 space-y-3">
        {PASOS_DEL_DIA.map((paso, n) => (
          <li className="flex gap-3 rounded-2xl border border-principal/15 p-3" key={paso.clave}>
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accion font-titulo text-xl font-bold text-sobre-accion"
            >
              {n + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold leading-snug text-principal">{t(`ayudaAPie.pasos.lista.${paso.clave}.titulo`)}</p>
              <p className="mt-1 text-base text-principal/85">{t(`ayudaAPie.pasos.lista.${paso.clave}.texto`)}</p>
              <VerEnVideo alVer={alVer} parte={paso.parte} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PestanaCasos({ alVer }) {
  const { t } = useTranslation()
  return (
    <div>
      <h3 className="text-lg font-bold text-principal">{t('ayudaAPie.casos.titulo')}</h3>
      <p className="mt-1 text-base text-principal/80">{t('ayudaAPie.casos.ayuda')}</p>
      <ul className="mt-3 space-y-2">
        {CASOS.map((caso) => {
          const base = `ayudaAPie.casos.lista.${caso.clave}`
          return (
            <li key={caso.clave}>
              <details className="group rounded-2xl border-2 border-principal/15 open:border-accion">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 text-lg font-bold leading-snug text-principal [&::-webkit-details-marker]:hidden">
                  <LuCircleHelp aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
                  <span className="min-w-0 flex-1">{t(`${base}.pregunta`)}</span>
                  <span aria-hidden="true" className="shrink-0 text-2xl font-bold text-principal/80 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="space-y-3 border-t border-principal/10 px-3 pb-3 pt-2">
                  {caso.ves && (
                    <div>
                      <p className="text-chica font-bold uppercase tracking-wide text-principal/70">{t('ayudaAPie.casos.ves')}</p>
                      <p className="text-base text-principal">{t(`${base}.ves`)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-chica font-bold uppercase tracking-wide text-principal/70">{t('ayudaAPie.casos.haz')}</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-6 text-base text-principal marker:font-bold">
                      {Array.from({ length: caso.haz }, (_, i) => (
                        <li key={i}>{t(`${base}.haz${i + 1}`)}</li>
                      ))}
                    </ol>
                  </div>
                  {caso.dile && (
                    <div className="rounded-xl border-2 border-accion bg-accion/10 p-3">
                      <p className="flex items-center gap-2 text-chica font-bold uppercase tracking-wide text-principal/80">
                        <LuMessageCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-accion" />
                        <span className="min-w-0">{t('ayudaAPie.casos.dile')}</span>
                      </p>
                      <p className="mt-1 text-base font-semibold text-principal">{t(`${base}.dile`)}</p>
                    </div>
                  )}
                  {caso.parte && <VerEnVideo alVer={alVer} parte={caso.parte} />}
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PestanaPalabras() {
  const { t } = useTranslation()
  return (
    <div>
      <h3 className="text-lg font-bold text-principal">{t('ayudaAPie.palabras.titulo')}</h3>
      <dl className="mt-3 divide-y divide-principal/10 rounded-2xl border border-principal/15">
        {PALABRAS.map((clave) => (
          <div className="px-3 py-3" key={clave}>
            <dt className="text-lg font-bold text-principal">{t(`ayudaAPie.palabras.lista.${clave}.palabra`)}</dt>
            <dd className="mt-0.5 text-base text-principal/85">{t(`ayudaAPie.palabras.lista.${clave}.significa`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
