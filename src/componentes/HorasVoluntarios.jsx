import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCalendarPlus, LuChevronDown, LuDownload, LuFileText, LuPlus } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import AnotarDiaVoluntarios from './AnotarDiaVoluntarios'
import Campo from './Campo'
import Selector from './Selector'
import Tarjeta from './Tarjeta'
import { EsqueletoLista } from './Esqueleto'
import { horaDeMarca } from '../datos/filaAPie'
import { hoyLocal } from '../datos/panel'
import { descargarCsv } from '../datos/reportes'
import {
  agregarAsistencia,
  anularAsistencia,
  asistenciasDeVoluntario,
  corregirAsistencia,
  csvDeHoras,
  horasDeVoluntarios,
  nombreArchivoHoras,
  problemaAsistencia,
  rangoDelMes,
  textoDuracion,
} from '../datos/voluntarios'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-3 text-base font-semibold text-principal transition hover:border-principal disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_FUERTE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-marca px-4 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'

const ENTRADA_FECHA =
  'min-h-12 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal'

/** '2026-10-18' -> 'sáb 18 oct'. */
function diaCorto(fecha, idioma) {
  return new Intl.DateTimeFormat(idioma, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
}

const aCampo = (marca) => (marca ? String(marca).slice(0, 16) : '')

function AvisoError({ codigo }) {
  const { t } = useTranslation()
  return (
    <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
      {t(`voluntarios.errores.${codigo}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
    </p>
  )
}

/**
 * Entrada, salida y motivo, para corregir una asistencia o agregar una que
 * no se escaneo. Las horas son de San Diego ('2026-10-20T09:00').
 */
function FormaHoras({ id, inicial, alGuardar, alCancelar, ocupado, boton }) {
  const { t } = useTranslation()
  const [valor, setValor] = useState(inicial)
  const problema = problemaAsistencia(valor)

  return (
    <form
      className="mt-2 space-y-3 rounded-xl border border-principal/15 p-3"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!problema) alGuardar(valor)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor={`${id}-entrada`}>
          {t('voluntarios.horas.entrada')}
          <input
            className={ENTRADA_FECHA}
            id={`${id}-entrada`}
            onChange={(e) => setValor({ ...valor, entrada: e.target.value })}
            type="datetime-local"
            value={valor.entrada}
          />
        </label>
        <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor={`${id}-salida`}>
          {t('voluntarios.horas.salida')}
          <input
            className={ENTRADA_FECHA}
            id={`${id}-salida`}
            onChange={(e) => setValor({ ...valor, salida: e.target.value })}
            type="datetime-local"
            value={valor.salida}
          />
        </label>
      </div>
      <Campo
        etiqueta={t('voluntarios.horas.motivo')}
        id={`${id}-motivo`}
        maxLength={200}
        onChange={(e) => setValor({ ...valor, motivo: e.target.value })}
        placeholder={t('voluntarios.horas.motivoEjemplo')}
        value={valor.motivo}
      />
      {problema === 'HORAS_INVALIDAS' && valor.entrada && valor.salida && (
        <p className="text-base font-semibold text-ya-recibio">{t('voluntarios.errores.HORAS_INVALIDAS')}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={BOTON_FUERTE} disabled={ocupado || Boolean(problema)} type="submit">
          {boton}
        </button>
        <button className={BOTON} onClick={alCancelar} type="button">
          {t('voluntarios.lista.cancelar')}
        </button>
      </div>
    </form>
  )
}

/** Cada asistencia de un voluntario en el rango, con corregir y anular. */
function DetalleVoluntario({ voluntarioId, desde, hasta, alCambiar }) {
  const { t, i18n } = useTranslation()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  //  { id, accion: 'corregir' | 'anular' } mientras se hace.
  const [abierta, setAbierta] = useState(null)
  const [motivoAnular, setMotivoAnular] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    asistenciasDeVoluntario(voluntarioId, desde, hasta)
      .then((filas) => {
        if (vigente) setLista(filas)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [voluntarioId, desde, hasta, version])

  async function hacer(accion) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
      setAbierta(null)
      setMotivoAnular('')
      setVersion((n) => n + 1)
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (lista === null && !error) return <EsqueletoLista filas={2} texto={t('voluntarios.cargando')} />

  return (
    <div className="mt-2 space-y-2">
      {error && <AvisoError codigo={error} />}
      {/* Para la escuela (servicio comunitario): una hoja con el total y la firma. */}
      <Link className={BOTON} to={`/admin/voluntarios/constancia/${voluntarioId}?desde=${desde}&hasta=${hasta}`}>
        <LuFileText aria-hidden="true" className="h-5 w-5 text-accion" />
        {t('voluntarios.horas.constancia')}
      </Link>
      <ul className="space-y-2">
        {(lista ?? []).map((a) => (
          <li className={`rounded-xl border p-3 ${a.estado === 'anulada' ? 'border-principal/10 opacity-70' : 'border-principal/15'}`} key={a.id}>
            <p className="font-semibold text-principal">
              <span className={a.estado === 'anulada' ? 'line-through' : ''}>
                {diaCorto(a.fecha, i18n.language)} ·{' '}
                {a.salida
                  ? `${horaDeMarca(a.entrada)} – ${horaDeMarca(a.salida)} · ${textoDuracion(t, a.minutos)}`
                  : t('voluntarios.resultado.entro', { hora: horaDeMarca(a.entrada) })}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {a.estado !== 'salio' && (
                <span
                  className={`rounded-full px-3 py-0.5 text-base font-semibold ${
                    a.estado === 'sin_salida' ? 'bg-accion/25 text-principal' : 'bg-principal/10 text-principal'
                  }`}
                >
                  {t(`voluntarios.estado.${a.estado}`)}
                </span>
              )}
              {a.corregida && a.estado !== 'anulada' && (
                <span className="rounded-full bg-principal/10 px-3 py-0.5 text-base text-principal">
                  {a.origen === 'dia_pasado' || a.origen === 'agregada' ? t('voluntarios.origen.aMano') : t('voluntarios.horas.corregida')}
                </span>
              )}
              {a.salida_automatica && a.estado === 'salio' && !a.corregida && (
                <span className="rounded-full bg-principal/10 px-3 py-0.5 text-base text-principal">
                  {t('voluntarios.origen.salidaSola')}
                </span>
              )}
              {a.origen === 'lista' && (
                <span className="rounded-full bg-principal/10 px-3 py-0.5 text-base text-principal">
                  {t('voluntarios.origen.lista')}
                </span>
              )}
            </div>
            {a.motivo && <p className="mt-1 text-base text-principal/70">{t('voluntarios.horas.porque', { motivo: a.motivo })}</p>}

            {a.estado !== 'anulada' && abierta?.id !== a.id && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={BOTON} onClick={() => setAbierta({ id: a.id, accion: 'corregir' })} type="button">
                  {a.estado === 'sin_salida' ? t('voluntarios.horas.ponerSalida') : t('voluntarios.horas.corregir')}
                </button>
                <button className={`${BOTON} text-ya-recibio`} onClick={() => setAbierta({ id: a.id, accion: 'anular' })} type="button">
                  {t('voluntarios.horas.anular')}
                </button>
              </div>
            )}

            {abierta?.id === a.id && abierta.accion === 'corregir' && (
              <FormaHoras
                alCancelar={() => setAbierta(null)}
                alGuardar={(valor) => hacer(() => corregirAsistencia(a.id, valor))}
                boton={t('voluntarios.horas.guardar')}
                id={`corregir-${a.id}`}
                inicial={{ entrada: aCampo(a.entrada), salida: aCampo(a.salida), motivo: '' }}
                ocupado={ocupado}
              />
            )}

            {abierta?.id === a.id && abierta.accion === 'anular' && (
              <div className="mt-2 space-y-3 rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-3" role="alertdialog">
                <p className="text-base font-semibold">{t('voluntarios.horas.anularPregunta')}</p>
                <Campo
                  etiqueta={t('voluntarios.horas.motivo')}
                  id={`anular-${a.id}`}
                  maxLength={200}
                  onChange={(e) => setMotivoAnular(e.target.value)}
                  value={motivoAnular}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex min-h-12 items-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-50"
                    disabled={ocupado || !motivoAnular.trim()}
                    onClick={() => hacer(() => anularAsistencia(a.id, motivoAnular))}
                    type="button"
                  >
                    {t('voluntarios.horas.siAnular')}
                  </button>
                  <button className={BOTON} onClick={() => setAbierta(null)} type="button">
                    {t('voluntarios.lista.cancelar')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Las horas de los voluntarios entre dos fechas (el mes, de arranque): por
 * persona, los dias y las horas completas, y las que se quedaron sin salida
 * para corregir. Se descargan para Excel (cartas de servicio comunitario).
 *
 * Seccion 52: anotar un dia que no se escaneo a varios a la vez.
 */
export default function HorasVoluntarios({ voluntarios, alCambiar, horaSalida = null }) {
  const { t } = useTranslation()
  const hoy = hoyLocal()
  const [rango, setRango] = useState(() => rangoDelMes(hoy))
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [agregando, setAgregando] = useState(false)
  const [anotandoDia, setAnotandoDia] = useState(false)
  const [quien, setQuien] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    if (!rango.desde || !rango.hasta || rango.hasta < rango.desde) return undefined
    horasDeVoluntarios(rango.desde, rango.hasta)
      .then((resultado) => {
        if (!vigente) return
        setFilas(resultado)
        setError(null)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [rango, version])

  function recargar() {
    setVersion((n) => n + 1)
    alCambiar()
  }

  async function agregar(valor) {
    setOcupado(true)
    setError(null)
    try {
      await agregarAsistencia(quien, valor)
      setAgregando(false)
      setQuien('')
      recargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  function descargar() {
    descargarCsv(
      nombreArchivoHoras(rango.desde, rango.hasta),
      csvDeHoras(filas, {
        nombre: t('voluntarios.horas.col.nombre'),
        dias: t('voluntarios.horas.col.dias'),
        horas: t('voluntarios.horas.col.horas'),
        sinSalida: t('voluntarios.horas.col.sinSalida'),
      }),
    )
  }

  const total = (filas ?? []).reduce((suma, f) => suma + (f.minutos ?? 0), 0)
  const activos = (voluntarios ?? []).filter((v) => v.activo)

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h2 className="text-xl font-bold">{t('voluntarios.horas.titulo')}</h2>
        <p className="mb-3 text-base text-principal/70">{t('voluntarios.horas.ayuda')}</p>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor="horas-desde">
            {t('voluntarios.horas.desde')}
            <input
              className={ENTRADA_FECHA}
              id="horas-desde"
              max={hoy}
              onChange={(e) => setRango({ ...rango, desde: e.target.value })}
              type="date"
              value={rango.desde}
            />
          </label>
          <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor="horas-hasta">
            {t('voluntarios.horas.hasta')}
            <input
              className={ENTRADA_FECHA}
              id="horas-hasta"
              max={hoy}
              onChange={(e) => setRango({ ...rango, hasta: e.target.value })}
              type="date"
              value={rango.hasta}
            />
          </label>
        </div>

        {error && (
          <div className="mt-3">
            <AvisoError codigo={error} />
          </div>
        )}

        {filas === null && !error ? (
          <div className="mt-3">
            <EsqueletoLista texto={t('voluntarios.cargando')} />
          </div>
        ) : (
          filas && (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-lg font-bold text-principal">
                  {t('voluntarios.horas.total', { count: filas.length, duracion: textoDuracion(t, total) })}
                </p>
                {filas.length > 0 && (
                  <button className={BOTON} onClick={descargar} type="button">
                    <LuDownload aria-hidden="true" className="h-5 w-5 text-accion" />
                    {t('voluntarios.horas.descargar')}
                  </button>
                )}
              </div>

              {filas.length === 0 ? (
                <p className="mt-2 text-base text-principal/70">{t('voluntarios.horas.nadie')}</p>
              ) : (
                <ul className="mt-3 divide-y divide-principal/10">
                  {filas.map((f) => (
                    <li className="py-2" key={f.voluntario_id}>
                      <button
                        aria-expanded={abierto === f.voluntario_id}
                        className="flex min-h-12 w-full items-center justify-between gap-2 text-left"
                        onClick={() => setAbierto(abierto === f.voluntario_id ? null : f.voluntario_id)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-principal">{f.nombre}</span>
                          <span className="text-base text-principal/80">
                            {t('voluntarios.horas.renglon', { count: f.dias, duracion: textoDuracion(t, f.minutos) })}
                          </span>
                          {f.sin_salida > 0 && (
                            <span className="ml-2 rounded-full bg-accion/25 px-2 py-0.5 text-base font-semibold text-principal">
                              {t('voluntarios.lista.sinSalida', { count: f.sin_salida })}
                            </span>
                          )}
                        </span>
                        <LuChevronDown
                          aria-hidden="true"
                          className={`h-5 w-5 shrink-0 text-principal transition ${abierto === f.voluntario_id ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {abierto === f.voluntario_id && (
                        <DetalleVoluntario alCambiar={recargar} desde={rango.desde} hasta={rango.hasta} voluntarioId={f.voluntario_id} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        )}
      </Tarjeta>

      {/* Un dia que no se escaneo, a varios de una vez (seccion 52). */}
      <Tarjeta>
        {anotandoDia ? (
          <AnotarDiaVoluntarios
            alCambiar={recargar}
            alCerrar={() => setAnotandoDia(false)}
            horaSalida={horaSalida}
            voluntarios={voluntarios}
          />
        ) : (
          <div className="space-y-2">
            <button
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-accion bg-accion/10 px-4 text-lg font-bold text-principal transition hover:bg-accion/20"
              onClick={() => {
                setAgregando(false)
                setAnotandoDia(true)
              }}
              type="button"
            >
              <LuCalendarPlus aria-hidden="true" className="h-6 w-6 text-accion" />
              {t('voluntarios.dia.abrir')}
            </button>
            <p className="text-base text-principal/80">{t('voluntarios.dia.abrirAyuda')}</p>
          </div>
        )}
      </Tarjeta>

      {/* Vino y no se escaneo (olvido su credencial y nadie lo busco). */}
      <Tarjeta>
        {agregando ? (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">{t('voluntarios.horas.agregarTitulo')}</h2>
            <Selector
              etiqueta={t('voluntarios.horas.quien')}
              id="agregar-quien"
              onChange={(e) => setQuien(e.target.value)}
              value={quien}
            >
              <option value="">{t('voluntarios.horas.escoge')}</option>
              {activos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </Selector>
            {quien && (
              <FormaHoras
                alCancelar={() => setAgregando(false)}
                alGuardar={agregar}
                boton={t('voluntarios.horas.agregar')}
                id="agregar"
                inicial={{ entrada: `${hoy}T09:00`, salida: `${hoy}T13:00`, motivo: '' }}
                ocupado={ocupado}
              />
            )}
            {!quien && (
              <button className={BOTON} onClick={() => setAgregando(false)} type="button">
                {t('voluntarios.lista.cancelar')}
              </button>
            )}
          </div>
        ) : (
          <button className={BOTON} onClick={() => setAgregando(true)} type="button">
            <LuPlus aria-hidden="true" className="h-5 w-5 text-accion" />
            {t('voluntarios.horas.agregarBoton')}
          </button>
        )}
      </Tarjeta>
    </div>
  )
}
