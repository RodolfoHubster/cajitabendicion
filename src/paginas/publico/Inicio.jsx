import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCalendarDays, LuCheck, LuLock } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import { LogoCompleto } from '../../componentes/Logo'
import Tarjeta from '../../componentes/Tarjeta'
import TarjetaDonar from '../../componentes/TarjetaDonar'
import Ubicacion from '../../componentes/Ubicacion'
import { ORGANIZACION } from '../../datos/organizacion'
import { aFechaLocal, consultarDisponibilidad, formatearFechaHora } from '../../datos/disponibilidad'

export default function Inicio() {
  const { t, i18n } = useTranslation()
  const navegar = useNavigate()

  // undefined mientras carga, null si no hay fechas con lugar.
  const [proxima, setProxima] = useState(undefined)

  useEffect(() => {
    let vigente = true

    consultarDisponibilidad()
      .then((bloques) => {
        const conLugar = bloques.filter((bloque) => bloque.libres > 0)
        const primero = conLugar[0]

        if (!vigente) return
        setProxima(
          primero
            ? {
                fecha: primero.fecha,
                horarios: conLugar.filter((bloque) => bloque.fecha === primero.fecha).length,
                // Sin la migracion de apertura no llega `abierto`: se trata como abierta.
                abierta: primero.abierto !== false,
                abreEn: primero.abre_en,
              }
            : null,
        )
      })
      .catch(() => {
        if (vigente) setProxima(null)
      })

    return () => {
      vigente = false
    }
  }, [])

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl bg-principal text-white shadow-lg">
        {/* Franja naranja arriba, como la linea del techo en el logo. */}
        <div aria-hidden="true" className="h-1.5 bg-accion" />

        <div className="flex flex-col items-center gap-3 px-5 pb-7 pt-7 text-center">
          <div className="rounded-full bg-white p-2 shadow-md">
            <LogoCompleto className="h-36 w-36 rounded-full sm:h-44 sm:w-44" />
          </div>

          <p className="text-base font-semibold uppercase tracking-[0.2em] text-accion">
            {ORGANIZACION.lema}
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{t('inicio.titulo')}</h1>
          <p className="text-lg text-white/85">{t('inicio.subtitulo')}</p>
          <p className="text-base text-white/75">
            {t('marca.ministerio', { iglesia: ORGANIZACION.iglesia })}
          </p>

          <Boton className="mt-3 max-w-sm" onClick={() => navegar('/calendario')}>
            <LuCalendarDays aria-hidden="true" className="h-5 w-5" />
            {t('inicio.elegir')}
          </Boton>

          <p className="text-base font-semibold text-white">{t('inicio.gratuito')}</p>
        </div>
      </section>

      <Tarjeta>
        <p className="text-base text-principal/70">{t('inicio.proximaFecha')}</p>

        {proxima === undefined && <p className="mt-1 text-base">{t('calendario.cargando')}</p>}

        {proxima === null && <p className="mt-1 text-base">{t('inicio.sinProxima')}</p>}

        {proxima && (
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
            <p className="font-titulo text-2xl font-bold first-letter:uppercase">
              {new Intl.DateTimeFormat(i18n.language, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }).format(aFechaLocal(proxima.fecha))}
            </p>
            {proxima.abierta ? (
              <p className="text-base font-semibold text-puede-pasar">
                {t('inicio.horariosLibres', { count: proxima.horarios })}
              </p>
            ) : (
              <p className="flex items-center gap-1 text-base font-semibold text-principal">
                <LuLock aria-hidden="true" className="h-4 w-4 shrink-0 text-accion" />
                {t('calendario.abre', { cuando: formatearFechaHora(proxima.abreEn, i18n.language) })}
              </p>
            )}
          </div>
        )}
      </Tarjeta>

      {/* Las reglas van antes del registro, no escondidas en el formulario:
          se aceptan mejor cuando se entienden desde el principio. */}
      <Tarjeta>
        <h2 className="text-xl font-bold">{t('inicio.antesDeEmpezar')}</h2>
        <ul className="mt-3 space-y-3">
          {[t('inicio.regla1'), t('inicio.regla2')].map((regla) => (
            <li className="flex gap-3 text-base" key={regla}>
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-puede-pasar/15 text-puede-pasar">
                <LuCheck aria-hidden="true" className="h-4 w-4" />
              </span>
              {regla}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-xl bg-principal/5 p-3 text-base text-principal/80">
          {t('inicio.yaTienesCita')}
        </p>
      </Tarjeta>

      <Ubicacion />

      <TarjetaDonar />
    </div>
  )
}
