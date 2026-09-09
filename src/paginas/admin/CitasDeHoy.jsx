import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal, formatearHora } from '../../datos/disponibilidad'
import { bloquesDelDia, citasDelDia, hoyLocal, resumenDelDia } from '../../datos/panel'

const ESTILO_ESTADO = {
  entregada: 'bg-puede-pasar/15 text-puede-pasar',
  reservada: 'bg-principal/10 text-principal/70',
  llego: 'bg-accion/20 text-principal',
  no_asistio: 'bg-ya-recibio/10 text-ya-recibio',
}

export default function CitasDeHoy() {
  const { t, i18n } = useTranslation()
  const fecha = hoyLocal()

  const [resumen, setResumen] = useState(null)
  const [bloques, setBloques] = useState([])
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true

    Promise.all([resumenDelDia(fecha), bloquesDelDia(fecha), citasDelDia(fecha)])
      .then(([r, b, c]) => {
        if (!vigente) return
        setResumen(r)
        setBloques(b)
        setCitas(c)
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
  }, [fecha])

  if (cargando) {
    return (
      <Tarjeta>
        <p className="text-base">{t('panel.cargando')}</p>
      </Tarjeta>
    )
  }

  if (error) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.adminCitasHoy')}</h1>
        <p className="text-base text-ya-recibio">
          {t(`panel.errores.${error}`, { defaultValue: t('panel.errores.ERROR_DESCONOCIDO') })}
        </p>
      </Tarjeta>
    )
  }

  const fechaLarga = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(fecha))

  const numeros = [
    { clave: 'conCita', valor: resumen?.con_cita ?? 0, color: 'text-principal' },
    { clave: 'yaRecibieron', valor: resumen?.ya_recibieron ?? 0, color: 'text-puede-pasar' },
    { clave: 'faltan', valor: resumen?.faltan_por_llegar ?? 0, color: 'text-principal' },
    { clave: 'sinCita', valor: resumen?.sin_cita ?? 0, color: 'text-principal' },
    { clave: 'repetidos', valor: resumen?.intentos_repetidos ?? 0, color: 'text-ya-recibio' },
  ]

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="text-2xl font-bold first-letter:uppercase">{fechaLarga}</h1>
        <p className="mb-4 text-base text-principal/70">{t('panel.subtitulo')}</p>

        <dl className="grid grid-cols-2 gap-3">
          {numeros.map(({ clave, valor, color }) => (
            <div className="rounded-xl bg-principal/5 p-3" key={clave}>
              <dd className={`text-3xl font-bold ${color}`}>{valor}</dd>
              <dt className="text-base text-principal/70">{t(`panel.${clave}`)}</dt>
            </div>
          ))}
        </dl>
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-1 text-lg font-bold">{t('panel.cupoPorHorario')}</h2>
        <p className="mb-3 text-base text-principal/70">{t('panel.cupoAyuda')}</p>

        {bloques.length === 0 ? (
          <p className="text-base">{t('panel.sinBloques')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {bloques.map((bloque) => (
              <li
                className={`rounded-xl border p-3 ${
                  bloque.cerrado ? 'border-ya-recibio/30 bg-ya-recibio/5' : 'border-principal/20'
                }`}
                key={bloque.bloque_id}
              >
                <p className="text-base font-semibold text-principal">
                  {formatearHora(bloque.hora)}
                </p>
                <p className="text-base text-principal/70">
                  {bloque.cerrado
                    ? t('panel.cerrado')
                    : t('panel.deTotal', { ocupados: bloque.ocupados, total: bloque.capacidad })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta>
        <h2 className="mb-3 text-lg font-bold">
          {t('panel.citasDelDia', { count: citas.length })}
        </h2>

        {citas.length === 0 ? (
          <p className="text-base">{t('panel.sinCitas')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-principal/15 text-principal/70">
                  <th className="py-2 pr-3 font-medium">{t('panel.col.hora')}</th>
                  <th className="py-2 pr-3 font-medium">{t('panel.col.nombre')}</th>
                  <th className="py-2 pr-3 font-medium">{t('panel.col.codigo')}</th>
                  <th className="py-2 pr-3 font-medium">{t('panel.col.estado')}</th>
                  <th className="py-2 font-medium">{t('panel.col.ciudad')}</th>
                </tr>
              </thead>
              <tbody>
                {citas.map((cita) => (
                  <tr
                    className="border-b border-principal/10 last:border-0"
                    key={cita.codigo_corto}
                  >
                    <td className="whitespace-nowrap py-2 pr-3">{formatearHora(cita.hora)}</td>
                    <td className="py-2 pr-3">{cita.nombre}</td>
                    <td className="whitespace-nowrap py-2 pr-3 font-semibold">
                      {cita.codigo_corto}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-lg px-2 py-1 ${
                          ESTILO_ESTADO[cita.estado] ?? 'bg-principal/10 text-principal/70'
                        }`}
                      >
                        {t(`panel.estado.${cita.estado}`, { defaultValue: cita.estado })}
                      </span>
                    </td>
                    <td className="py-2 text-principal/70">{cita.ciudad ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  )
}
