import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuArrowRight, LuTicket } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import { aFechaLocal, formatearHora } from '../datos/disponibilidad'
import { citasProximas, leerMisCitas, quitarMiCita } from '../datos/misCitas'
import { hoyLocal } from '../datos/panel'

/**
 * "Tu cita", arriba de todo en la portada, si este telefono hizo una.
 *
 * Quien perdio la captura o cerro la pagina vuelve a entrar y lo primero
 * que ve es su cita con un boton grande para ver su codigo. Solo lee lo
 * guardado en este navegador (ver datos/misCitas.js); no pregunta nada a
 * la base.
 */
export default function MisCitas({ className = '' }) {
  const { t, i18n } = useTranslation()
  const hoy = hoyLocal()

  const [lista, setLista] = useState(() => citasProximas(leerMisCitas(), hoy))
  const [quitando, setQuitando] = useState(null)

  if (lista.length === 0) return null

  function quitar(token) {
    quitarMiCita(token)
    setLista(citasProximas(leerMisCitas(), hoy))
    setQuitando(null)
  }

  const fechaLarga = (fecha) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
      aFechaLocal(fecha),
    )

  return (
    <section aria-labelledby="mis-citas" className={`rounded-2xl border-2 border-accion bg-accion/10 p-4 ${className}`}>
      <h2 className="flex items-center gap-2 text-xl font-bold" id="mis-citas">
        <LuTicket aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
        {lista.length === 1 ? t('misCitas.tituloUna') : t('misCitas.titulo')}
      </h2>
      <p className="mt-1 text-base text-principal/75">
        {lista.length === 1 ? t('misCitas.ayudaUna') : t('misCitas.ayuda')}
      </p>

      <ul className="mt-3 space-y-3">
        {lista.map((cita) => {
          const esHoy = cita.fecha === hoy

          return (
            <li className="rounded-xl bg-superficie p-4 shadow-tarjeta ring-1 ring-principal/10" key={cita.token}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {esHoy && (
                  <span className="rounded-full bg-accion px-2.5 py-0.5 text-chica font-bold text-sobre-accion">
                    {t('misCitas.hoy')}
                  </span>
                )}
                <p className="text-lg font-bold first-letter:uppercase">
                  {fechaLarga(cita.fecha)} · {formatearHora(cita.hora)}
                </p>
              </div>
              <p className="text-base text-principal/70">
                {[cita.nombre, cita.codigo].filter(Boolean).join(' · ')}
              </p>

              <Link
                className="group mt-3 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-base font-bold text-sobre-accion shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-principal/30"
                to={`/confirmacion/${cita.token}`}
              >
                {t('misCitas.ver')}
                <LuArrowRight aria-hidden="true" className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>

              {/* Quitar pregunta primero: un toque sin querer no debe borrarle
                  a nadie su codigo. Y dice que NO cancela la cita. */}
              {quitando === cita.token ? (
                <div className="mt-2 rounded-xl bg-principal/5 p-3" role="group">
                  <p className="text-base">{t('misCitas.quitarPregunta')}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="inline-flex min-h-12 items-center rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold"
                      onClick={() => quitar(cita.token)}
                      type="button"
                    >
                      {t('misCitas.quitarSi')}
                    </button>
                    <button
                      className="inline-flex min-h-12 items-center px-2 text-base font-semibold underline underline-offset-4"
                      onClick={() => setQuitando(null)}
                      type="button"
                    >
                      {t('misCitas.quitarNo')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="mt-2 inline-flex min-h-12 items-center text-base text-principal/70 underline underline-offset-4 hover:text-principal"
                  onClick={() => setQuitando(cita.token)}
                  type="button"
                >
                  {t('misCitas.quitar')}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
