import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Campo from './Campo'
import Paginacion from './Paginacion'
import PanelFiltros from './PanelFiltros'
import Selector from './Selector'
import Tarjeta from './Tarjeta'
import { cancelarCitaPanel } from '../datos/citas'
import { formatearHora, horaSanDiego } from '../datos/disponibilidad'
import {
  FILTROS_CITAS,
  SIN_VALOR,
  TAMANOS_PAGINA,
  contarPor,
  cuantosFiltros,
  filtrarCitas,
  hayFiltros,
  hayVacios,
  paginar,
  valoresUnicos,
} from '../datos/filtros'

const ESTADOS = ['reservada', 'llego', 'entregada', 'no_asistio']

const ESTILO_ESTADO = {
  entregada: 'bg-puede-pasar/15 text-puede-pasar',
  reservada: 'bg-principal/10 text-principal/70',
  llego: 'bg-accion/20 text-principal',
  no_asistio: 'bg-ya-recibio/10 text-ya-recibio',
}

/**
 * Las citas de un dia: buscador, filtros y paginas. Desde aqui el
 * administrador cancela las que aun no se usan.
 */
export default function ListaCitas({ citas, fecha, hoy, alCambiar }) {
  const { t } = useTranslation()

  const [filtros, setFiltros] = useState(FILTROS_CITAS)
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(TAMANOS_PAGINA[0])

  // Cancelar desde la lista: la fila que se esta cancelando y su motivo.
  const [cancelando, setCancelando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState(null)
  const [cancelada, setCancelada] = useState(null)

  const filtradas = filtrarCitas(citas, filtros)
  const resultado = paginar(filtradas, pagina, porPagina)
  const porHora = contarPor(citas, 'hora')
  const porEstado = contarPor(citas, 'estado')
  const porCiudad = contarPor(citas, 'ciudad')

  function filtrar(campo, valor) {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }))
    setPagina(1)
    setCancelando(null)
  }

  function limpiar() {
    setFiltros(FILTROS_CITAS)
    setPagina(1)
  }

  async function confirmarCancelacion(cita) {
    setEnviando(true)
    setErrorCancelar(null)

    try {
      await cancelarCitaPanel({ codigo: cita.codigo_corto, fecha, hora: cita.hora, motivo })
      setCancelada(cita.nombre)
      setCancelando(null)
      setMotivo('')
      alCambiar()
    } catch (e) {
      setErrorCancelar(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <div className="scroll-mt-24" id="lista-citas">
        <h2 className="mb-3 text-lg font-bold">{t('panel.citasDelDia', { count: citas.length })}</h2>

        {cancelada && (
          <p
            className="mb-3 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar"
            role="status"
          >
            {t('cancelarPanel.listo', { nombre: cancelada })}
          </p>
        )}

        {citas.length === 0 ? (
          <p className="text-base">{t('panel.sinCitas')}</p>
        ) : (
          <>
            <PanelFiltros
              alLimpiar={limpiar}
              busqueda={
                <Campo
                  autoComplete="off"
                  etiqueta={t('filtros.buscar')}
                  id="buscar-cita"
                  onChange={(e) => filtrar('texto', e.target.value)}
                  placeholder={t('filtros.buscarEjemplo')}
                  type="search"
                  value={filtros.texto}
                />
              }
              columnas="sm:grid-cols-3 xl:grid-cols-5"
              hayFiltros={hayFiltros(filtros)}
              id="filtros-citas"
              ocultos={cuantosFiltros(filtros, ['texto'])}
            >
              <Selector
                activo={filtros.hora !== ''}
                etiqueta={t('filtros.horario')}
                id="filtro-horario"
                onChange={(e) => filtrar('hora', e.target.value)}
                value={filtros.hora}
              >
                <option value="">{t('filtros.todos')}</option>
                {valoresUnicos(citas, 'hora').map((hora) => (
                  <option key={hora} value={hora}>
                    {`${formatearHora(hora)} · ${porHora[hora]}`}
                  </option>
                ))}
              </Selector>

              <Selector
                activo={filtros.estado !== ''}
                etiqueta={t('filtros.estado')}
                id="filtro-estado"
                onChange={(e) => filtrar('estado', e.target.value)}
                value={filtros.estado}
              >
                <option value="">{t('filtros.todos')}</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {`${t(`panel.estado.${estado}`)} · ${porEstado[estado] ?? 0}`}
                  </option>
                ))}
              </Selector>

              <Selector
                activo={filtros.ciudad !== ''}
                etiqueta={t('filtros.ciudad')}
                id="filtro-ciudad"
                onChange={(e) => filtrar('ciudad', e.target.value)}
                value={filtros.ciudad}
              >
                <option value="">{t('filtros.todas')}</option>
                {valoresUnicos(citas, 'ciudad').map((ciudad) => (
                  <option key={ciudad} value={ciudad}>
                    {`${ciudad} · ${porCiudad[ciudad]}`}
                  </option>
                ))}
                {hayVacios(citas, 'ciudad') && <option value={SIN_VALOR}>{t('filtros.sinCiudad')}</option>}
              </Selector>

              {/* La hora en que pasaron (se escaneo su codigo), no la de su cita. */}
              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <Campo
                  etiqueta={t('filtros.pasoDesde')}
                  id="filtro-paso-desde"
                  onChange={(e) => filtrar('desde', e.target.value)}
                  type="time"
                  value={filtros.desde}
                />
                <Campo
                  etiqueta={t('filtros.pasoHasta')}
                  id="filtro-paso-hasta"
                  onChange={(e) => filtrar('hasta', e.target.value)}
                  type="time"
                  value={filtros.hasta}
                />
              </div>
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
                        <th className="py-2 pr-3 font-medium">{t('panel.col.hora')}</th>
                        <th className="py-2 pr-3 font-medium">{t('panel.col.nombre')}</th>
                        <th className="py-2 pr-3 font-medium">{t('panel.col.codigo')}</th>
                        <th className="py-2 pr-3 font-medium">{t('panel.col.estado')}</th>
                        <th className="py-2 pr-3 font-medium">{t('panel.col.paso')}</th>
                        <th className="py-2 pr-3 font-medium">{t('panel.col.ciudad')}</th>
                        <th className="py-2 font-medium">
                          <span className="sr-only">{t('cancelarPanel.columna')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.filas.map((cita) => {
                        const llave = `${cita.codigo_corto}-${cita.hora}`
                        // Solo lo que aun no se usa y de hoy en adelante.
                        const puedeCancelar = cita.estado === 'reservada' && fecha >= hoy

                        return (
                          <Fragment key={llave}>
                            <tr className="border-b border-principal/10 last:border-0">
                              <td className="whitespace-nowrap py-2 pr-3">{formatearHora(cita.hora)}</td>
                              <td className="py-2 pr-3">{cita.nombre}</td>
                              <td className="whitespace-nowrap py-2 pr-3 font-semibold">{cita.codigo_corto}</td>
                              <td className="py-2 pr-3">
                                <span
                                  className={`inline-block whitespace-nowrap rounded-lg px-2 py-1 ${
                                    ESTILO_ESTADO[cita.estado] ?? 'bg-principal/10 text-principal/70'
                                  }`}
                                >
                                  {t(`panel.estado.${cita.estado}`, { defaultValue: cita.estado })}
                                </span>
                              </td>
                              <td className="whitespace-nowrap py-2 pr-3 text-principal/70">
                                {cita.usado_en ? horaSanDiego(cita.usado_en) : '—'}
                              </td>
                              <td className="py-2 pr-3 text-principal/70">{cita.ciudad ?? '—'}</td>
                              <td className="py-2 text-right">
                                {puedeCancelar && cancelando !== llave && (
                                  <button
                                    className="min-h-10 whitespace-nowrap px-2 text-base font-semibold text-ya-recibio underline underline-offset-4"
                                    onClick={() => {
                                      setCancelando(llave)
                                      setMotivo('')
                                      setErrorCancelar(null)
                                      setCancelada(null)
                                    }}
                                    type="button"
                                  >
                                    {t('cancelarPanel.boton')}
                                  </button>
                                )}
                              </td>
                            </tr>

                            {cancelando === llave && (
                              <tr>
                                <td className="pb-3" colSpan={7}>
                                  <div className="space-y-3 rounded-xl border border-ya-recibio/30 bg-ya-recibio/5 p-3">
                                    <p className="text-base font-semibold text-principal">
                                      {t('cancelarPanel.titulo', {
                                        nombre: cita.nombre,
                                        hora: formatearHora(cita.hora),
                                      })}
                                    </p>
                                    <Campo
                                      etiqueta={t('cancelarPanel.motivo')}
                                      id={`motivo-${llave}`}
                                      onChange={(e) => setMotivo(e.target.value)}
                                      value={motivo}
                                    />
                                    {errorCancelar && (
                                      <p
                                        className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio"
                                        role="alert"
                                      >
                                        {t(`citas.errores.${errorCancelar}`, {
                                          defaultValue: t('citas.errores.ERROR_DESCONOCIDO'),
                                        })}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-ya-recibio px-4 text-base font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={enviando}
                                        onClick={() => confirmarCancelacion(cita)}
                                        type="button"
                                      >
                                        {enviando ? t('cancelarPanel.cancelando') : t('cancelarPanel.confirmar')}
                                      </button>
                                      <button
                                        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/25 bg-white px-4 text-base font-bold text-principal transition hover:border-principal"
                                        onClick={() => setCancelando(null)}
                                        type="button"
                                      >
                                        {t('cancelarPanel.volver')}
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
                    setCancelando(null)
                  }}
                  alCambiarPorPagina={(tamano) => {
                    setPorPagina(tamano)
                    setPagina(1)
                  }}
                  ancla="lista-citas"
                  id="citas"
                  porPagina={porPagina}
                  resultado={resultado}
                  totalSinFiltro={citas.length}
                />
              </>
            )}
          </>
        )}
      </div>
    </Tarjeta>
  )
}
