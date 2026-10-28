import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuClipboardCheck,
  LuClipboardList,
  LuDoorOpen,
  LuLogIn,
  LuLogOut,
  LuSearch,
  LuSlidersHorizontal,
  LuUndo2,
  LuUserCheck,
} from 'react-icons/lu'
import AjustesVoluntarios from './AjustesVoluntarios'
import LectorQR from './LectorQR'
import PasarListaVoluntarios from './PasarListaVoluntarios'
import Tarjeta from './Tarjeta'
import { EsqueletoLista } from './Esqueleto'
import { ahoraSanDiego, formatearHora } from '../datos/disponibilidad'
import { horaDeMarca } from '../datos/filaAPie'
import { avisoDetente, avisoLeido, avisoValido, prepararSonido } from '../datos/sonido'
import {
  asistenciasDelDia,
  buscarVoluntarios,
  cerrarDiaVoluntarios,
  deshacerAsistencia,
  esCredencial,
  esQrDeCita,
  horaParaCerrar,
  marcarAsistencia,
  resumenDeHoy,
  salidaTemprana,
  textoDuracion,
} from '../datos/voluntarios'

//  "Deshacer" se ve el primer minuto (la base lo acepta hasta los 2).
const MS_DESHACER = 60_000

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold text-principal transition hover:border-principal disabled:opacity-50'

const BOTON_FUERTE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-marca px-4 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-50'

const ESTILO = {
  ENTRADA: 'border-puede-pasar bg-puede-pasar/10',
  SALIDA: 'border-principal bg-principal/5',
  YA_ENTRO: 'border-principal/30 bg-principal/5',
  YA_SALIO: 'border-principal/30 bg-principal/5',
  INACTIVO: 'border-ya-recibio bg-ya-recibio/10',
  NO_EXISTE: 'border-ya-recibio bg-ya-recibio/10',
}

const ahoraCorta = () => ahoraSanDiego().slice(11, 16)

/** '2026-10-18' -> 'sábado 18 de octubre'. */
function diaLargo(fecha, idioma) {
  return new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
}

/** El titulo del resultado. En modo solo la entrada, volver a escanear no es un error. */
function tituloResultado(t, resultado, soloEntrada) {
  if (soloEntrada && resultado === 'YA_ENTRO') return t('voluntarios.resultado.yaAnotado')
  if (soloEntrada && resultado === 'YA_SALIO') return t('voluntarios.resultado.yaVino')
  return t(`voluntarios.resultado.${resultado}`)
}

/**
 * El dia de los voluntarios (secciones 48, 49 y 52): cuantos hay adentro,
 * cuantos vinieron y cuantos de los de siempre faltan; el escaner de su
 * credencial; pasar lista para los que no escanearon; y la lista de hoy.
 *
 * Seccion 52: de arranque se escanea SOLO la entrada (escanear otra vez no
 * lo saca) y la salida se pone sola a la hora de salida de siempre; quien
 * se va antes, "Se fue temprano". En el modo "entrada y salida", si ya
 * entro, el escaneo es su salida, como antes.
 *
 * voluntarios: la lista. ajustes: { modo, hora_salida }. esAdmin: puede
 * cambiar los ajustes. alCambiar: para que se vuelva a pedir la lista.
 * alCambiarAjustes(nuevos).
 */
export default function EntradaSalidaVoluntarios({ voluntarios, alCambiar, ajustes, esAdmin, alCambiarAjustes }) {
  const { t, i18n } = useTranslation()
  const soloEntrada = ajustes.modo === 'solo_entrada'
  //  'escanear' o 'lista' (pasar lista).
  const [vista, setVista] = useState('escanear')
  const [viendoAjustes, setViendoAjustes] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const [deshecho, setDeshecho] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [hoy, setHoy] = useState(null)
  const [version, setVersion] = useState(0)
  //  Terminar el dia (seccion 49): a que hora, y que paso.
  const [cerrando, setCerrando] = useState(false)
  const [horaCierre, setHoraCierre] = useState('')
  const [cerrado, setCerrado] = useState(null)
  //  Se fue temprano (seccion 52): { id, hora } mientras se pregunta la hora.
  const [temprano, setTemprano] = useState(null)

  //  El bip necesita un primer toque en la pagina (los navegadores lo piden).
  useEffect(() => {
    const preparar = () => prepararSonido()
    document.addEventListener('pointerdown', preparar, { once: true })
    return () => document.removeEventListener('pointerdown', preparar)
  }, [])

  useEffect(() => {
    let vigente = true
    asistenciasDelDia()
      .then((lista) => {
        if (vigente) setHoy(lista)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [version])

  useEffect(() => {
    if (!puedeDeshacer) return undefined
    const reloj = setTimeout(() => setPuedeDeshacer(false), MS_DESHACER)
    return () => clearTimeout(reloj)
  }, [puedeDeshacer, resultado])

  const recargar = useCallback(() => {
    setVersion((n) => n + 1)
    alCambiar?.()
  }, [alCambiar])

  const marcar = useCallback(
    async (cual) => {
      setOcupado(true)
      setError(null)
      setDeshecho(null)
      setPuedeDeshacer(false)
      try {
        const respuesta = await marcarAsistencia(cual)
        setResultado(respuesta)
        if (respuesta?.resultado === 'ENTRADA' || respuesta?.resultado === 'SALIDA') {
          avisoValido()
          setPuedeDeshacer(true)
        } else if (respuesta?.resultado === 'YA_ENTRO' || respuesta?.resultado === 'YA_SALIO') {
          avisoLeido()
        } else {
          avisoDetente()
        }
        setBusqueda('')
        recargar()
      } catch (e) {
        setResultado(null)
        setError(e.message)
        avisoDetente()
      } finally {
        setOcupado(false)
      }
    },
    [recargar],
  )

  //  Un QR que no es credencial ni se pregunta: se dice que es.
  const alLeer = useCallback(
    (texto) => {
      if (!esCredencial(texto)) {
        avisoDetente()
        setError(null)
        setPuedeDeshacer(false)
        setResultado({ resultado: 'NO_EXISTE', deCita: esQrDeCita(texto) })
        return
      }
      marcar({ token: texto })
    },
    [marcar],
  )

  async function hacer(accion) {
    setOcupado(true)
    setError(null)
    try {
      return await accion()
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setOcupado(false)
    }
  }

  async function deshacer() {
    const respuesta = await hacer(() => deshacerAsistencia(resultado.asistencia_id))
    if (!respuesta) return
    setDeshecho(respuesta)
    setResultado(null)
    setPuedeDeshacer(false)
    recargar()
  }

  async function cerrarDia() {
    const cuantos = await hacer(() => cerrarDiaVoluntarios(horaCierre))
    if (cuantos === null) return
    setCerrado({ cuantos, hora: formatearHora(horaCierre) })
    setCerrando(false)
    recargar()
  }

  async function ponerSalidaTemprana() {
    const ahora = ahoraCorta()
    const minutos = await hacer(() => salidaTemprana(temprano.id, temprano.hora >= ahora ? null : temprano.hora))
    if (minutos === null) return
    setTemprano(null)
    recargar()
  }

  const activos = (voluntarios ?? []).filter((v) => v.activo)
  const encontrados = buscarVoluntarios(activos, busqueda, 6)
  const resumen = resumenDeHoy(voluntarios, hoy)

  const tarjetaResumen = (
    <Tarjeta>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['adentro', resumen.adentro, LuDoorOpen, 'text-puede-pasar'],
          ['vinieron', resumen.vinieron, LuUserCheck, 'text-principal'],
          ['faltan', resumen.faltan, LuClipboardList, 'text-principal'],
        ].map(([clave, numero, Icono, color]) => {
          const contenido = (
            <>
              <dt className="flex flex-col items-center gap-1 text-base leading-tight text-principal/80">
                <Icono aria-hidden="true" className="h-5 w-5 shrink-0" />
                {t(`voluntarios.resumen.${clave}`)}
              </dt>
              <dd className={`font-titulo text-3xl font-bold ${color}`}>{hoy === null ? '…' : numero}</dd>
            </>
          )
          //  "Faltan" abre pasar lista: ahi estan, arriba.
          return clave === 'faltan' && numero > 0 && vista !== 'lista' ? (
            <button
              className="rounded-xl bg-accion/15 p-2 ring-1 ring-accion/40 transition hover:bg-accion/25"
              key={clave}
              onClick={() => setVista('lista')}
              type="button"
            >
              {contenido}
            </button>
          ) : (
            <div className="rounded-xl bg-principal/5 p-2" key={clave}>
              {contenido}
            </div>
          )
        })}
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base text-principal/80">
          {soloEntrada
            ? t('voluntarios.modo.soloEntrada', { hora: formatearHora(ajustes.hora_salida ?? '18:30') })
            : t('voluntarios.modo.entradaSalida')}
        </p>
        {esAdmin && !viendoAjustes && (
          <button className={BOTON} onClick={() => setViendoAjustes(true)} type="button">
            <LuSlidersHorizontal aria-hidden="true" className="h-5 w-5" />
            {t('voluntarios.modo.cambiar')}
          </button>
        )}
      </div>
      {viendoAjustes && (
        <div className="mt-3">
          <AjustesVoluntarios
            ajustes={ajustes}
            alCerrar={() => setViendoAjustes(false)}
            alGuardar={(nuevos) => {
              setViendoAjustes(false)
              alCambiarAjustes(nuevos)
              recargar()
            }}
          />
        </div>
      )}
    </Tarjeta>
  )

  return (
    <div className="space-y-4">
      {tarjetaResumen}

      {vista === 'lista' ? (
        <PasarListaVoluntarios alCambiar={recargar} alVolver={() => setVista('escanear')} hoy={hoy} voluntarios={voluntarios} />
      ) : (
        <Tarjeta>
          <h2 className="text-xl font-bold">{t('voluntarios.entrada.titulo')}</h2>
          <p className="mb-3 text-base text-principal/70">
            {soloEntrada ? t('voluntarios.entrada.ayudaSoloEntrada') : t('voluntarios.entrada.ayuda')}
          </p>

          <LectorQR activo alLeer={alLeer} olvidar={5000} />

          <div aria-live="polite" className="mt-4 space-y-3">
            {resultado && (
              <div className={`aparecer rounded-xl border-2 p-4 ${ESTILO[resultado.resultado] ?? ESTILO.NO_EXISTE}`}>
                <p className="flex items-center gap-2 text-2xl font-bold text-principal">
                  {resultado.resultado === 'ENTRADA' && <LuLogIn aria-hidden="true" className="h-7 w-7 text-puede-pasar" />}
                  {resultado.resultado === 'SALIDA' && <LuLogOut aria-hidden="true" className="h-7 w-7" />}
                  {tituloResultado(t, resultado.resultado, soloEntrada)}
                </p>
                {resultado.nombre && <p className="mt-1 text-xl font-bold text-principal">{resultado.nombre}</p>}
                <p className="mt-1 text-base text-principal">
                  {resultado.resultado === 'NO_EXISTE'
                    ? t(resultado.deCita ? 'voluntarios.resultado.esCita' : 'voluntarios.resultado.noEsCredencial')
                    : resultado.resultado === 'INACTIVO'
                      ? t('voluntarios.resultado.inactivoAyuda')
                      : resultado.salida_en
                        ? t('voluntarios.resultado.entroSalio', {
                            entrada: horaDeMarca(resultado.entrada_en),
                            salida: horaDeMarca(resultado.salida_en),
                            duracion: textoDuracion(t, resultado.minutos),
                          })
                        : t('voluntarios.resultado.entro', { hora: horaDeMarca(resultado.entrada_en) })}
                </p>
                {resultado.olvido && (
                  <p className="mt-2 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
                    {t('voluntarios.resultado.olvido', { dia: diaLargo(resultado.olvido, i18n.language) })}
                  </p>
                )}
                {puedeDeshacer && (
                  <button className={`${BOTON} mt-3`} disabled={ocupado} onClick={deshacer} type="button">
                    <LuUndo2 aria-hidden="true" className="h-5 w-5" />
                    {t('voluntarios.deshacer')}
                  </button>
                )}
              </div>
            )}

            {deshecho && (
              <p className="rounded-xl bg-principal/5 p-3 text-base font-semibold text-principal" role="status">
                {t(`voluntarios.deshecho.${deshecho}`)}
              </p>
            )}

            {error && (
              <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
                {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
              </p>
            )}
          </div>

          {/* Los que llegaron y no escanearon: todos de una vez. */}
          <button
            className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-accion bg-accion/10 px-4 text-lg font-bold text-principal transition hover:bg-accion/20"
            onClick={() => setVista('lista')}
            type="button"
          >
            <LuClipboardCheck aria-hidden="true" className="h-6 w-6 text-accion" />
            {t('voluntarios.pasarLista.abrir')}
          </button>

          {/* Quien no trae su credencial (o se le acabo la pila): por nombre. */}
          <div className="mt-5 border-t border-principal/10 pt-4">
            <label className="block text-base font-semibold text-principal" htmlFor="buscar-voluntario">
              {t('voluntarios.entrada.sinCredencial')}
            </label>
            <div className="relative mt-2">
              <LuSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-principal/70" />
              <input
                autoComplete="off"
                className="min-h-14 w-full rounded-xl border border-principal/25 bg-superficie pl-11 pr-4 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
                id="buscar-voluntario"
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t('voluntarios.entrada.buscarEjemplo')}
                type="search"
                value={busqueda}
              />
            </div>
            {busqueda.trim() && (
              <ul className="mt-2 space-y-2">
                {encontrados.length === 0 && (
                  <li className="rounded-xl bg-principal/5 p-3 text-base text-principal">{t('voluntarios.entrada.nadie')}</li>
                )}
                {encontrados.map((v) => (
                  <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-principal/15 p-3" key={v.id}>
                    <span className="min-w-0">
                      <span className="block font-semibold text-principal">{v.nombre}</span>
                      {v.dentro_desde && (
                        <span className="text-base text-principal/70">
                          {t('voluntarios.adentroDesde', { hora: horaDeMarca(v.dentro_desde) })}
                        </span>
                      )}
                    </span>
                    {/* En modo solo la entrada, quien ya esta adentro no tiene boton. */}
                    {!(soloEntrada && v.dentro_desde) && (
                      <button className={BOTON_FUERTE} disabled={ocupado} onClick={() => marcar({ voluntario: v.id })} type="button">
                        {v.dentro_desde ? <LuLogOut aria-hidden="true" className="h-5 w-5" /> : <LuLogIn aria-hidden="true" className="h-5 w-5" />}
                        {v.dentro_desde ? t('voluntarios.marcarSalida') : t('voluntarios.marcarEntrada')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Tarjeta>
      )}

      <Tarjeta>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">{t('voluntarios.hoy.titulo')}</h2>
          {hoy && <p className="text-base font-semibold text-puede-pasar">{t('voluntarios.hoy.adentro', { count: resumen.adentro })}</p>}
        </div>
        {/* Al terminar: la salida de los que siguen adentro (si no, en modo
            solo la entrada, se pone sola a la hora de salida). */}
        {resumen.adentro > 0 && !cerrando && (
          <button
            className={`${BOTON} mt-3`}
            disabled={ocupado}
            onClick={() => {
              setCerrado(null)
              setHoraCierre(horaParaCerrar(ajustes, ahoraCorta()))
              setCerrando(true)
            }}
            type="button"
          >
            <LuLogOut aria-hidden="true" className="h-5 w-5" />
            {t('voluntarios.cierre.boton')}
          </button>
        )}
        {cerrando && (
          <div className="mt-3 space-y-3 rounded-xl border-2 border-accion bg-accion/10 p-3" role="group">
            <label className="flex flex-wrap items-center gap-3 text-base font-semibold text-principal" htmlFor="hora-cierre">
              {t('voluntarios.cierre.pregunta')}
              <input
                className="min-h-12 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal"
                id="hora-cierre"
                onChange={(e) => setHoraCierre(e.target.value)}
                type="time"
                value={horaCierre}
              />
            </label>
            <p className="text-base text-principal/80">
              {t('voluntarios.cierre.ayuda')}
              {soloEntrada && ` ${t('voluntarios.cierre.solaALas', { hora: formatearHora(ajustes.hora_salida ?? '18:30') })}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button className={BOTON_FUERTE} disabled={ocupado || !horaCierre} onClick={cerrarDia} type="button">
                {t('voluntarios.cierre.confirmar', { count: resumen.adentro })}
              </button>
              <button className={BOTON} onClick={() => setCerrando(false)} type="button">
                {t('voluntarios.lista.cancelar')}
              </button>
            </div>
          </div>
        )}
        {cerrado && (
          <p className="mt-3 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
            {cerrado.cuantos > 0
              ? t('voluntarios.cierre.listo', { count: cerrado.cuantos, hora: cerrado.hora })
              : t('voluntarios.cierre.ninguno')}
          </p>
        )}

        {hoy === null ? (
          <div className="mt-3">
            <EsqueletoLista filas={3} texto={t('voluntarios.cargando')} />
          </div>
        ) : hoy.length === 0 ? (
          <p className="mt-2 text-base text-principal/70">{t('voluntarios.hoy.nadie')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-principal/10">
            {hoy.map((a) => (
              <li className="py-3" key={a.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-principal">{a.nombre}</span>
                    <span className="text-base text-principal/80">
                      {a.salida
                        ? t('voluntarios.resultado.entroSalio', {
                            entrada: horaDeMarca(a.entrada),
                            salida: horaDeMarca(a.salida),
                            duracion: textoDuracion(t, a.minutos),
                          })
                        : t('voluntarios.resultado.entro', { hora: horaDeMarca(a.entrada) })}
                    </span>
                    {(a.origen === 'lista' || a.origen === 'nombre' || a.salida_automatica) && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {(a.origen === 'lista' || a.origen === 'nombre') && (
                          <span className="rounded-full bg-principal/10 px-2.5 py-0.5 text-chica text-principal">
                            {t(`voluntarios.origen.${a.origen}`)}
                          </span>
                        )}
                        {a.salida_automatica && (
                          <span className="rounded-full bg-principal/10 px-2.5 py-0.5 text-chica text-principal">
                            {t('voluntarios.origen.salidaSola')}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  {a.estado === 'dentro' && temprano?.id !== a.id ? (
                    soloEntrada ? (
                      <button
                        className={BOTON}
                        disabled={ocupado}
                        onClick={() => setTemprano({ id: a.id, hora: ahoraCorta() })}
                        type="button"
                      >
                        <LuLogOut aria-hidden="true" className="h-5 w-5" />
                        {t('voluntarios.temprano.boton')}
                      </button>
                    ) : (
                      <button className={BOTON} disabled={ocupado} onClick={() => marcar({ voluntario: a.voluntario_id })} type="button">
                        <LuLogOut aria-hidden="true" className="h-5 w-5" />
                        {t('voluntarios.marcarSalida')}
                      </button>
                    )
                  ) : a.estado === 'sin_salida' ? (
                    <span className="rounded-full bg-accion/25 px-3 py-1 text-base font-semibold text-principal">
                      {t('voluntarios.estado.sin_salida')}
                    </span>
                  ) : null}
                </div>

                {temprano?.id === a.id && (
                  <div className="mt-2 space-y-3 rounded-xl border-2 border-accion bg-accion/10 p-3" role="group">
                    <label className="flex flex-wrap items-center gap-3 text-base font-semibold text-principal" htmlFor={`temprano-${a.id}`}>
                      {t('voluntarios.temprano.pregunta')}
                      <input
                        className="min-h-12 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal"
                        id={`temprano-${a.id}`}
                        onChange={(e) => setTemprano({ ...temprano, hora: e.target.value })}
                        type="time"
                        value={temprano.hora}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button className={BOTON_FUERTE} disabled={ocupado || !temprano.hora} onClick={ponerSalidaTemprana} type="button">
                        {t('voluntarios.temprano.confirmar')}
                      </button>
                      <button className={BOTON} onClick={() => setTemprano(null)} type="button">
                        {t('voluntarios.lista.cancelar')}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
