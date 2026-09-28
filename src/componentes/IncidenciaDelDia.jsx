import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaWhatsapp } from 'react-icons/fa6'
import { LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'
import Campo from './Campo'
import { EsqueletoLista } from './Esqueleto'
import { formatearHora } from '../datos/disponibilidad'
import {
  MINUTOS_RETRASO,
  TIPOS_INCIDENCIA,
  anunciarRetraso,
  cancelarEntrega,
  enlaceWhatsApp,
  fechaLarga,
  incidenciaVigente,
  incidenciasDeFecha,
  moverEntrega,
  personasAAvisar,
  textoWhatsApp,
} from '../datos/incidencias'

/**
 * "Hay un problema este dia": retraso, mover la entrega o cancelarla, y la
 * lista de a quien avisar por WhatsApp. Va dentro de cada fecha en Horarios
 * (solo admin; la base lo vuelve a revisar).
 */
export default function IncidenciaDelDia({ dia, alCambiar }) {
  const { t, i18n } = useTranslation()

  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState('retraso')
  const [minutos, setMinutos] = useState(30)
  const [fechaNueva, setFechaNueva] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [listo, setListo] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    if (!abierto) return
    let vivo = true
    incidenciasDeFecha(dia.fecha)
      .then((h) => vivo && setHistorial(h))
      .catch((e) => {
        if (!vivo) return
        setHistorial([])
        setError(e.message)
      })
    return () => {
      vivo = false
    }
  }, [abierto, dia.fecha, recarga])

  const fecha = (f) => fechaLarga(f, i18n.language)
  const vigente = incidenciaVigente(historial, dia.fecha)
  const resuelta = vigente && vigente.tipo !== 'retraso' ? vigente : null

  async function aplicar(evento) {
    evento?.preventDefault()
    setError(null)
    setListo(null)

    if (tipo === 'movida' && !fechaNueva) {
      setError('FECHA_NUEVA_INVALIDA')
      return
    }
    //  Mover o cancelar toca a todos: se pregunta una vez.
    if (tipo !== 'retraso' && !confirmando) {
      setConfirmando(true)
      return
    }

    setOcupado(true)
    try {
      if (tipo === 'retraso') {
        await anunciarRetraso({ fecha: dia.fecha, minutos, mensaje })
        setListo(t('incidencias.listo.retraso', { minutos }))
      } else if (tipo === 'movida') {
        const { movidas, sin_mover: sinMover } = await moverEntrega({ fecha: dia.fecha, fechaNueva, mensaje })
        setListo(
          [
            t('incidencias.listo.movida', { movidas, fechaNueva: fecha(fechaNueva) }),
            sinMover ? t('incidencias.listo.sinMover', { n: sinMover }) : null,
          ]
            .filter(Boolean)
            .join(' '),
        )
      } else {
        const n = await cancelarEntrega({ fecha: dia.fecha, mensaje })
        setListo(t('incidencias.listo.cancelada', { n }))
      }
      setConfirmando(false)
      setMensaje('')
      setRecarga((x) => x + 1)
      alCambiar?.()
    } catch (e) {
      setError(e.message)
      setConfirmando(false)
    } finally {
      setOcupado(false)
    }
  }

  async function quitarRetraso() {
    setOcupado(true)
    setError(null)
    try {
      await anunciarRetraso({ fecha: dia.fecha, minutos: 0 })
      setListo(t('incidencias.listo.retirado'))
      setRecarga((x) => x + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!abierto) {
    return (
      <button
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-accion bg-accion/10 px-4 text-base font-bold text-principal transition hover:bg-accion/20"
        onClick={() => setAbierto(true)}
        type="button"
      >
        <LuTriangleAlert aria-hidden="true" className="h-5 w-5 text-accion" />
        {t('incidencias.boton')}
      </button>
    )
  }

  return (
    <section className="space-y-4 rounded-xl border-2 border-accion bg-superficie p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-lg font-bold text-principal">{t('incidencias.titulo')}</h4>
        <button
          className="min-h-10 px-2 text-base font-semibold text-principal underline underline-offset-4"
          onClick={() => setAbierto(false)}
          type="button"
        >
          {t('incidencias.cerrar')}
        </button>
      </div>

      {listo && (
        <p className="flex items-start gap-2 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
          <LuCircleCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          {listo}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`incidencias.errores.${error}`, { defaultValue: t('incidencias.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      {historial === null && <EsqueletoLista filas={2} texto={t('incidencias.cargando')} />}

      {historial !== null && resuelta && (
        <p className="rounded-xl bg-principal/5 p-3 text-base font-semibold text-principal">
          {t(`incidencias.yaResuelta.${resuelta.tipo}`, {
            fechaNueva: resuelta.fecha_nueva ? fecha(resuelta.fecha_nueva) : '',
          })}
        </p>
      )}

      {historial !== null && vigente?.tipo === 'retraso' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accion/10 p-3">
          <p className="text-base font-semibold text-principal">
            {t('incidencias.retrasoVigente', { minutos: vigente.minutos })}
          </p>
          <button
            className="min-h-10 px-2 text-base font-semibold text-ya-recibio underline underline-offset-4 disabled:opacity-60"
            disabled={ocupado}
            onClick={quitarRetraso}
            type="button"
          >
            {t('incidencias.quitarRetraso')}
          </button>
        </div>
      )}

      {historial !== null && !resuelta && (
        <form className="space-y-3" noValidate onSubmit={aplicar}>
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('incidencias.titulo')}</legend>
            {TIPOS_INCIDENCIA.map((valor) => (
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition ${
                  tipo === valor ? 'border-principal bg-principal/5' : 'border-principal/15 hover:border-principal/40'
                }`}
                key={valor}
              >
                <input
                  checked={tipo === valor}
                  className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--c-marca))]"
                  name={`incidencia-${dia.fecha}`}
                  onChange={() => {
                    setTipo(valor)
                    setConfirmando(false)
                    setError(null)
                  }}
                  type="radio"
                  value={valor}
                />
                <span>
                  <span className="block text-base font-bold text-principal">{t(`incidencias.tipos.${valor}.titulo`)}</span>
                  <span className="block text-base text-principal/70">{t(`incidencias.tipos.${valor}.ayuda`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {tipo === 'retraso' && (
            <label className="flex flex-col gap-1" htmlFor={`minutos-${dia.fecha}`}>
              <span className="text-base font-semibold text-principal">{t('incidencias.minutos')}</span>
              <select
                className="min-h-14 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal"
                id={`minutos-${dia.fecha}`}
                onChange={(e) => setMinutos(Number(e.target.value))}
                value={minutos}
              >
                {MINUTOS_RETRASO.map((m) => (
                  <option key={m} value={m}>
                    {t('incidencias.minutosOpcion', { minutos: m })}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tipo === 'movida' && (
            <div>
              <Campo
                etiqueta={t('incidencias.fechaNueva')}
                id={`fecha-nueva-${dia.fecha}`}
                onChange={(e) => {
                  setFechaNueva(e.target.value)
                  setConfirmando(false)
                }}
                type="date"
                value={fechaNueva}
              />
              <p className="mt-1 text-chica text-principal/70">{t('incidencias.fechaNuevaAyuda')}</p>
            </div>
          )}

          <Campo
            etiqueta={t('incidencias.mensaje')}
            id={`mensaje-incidencia-${dia.fecha}`}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder={t('incidencias.mensajeEjemplo')}
            value={mensaje}
          />

          {confirmando && (
            <p
              className={`rounded-xl border-2 p-3 text-base font-semibold text-principal ${
                tipo === 'cancelada' ? 'border-ya-recibio/40 bg-ya-recibio/5' : 'border-accion bg-accion/10'
              }`}
              role="alert"
            >
              {tipo === 'movida'
                ? t('incidencias.confirmarMovida', { fecha: fecha(dia.fecha), fechaNueva: fecha(fechaNueva) })
                : t('incidencias.confirmarCancelada', { fecha: fecha(dia.fecha) })}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-base font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${
                confirmando && tipo === 'cancelada' ? 'bg-peligro' : 'bg-marca'
              }`}
              disabled={ocupado}
              type="submit"
            >
              {ocupado
                ? t('incidencias.aplicando')
                : confirmando
                  ? t(tipo === 'movida' ? 'incidencias.siMover' : 'incidencias.siCancelar')
                  : t('incidencias.aplicar')}
            </button>
            {confirmando && (
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/25 bg-superficie px-4 text-base font-bold text-principal"
                onClick={() => setConfirmando(false)}
                type="button"
              >
                {t('incidencias.noVolver')}
              </button>
            )}
          </div>
        </form>
      )}

      {historial?.length > 0 && (
        <div>
          <h5 className="mb-1 text-base font-bold text-principal">{t('incidencias.historial')}</h5>
          <ul className="space-y-1">
            {historial.map((h) => (
              <li className={`text-base ${h.retirada ? 'text-principal/70 line-through' : 'text-principal'}`} key={`${h.tipo}-${h.creada_en}`}>
                {h.fecha === dia.fecha
                  ? t(`incidencias.historialLinea.${h.tipo}`, {
                      minutos: h.minutos,
                      fechaNueva: h.fecha_nueva ? fecha(h.fecha_nueva) : '',
                      n: h.afectadas,
                    })
                  : t('incidencias.historialLinea.llegada', { fecha: fecha(h.fecha), n: h.afectadas })}
                <span className="block text-chica text-principal/70">
                  {t('incidencias.por', {
                    quien: h.creada_por ?? '—',
                    cuando: new Intl.DateTimeFormat(i18n.language, {
                      timeZone: 'America/Los_Angeles',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(h.creada_en)),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {vigente && <AvisarPorWhatsApp fecha={dia.fecha} incidencia={vigente} key={`${vigente.tipo}-${recarga}`} />}
    </section>
  )
}

const llaveAvisadas = (fecha) => `cajita-avisados-${fecha}`

function leerAvisadas(fecha) {
  try {
    return new Set(JSON.parse(localStorage.getItem(llaveAvisadas(fecha)) ?? '[]'))
  } catch {
    return new Set()
  }
}

/**
 * Mientras se decide el envio automatico (SMS o WhatsApp): un boton por
 * persona que abre WhatsApp con su mensaje ya escrito. Quien avisa marca a
 * quien ya le mando; eso se queda en este telefono.
 */
function AvisarPorWhatsApp({ fecha, incidencia }) {
  const { t } = useTranslation()
  const [abierta, setAbierta] = useState(false)
  const [personas, setPersonas] = useState(null)
  const [error, setError] = useState(null)
  const [avisadas, setAvisadas] = useState(() => leerAvisadas(fecha))

  useEffect(() => {
    if (!abierta) return
    let vivo = true
    personasAAvisar(fecha)
      .then((p) => vivo && setPersonas(p))
      .catch((e) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [abierta, fecha])

  function marcar(codigo) {
    setAvisadas((actual) => {
      const siguiente = new Set(actual)
      siguiente.add(codigo)
      try {
        localStorage.setItem(llaveAvisadas(fecha), JSON.stringify([...siguiente]))
      } catch {
        // Sin almacenamiento: se recuerda solo mientras la pagina este abierta.
      }
      return siguiente
    })
  }

  if (!abierta) {
    return (
      <button
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-bold text-principal transition hover:border-principal"
        onClick={() => setAbierta(true)}
        type="button"
      >
        <FaWhatsapp aria-hidden="true" className="h-5 w-5" />
        {t('incidencias.avisar.ver')}
      </button>
    )
  }

  const origen = typeof window === 'undefined' ? '' : window.location.origin
  const conCita = (personas ?? []).length

  return (
    <div className="space-y-3 rounded-xl bg-principal/5 p-3">
      <h5 className="text-base font-bold text-principal">{t('incidencias.avisar.titulo')}</h5>
      <p className="text-base text-principal/70">{t('incidencias.avisar.ayuda')}</p>

      {error && (
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`incidencias.errores.${error}`, { defaultValue: t('incidencias.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}
      {!error && personas === null && <EsqueletoLista filas={3} texto={t('incidencias.avisar.cargando')} />}
      {personas && conCita === 0 && <p className="text-base">{t('incidencias.avisar.ninguna')}</p>}

      {personas && conCita > 0 && (
        <>
          <p className="text-base font-semibold text-principal">
            {t('incidencias.avisar.cuenta', { avisadas: personas.filter((p) => avisadas.has(p.codigo_corto)).length, total: conCita })}
          </p>
          <ul className="divide-y divide-principal/10">
            {personas.map((p) => {
              const enlace = enlaceWhatsApp(
                p.telefono,
                textoWhatsApp(incidencia, p, {
                  cita: `${origen}/confirmacion/${p.token_qr}`,
                  calendario: `${origen}/calendario`,
                }),
              )
              const ya = avisadas.has(p.codigo_corto)

              return (
                <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={p.codigo_corto}>
                  <span>
                    <span className="block text-base font-semibold text-principal">{p.nombre}</span>
                    <span className="block text-chica text-principal/70">
                      {p.codigo_corto} · {formatearHora(p.hora)} · {p.telefono ?? t('incidencias.avisar.sinTelefono')}
                    </span>
                  </span>
                  {enlace ? (
                    <a
                      className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-base font-bold transition ${
                        ya ? 'border border-puede-pasar/40 text-puede-pasar' : 'bg-marca text-white hover:brightness-110'
                      }`}
                      href={enlace}
                      onClick={() => marcar(p.codigo_corto)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {ya ? <LuCircleCheck aria-hidden="true" className="h-5 w-5" /> : <FaWhatsapp aria-hidden="true" className="h-5 w-5" />}
                      {ya ? t('incidencias.avisar.avisada') : t('incidencias.avisar.boton')}
                    </a>
                  ) : (
                    <span className="text-base text-principal/70">{t('incidencias.avisar.sinTelefono')}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
