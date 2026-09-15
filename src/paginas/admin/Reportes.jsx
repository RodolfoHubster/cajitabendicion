import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuDownload } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Paginacion from '../../componentes/Paginacion'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal } from '../../datos/disponibilidad'
import { TAMANOS_PAGINA, paginar } from '../../datos/filtros'
import { hoyLocal } from '../../datos/panel'
import {
  COLUMNAS,
  PERIODOS,
  aCsv,
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

/**
 * Reportes: cajas entregadas y asistencia por dia, en el periodo que se
 * elija. Es lo que se reporta al banco de alimentos. Solo admin.
 */
export default function Reportes() {
  const { t, i18n } = useTranslation()
  const navegar = useNavigate()
  const hoy = hoyLocal()

  const [rango, setRango] = useState(() => rangoDePeriodo('esteMes', hoy))
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(TAMANOS_PAGINA[0])

  // Los datos guardan de que fechas son: asi no se muestran los de otro periodo.
  const [datos, setDatos] = useState(null)
  const [fallo, setFallo] = useState(null)

  const { desde, hasta } = rango
  const clave = `${desde}|${hasta}`
  const errorRango = validarRango(desde, hasta)

  useEffect(() => {
    if (validarRango(desde, hasta)) return

    let vigente = true
    const pedida = `${desde}|${hasta}`

    reportePorDias(desde, hasta)
      .then((filas) => {
        if (vigente) setDatos({ clave: pedida, filas })
      })
      .catch((e) => {
        if (vigente) setFallo({ clave: pedida, codigo: e.message })
      })

    return () => {
      vigente = false
    }
  }, [desde, hasta])

  const filas = !errorRango && datos?.clave === clave ? datos.filas : null
  const error = errorRango ?? (fallo?.clave === clave ? fallo.codigo : null)
  const cargando = !error && filas === null

  const totales = totalesReporte(filas)
  const asistencia = porcentaje(totales.recibieron, totales.recibieron + totales.no_asistieron)
  // "Por venir" solo si el periodo llega a fechas que todavia no pasan.
  const columnas = COLUMNAS_TABLA.filter((columna) => columna !== 'pendientes' || totales.pendientes > 0)
  const resultado = paginar(filas, pagina, porPagina)
  const activo = periodoActivo(desde, hasta, hoy)

  function cambiarRango(cambio) {
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
    descargarCsv(nombreArchivoReporte(desde, hasta), aCsv(conTotal, encabezados))
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

        <div aria-label={t('reportes.periodo')} className="mt-4 flex flex-wrap gap-2" role="group">
          {PERIODOS.map((periodo) => (
            <button
              aria-pressed={activo === periodo}
              className={`min-h-12 rounded-xl border px-4 text-base font-semibold transition ${
                activo === periodo
                  ? 'border-principal bg-principal text-white'
                  : 'border-principal/25 bg-white text-principal hover:border-principal'
              }`}
              key={periodo}
              onClick={() => {
                setRango(rangoDePeriodo(periodo, hoy))
                setPagina(1)
              }}
              type="button"
            >
              {t(`reportes.periodos.${periodo}`)}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
          <Campo
            etiqueta={t('reportes.desde')}
            id="reporte-desde"
            onChange={(e) => cambiarRango({ desde: e.target.value })}
            type="date"
            value={desde}
          />
          <Campo
            etiqueta={t('reportes.hasta')}
            id="reporte-hasta"
            onChange={(e) => cambiarRango({ hasta: e.target.value })}
            type="date"
            value={hasta}
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
          <p className="text-base">{t('reportes.cargando')}</p>
        </Tarjeta>
      )}

      {filas && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {tarjetas.map(({ clave: dato, valor, color = 'text-principal', destacada }) => (
              <div
                className={`rounded-2xl p-4 ring-1 ${
                  destacada ? 'bg-principal ring-principal' : 'bg-white ring-principal/10'
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
                          <tr className="border-b border-principal/10 last:border-0" key={fila.fecha}>
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
                              <button
                                className="min-h-10 whitespace-nowrap px-2 text-base font-semibold text-principal underline underline-offset-4"
                                onClick={() => navegar(`/admin?fecha=${fila.fecha}`)}
                                type="button"
                              >
                                {t('reportes.verDia')}
                              </button>
                            </td>
                          </tr>
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
