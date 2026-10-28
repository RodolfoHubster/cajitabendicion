import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaBoxOpen, FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import {
  LuCalendarCheck,
  LuChevronLeft,
  LuChevronRight,
  LuHeartHandshake,
  LuPause,
  LuPlay,
  LuQrCode,
  LuRotateCcw,
  LuShieldCheck,
} from 'react-icons/lu'
import { LogoCompleto } from './Logo'
import { ORGANIZACION } from '../datos/organizacion'
import { ESCENAS, MS_ESCENA, avanzar } from '../datos/presentacion'

//  Cada cuanto se mueve la barrita de avance.
const PASO_MS = 100

//  Los tamanos: el de pantalla completa y el de la ventanita de la esquina
//  (en la pagina de la iglesia, 27 de octubre de 2026).
const GRANDE = {
  logo: 'h-36 w-36 sm:h-44 sm:w-44',
  icono: 'h-14 w-14',
  telefono: 'h-48 w-32',
  calendario: 'h-16 w-16',
  qr: 'h-36 w-36',
  escanear: 'motion-safe:animate-escanear',
  caja: 'h-36 w-36',
  manos: 'h-28 w-28',
  titulo: 'text-3xl',
  texto: 'text-lg',
  hueco: 'gap-5 px-6 py-4',
  control: 'h-14 w-14',
}
const CHICO = {
  logo: 'h-24 w-24',
  icono: 'h-10 w-10',
  telefono: 'h-36 w-24',
  calendario: 'h-12 w-12',
  qr: 'h-24 w-24',
  escanear: 'motion-safe:animate-escanear-chico',
  caja: 'h-24 w-24',
  manos: 'h-20 w-20',
  titulo: 'text-2xl',
  texto: 'text-base',
  hueco: 'gap-3 px-4 py-3',
  control: 'h-12 w-12',
}

/** El dibujo grande de cada escena: iconos que se mueven poquito. */
function Dibujo({ escena, tam }) {
  const { t } = useTranslation()

  if (escena === 'portada') {
    return (
      <div className="rounded-full bg-white p-2 shadow-lg ring-4 ring-accion/80 ring-offset-4 ring-offset-marca motion-safe:animate-flotar">
        <LogoCompleto className={`${tam.logo} rounded-full`} />
      </div>
    )
  }

  if (escena === 'comoVienes') {
    return (
      <div className="grid w-full max-w-sm grid-cols-2 gap-3">
        {[
          ['carro', FaCarSide, 'bg-accion text-sobre-accion'],
          ['aPie', FaPersonWalking, 'bg-white/10 text-white ring-2 ring-white/30'],
        ].map(([clave, Icono, color], i) => (
          <div
            className={`flex flex-col items-center gap-2 rounded-2xl p-3 motion-safe:animate-aparecer ${color}`}
            key={clave}
            style={{ animationDelay: `${i * 250}ms` }}
          >
            <Icono aria-hidden="true" className={`${tam.icono} motion-safe:animate-flotar`} />
            <span className="text-base font-bold leading-tight">{t(`video.comoVienes.${clave}`)}</span>
          </div>
        ))}
      </div>
    )
  }

  if (escena === 'cita') {
    return (
      <div className={`relative flex ${tam.telefono} flex-col items-center justify-center gap-2 rounded-[1.75rem] border-4 border-white/80 bg-white/10 motion-safe:animate-flotar`}>
        <LuCalendarCheck aria-hidden="true" className={`${tam.calendario} text-accion motion-safe:animate-latido`} />
        {['lunes', 'jueves'].map((dia, i) => (
          <span
            className="rounded-full bg-white/15 px-3 py-0.5 text-chica font-bold text-white motion-safe:animate-aparecer"
            key={dia}
            style={{ animationDelay: `${300 + i * 300}ms` }}
          >
            {t(`video.cita.${dia}`)}
          </span>
        ))}
      </div>
    )
  }

  if (escena === 'codigo') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative overflow-hidden rounded-2xl bg-white/10 p-4 ring-2 ring-white/30">
          <LuQrCode aria-hidden="true" className={`${tam.qr} text-white`} />
          {/* La linea que "escanea" el codigo. */}
          <span aria-hidden="true" className={`absolute inset-x-2 top-2 h-1 rounded-full bg-accion shadow-[0_0_12px_rgba(245,160,60,0.9)] ${tam.escanear}`} />
        </div>
        <span className="rounded-full bg-accion px-4 py-1 font-titulo text-xl font-bold tracking-wide text-sobre-accion">CB-12345</span>
      </div>
    )
  }

  if (escena === 'despensa') {
    return (
      <div className="flex flex-col items-center gap-3">
        <FaBoxOpen aria-hidden="true" className={`${tam.caja} text-accion motion-safe:animate-latido`} />
        <span className="rounded-full bg-white/15 px-4 py-1 text-base font-bold text-white">{t('video.despensa.unaCaja')}</span>
      </div>
    )
  }

  //  privado
  return (
    <div className="flex items-center gap-4">
      <LuHeartHandshake aria-hidden="true" className={`${tam.manos} text-accion motion-safe:animate-flotar`} />
      <LuShieldCheck aria-hidden="true" className={`${tam.manos} text-white motion-safe:animate-flotar [animation-delay:-1.5s]`} />
    </div>
  )
}

/**
 * Que es Cajita de Bendicion, como un video corto (27 de octubre de 2026):
 * escenas que avanzan solas, con su barrita, y se pueden pausar, regresar
 * o adelantar. Hecho con codigo y no grabado: sale en los tres idiomas, no
 * pesa y se cambia sin volver a grabar. Lo que dice es lo mismo que dice el
 * sistema (gratis, cita o turno, codigo QR, una caja por adulto, privado):
 * nada inventado de la iglesia.
 *
 * Al final se queda en "Haz tu cita". El boton de la cita lo pone quien la
 * usa (accion), porque cambia si se ve dentro de la pagina de la iglesia;
 * encabezado: lo que va arriba (el nombre y el idioma). compacta: para la
 * ventanita de la esquina de la pagina de la iglesia.
 */
export default function PresentacionCajita({ accion = null, encabezado = null, compacta = false }) {
  const { t } = useTranslation()
  const tam = compacta ? CHICO : GRANDE
  const [estado, setEstado] = useState({ escena: 0, transcurrido: 0 })
  const [pausado, setPausado] = useState(false)
  const terminado = estado.escena >= ESCENAS.length
  const escena = ESCENAS[Math.min(estado.escena, ESCENAS.length - 1)]
  const control = `flex ${tam.control} shrink-0 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/60`

  useEffect(() => {
    if (pausado || terminado) return undefined
    const reloj = setInterval(() => setEstado((antes) => avanzar(antes, PASO_MS)), PASO_MS)
    return () => clearInterval(reloj)
  }, [pausado, terminado])

  const ir = (numero) => setEstado({ escena: Math.max(0, Math.min(numero, ESCENAS.length)), transcurrido: 0 })

  return (
    <section
      aria-label={t('video.titulo')}
      aria-roledescription={t('video.presentacion')}
      className="relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-marca text-white"
    >
      {/* Las mismas luces del inicio, detras de todo. */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 -z-10 h-72 w-72 animate-brillo rounded-full bg-sky-300/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-24 -z-10 h-80 w-80 animate-brillo rounded-full bg-sky-200/15 blur-3xl [animation-delay:-3.5s]" />
      {!compacta && <div aria-hidden="true" className="h-1.5 shrink-0 bg-accion" />}
      {encabezado}

      {/* Una barrita por escena, como en las historias del telefono. */}
      <div aria-hidden="true" className="flex shrink-0 gap-1.5 px-4 pt-3">
        {ESCENAS.map((clave, i) => (
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25" key={clave}>
            <span
              className="block h-full rounded-full bg-white/95 transition-[width] duration-100 ease-linear"
              style={{
                width: i < estado.escena ? '100%' : i === estado.escena ? `${(estado.transcurrido / MS_ESCENA) * 100}%` : '0%',
              }}
            />
          </span>
        ))}
      </div>

      <div
        aria-live="polite"
        className={`flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto text-center ${tam.hueco}`}
        key={estado.escena}
      >
        {terminado ? (
          <>
            <p className="text-base font-semibold uppercase tracking-[0.2em] text-accion motion-safe:animate-aparecer">{ORGANIZACION.programa}</p>
            <h2 className={`${tam.titulo} font-bold leading-tight motion-safe:animate-aparecer`}>{t('video.final.titulo')}</h2>
            <p className={`max-w-sm ${tam.texto} text-white/85 motion-safe:animate-aparecer`}>{t('video.final.texto')}</p>
            <button
              className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-semibold text-white underline underline-offset-4"
              onClick={() => ir(0)}
              type="button"
            >
              <LuRotateCcw aria-hidden="true" className="h-5 w-5" />
              {t('video.otraVez')}
            </button>
          </>
        ) : (
          <>
            <Dibujo escena={escena} tam={tam} />
            <div className="space-y-2 motion-safe:animate-aparecer">
              {escena === 'portada' && !compacta && (
                <p className="text-base font-semibold uppercase tracking-[0.2em] text-accion">{ORGANIZACION.lema}</p>
              )}
              <h2 className={`${tam.titulo} font-bold leading-tight`}>{t(`video.${escena}.titulo`)}</h2>
              <p className={`mx-auto max-w-sm ${tam.texto} text-white/85`}>{t(`video.${escena}.texto`, { iglesia: ORGANIZACION.iglesia })}</p>
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 space-y-3 px-4 pb-4">
        {accion}
        <div className="flex items-center justify-center gap-4">
          <button aria-label={t('video.anterior')} className={control} disabled={estado.escena === 0} onClick={() => ir(estado.escena - 1)} type="button">
            <LuChevronLeft aria-hidden="true" className="h-7 w-7" />
          </button>
          <button
            aria-label={terminado ? t('video.otraVez') : pausado ? t('video.seguir') : t('video.pausar')}
            className={control}
            onClick={() => (terminado ? ir(0) : setPausado((antes) => !antes))}
            type="button"
          >
            {terminado ? (
              <LuRotateCcw aria-hidden="true" className="h-6 w-6" />
            ) : pausado ? (
              <LuPlay aria-hidden="true" className="h-6 w-6" />
            ) : (
              <LuPause aria-hidden="true" className="h-6 w-6" />
            )}
          </button>
          <button aria-label={t('video.siguiente')} className={control} disabled={terminado} onClick={() => ir(estado.escena + 1)} type="button">
            <LuChevronRight aria-hidden="true" className="h-7 w-7" />
          </button>
        </div>
      </div>
    </section>
  )
}
