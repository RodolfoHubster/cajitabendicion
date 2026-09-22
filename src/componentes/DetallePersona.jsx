import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuX } from 'react-icons/lu'
import { aFechaLocal, formatearHora, horaSanDiego } from '../datos/disponibilidad'
import { citasDePersona, detalleDePersona } from '../datos/panel'

const ESTILO_ESTADO = {
  entregada: 'bg-ya-recibio/10 text-ya-recibio',
  llego: 'bg-puede-pasar/10 text-puede-pasar',
  reservada: 'bg-principal/10 text-principal',
  cancelada: 'bg-principal/10 text-principal/60',
  no_asistio: 'bg-accion/20 text-principal',
}

/** Una linea "etiqueta: valor". Si no hay valor, no se dibuja. */
function Dato({ etiqueta, children }) {
  if (children === null || children === undefined || children === '') return null

  return (
    <div className="py-1">
      <dt className="text-base text-principal/60">{etiqueta}</dt>
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-principal/10 bg-white px-5 py-4">
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
          {cargando && <p className="text-base">{t('detalle.cargando')}</p>}

          {error && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
            </p>
          )}

          {persona && (
            <>
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
                      <span
                        className={`whitespace-nowrap rounded-lg px-2 py-1 text-base ${
                          ESTILO_ESTADO[cita.estado] ?? 'bg-principal/10 text-principal/70'
                        }`}
                      >
                        {t(`panel.estado.${cita.estado}`, { defaultValue: cita.estado })}
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
