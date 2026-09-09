import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal, agruparPorFecha, consultarDisponibilidad } from '../../datos/disponibilidad'

export default function Calendario() {
  const { t, i18n } = useTranslation()
  const [dias, setDias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

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

    // Evita escribir estado si la persona se sale de la pantalla antes
    // de que responda la consulta.
    return () => {
      vigente = false
    }
  }, [])

  const formatoFecha = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

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

  return (
    <Tarjeta>
      <h1 className="mb-1 text-2xl font-bold">{t('pages.calendario')}</h1>
      <p className="mb-4 text-base text-principal/70">{t('calendario.instruccion')}</p>

      {dias.length === 0 ? (
        <p className="text-base">{t('calendario.sinFechas')}</p>
      ) : (
        <ul className="space-y-3">
          {dias.map((dia) => {
            const agotado = dia.libres === 0

            if (agotado) {
              return (
                <li key={dia.fecha}>
                  <div className="flex min-h-14 items-center justify-between rounded-xl border border-principal/20 bg-principal/5 px-4 py-3">
                    <span className="text-base font-semibold text-principal/50">
                      {formatoFecha.format(aFechaLocal(dia.fecha))}
                    </span>
                    <span className="text-base font-semibold text-ya-recibio">
                      {t('calendario.agotado')}
                    </span>
                  </div>
                </li>
              )
            }

            return (
              <li key={dia.fecha}>
                <Link
                  className="flex min-h-14 items-center justify-between rounded-xl border border-principal/20 px-4 py-3 transition hover:border-principal"
                  to={`/horarios/${dia.fecha}`}
                >
                  <span className="text-base font-semibold text-principal">
                    {formatoFecha.format(aFechaLocal(dia.fecha))}
                  </span>
                  <span className="text-base text-puede-pasar">
                    {t('calendario.libres', { count: dia.libres })}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Tarjeta>
  )
}
