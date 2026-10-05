import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaWhatsapp } from 'react-icons/fa6'
import { LuCircleCheck, LuInfo, LuSkipForward, LuX } from 'react-icons/lu'
import {
  enlaceInvitacion,
  juntarNombres,
  leerInvitadas,
  marcarInvitada,
  prepararInvitaciones,
  siguienteEnvio,
  textoInvitacion,
} from '../datos/invitarSinCita'

/**
 * Invitar por WhatsApp a sacar cita a quienes entraron sin cita ese dia,
 * uno por uno (datos/invitarSinCita.js): la pagina abre WhatsApp con el
 * mensaje listo, la persona toca Enviar, regresa y pasa al siguiente. Se
 * puede cerrar y seguir despues: recuerda a quien ya se le mando.
 */
export default function VentanaInvitar({ fecha, filas, alCerrar }) {
  const { t, i18n } = useTranslation()
  const sitio = globalThis.location?.origin ?? 'https://citas.casadealabanzasd.com'

  const { envios, sinTelefono, repetidos } = prepararInvitaciones(filas)
  const [invitadas, setInvitadas] = useState(() => leerInvitadas(fecha))
  const [saltadas, setSaltadas] = useState(() => new Set())
  // Ya se abrio WhatsApp para el actual: ahora toca confirmar que se envio.
  const [abierto, setAbierto] = useState(false)
  const [verTodos, setVerTodos] = useState(false)

  const actual = siguienteEnvio(envios, invitadas, saltadas)
  const enviadas = envios.filter((envio) => invitadas.has(envio.clave)).length
  const avance = envios.length ? Math.round((enviadas / envios.length) * 100) : 0

  useEffect(() => {
    const escape = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [alCerrar])

  function marcar(clave, enviada = true) {
    setInvitadas(marcarInvitada(fecha, clave, enviada))
    setAbierto(false)
  }

  function saltar(clave) {
    setSaltadas((antes) => new Set(antes).add(clave))
    setAbierto(false)
  }

  const fechaLarga = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(`${fecha}T12:00:00`),
  )

  return (
    <div
      aria-labelledby="invitar-titulo"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-principal/40 p-0 sm:items-center sm:p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
      role="dialog"
    >
      <div className="ventana-sube max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-superficie shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 border-b border-principal/10 bg-superficie px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-principal" id="invitar-titulo">
                {t('invitar.titulo')}
              </h2>
              <p className="text-base text-principal/70 first-letter:uppercase">
                {t('invitar.quienes', { fecha: fechaLarga })}
              </p>
            </div>
            <button
              aria-label={t('detalle.cerrar')}
              className="-mr-2 flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl text-principal transition hover:bg-principal/10"
              onClick={alCerrar}
              type="button"
            >
              <LuX aria-hidden="true" className="h-6 w-6" />
            </button>
          </div>

          {envios.length > 0 && (
            <div className="mt-3">
              <p className="text-base font-semibold text-principal" role="status">
                {t('invitar.avance', { enviadas, total: envios.length })}
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-principal/10">
                <div className="h-full rounded-full bg-puede-pasar transition-all duration-500" style={{ width: `${avance}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="flex items-start gap-2 rounded-xl bg-principal/5 p-3 text-base text-principal">
            <LuInfo aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
            {t('invitar.comoFunciona')}
          </p>

          {(sinTelefono > 0 || repetidos > 0) && (
            <p className="text-chica text-principal/70">
              {[
                sinTelefono > 0 && t('invitar.sinTelefono', { count: sinTelefono }),
                repetidos > 0 && t('invitar.repetidos', { count: repetidos }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}

          {envios.length === 0 && <p className="text-base">{t('invitar.nadie')}</p>}

          {/* El que sigue: su mensaje ya escrito y el boton a WhatsApp. */}
          {actual && (
            <div className="aparecer rounded-2xl border-2 border-puede-pasar/40 p-4" key={actual.clave}>
              <p className="text-chica font-semibold uppercase tracking-wide text-principal/70">{t('invitar.sigue')}</p>
              <p className="text-xl font-bold text-principal">{juntarNombres(actual.nombres)}</p>
              <p className="text-base text-principal/80">{actual.telefono}</p>

              <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line rounded-xl bg-principal/5 p-3 text-chica text-principal">
                {textoInvitacion({ nombres: actual.nombres, fecha, enlace: `${sitio}/` })}
              </p>

              {abierto ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-puede-pasar px-4 text-base font-bold text-white"
                    onClick={() => marcar(actual.clave)}
                    type="button"
                  >
                    <LuCircleCheck aria-hidden="true" className="h-5 w-5" />
                    {t('invitar.yaLoEnvie')}
                  </button>
                  <a
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-principal px-4 text-base font-semibold text-principal"
                    href={enlaceInvitacion(actual, fecha, sitio)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <FaWhatsapp aria-hidden="true" className="h-5 w-5" />
                    {t('invitar.abrirOtraVez')}
                  </a>
                </div>
              ) : (
                <a
                  className="mt-3 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#1F7A47] px-4 text-base font-bold text-white transition hover:brightness-110"
                  href={enlaceInvitacion(actual, fecha, sitio)}
                  onClick={() => setAbierto(true)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <FaWhatsapp aria-hidden="true" className="h-6 w-6" />
                  {t('invitar.abrir')}
                </a>
              )}

              <button
                className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-xl px-3 text-base font-semibold text-principal underline underline-offset-4"
                onClick={() => saltar(actual.clave)}
                type="button"
              >
                <LuSkipForward aria-hidden="true" className="h-5 w-5" />
                {t('invitar.saltar')}
              </button>
            </div>
          )}

          {envios.length > 0 && !actual && (
            <p className="aparecer flex items-center gap-2 rounded-xl bg-puede-pasar/10 p-4 text-lg font-bold text-puede-pasar" role="status">
              <LuCircleCheck aria-hidden="true" className="h-6 w-6" />
              {saltadas.size > 0 && enviadas < envios.length
                ? t('invitar.terminoConSaltados', { count: envios.length - enviadas })
                : t('invitar.listo', { count: enviadas })}
            </p>
          )}

          {/* Todos, para volver a mandar o corregir uno marcado por error. */}
          {envios.length > 0 && (
            <div>
              <button
                aria-expanded={verTodos}
                className="min-h-12 text-base font-semibold text-principal underline underline-offset-4"
                onClick={() => setVerTodos((antes) => !antes)}
                type="button"
              >
                {verTodos ? t('invitar.ocultarTodos') : t('invitar.verTodos', { count: envios.length })}
              </button>

              {verTodos && (
                <ul className="mt-2 divide-y divide-principal/10 rounded-xl border border-principal/15">
                  {envios.map((envio) => {
                    const ya = invitadas.has(envio.clave)
                    return (
                      <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" key={envio.clave}>
                        <span>
                          <span className="block text-base font-semibold text-principal">{juntarNombres(envio.nombres)}</span>
                          <span className="block text-chica text-principal/70">
                            {envio.telefono} · {ya ? t('invitar.enviado') : t('invitar.pendiente')}
                          </span>
                        </span>
                        <span className="flex gap-1">
                          <a
                            aria-label={t('invitar.abrir')}
                            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-[#1F7A47] transition hover:bg-principal/10"
                            href={enlaceInvitacion(envio, fecha, sitio)}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            <FaWhatsapp aria-hidden="true" className="h-6 w-6" />
                          </a>
                          <button
                            className="min-h-12 rounded-xl px-2 text-chica font-semibold text-principal underline underline-offset-4"
                            onClick={() => marcar(envio.clave, !ya)}
                            type="button"
                          >
                            {ya ? t('invitar.marcarPendiente') : t('invitar.marcarEnviado')}
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
