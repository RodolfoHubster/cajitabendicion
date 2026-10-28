import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCopyX, LuInfo, LuPackageCheck, LuQrCode, LuRotateCcw, LuSearch, LuX } from 'react-icons/lu'
import Boton from './Boton'
import { EsqueletoLista } from './Esqueleto'
import LlegoTarde from './LlegoTarde'
import { dibujarQR } from '../datos/cita'
import {
  buscarTurnos,
  cancelarTurnoRepetido,
  deshacerTurnoRepetido,
  estadoDeTurno,
  haceCuanto,
  horaDeMarca,
  qrDeTurno,
  turnosAPieDeHoy,
} from '../datos/filaAPie'

//  Mientras se busca, la lista se vuelve a pedir si ya tiene mas que esto.
const VIGENCIA_MS = 8000

const COLOR_ESTADO = {
  va: 'text-puede-pasar font-semibold',
  esperando: 'text-principal/80',
  saltado: 'text-principal font-semibold',
  recibio: 'text-ya-recibio font-semibold',
  anulado: 'text-principal/70',
  repetido: 'text-principal/70',
}

const BORDE_ESTADO = {
  va: 'border-puede-pasar',
  esperando: 'border-principal/20',
  saltado: 'border-accion bg-accion/10',
  recibio: 'border-ya-recibio/40 bg-ya-recibio/5',
  anulado: 'border-principal/15 bg-principal/5',
  repetido: 'border-principal/15 bg-principal/5',
}

//  "Turno 2 · María, chamarra roja" -> "María, chamarra roja"; "Turno 2" -> "".
const senaDe = (nombre) => String(nombre ?? '').replace(/^Turno \d+\s*(·\s*)?/, '')

/**
 * A pie, debajo de la camara (seccion 46): buscar un turno de hoy mientras
 * se teclea, por numero de turno o por su codigo, sin salir del escaner.
 * El 15 de octubre de 2026 habia que irse a Citas de hoy para encontrar a
 * alguien por su turno.
 *
 *   Tocar el turno   entrega, si esta esperando. Si lo llamaron y no estaba,
 *                    si ya recibio o si se anulo, abre su detalle.
 *   La "i"           su detalle: codigo, a que hora saco su turno, si lo
 *                    llamaron, si recibio, su QR; y Entregar, Anular o
 *                    Regresar a la fila. Seccion 53: y cancelarlo si la
 *                    misma persona saco otro turno (o regresarlo, si se
 *                    cancelo el equivocado).
 *
 * alCambio: para que la fila de la voluntaria se vuelva a pedir.
 *
 * El codigo solo se ve en el detalle: es lo que prueba de quien es el turno,
 * y la persona de enfrente alcanza a ver la pantalla.
 */
export default function BuscarTurno({ actual = null, version = 0, ocupado = false, alEntregar, alAnular, alRegresar, alCambio }) {
  const { t } = useTranslation()
  const [texto, setTexto] = useState('')
  const [conLetras, setConLetras] = useState(false)
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(null)
  const [pedir, setPedir] = useState(0)
  const pedidaEn = useRef(0)
  const campo = useRef(null)

  //  La lista de hoy: al abrir, cada vez que la fila cambia y, mientras se
  //  busca, si ya es vieja.
  useEffect(() => {
    let vigente = true
    pedidaEn.current = Date.now()
    turnosAPieDeHoy()
      .then((filas) => {
        if (!vigente) return
        setLista(filas)
        setError(null)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [version, pedir])

  function escribir(valor) {
    setTexto(valor)
    setAbierto(null)
    if (Date.now() - pedidaEn.current > VIGENCIA_MS) setPedir((n) => n + 1)
  }

  function limpiar() {
    setTexto('')
    setAbierto(null)
  }

  //  Lo que se hace con un turno deja la busqueda lista para el siguiente.
  function hecho(accion) {
    return (turno) => {
      limpiar()
      accion?.(turno)
    }
  }

  const resultados = buscarTurnos(lista, texto)
  const ayudaId = 'buscar-turno-ayuda'

  return (
    <div className="mt-4 rounded-2xl border-2 border-principal/20 p-3">
      <label className="flex items-center gap-2 text-lg font-bold text-principal" htmlFor="buscar-turno">
        <LuSearch aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
        {t('escaneo.turnos.etiqueta')}
      </label>
      <p className="text-base text-principal/80" id={ayudaId}>
        {t('escaneo.turnos.ayuda')}
      </p>

      <div className="mt-2 flex gap-2">
        <input
          aria-describedby={ayudaId}
          autoComplete="off"
          className="min-h-14 w-0 min-w-0 flex-1 rounded-xl border-2 border-principal/30 bg-superficie px-3 font-titulo text-2xl font-bold text-principal placeholder:text-principal/40 focus:border-principal"
          enterKeyHint="search"
          id="buscar-turno"
          inputMode={conLetras ? 'text' : 'numeric'}
          onChange={(e) => escribir(e.target.value)}
          placeholder={conLetras ? t('escaneo.turnos.ejemploLetras') : t('escaneo.turnos.ejemplo')}
          ref={campo}
          value={texto}
        />
        {texto && (
          <button
            aria-label={t('escaneo.turnos.borrar')}
            className="flex min-h-14 w-12 shrink-0 items-center justify-center rounded-xl border border-principal/30 text-principal"
            onClick={() => {
              limpiar()
              campo.current?.focus()
            }}
            type="button"
          >
            <LuX aria-hidden="true" className="h-6 w-6" />
          </button>
        )}
        {/* El teclado de numeros no tiene letras: para buscar una sena. */}
        <button
          aria-label={conLetras ? t('escaneo.turnos.conNumeros') : t('escaneo.turnos.conLetras')}
          aria-pressed={conLetras}
          className="flex min-h-14 shrink-0 items-center justify-center rounded-xl border border-principal/30 px-3 text-base font-bold text-principal"
          onClick={() => {
            setConLetras((antes) => !antes)
            campo.current?.focus()
          }}
          type="button"
        >
          {conLetras ? '123' : 'ABC'}
        </button>
      </div>

      {error && (
        <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`escaneo.errores.${error}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}
      {texto && lista === null && !error && (
        <div className="mt-2">
          <EsqueletoLista filas={2} texto={t('escaneo.turnos.cargando')} />
        </div>
      )}
      {texto && lista !== null && resultados.length === 0 && (
        <p className="mt-2 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
          {t('escaneo.turnos.nada')}
        </p>
      )}

      {resultados.length > 0 && (
        <ul aria-live="polite" className="mt-2 space-y-2">
          {resultados.map((fila) => {
            const estado = estadoDeTurno(fila, actual)
            const directo = estado === 'esperando' || estado === 'va'
            const sena = senaDe(fila.nombre)
            const marca = { saltado: fila.saltado_en, recibio: fila.entregado_en, anulado: fila.anulado_en, repetido: fila.repetido_en }[
              estado
            ]
            const verDetalle = () => setAbierto((antes) => (antes === fila.turno ? null : fila.turno))

            return (
              <li className={`aparecer overflow-hidden rounded-xl border-2 ${BORDE_ESTADO[estado]}`} key={fila.turno}>
                <div className="flex items-stretch">
                  <button
                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 p-3 text-left disabled:opacity-60"
                    disabled={ocupado && directo}
                    onClick={directo ? () => hecho(alEntregar)(fila.turno) : verDetalle}
                    type="button"
                  >
                    <span className="w-16 shrink-0 text-center font-titulo text-4xl font-bold leading-none text-principal">
                      {fila.turno}
                    </span>
                    <span className="min-w-0 flex-1">
                      {sena && <span className="block truncate text-base font-semibold text-principal">{sena}</span>}
                      <span className={`block text-base ${COLOR_ESTADO[estado]}`}>
                        {t(`escaneo.turnos.estado.${estado}`, {
                          hora: horaDeMarca(marca),
                          hace: marca ? haceCuanto(t, marca) : '',
                        })}
                      </span>
                      {directo && (
                        <span className="mt-0.5 flex items-center gap-1 text-chica font-semibold text-principal/80">
                          <LuPackageCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-accion" />
                          {t('escaneo.turnos.tocaParaEntregar')}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    aria-expanded={abierto === fila.turno}
                    aria-label={t('escaneo.turnos.verDetalle', { turno: fila.turno })}
                    className="flex w-14 shrink-0 items-center justify-center border-l border-principal/15 text-principal hover:bg-principal/5"
                    onClick={verDetalle}
                    type="button"
                  >
                    <LuInfo aria-hidden="true" className="h-7 w-7" />
                  </button>
                </div>

                {abierto === fila.turno && (
                  <DetalleTurno
                    alAnular={hecho(alAnular)}
                    alEntregar={hecho(alEntregar)}
                    alCambio={() => {
                      setPedir((n) => n + 1)
                      alCambio?.()
                    }}
                    alRegresar={hecho(alRegresar)}
                    estado={estado}
                    fila={fila}
                    ocupado={ocupado}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** El detalle de un turno: sus datos, su QR y lo que se puede hacer con el. */
function DetalleTurno({ fila, estado, ocupado, alEntregar, alAnular, alRegresar, alCambio }) {
  const { t } = useTranslation()
  const [qr, setQr] = useState(null)
  const [errorQr, setErrorQr] = useState(null)
  const vivo = estado === 'esperando' || estado === 'va' || estado === 'saltado'
  //  Turno repetido (seccion 53): null, o el turno con el que se queda mientras se pregunta.
  const [repetido, setRepetido] = useState(null)
  const [haciendo, setHaciendo] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [errorRepetido, setErrorRepetido] = useState(null)

  async function hacerRepetido(accion, texto) {
    setHaciendo(true)
    setErrorRepetido(null)
    try {
      await accion()
      setRepetido(null)
      setAviso(texto)
      alCambio()
    } catch (e) {
      setErrorRepetido(e.message)
    } finally {
      setHaciendo(false)
    }
  }

  async function alternarQr() {
    if (qr) {
      setQr(null)
      return
    }
    setErrorQr(null)
    try {
      setQr(await dibujarQR(await qrDeTurno(fila.turno), 'a_pie'))
    } catch (e) {
      setErrorQr(e.message)
    }
  }

  const datos = [
    ['codigo', <span className="font-titulo text-xl font-bold" key="c">{fila.codigo_corto}</span>],
    ['sacado', horaDeMarca(fila.sacado_en)],
    fila.dado_por && ['dadoPor', <span className="break-all" key="d">{fila.dado_por}</span>],
    fila.saltado_en && ['llamado', `${horaDeMarca(fila.saltado_en)} · ${haceCuanto(t, fila.saltado_en)}`],
    fila.entregado_en && ['recibio', horaDeMarca(fila.entregado_en)],
    fila.anulado_en && ['anulado', horaDeMarca(fila.anulado_en)],
    fila.repetido_en && ['cancelado', horaDeMarca(fila.repetido_en)],
    fila.repetido_en && fila.se_queda && ['seQueda', <span className="font-titulo text-xl font-bold" key="q">{fila.se_queda}</span>],
  ].filter(Boolean)

  return (
    <div className="space-y-3 border-t border-principal/15 bg-superficie p-3">
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-base text-principal">
        {datos.map(([clave, valor]) => (
          <div className="contents" key={clave}>
            <dt className="text-principal/70">{t(`escaneo.turnos.${clave}`)}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {vivo && <p className="text-chica text-principal/80">{t('escaneo.turnos.comparaCodigo')}</p>}

      {estado === 'saltado' && (
        <LlegoTarde
          alAnular={() => alAnular(fila.turno)}
          alEntregar={() => alEntregar(fila.turno)}
          ocupado={ocupado}
          saltadoEn={fila.saltado_en}
          turno={fila.turno}
        />
      )}

      {(estado === 'esperando' || estado === 'va') && (
        <Boton disabled={ocupado} onClick={() => alEntregar(fila.turno)}>
          <LuPackageCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
          {t('escaneo.registrarEntrega')}
        </Boton>
      )}

      <div className="flex flex-wrap gap-x-4">
        {estado === 'saltado' && (
          <button
            className="inline-flex min-h-12 items-center gap-2 text-base font-semibold text-principal underline underline-offset-4 disabled:opacity-60"
            disabled={ocupado}
            onClick={() => alRegresar(fila.turno)}
            type="button"
          >
            <LuRotateCcw aria-hidden="true" className="h-5 w-5 text-accion" />
            {t('filaTurnos.regresar')}
          </button>
        )}
        {vivo && (
          <button
            aria-expanded={Boolean(qr)}
            className="inline-flex min-h-12 items-center gap-2 text-base font-semibold text-principal underline underline-offset-4"
            onClick={alternarQr}
            type="button"
          >
            <LuQrCode aria-hidden="true" className="h-5 w-5 text-accion" />
            {qr ? t('escaneo.turnos.ocultarQr') : t('escaneo.turnos.verQr')}
          </button>
        )}
      </div>

      {/* La misma persona saco otro turno: se cancela este y se queda con el otro. */}
      {vivo && repetido === null && (
        <button
          className="inline-flex min-h-12 items-center gap-2 text-base font-semibold text-ya-recibio underline underline-offset-4 disabled:opacity-60"
          disabled={ocupado || haciendo}
          onClick={() => {
            setAviso(null)
            setRepetido('')
          }}
          type="button"
        >
          <LuCopyX aria-hidden="true" className="h-5 w-5" />
          {t('escaneo.turnos.repetido.boton')}
        </button>
      )}
      {vivo && repetido !== null && (
        <div className="space-y-3 rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-3" role="alertdialog">
          <p className="text-base font-semibold text-principal">{t('escaneo.turnos.repetido.pregunta', { turno: fila.turno })}</p>
          <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor={`se-queda-${fila.turno}`}>
            {t('escaneo.turnos.repetido.seQueda')}
            <input
              className="min-h-12 w-32 rounded-xl border border-principal/25 bg-superficie px-3 font-titulo text-xl font-bold text-principal outline-none focus:border-principal"
              id={`se-queda-${fila.turno}`}
              inputMode="numeric"
              onChange={(e) => setRepetido(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="12"
              value={repetido}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-50"
              disabled={haciendo}
              onClick={() =>
                hacerRepetido(
                  () => cancelarTurnoRepetido(fila.turno, repetido),
                  t('escaneo.turnos.repetido.listo', { turno: fila.turno }),
                )
              }
              type="button"
            >
              {t('escaneo.turnos.repetido.si', { turno: fila.turno })}
            </button>
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold text-principal"
              onClick={() => setRepetido(null)}
              type="button"
            >
              {t('escaneo.turnos.repetido.no')}
            </button>
          </div>
        </div>
      )}
      {/* Se cancelo el equivocado: regresa a la fila, esperando. */}
      {estado === 'repetido' && (
        <button
          className="inline-flex min-h-12 items-center gap-2 text-base font-semibold text-principal underline underline-offset-4 disabled:opacity-60"
          disabled={ocupado || haciendo}
          onClick={() =>
            hacerRepetido(() => deshacerTurnoRepetido(fila.turno), t('escaneo.turnos.repetido.regresado', { turno: fila.turno }))
          }
          type="button"
        >
          <LuRotateCcw aria-hidden="true" className="h-5 w-5 text-accion" />
          {t('escaneo.turnos.repetido.regresar')}
        </button>
      )}
      {aviso && (
        <p className="rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
          {aviso}
        </p>
      )}
      {errorRepetido && (
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`escaneo.errores.${errorRepetido}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      {qr && (
        <img
          alt={t('escaneo.turnos.qrAlt', { turno: fila.turno })}
          className="aparecer mx-auto w-full max-w-[14rem] rounded-xl border-4 border-accion bg-white p-2"
          src={qr}
        />
      )}
      {errorQr && (
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`escaneo.errores.${errorQr}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}
    </div>
  )
}
