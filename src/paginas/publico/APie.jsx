import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaPersonWalking } from 'react-icons/fa6'
import { LuArrowRight, LuClock, LuTicket } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import { EsqueletoProximaFecha } from '../../componentes/Esqueleto'
import Tarjeta from '../../componentes/Tarjeta'
import useCadaRato from '../../componentes/useCadaRato'
import { aFechaLocal, formatearFechaHora, formatearHora } from '../../datos/disponibilidad'
import { consultarFilasAPie, estadoFilaAPie, proximaFilaAPie } from '../../datos/filaAPie'
import { hoyLocal } from '../../datos/panel'

//  Cada cuanto se vuelve a revisar: si todavia no abre, el boton aparece
//  solo cuando abre, sin que la persona tenga que recargar.
const CADA_MS = 30000

/**
 * /a-pie: a donde lleva el QR del cartel.
 *
 * La fila a pie no va por horarios: se saca turno. Aqui se ve si hoy hay
 * fila a pie, a que hora empieza y, cuando ya abrio el registro, el boton
 * para sacar turno (el mismo registro que en carro).
 */
export default function APie() {
  const { t, i18n } = useTranslation()
  const [filas, setFilas] = useState(null)
  const [sinConexion, setSinConexion] = useState(false)

  useCadaRato(async () => {
    try {
      setFilas(await consultarFilasAPie(hoyLocal()))
      setSinConexion(false)
    } catch {
      setSinConexion(true)
      setFilas((antes) => antes ?? [])
    }
  }, CADA_MS)

  if (filas === null) return <EsqueletoProximaFecha texto={t('aPie.cargando')} />

  const fila = proximaFilaAPie(filas)
  const estado = estadoFilaAPie(fila)
  const fecha =
    fila &&
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
      aFechaLocal(fila.fecha),
    )
  const esHoy = fila?.fecha === hoyLocal()

  return (
    <div className="space-y-4">
      <Tarjeta className="overflow-hidden p-0">
        <div className="border-t-8 border-accion px-5 pb-5 pt-4">
          <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>

          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accion/20 text-principal">
              <FaPersonWalking aria-hidden="true" className="h-8 w-8" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">{t('aPie.titulo')}</h1>
              <p className="text-base text-principal/70">{t('aPie.subtitulo')}</p>
            </div>
          </div>

          {sinConexion && (
            <p className="mt-4 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
              {t('aPie.sinConexion')}
            </p>
          )}

          {estado === 'no_hay' && (
            <p className="mt-4 rounded-xl bg-principal/5 p-4 text-lg text-principal">{t('aPie.noHay')}</p>
          )}

          {fila && (
            <div className="mt-4 rounded-xl bg-principal/5 p-4">
              <p className="text-base font-semibold text-principal/70">
                {esHoy ? t('aPie.hoy') : t('aPie.proxima')}
              </p>
              <p className="text-2xl font-bold first-letter:uppercase">{fecha}</p>
              <p className="mt-1 flex items-center gap-2 text-lg text-principal">
                <LuClock aria-hidden="true" className="h-5 w-5 text-accion" />
                {t('aPie.empiezaA', { hora: formatearHora(fila.hora) })}
              </p>
            </div>
          )}

          {estado === 'por_abrir' && (
            <p className="mt-4 rounded-xl border-2 border-accion bg-accion/10 p-4 text-lg font-semibold text-principal" role="status">
              {t('aPie.abreA', { cuando: formatearFechaHora(fila.abre_en, i18n.language) })}
              <span className="mt-1 block text-base font-normal text-principal/80">{t('aPie.seActualiza')}</span>
            </p>
          )}

          {estado === 'llena' && (
            <p className="mt-4 rounded-xl bg-ya-recibio/10 p-4 text-lg font-semibold text-ya-recibio" role="status">
              {t('aPie.llena')}
            </p>
          )}

          {estado === 'abierta' && (
            <Link
              className="mt-4 flex min-h-16 items-center justify-center gap-2 rounded-xl bg-accion px-4 text-center text-xl font-bold text-sobre-accion shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-principal/30"
              to={`/registro?bloque=${fila.bloque_id}&fecha=${fila.fecha}&fila=a_pie`}
            >
              <LuTicket aria-hidden="true" className="h-6 w-6" />
              {t('aPie.sacarTurno')}
              <LuArrowRight aria-hidden="true" className="h-5 w-5" />
            </Link>
          )}
        </div>
      </Tarjeta>

      <Tarjeta>
        <h2 className="text-xl font-bold">{t('aPie.comoFunciona')}</h2>
        <ol className="mt-3 space-y-3">
          {['uno', 'dos', 'tres'].map((paso, i) => (
            <li className="flex gap-3" key={paso}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca font-bold text-white">
                {i + 1}
              </span>
              <span className="pt-1 text-base text-principal">{t(`aPie.pasos.${paso}`)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-xl border-l-4 border-accion bg-principal/5 p-3 text-base text-principal/85">
          {t('aPie.unaPorPersona')}
        </p>
      </Tarjeta>
    </div>
  )
}
