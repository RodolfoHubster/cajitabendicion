import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaFacebook } from 'react-icons/fa6'
import { LuCircleCheck, LuClock, LuLock, LuMapPin, LuUsers } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import ModalSuscriptor from '../../componentes/ModalSuscriptor'
import Pasos from '../../componentes/Pasos'
import Tarjeta from '../../componentes/Tarjeta'
import {
  aFechaLocal,
  agruparPorFecha,
  consultarDisponibilidad,
  desglosarSegundos,
  elegirProximaEntrega,
  formatearFechaHora,
  formatearHora,
  segundosHasta,
} from '../../datos/disponibilidad'
import { ORGANIZACION } from '../../datos/organizacion'

// Azul de Facebook un poco mas oscuro que el oficial (#1877F2): con letra
// blanca, el oficial no llega al contraste minimo legible.
const AZUL_FACEBOOK =
  'bg-[#1560D4] text-white shadow-sm hover:brightness-110 focus-visible:ring-[#1560D4]/40'

/** "1 dia 3 h 20 min" o, en la ultima hora, "20 min 15 s". */
function tiempoRestante(t, total) {
  const { dias, horas, minutos, segundos } = desglosarSegundos(total)
  const partes = []

  if (dias) partes.push(t('proxima.tiempo.dias', { count: dias }))
  if (dias || horas) partes.push(t('proxima.tiempo.horas', { n: horas }))
  partes.push(t('proxima.tiempo.minutos', { n: minutos }))
  if (!dias && !horas) partes.push(t('proxima.tiempo.segundos', { n: segundos }))

  return partes.join(' ')
}

/**
 * Proxima entrega: una sola fecha, con toda su informacion.
 *
 * "Registrarme" se queda gris y sin poder tocarse hasta la hora de apertura,
 * y se activa solo a esa hora, sin recargar. A la izquierda, en azul, el
 * registro con codigo de suscriptor de Facebook abre un modal.
 *
 * Bloquear el boton es para que se entienda; lo que de verdad impide
 * registrarse antes de tiempo es la base de datos (registrar_y_reservar).
 */
export default function Calendario() {
  const { t, i18n } = useTranslation()
  const navegar = useNavigate()

  const [dias, setDias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [, setTic] = useState(0)

  const cerrarModal = useCallback(() => setModalAbierto(false), [])

  useEffect(() => {
    let vigente = true

    consultarDisponibilidad()
      .then((bloques) => {
        if (vigente) setDias(agruparPorFecha(bloques))
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [])

  const dia = elegirProximaEntrega(dias)
  const faltaPublico = dia?.abreEn ? segundosHasta(dia.abreEn) : 0
  // La base dijo si estaba abierta al cargar; si la hora llega con la
  // pagina abierta, se abre aqui tambien sin recargar.
  const abierta = Boolean(dia) && (dia.abierto || faltaPublico <= 0)
  const hayLugar = (dia?.libres ?? 0) > 0

  // Mientras no abre, la cuenta regresiva avanza cada segundo.
  useEffect(() => {
    if (!dia || abierta) return
    const intervalo = setInterval(() => setTic((n) => n + 1), 1000)
    return () => clearInterval(intervalo)
  }, [dia, abierta])

  if (cargando) {
    return (
      <Tarjeta>
        <p className="text-base">{t('calendario.cargando')}</p>
      </Tarjeta>
    )
  }

  if (error) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.calendario')}</h1>
        <p className="text-base text-ya-recibio">{t('calendario.error')}</p>
      </Tarjeta>
    )
  }

  if (!dia) {
    return (
      <Tarjeta>
        <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
        <h1 className="mb-2 text-2xl font-bold">{t('proxima.etiqueta')}</h1>
        <p className="mb-4 text-base">{t('proxima.sinFechas')}</p>
        <a
          className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition focus-visible:outline-none focus-visible:ring-4 ${AZUL_FACEBOOK}`}
          href={ORGANIZACION.apoyo.suscripcionFacebook}
          rel="noopener noreferrer"
          target="_blank"
        >
          <FaFacebook aria-hidden="true" className="h-5 w-5 shrink-0" />
          {t('modalSuscriptor.suscribirme')}
        </a>
      </Tarjeta>
    )
  }

  const titulo = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(dia.fecha))

  const faltaSuscriptores = dia.abreAnticipadoEn ? segundosHasta(dia.abreAnticipadoEn) : null
  const puedeRegistrarse = abierta && hayLugar

  return (
    <>
      <Tarjeta>
        <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
        <Pasos actual={1} />

        <p className="text-base font-semibold uppercase tracking-wide text-accion">{t('proxima.etiqueta')}</p>
        <h1 className="mt-1 font-titulo text-3xl font-bold leading-tight first-letter:uppercase">{titulo}</h1>

        <ul className="mt-4 space-y-2 text-base">
          {dia.primeraHora && dia.ultimaHora && (
            <li className="flex items-start gap-3">
              <LuClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
              <span>
                {t('proxima.horario', {
                  inicio: formatearHora(dia.primeraHora),
                  fin: formatearHora(dia.ultimaHora),
                })}
                . {t('proxima.duracion')}
              </span>
            </li>
          )}
          <li className="flex items-start gap-3">
            <LuMapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
            <span>
              {ORGANIZACION.iglesia} · {ORGANIZACION.direccion}
            </span>
          </li>
          <li className="flex items-start gap-3">
            <LuUsers aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
            <span className={hayLugar ? '' : 'font-semibold text-ya-recibio'}>
              {hayLugar ? t('proxima.lugares', { count: dia.libres }) : t('proxima.lleno')}
            </span>
          </li>
        </ul>

        {abierta ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar">
            <LuCircleCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
            {t('proxima.abiertos')}
          </p>
        ) : (
          <div className="mt-4 rounded-xl bg-principal/5 p-4">
            <p className="flex items-start gap-2 text-base font-semibold">
              <LuLock aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-accion" />
              {t('proxima.abreEl', { cuando: formatearFechaHora(dia.abreEn, i18n.language) })}
            </p>
            <p className="mt-1 font-titulo text-2xl font-bold text-principal">
              {t('proxima.faltan', { tiempo: tiempoRestante(t, faltaPublico) })}
            </p>
            {dia.abreAnticipadoEn && (
              <p className="mt-2 text-base text-principal/80">
                {faltaSuscriptores > 0
                  ? t('proxima.suscriptoresDesde', {
                      cuando: formatearFechaHora(dia.abreAnticipadoEn, i18n.language),
                    })
                  : t('proxima.suscriptoresAhora')}
              </p>
            )}
          </div>
        )}

        {/* Izquierda: suscriptores. Derecha: registro normal. En celular, uno arriba del otro. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-center text-base font-bold transition focus-visible:outline-none focus-visible:ring-4 ${AZUL_FACEBOOK}`}
            onClick={() => setModalAbierto(true)}
            type="button"
          >
            <FaFacebook aria-hidden="true" className="h-5 w-5 shrink-0" />
            {t('proxima.conCodigo')}
          </button>

          {puedeRegistrarse ? (
            <Boton onClick={() => navegar(`/horarios/${dia.fecha}`)}>{t('proxima.registrarme')}</Boton>
          ) : (
            <button
              className="inline-flex min-h-14 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-principal/10 px-4 text-base font-bold text-principal/50"
              disabled
              type="button"
            >
              <LuLock aria-hidden="true" className="h-5 w-5 shrink-0" />
              {hayLugar ? t('proxima.registrarme') : t('proxima.sinLugares')}
            </button>
          )}
        </div>

        {!abierta && hayLugar && (
          <p className="mt-2 text-center text-base text-principal/60">{t('proxima.seActivara')}</p>
        )}
      </Tarjeta>

      {modalAbierto && <ModalSuscriptor abierta={abierta} alCerrar={cerrarModal} dia={dia} />}
    </>
  )
}
