import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import { LuDownload } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import ElegirDiaEntrega from '../../componentes/ElegirDiaEntrega'
import Paginacion from '../../componentes/Paginacion'
import SelectorFila from '../../componentes/SelectorFila'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal } from '../../datos/disponibilidad'
import { fechasDeEntrega, rangoEnFechas } from '../../datos/fechasEntrega'
import { TAMANOS_PAGINA, paginar } from '../../datos/filtros'
import { hoyLocal } from '../../datos/panel'
import { EsqueletoLista } from '../../componentes/Esqueleto'
import {
  COLUMNAS,
  PERIODOS,
  aCsv,
  detalleDelDia,
  nombreArchivoReporte,
  periodoActivo,
  porcentaje,
  rangoDePeriodo,
  reportePorDias,
  totalesReporte,
  validarRango,
} from '../../datos/reportes'

// En pantalla, sin excepciones ni intentos repetidos: van en el CSV.
const COLUMNAS_TABLA = ['capacidad', 'con_cita', 'recibieron', 'no_asistieron', 'pendientes', 'canceladas', 'sin_cita', 'cajas']

function descargarCsv(nombre, texto) {
  // La marca BOM al inicio: sin ella, Excel muestra mal los acentos.
  const url = URL.createObjectURL(new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

//  En el detalle de un dia, a pie se dice distinto: son turnos.
const CUENTAS_DETALLE = ['con_cita', 'recibieron', 'no_asistieron', 'sin_cita', 'con_pase', 'cajas']
const ETIQUETA_A_PIE = { con_cita: 'reportes.detalle.turnos', no_asistieron: 'reportes.detalle.perdieron' }
const ICONO_FILA = { carro: FaCarSide, a_pie: FaPersonWalking }

/**
 * Reportes: cajas entregadas y asistencia por dia, en el periodo que se
 * elija. Es lo que se reporta al banco de alimentos. Solo admin.
 *
 * Lo que mas se pide es el del dia: al entrar se ve el ultimo dia de
 * entrega, con carros y a pie por separado. Cada dia de la tabla tiene su
 * detalle.
 */
export default function Reportes() {
  const { t, i18n } = useTranslation()
  const navegar = useNavigate()
  const hoy = hoyLocal()

  //  Hasta que se escoja otro periodo, el ultimo dia de entrega.
  const [rango, setRango] = useState(() => rangoDePeriodo('ultimoDia', hoy))
  const tocado = useRef(false)
  //  El dia de la tabla con su detalle abierto.
  const [abierto, setAbierto] = useState(null)
  // Juntas es la suma de las dos filas: lo que se reporta al banco.
  const [vistaFila, setVistaFila] = useState('juntas')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(TAMANOS_PAGINA[0])

  // Los dias de entrega, para escoger "desde" y "hasta" de una lista.
  const [fechas, setFechas] = useState(null)

  useEffect(() => {
    let vigente = true

    fechasDeEntrega()
      .then((lista) => {
        if (!vigente) return
        setFechas(lista)
        if (!tocado.current) setRango(rangoDePeriodo('ultimoDia', hoy, lista.map((dia) => dia.fecha)))
      })
      .catch(() => {
        if (vigente) setFechas([])
      })

    return () => {
      vigente = false
    }
  }, [hoy])

  // Los datos guardan de que fechas son: asi no se muestran los de otro periodo.
  const [datos, setDatos] = useState(null)
  const [fallo, setFallo] = useState(null)

  const { desde, hasta } = rango
  const clave = `${desde}|${hasta}|${vistaFila}`
  const errorRango = validarRango(desde, hasta)
  //  Se espera a saber cual fue el ultimo dia de entrega.
  const fechasListas = fechas !== null

  useEffect(() => {
    if (!fechasListas || validarRango(desde, hasta)) return

    let vigente = true
    const pedida = `${desde}|${hasta}|${vistaFila}`

    reportePorDias(desde, hasta, vistaFila)
      .then((filas) => {
        if (vigente) setDatos({ clave: pedida, filas })
      })
      .catch((e) => {
        if (vigente) setFallo({ clave: pedida, codigo: e.message })
      })

    return () => {
      vigente = false
    }
  }, [desde, hasta, vistaFila, fechasListas])

  const filas = !errorRango && datos?.clave === clave ? datos.filas : null
  const error = errorRango ?? (fallo?.clave === clave ? fallo.codigo : null)
  const cargando = !error && filas === null

  const totales = totalesReporte(filas)
  const asistencia = porcentaje(totales.recibieron, totales.recibieron + totales.no_asistieron)
  // "Por venir" solo si el periodo llega a fechas que todavia no pasan.
  const columnas = COLUMNAS_TABLA.filter((columna) => columna !== 'pendientes' || totales.pendientes > 0)
  const resultado = paginar(filas, pagina, porPagina)
  const listaFechas = (fechas ?? []).map((dia) => dia.fecha)
  const activo = periodoActivo(desde, hasta, hoy, listaFechas)
  // "Este mes" va del 1 al 30: en la lista se ve el primer y el ultimo dia
  // de entrega del periodo. La cuenta es la misma.
  const conLista = Boolean(fechas?.length)
  const enLista = rangoEnFechas(rango, (fechas ?? []).map((dia) => dia.fecha))

  function cambiarRango(cambio) {
    tocado.current = true
    setRango((antes) => ({ ...antes, ...cambio }))
    setPagina(1)
  }

  const fechaCorta = (fecha) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(aFechaLocal(fecha))

  function descargar() {
    const encabezados = COLUMNAS.map((columna) => ({ clave: columna, titulo: t(`reportes.col.${columna}`) }))
    const conTotal = [...filas, { ...totales, fecha: t('reportes.total') }]
    descargarCsv(nombreArchivoReporte(desde, hasta, vistaFila), aCsv(conTotal, encabezados))
  }

  const tarjetas = [
    { clave: 'cajas', valor: totales.cajas, destacada: true },
    { clave: 'dias', valor: totales.dias },
    { clave: 'recibieron', valor: totales.recibieron, color: 'text-puede-pasar' },
    { clave: 'sinCita', valor: totales.sin_cita },
    { clave: 'noAsistieron', valor: totales.no_asistieron, color: 'text-ya-recibio' },
    { clave: 'asistencia', valor: asistencia === null ? '—' : `${asistencia}%` },
  ]

  return (
    <div className="space-y-4">
      <Tarjeta>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('reportes.titulo')}</h1>
            <p className="text-base text-principal/70">{t('reportes.ayuda')}</p>
          </div>

          <Boton
            className="md:w-auto md:px-6"
            disabled={!filas || filas.length === 0}
            onClick={descargar}
            variant="secondary"
          >
            <LuDownload aria-hidden="true" className="h-5 w-5" />
            {t('reportes.descargar')}
          </Boton>
        </div>

        <SelectorFila
          alCambiar={(vista) => {
            setVistaFila(vista)
            setPagina(1)
          }}
          className="mt-4"
          valor={vistaFila}
        />

        <div aria-label={t('reportes.periodo')} className="mt-4 flex flex-wrap gap-2" role="group">
          {PERIODOS.map((periodo) => (
            <button
              aria-pressed={activo === periodo}
              className={`min-h-12 rounded-xl border px-4 text-base font-semibold transition ${
                activo === periodo
                  ? 'border-marca bg-marca text-white'
                  : 'border-principal/25 bg-superficie text-principal hover:border-principal'
              }`}
              key={periodo}
              onClick={() => {
                tocado.current = true
                setRango(rangoDePeriodo(periodo, hoy, listaFechas))
                setPagina(1)
              }}
              type="button"
            >
              {t(`reportes.periodos.${periodo}`)}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <ElegirDiaEntrega
            alCambiar={(dia) => cambiarRango({ desde: dia })}
            etiqueta={t('reportes.desde')}
            fechas={fechas}
            flechas={false}
            hoy={hoy}
            id="reporte-desde"
            valor={conLista ? enLista.desde : desde}
          />
          <ElegirDiaEntrega
            alCambiar={(dia) => cambiarRango({ hasta: dia })}
            etiqueta={t('reportes.hasta')}
            fechas={fechas}
            flechas={false}
            hoy={hoy}
            id="reporte-hasta"
            valor={conLista ? enLista.hasta : hasta}
          />
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`reportes.errores.${error}`, { defaultValue: t('reportes.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}
      </Tarjeta>

      {cargando && (
        <Tarjeta>
          <EsqueletoLista filas={5} texto={t('reportes.cargando')} />
        </Tarjeta>
      )}

      {filas && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {tarjetas.map(({ clave: dato, valor, color = 'text-principal', destacada }) => (
              <div
                className={`rounded-2xl p-4 ring-1 ${
                  destacada ? 'bg-marca ring-marca' : 'bg-superficie ring-principal/10'
                }`}
                key={dato}
              >
                <dd className={`text-3xl font-bold ${destacada ? 'text-white' : color}`}>{valor}</dd>
                <dt className={`text-base ${destacada ? 'text-white/85' : 'text-principal/70'}`}>
                  {t(`reportes.totales.${dato}`)}
                </dt>
              </div>
            ))}
          </dl>

          {/* Cuantos dejaron la fila de carros por la de a pie (seccion 42). De
              un solo dia lo dice su detalle, abajo. */}
          {totales.cambios_a_pie > 0 && desde !== hasta && (
            <p className="rounded-xl bg-accion/15 p-3 text-base font-semibold text-principal">
              {t('reportes.cambiosAPie', { count: totales.cambios_a_pie })}
            </p>
          )}

          {/* Un solo dia (el ultimo de entrega, casi siempre): su detalle a la vista. */}
          {desde === hasta && filas.length > 0 && (
            <DetalleDelDia fecha={desde} key={desde} titulo={t('reportes.detalle.titulo', { fecha: fechaCorta(desde) })} />
          )}

          <Tarjeta>
            <div className="scroll-mt-24" id="lista-reporte">
              <h2 className="text-lg font-bold">{t('reportes.porDia')}</h2>
              <p className="mb-3 text-base text-principal/70">{t('reportes.nota')}</p>

              {filas.length === 0 ? (
                <p className="text-base">{t('reportes.sinDatos')}</p>
              ) : (
                <>
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-left text-base">
                      <thead>
                        <tr className="border-b border-principal/15 text-principal/70">
                          <th className="py-2 pr-3 font-medium">{t('reportes.col.fecha')}</th>
                          {columnas.map((columna) => (
                            <th className="whitespace-nowrap py-2 pr-3 text-right font-medium" key={columna}>
                              {t(`reportes.col.${columna}`)}
                            </th>
                          ))}
                          <th className="py-2 font-medium">
                            <span className="sr-only">{t('reportes.verDia')}</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.filas.map((fila) => (
                          <Fragment key={fila.fecha}>
                            <tr className="border-b border-principal/10 last:border-0">
                              <td className="whitespace-nowrap py-2 pr-3 first-letter:uppercase">
                                {fechaCorta(fila.fecha)}
                              </td>
                              {columnas.map((columna) => (
                                <td
                                  className={`py-2 pr-3 text-right tabular-nums ${
                                    columna === 'cajas' ? 'font-bold text-principal' : ''
                                  }`}
                                  key={columna}
                                >
                                  {fila[columna]}
                                </td>
                              ))}
                              <td className="py-2 text-right">
                                <span className="inline-flex">
                                  <button
                                    aria-expanded={abierto === fila.fecha}
                                    className="min-h-10 whitespace-nowrap px-2 text-base font-semibold text-principal underline underline-offset-4"
                                    onClick={() => setAbierto((antes) => (antes === fila.fecha ? null : fila.fecha))}
                                    type="button"
                                  >
                                    {t('reportes.detalle.ver')}
                                  </button>
                                  <button
                                    className="min-h-10 whitespace-nowrap px-2 text-base font-semibold text-principal underline underline-offset-4"
                                    onClick={() => navegar(`/admin?fecha=${fila.fecha}`)}
                                    type="button"
                                  >
                                    {t('reportes.verDia')}
                                  </button>
                                </span>
                              </td>
                            </tr>
                            {abierto === fila.fecha && (
                              <tr>
                                <td className="pb-3" colSpan={columnas.length + 2}>
                                  <DetalleDelDia fecha={fila.fecha} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-principal/20 font-bold">
                          <td className="whitespace-nowrap py-2 pr-3">{t('reportes.total')}</td>
                          {columnas.map((columna) => (
                            <td className="py-2 pr-3 text-right tabular-nums" key={columna}>
                              {totales[columna]}
                            </td>
                          ))}
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <Paginacion
                    alCambiarPagina={setPagina}
                    alCambiarPorPagina={(tamano) => {
                      setPorPagina(tamano)
                      setPagina(1)
                    }}
                    ancla="lista-reporte"
                    id="reporte"
                    porPagina={porPagina}
                    resultado={resultado}
                  />
                </>
              )}
            </div>
          </Tarjeta>
        </>
      )}
    </div>
  )
}

/**
 * Un dia con la fila de carros y la de a pie por separado: con cita (o
 * turnos), recibieron, sin cita, con pase y cajas. Lo que se reporta del dia.
 */
function DetalleDelDia({ fecha, titulo = null }) {
  const { t } = useTranslation()
  const [detalle, setDetalle] = useState(undefined)

  useEffect(() => {
    let vigente = true
    detalleDelDia(fecha)
      .then((datos) => {
        if (vigente) setDetalle(datos)
      })
      .catch(() => {
        if (vigente) setDetalle(null)
      })
    return () => {
      vigente = false
    }
  }, [fecha])

  if (detalle === undefined) return <EsqueletoLista filas={2} texto={t('reportes.detalle.cargando')} />

  if (detalle === null) {
    return (
      <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
        {t('reportes.detalle.error')}
      </p>
    )
  }

  const filasDelDia = [
    ['carro', detalle.carro],
    ['a_pie', detalle.aPie],
  ].filter(([, datos]) => datos)
  const cajas = filasDelDia.reduce((suma, [, datos]) => suma + (Number(datos.cajas) || 0), 0)
  const cambios = Number(detalle.carro?.cambios_a_pie) || 0
  const etiqueta = (fila, cuenta) =>
    fila === 'a_pie' && ETIQUETA_A_PIE[cuenta] ? t(ETIQUETA_A_PIE[cuenta]) : t(`reportes.col.${cuenta}`)

  return (
    <section className="aparecer rounded-2xl bg-principal/5 p-3 ring-1 ring-principal/10">
      {titulo && <h2 className="mb-2 text-lg font-bold first-letter:uppercase">{titulo}</h2>}
      <div className="grid gap-3 sm:grid-cols-2">
        {filasDelDia.map(([fila, datos]) => {
          const Icono = ICONO_FILA[fila]
          return (
            <div className="rounded-xl bg-superficie p-3 ring-1 ring-principal/10" key={fila}>
              <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-principal">
                <Icono aria-hidden="true" className="h-4 w-4 text-accion" />
                {t(`filas.nombre.${fila}`)}
              </h3>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-base">
                {CUENTAS_DETALLE.map((cuenta) => (
                  <Fragment key={cuenta}>
                    <dt className="text-principal/70">{etiqueta(fila, cuenta)}</dt>
                    <dd className={`text-right tabular-nums ${cuenta === 'cajas' ? 'font-bold text-principal' : ''}`}>
                      {Number(datos[cuenta]) || 0}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-base font-semibold text-principal">
        <span>{t('reportes.detalle.cajasDelDia', { cajas })}</span>
        {cambios > 0 && <span>{t('reportes.detalle.cambios', { cambios })}</span>}
      </p>
    </section>
  )
}
