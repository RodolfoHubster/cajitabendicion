import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Campo from './Campo'
import Paginacion from './Paginacion'
import PanelFiltros from './PanelFiltros'
import Selector from './Selector'
import Tarjeta from './Tarjeta'
import { anularEntradaSinCita, entradasSinCitaDelDia } from '../datos/citas'
import { horaSanDiego } from '../datos/disponibilidad'
import { filtrarPorFila } from '../datos/filas'
import { EsqueletoLista } from './Esqueleto'
import {
  FILTROS_SIN_CITA,
  SIN_VALOR,
  TAMANOS_PAGINA,
  contarPor,
  cuantosFiltros,
  filtrarSinCita,
  hayFiltros,
  hayVacios,
  paginar,
  valoresUnicos,
} from '../datos/filtros'

/**
 * Quien entro sin cita un dia: nombre, codigo de comprobante, quien lo anoto
 * y a que hora. Las anuladas siguen en la lista, marcadas, con quien las anulo.
 * Con buscador, filtros (hora, quien anoto, si cuenta) y paginas.
 */
export default function ListaSinCita({ fecha, recarga, alCambiar, vistaFila = 'juntas' }) {
  const { t } = useTranslation()

  // Los datos guardan de que fecha son, para no mostrar los de otro dia.
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [anulando, setAnulando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [errorAnular, setErrorAnular] = useState(null)

  const [filtros, setFiltros] = useState(FILTROS_SIN_CITA)
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(TAMANOS_PAGINA[0])

  useEffect(() => {
    let vigente = true

    entradasSinCitaDelDia(fecha)
      .then((filas) => {
        if (!vigente) return
        setDatos({ fecha, filas })
        setError(null)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })

    return () => {
      vigente = false
    }
  }, [fecha, recarga])

  const filas = datos?.fecha === fecha ? datos.filas : null
  const todas = filtrarPorFila(filas, vistaFila)
  const cuentan = todas.filter((fila) => !fila.anulada).length
  const filtradas = filtrarSinCita(todas, filtros)
  const resultado = paginar(filtradas, pagina, porPagina)
  const porAnotador = contarPor(todas, 'anotado_por')

  function filtrar(campo, valor) {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }))
    setPagina(1)
    setAnulando(null)
  }

  function limpiar() {
    setFiltros(FILTROS_SIN_CITA)
    setPagina(1)
  }

  async function anular(fila) {
    setOcupado(true)
    setErrorAnular(null)

    try {
      await anularEntradaSinCita(fila.codigo, fecha)
      setAnulando(null)
      alCambiar?.()
    } catch (e) {
      setErrorAnular(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Tarjeta>
      <div className="scroll-mt-24" id="lista-sin-cita">
        <h2 className="text-lg font-bold">
          {t('sinCita.lista')} {filas && `(${cuentan})`}
        </h2>
        <p className="mb-3 text-base text-principal/70">{t('sinCita.listaAyuda')}</p>

        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}

        {!error && filas === null && <EsqueletoLista filas={2} texto={t('sinCita.cargando')} />}
        {filas && filas.length === 0 && <p className="text-base">{t('sinCita.sinEntradas')}</p>}

        {filas && filas.length > 0 && (
          <>
            <PanelFiltros
              alLimpiar={limpiar}
              busqueda={
                <Campo
                  autoComplete="off"
                  etiqueta={t('filtros.buscar')}
                  id="buscar-sin-cita"
                  onChange={(e) => filtrar('texto', e.target.value)}
                  placeholder={t('filtros.buscarEjemploSinCita')}
                  type="search"
                  value={filtros.texto}
                />
              }
              columnas="sm:grid-cols-2 lg:grid-cols-4"
              hayFiltros={hayFiltros(filtros)}
              id="filtros-sin-cita"
              ocultos={cuantosFiltros(filtros, ['texto'])}
            >
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <Campo
                  etiqueta={t('filtros.anotadaDesde')}
                  id="filtro-anotada-desde"
                  onChange={(e) => filtrar('desde', e.target.value)}
                  type="time"
                  value={filtros.desde}
                />
                <Campo
                  etiqueta={t('filtros.anotadaHasta')}
                  id="filtro-anotada-hasta"
                  onChange={(e) => filtrar('hasta', e.target.value)}
                  type="time"
                  value={filtros.hasta}
                />
              </div>

              <Selector
                activo={filtros.anotadoPor !== ''}
                etiqueta={t('filtros.anotoPor')}
                id="filtro-anoto"
                onChange={(e) => filtrar('anotadoPor', e.target.value)}
                value={filtros.anotadoPor}
              >
                <option value="">{t('filtros.todos')}</option>
                {valoresUnicos(todas, 'anotado_por').map((correo) => (
                  <option key={correo} value={correo}>
                    {`${correo} · ${porAnotador[correo]}`}
                  </option>
                ))}
                {hayVacios(todas, 'anotado_por') && <option value={SIN_VALOR}>{t('filtros.sinDato')}</option>}
              </Selector>

              <Selector
                activo={filtros.estado !== ''}
                etiqueta={t('filtros.estado')}
                id="filtro-cuenta"
                onChange={(e) => filtrar('estado', e.target.value)}
                value={filtros.estado}
              >
                <option value="">{`${t('filtros.todas')} · ${todas.length}`}</option>
                <option value="cuentan">{`${t('filtros.cuentan')} · ${cuentan}`}</option>
                <option value="anuladas">{`${t('filtros.anuladas')} · ${todas.length - cuentan}`}</option>
              </Selector>
            </PanelFiltros>

            {filtradas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-principal/25 p-4 text-center">
                <p className="text-base">{t('filtros.sinResultados')}</p>
                <button
                  className="mt-2 min-h-12 px-2 text-base font-semibold text-principal underline underline-offset-4"
                  onClick={limpiar}
                  type="button"
                >
                  {t('filtros.limpiar')}
                </button>
              </div>
            ) : (
              <>
                <div className="relative overflow-x-auto">
                  <table className="w-full text-left text-base">
                    <thead>
                      <tr className="border-b border-principal/15 text-principal/70">
                        <th className="py-2 pr-3 font-medium">{t('sinCita.col.hora')}</th>
                        <th className="py-2 pr-3 font-medium">{t('sinCita.col.nombre')}</th>
                        <th className="py-2 pr-3 font-medium">{t('sinCita.col.codigo')}</th>
                        <th className="py-2 pr-3 font-medium">{t('sinCita.col.anoto')}</th>
                        <th className="py-2 font-medium">{t('sinCita.col.estado')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.filas.map((fila) => {
                        const llave = fila.codigo ?? fila.registrado_en

                        return (
                          <Fragment key={llave}>
                            <tr
                              className={`border-b border-principal/10 last:border-0 ${
                                fila.anulada ? 'text-principal/70' : ''
                              }`}
                            >
                              <td className="whitespace-nowrap py-2 pr-3">{horaSanDiego(fila.registrado_en)}</td>
                              <td className={`py-2 pr-3 ${fila.anulada ? 'line-through' : ''}`}>
                                {fila.nombre ?? t('sinCita.sinNombre')}
                              </td>
                              <td className="whitespace-nowrap py-2 pr-3 font-semibold">{fila.codigo ?? '—'}</td>
                              <td className="py-2 pr-3">{fila.anotado_por ?? '—'}</td>
                              <td className="py-2">
                                {fila.anulada ? (
                                  <span className="text-ya-recibio">
                                    {t('sinCita.anuladaEstado')}
                                    <span className="block text-principal/70">
                                      {t('sinCita.anuladaPor', {
                                        quien: fila.anulada_por ?? '—',
                                        hora: horaSanDiego(fila.anulada_en),
                                      })}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="flex flex-wrap items-center gap-x-3">
                                    <span className="rounded-lg bg-puede-pasar/15 px-2 py-1 text-puede-pasar">
                                      {t('sinCita.vigente')}
                                    </span>
                                    {/* Las anotadas antes del codigo no se pueden identificar para anular. */}
                                    {fila.codigo && anulando !== llave && (
                                      <button
                                        className="min-h-10 font-semibold text-ya-recibio underline underline-offset-4"
                                        onClick={() => {
                                          setAnulando(llave)
                                          setErrorAnular(null)
                                        }}
                                        type="button"
                                      >
                                        {t('sinCita.anular')}
                                      </button>
                                    )}
                                  </span>
                                )}
                              </td>
                            </tr>

                            {anulando === llave && (
                              <tr>
                                <td className="pb-3" colSpan={5}>
                                  <div className="space-y-2 rounded-xl border border-ya-recibio/30 bg-ya-recibio/5 p-3">
                                    <p className="text-base font-semibold text-principal">
                                      {t('sinCita.preguntaAnular', { nombre: fila.nombre ?? fila.codigo })}
                                    </p>
                                    {errorAnular && (
                                      <p
                                        className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio"
                                        role="alert"
                                      >
                                        {t(`citas.errores.${errorAnular}`, {
                                          defaultValue: t('citas.errores.ERROR_DESCONOCIDO'),
                                        })}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-60"
                                        disabled={ocupado}
                                        onClick={() => anular(fila)}
                                        type="button"
                                      >
                                        {t('sinCita.confirmarAnular')}
                                      </button>
                                      <button
                                        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/25 bg-superficie px-4 text-base font-bold text-principal"
                                        onClick={() => setAnulando(null)}
                                        type="button"
                                      >
                                        {t('sinCita.noAnular')}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <Paginacion
                  alCambiarPagina={(numero) => {
                    setPagina(numero)
                    setAnulando(null)
                  }}
                  alCambiarPorPagina={(tamano) => {
                    setPorPagina(tamano)
                    setPagina(1)
                  }}
                  ancla="lista-sin-cita"
                  id="sin-cita"
                  porPagina={porPagina}
                  resultado={resultado}
                  totalSinFiltro={todas.length}
                />
              </>
            )}
          </>
        )}
      </div>
    </Tarjeta>
  )
}
