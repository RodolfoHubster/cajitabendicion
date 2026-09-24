import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuQrCode, LuX } from 'react-icons/lu'
import { useOutletContext } from 'react-router-dom'
import { EsqueletoFicha } from './Esqueleto'
import QrDeCita from './QrDeCita'
import { aFechaLocal, formatearHora, horaSanDiego } from '../datos/disponibilidad'
import { citaParaQr, citasDePersona, detalleDePersona, hoyLocal, sePuedeVerQr } from '../datos/panel'

const ESTILO_ESTADO = {
  entregada: 'bg-ya-recibio/10 text-ya-recibio',
  llego: 'bg-puede-pasar/10 text-puede-pasar',
  reservada: 'bg-principal/10 text-principal',
  cancelada: 'bg-principal/10 text-principal/70',
  no_asistio: 'bg-accion/20 text-principal',
}

/** Una linea "etiqueta: valor". Si no hay valor, no se dibuja. */
function Dato({ etiqueta, children }) {
  if (children === null || children === undefined || children === '') return null

  return (
    <div className="py-1">
      <dt className="text-base text-principal/70">{etiqueta}</dt>
      <dd className="text-base font-semibold text-principal">{children}</dd>
    </div>
  )
}

/**
 * La ficha completa de una persona: domicilio exacto, contacto y sus
 * citas anteriores.
 *
 * Es lo que NO va en la lista del dia. La lista es para trabajar en la
 * fila, con lo minimo a la vista; esto se abre a proposito, cuando de
 * verdad hace falta el dato.
 */
export default function DetallePersona({ codigo, alCerrar }) {
  const { t, i18n } = useTranslation()

  const [persona, setPersona] = useState(null)
  const [citas, setCitas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  // El QR vale una caja: solo el admin lo ve (la base lo vuelve a revisar).
  const { rol } = useOutletContext() ?? {}
  const esAdmin = rol === 'admin'
  const hoy = hoyLocal()
  // La cita elegida en "Sus citas" para el cuadro del QR; si no, la que toca.
  const [elegida, setElegida] = useState(null)
  const cuadroQr = useRef(null)

  useEffect(() => {
    let vigente = true

    Promise.all([detalleDePersona(codigo), citasDePersona(codigo)])
      .then(([ficha, suyas]) => {
        if (!vigente) return
        setPersona(ficha)
        setCitas(suyas)
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
  }, [codigo])

  useEffect(() => {
    const escape = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }

    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [alCerrar])

  const fecha = (dia) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(
      aFechaLocal(dia),
    )

  const clave = (cita) => `${cita.fecha}-${cita.hora}`
  const cuando = (cita) => `${fecha(cita.fecha)} · ${formatearHora(cita.hora)}`
  const citaQr = (elegida && citas.find((cita) => clave(cita) === elegida)) || citaParaQr(citas, hoy)

  function verQrDe(cita) {
    setElegida(clave(cita))
    // En el celular el cuadro queda arriba: se lleva la vista hasta él.
    requestAnimationFrame(() => cuadroQr.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const momento = (marca) =>
    marca
      ? `${new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(marca))} · ${horaSanDiego(marca)}`
      : null

  return (
    <div
      aria-labelledby="detalle-titulo"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-principal/40 p-0 sm:items-center sm:p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
      role="dialog"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-superficie shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-principal/10 bg-superficie px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-principal" id="detalle-titulo">
              {persona?.nombre ?? t('detalle.titulo')}
            </h2>
            <p className="font-titulo text-lg font-bold text-principal/70">{codigo}</p>
          </div>
          <button
            aria-label={t('detalle.cerrar')}
            className="-mr-2 flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl text-principal transition hover:bg-principal/5"
            onClick={alCerrar}
            type="button"
          >
            <LuX aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>

        <div className="px-5 py-4">
          {cargando && <EsqueletoFicha conQr={esAdmin} texto={t('detalle.cargando')} />}

          {error && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
            </p>
          )}

          {persona && (
            <>
              <div className={esAdmin ? 'grid gap-5 sm:grid-cols-[minmax(0,1fr)_15rem]' : ''}>
                <div className="min-w-0">
                  <dl className="grid gap-x-6 sm:grid-cols-2">
                    <Dato etiqueta={t('detalle.telefono')}>{persona.telefono}</Dato>
                    <Dato etiqueta={t('detalle.correo')}>{persona.email}</Dato>
                  </dl>

                  <h3 className="mb-1 mt-4 text-base font-bold text-principal">{t('detalle.domicilio')}</h3>

                  {persona.sin_domicilio ? (
                    <p className="text-base font-semibold text-principal">{t('detalle.sinDomicilio')}</p>
                  ) : (
                    <p className="text-base font-semibold text-principal">{persona.direccion ?? '—'}</p>
                  )}

                  <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
                    <Dato etiqueta={t('detalle.calle')}>
                      {[persona.calle, persona.numero_exterior].filter(Boolean).join(' ') || null}
                    </Dato>
                    <Dato etiqueta={t('detalle.interior')}>{persona.numero_interior}</Dato>
                    <Dato etiqueta={t('detalle.colonia')}>{persona.colonia}</Dato>
                    <Dato etiqueta={t('detalle.codigoPostal')}>{persona.codigo_postal}</Dato>
                    {/* En muchos casos el municipio se llama igual que la ciudad. */}
                    <Dato etiqueta={t('detalle.ciudad')}>
                      {[persona.ciudad, persona.municipio !== persona.ciudad ? persona.municipio : null]
                        .filter(Boolean)
                        .join(' · ') || null}
                    </Dato>
                    <Dato etiqueta={t('detalle.estado')}>
                      {[persona.estado, persona.pais ? t(`domicilio.paises.${persona.pais}`, { defaultValue: persona.pais }) : null]
                        .filter(Boolean)
                        .join(' · ') || null}
                    </Dato>
                  </dl>
                </div>

                {/* El espacio de la derecha: el QR de la cita que toca. */}
                {esAdmin && (
                  <div className="scroll-mt-20" ref={cuadroQr}>
                    {citaQr ? (
                      <QrDeCita
                        abiertoAlInicio={elegida === clave(citaQr)}
                        cita={citaQr}
                        codigo={codigo}
                        cuando={cuando(citaQr)}
                        hoy={hoy}
                        key={clave(citaQr)}
                      />
                    ) : (
                      <p className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-principal/25 p-4 text-center text-base text-principal/70">
                        {t('verQr.sinCita')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <h3 className="mb-1 mt-4 text-base font-bold text-principal">{t('detalle.registro')}</h3>
              <dl className="grid gap-x-6 sm:grid-cols-2">
                <Dato etiqueta={t('detalle.registradaEn')}>{momento(persona.registrada_en)}</Dato>
                <Dato etiqueta={t('detalle.aceptoAviso')}>{momento(persona.acepto_privacidad_en)}</Dato>
                <Dato etiqueta={t('detalle.citasTotales')}>{String(persona.citas_totales ?? 0)}</Dato>
                <Dato etiqueta={t('detalle.cajasRecibidas')}>{String(persona.cajas_recibidas ?? 0)}</Dato>
              </dl>

              <h3 className="mb-2 mt-4 text-base font-bold text-principal">{t('detalle.suHistorial')}</h3>

              {citas.length === 0 ? (
                <p className="text-base text-principal/70">{t('detalle.sinCitas')}</p>
              ) : (
                <ul className="divide-y divide-principal/10">
                  {citas.map((cita) => (
                    <li className="flex items-center justify-between gap-3 py-2" key={`${cita.fecha}-${cita.hora}`}>
                      <span className="text-base text-principal">
                        {fecha(cita.fecha)} · {formatearHora(cita.hora)}
                      </span>
                      <span className="flex items-center gap-2">
                        {esAdmin && sePuedeVerQr(rol, cita) && (
                          <button
                            aria-label={t('verQr.ver', { cuando: cuando(cita) })}
                            aria-pressed={Boolean(citaQr) && clave(citaQr) === clave(cita)}
                            className={`inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-base font-semibold text-principal transition ${
                              citaQr && clave(citaQr) === clave(cita)
                                ? 'bg-principal/10'
                                : 'underline underline-offset-4 hover:bg-principal/5'
                            }`}
                            onClick={() => verQrDe(cita)}
                            type="button"
                          >
                            <LuQrCode aria-hidden="true" className="h-5 w-5" />
                            {t('verQr.verEste')}
                          </button>
                        )}
                        <span
                          className={`whitespace-nowrap rounded-lg px-2 py-1 text-base ${
                            ESTILO_ESTADO[cita.estado] ?? 'bg-principal/10 text-principal/70'
                          }`}
                        >
                          {t(`panel.estado.${cita.estado}`, { defaultValue: cita.estado })}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-4 rounded-xl bg-principal/5 p-3 text-base text-principal/70">
                {t('detalle.aviso')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
