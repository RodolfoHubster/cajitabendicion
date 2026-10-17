import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaPersonWalking } from 'react-icons/fa6'
import { LuBan, LuFlag, LuKeyRound, LuPackageCheck, LuSearch, LuUndo2, LuUserPlus } from 'react-icons/lu'
import { Hueso } from './Esqueleto'
import { ConfirmarAnular } from './LlegoTarde'
import useCadaRato from './useCadaRato'
import { formatearHora } from '../datos/disponibilidad'
import { MAXIMO_SENA, darTurnoSinTelefono } from '../datos/turnoAPie'
import {
  CADA_MS_VOLUNTARIA,
  esSinLimite,
  filaDeTurnos,
  haceCuanto,
  numeroDeTurno,
  saltarTurno,
  terminarFilaAPie,
} from '../datos/filaAPie'
import {
  alCambiarVoces,
  guardarAnuncio,
  hablar,
  leerAnuncio,
  puedeHablar,
  turnoParaAnunciar,
  vocesDelIdioma,
} from '../datos/voz'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-3 text-base font-bold text-principal transition hover:border-principal disabled:opacity-60'

const BOTON_CHICO =
  'inline-flex min-h-12 items-center gap-1 px-2 text-base font-semibold text-principal underline underline-offset-4 disabled:opacity-60'

/**
 * La fila a pie en vivo, en el telefono de la voluntaria, debajo de la
 * camara. El turno que va y sus botones estan arriba de la camara
 * (TurnoQueVa); aqui va lo demas, lo que se usa de vez en cuando:
 *
 *   - dar turno nuevo a quien no tiene telefono (nombre o sena, opcional)
 *   - entregar un turno sin QR, por su numero (perdio su pagina)
 *   - los que siguen y los que no se presentaron: si llegan a los pocos
 *     minutos se les entrega; si tardaron, se anula su turno (seccion 46)
 *   - comprobar el codigo de un turno, las cuentas, la voz, terminar la fila
 *
 * Se vuelve a pedir cada pocos segundos, y de inmediato cuando cambia
 * `version` (se acaba de entregar o de saltar).
 *
 * alActualizar(datos): la pantalla de escaneo pinta el turno que va.
 * alBuscar(): lleva a la busqueda de turnos. alEntregarTurno(turno): entrega
 * sin QR y muestra el resultado arriba, como un escaneo. alAnularTurno(turno):
 * anula su turno y lo dice arriba (seccion 46).
 *
 * Los turnos sin datos llegan SIN su codigo (seccion 43 de la base): el
 * codigo es lo unico que prueba de quien es el turno.
 */
export default function PanelTurnos({
  version = 0,
  alActualizar,
  alBuscar,
  alEntregarTurno,
  alAnularTurno,
  ocupadoFuera = false,
}) {
  const { t, i18n } = useTranslation()
  const [datos, setDatos] = useState(undefined)
  const [sinConexion, setSinConexion] = useState(false)
  //  Lo que fallo al preguntar por la fila (se quita solo en la siguiente
  //  vuelta) y lo que fallo al tocar un boton (se queda hasta el siguiente).
  const [errorFila, setErrorFila] = useState(null)
  const [error, setError] = useState(null)
  const [ocupadoAqui, setOcupado] = useState(false)
  const ocupado = ocupadoAqui || ocupadoFuera
  const [cambios, setCambios] = useState(0)

  //  Turno nuevo para quien no tiene telefono: el formulario se abre al tocar.
  const [dandoTurno, setDandoTurno] = useState(false)
  const [sena, setSena] = useState('')
  //  El que se le acaba de dar: { turno, codigo, nombre }.
  const [turnoDado, setTurnoDado] = useState(null)

  //  Entregar sin QR, por numero.
  const [numeroSinQr, setNumeroSinQr] = useState('')
  //  El turno que se esta por anular (pregunta antes).
  const [anulando, setAnulando] = useState(null)
  const [preguntandoTerminar, setPreguntandoTerminar] = useState(false)

  //  Anunciar cada turno en voz alta, solo, con la voz que se escoja. Se
  //  recuerda en este telefono.
  const [anuncio, setAnuncio] = useState(() => leerAnuncio())
  //  El telefono carga sus voces poco a poco: cuando avisa, se vuelve a pintar.
  const [, setVocesCargadas] = useState(0)
  const voces = vocesDelIdioma(i18n.language)
  const anunciado = useRef(null)

  useEffect(() => alCambiarVoces(() => setVocesCargadas((n) => n + 1)), [])

  function decirTurno(turno, voz = anuncio.voz) {
    //  Dos veces: en la calle, la primera se pierde.
    const frase = t('filaTurnos.frase', { turno })
    hablar(`${frase}. ${frase}.`, i18n.language, globalThis.window, { voz })
  }

  function cambiarAnuncio(cambio) {
    const nuevo = { ...anuncio, ...cambio }
    setAnuncio(nuevo)
    guardarAnuncio(nuevo)
    //  Al prenderlo (o cambiar de voz) se dice el que va: asi se oye como
    //  suena, y el telefono da permiso de hablar solo (lo pide con un toque).
    const turno = datos?.actual?.turno
    if (nuevo.activo && Number.isInteger(turno)) {
      anunciado.current = turno
      decirTurno(turno, nuevo.voz)
    }
  }

  useCadaRato(
    async () => {
      try {
        const nuevos = await filaDeTurnos()
        setDatos(nuevos)
        const turno = turnoParaAnunciar(anunciado.current, nuevos?.actual?.turno ?? null)
        if (turno !== null) {
          //  La primera vez solo se toma nota: no se grita al abrir la pantalla.
          if (anuncio.activo && anunciado.current !== null) decirTurno(turno)
          anunciado.current = turno
        }
        setSinConexion(false)
        setErrorFila(null)
        alActualizar?.(nuevos)
      } catch (e) {
        if (e.message === 'SIN_CONEXION') setSinConexion(true)
        else setErrorFila(e.message)
        setDatos((antes) => (antes === undefined ? null : antes))
      }
    },
    CADA_MS_VOLUNTARIA,
    { clave: `${version}-${cambios}` },
  )

  async function correr(accion) {
    setOcupado(true)
    setError(null)
    try {
      await accion()
      setCambios((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  function darTurno() {
    correr(async () => {
      setTurnoDado(await darTurnoSinTelefono(sena))
      setSena('')
      setDandoTurno(false)
    })
  }

  function terminar(siTerminar = true) {
    setPreguntandoTerminar(false)
    correr(() => terminarFilaAPie(siTerminar))
  }

  function entregarPorNumero(evento) {
    evento.preventDefault()
    const turno = numeroDeTurno(numeroSinQr)
    if (!turno) return
    setNumeroSinQr('')
    alEntregarTurno?.(turno)
  }

  if (datos === undefined) {
    return (
      <div className="space-y-3" role="status">
        <span className="sr-only">{t('filaTurnos.cargando')}</span>
        <Hueso className="h-6 w-40" />
        <Hueso className="h-24 w-full" />
        <Hueso className="h-16 w-full" />
      </div>
    )
  }

  const encabezado = (
    <h2 className="flex items-center gap-2 text-lg font-bold text-principal">
      <FaPersonWalking aria-hidden="true" className="h-5 w-5 text-accion" />
      {t('filaTurnos.titulo')}
    </h2>
  )

  if (!datos) {
    return (
      <div>
        {encabezado}
        <p className="mt-2 rounded-xl bg-principal/5 p-3 text-base text-principal">{t('filaTurnos.noHay')}</p>
        {(errorFila || error) && <AvisoError error={errorFila || error} />}
      </div>
    )
  }

  const siguientes = datos.siguientes ?? []
  const saltados = datos.saltados ?? []

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {encabezado}
        <p className="text-chica text-principal/70">
          {t('filaTurnos.empieza', { hora: formatearHora(datos.hora) })}
        </p>
      </div>

      {sinConexion && (
        <p className="mt-2 rounded-xl bg-accion/15 p-2 text-base text-principal" role="status">
          {t('filaTurnos.sinConexion')}
        </p>
      )}

      {/* La fila ya termino: quien esperaba lo ve en su telefono. */}
      {datos.terminada && (
        <div className="mt-3 rounded-xl border-2 border-principal/30 bg-principal/5 p-3" role="status">
          <p className="flex items-center gap-2 text-lg font-bold text-principal">
            <LuFlag aria-hidden="true" className="h-5 w-5 shrink-0" />
            {t('filaTurnos.terminar.terminada')}
          </p>
          <button className={BOTON_CHICO} disabled={ocupado} onClick={() => terminar(false)} type="button">
            <LuUndo2 aria-hidden="true" className="h-4 w-4" />
            {t('filaTurnos.terminar.deshacer')}
          </button>
        </div>
      )}

      {/* El codigo del dia, para decirlo en la entrada (o escribirlo en el pizarron). */}
      {datos.codigo_dia && !datos.terminada && (
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-dashed border-accion bg-accion/10 px-3 py-2 text-base font-semibold text-principal">
          <span className="inline-flex items-center gap-2">
            <LuKeyRound aria-hidden="true" className="h-5 w-5 text-accion" />
            {t('filaTurnos.codigoDia')}
          </span>
          <span className="font-titulo text-3xl font-bold tracking-[0.3em]">{datos.codigo_dia}</span>
        </p>
      )}

      {error && <AvisoError error={error} />}

      {/* Turno nuevo para quien no tiene telefono: su numero y su codigo, en grande,
          para que le tome foto o se lo apunte en un papel. */}
      {turnoDado && (
        <div className="aparecer mt-3 rounded-2xl border-4 border-puede-pasar bg-puede-pasar/10 p-4 text-center" role="status">
          <p className="text-base font-bold uppercase tracking-wide text-principal/80">{t('filaTurnos.sinTelefono.dado')}</p>
          <p className="font-titulo text-6xl font-bold leading-none text-principal">{turnoDado.turno}</p>
          <p className="mt-1 font-titulo text-2xl font-bold tracking-wide text-principal">{turnoDado.codigo}</p>
          {turnoDado.nombre && /·/.test(turnoDado.nombre) && (
            <p className="mt-1 text-base font-semibold text-principal">{turnoDado.nombre.split('·').slice(1).join('·').trim()}</p>
          )}
          <p className="mt-2 text-base text-principal">{t('filaTurnos.sinTelefono.ayuda')}</p>
          <button className={`${BOTON} mt-3`} onClick={() => setTurnoDado(null)} type="button">
            {t('filaTurnos.sinTelefono.listo')}
          </button>
        </div>
      )}

      {!datos.terminada && !turnoDado && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {dandoTurno ? (
            <form
              className="rounded-xl border-2 border-principal/15 p-3 sm:col-span-2"
              onSubmit={(evento) => {
                evento.preventDefault()
                darTurno()
              }}
            >
              <label className="block text-base font-semibold text-principal" htmlFor="sena-sin-telefono">
                {t('filaTurnos.sinTelefono.sena')}
              </label>
              <input
                autoComplete="off"
                autoFocus
                className="mt-1 min-h-12 w-full rounded-xl border border-principal/30 bg-superficie px-3 text-base text-principal"
                id="sena-sin-telefono"
                maxLength={MAXIMO_SENA}
                onChange={(e) => setSena(e.target.value)}
                placeholder={t('filaTurnos.sinTelefono.senaEjemplo')}
                value={sena}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-marca px-3 text-base font-bold text-white disabled:opacity-60" disabled={ocupado} type="submit">
                  <LuUserPlus aria-hidden="true" className="h-5 w-5" />
                  {t('filaTurnos.sinTelefono.dar')}
                </button>
                <button className={BOTON} onClick={() => setDandoTurno(false)} type="button">
                  {t('filaTurnos.sinTelefono.cancelar')}
                </button>
              </div>
            </form>
          ) : (
            <button className={`${BOTON} min-h-14`} disabled={ocupado} onClick={() => setDandoTurno(true)} type="button">
              <LuUserPlus aria-hidden="true" className="h-5 w-5 text-accion" />
              {t('filaTurnos.sinTelefono.boton')}
            </button>
          )}

          {/* Perdio su pagina pero sabe su numero: se entrega sin escanear. */}
          {!dandoTurno && (
            <form className="flex gap-2" onSubmit={entregarPorNumero}>
              <label className="sr-only" htmlFor="turno-sin-qr">
                {t('filaTurnos.sinQr.numero')}
              </label>
              <input
                autoComplete="off"
                className="min-h-14 w-24 shrink-0 rounded-xl border border-principal/30 bg-superficie px-3 text-center font-titulo text-2xl font-bold text-principal"
                id="turno-sin-qr"
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => setNumeroSinQr(e.target.value.replace(/\D/g, ''))}
                pattern="[0-9]*"
                placeholder="#"
                value={numeroSinQr}
              />
              <button className={`${BOTON} min-h-14 flex-1`} disabled={ocupado || !numeroDeTurno(numeroSinQr)} type="submit">
                <LuPackageCheck aria-hidden="true" className="h-5 w-5 text-accion" />
                {t('filaTurnos.sinQr.entregarNumero')}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Las cuentas del dia. */}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ['atendidos', datos.atendidos],
          ['esperando', datos.en_espera],
          ['cupo', esSinLimite(datos.capacidad) ? t('filaTurnos.sinLimite') : `${datos.total}/${datos.capacidad}`],
        ].map(([clave, valor]) => (
          <div className="rounded-xl bg-principal/5 p-2" key={clave}>
            <dt className="text-chica text-principal/70">{t(`filaTurnos.cuentas.${clave}`)}</dt>
            <dd className="text-2xl font-bold text-principal">{valor}</dd>
          </div>
        ))}
      </dl>

      {siguientes.length > 0 && (
        <div className="mt-3">
          <h3 className="text-base font-bold text-principal">{t('filaTurnos.siguen')}</h3>
          <ol className="mt-1 divide-y divide-principal/10 rounded-xl border border-principal/15">
            {siguientes.map((persona) => (
              <li className="flex items-center gap-3 px-3 py-1.5" key={persona.turno}>
                <span className="w-12 shrink-0 font-titulo text-2xl font-bold text-principal">{persona.turno}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-principal">{persona.nombre}</span>
                  {persona.codigo_corto && (
                    <span className="block text-chica text-principal/70">{persona.codigo_corto}</span>
                  )}
                </span>
                <button className={BOTON_CHICO} disabled={ocupado} onClick={() => alEntregarTurno?.(persona.turno)} type="button">
                  {t('filaTurnos.sinQr.entregar')}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* No estaban cuando los llamaron (seccion 44). Si llegan a los pocos
          minutos se les entrega; si tardaron, se anula su turno (seccion 46). */}
      {saltados.length > 0 && (
        <details className="mt-3 rounded-xl border border-principal/15 p-3">
          <summary className="min-h-10 cursor-pointer text-base font-bold text-principal">
            {t('filaTurnos.noSePresentaron', { count: saltados.length })}
          </summary>
          <p className="mt-1 text-chica text-principal/70">{t('filaTurnos.noSePresentaronAyuda')}</p>
          <ul className="mt-2 space-y-2">
            {saltados.map((persona) => (
              <li className="space-y-2" key={persona.turno}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base text-principal">
                    <span className="font-bold">{persona.turno}</span> · {persona.nombre}
                    {persona.codigo_corto && ` · ${persona.codigo_corto}`}
                    {persona.saltado_en && (
                      <span className="block text-chica text-principal/70">{haceCuanto(t, persona.saltado_en)}</span>
                    )}
                  </span>
                  <span className="flex flex-wrap">
                    <button className={BOTON_CHICO} disabled={ocupado} onClick={() => alEntregarTurno?.(persona.turno)} type="button">
                      {t('filaTurnos.sinQr.entregar')}
                    </button>
                    <button
                      className={BOTON_CHICO}
                      disabled={ocupado}
                      onClick={() => correr(() => saltarTurno(persona.turno, false))}
                      type="button"
                    >
                      {t('filaTurnos.regresar')}
                    </button>
                    {alAnularTurno && (
                      <button
                        className={`${BOTON_CHICO} text-ya-recibio`}
                        disabled={ocupado}
                        onClick={() => setAnulando(persona.turno)}
                        type="button"
                      >
                        <LuBan aria-hidden="true" className="h-4 w-4" />
                        {t('filaTurnos.anular')}
                      </button>
                    )}
                  </span>
                </div>
                {anulando === persona.turno && (
                  <ConfirmarAnular
                    alNo={() => setAnulando(null)}
                    alSi={() => {
                      setAnulando(null)
                      alAnularTurno?.(persona.turno)
                    }}
                    ocupado={ocupado}
                    turno={persona.turno}
                  />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* "Yo soy el 50": el turno es de quien sabe su codigo. */}
      {alBuscar && (
        <div className="mt-3 rounded-xl bg-principal/5 p-3">
          <button className={BOTON_CHICO} onClick={alBuscar} type="button">
            <LuSearch aria-hidden="true" className="h-4 w-4" />
            {t('filaTurnos.comprobar')}
          </button>
          <p className="text-chica text-principal/70">{t('filaTurnos.comprobarAyuda')}</p>
        </div>
      )}

      {/* La bocina del telefono dice "Turno 12" cada vez que avanza la fila. */}
      {puedeHablar() && (
        <div className="mt-3 rounded-xl bg-principal/5 p-3">
          <label className="flex min-h-12 items-center gap-3 text-base font-semibold text-principal">
            <input
              checked={anuncio.activo}
              className="h-6 w-6 shrink-0 accent-principal"
              onChange={(e) => cambiarAnuncio({ activo: e.target.checked })}
              type="checkbox"
            />
            {t('filaTurnos.anunciar')}
          </label>
          {anuncio.activo && voces.length > 1 && (
            <label className="mt-1 flex flex-col gap-1 text-base text-principal">
              <span className="text-chica text-principal/70">{t('filaTurnos.voz')}</span>
              <select
                className="min-h-12 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal"
                onChange={(e) => cambiarAnuncio({ voz: e.target.value || null })}
                value={anuncio.voz ?? ''}
              >
                <option value="">{t('filaTurnos.vozDelTelefono')}</option>
                {voces.map((voz) => (
                  <option key={voz.id} value={voz.id}>
                    {voz.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <p className="mt-2 text-chica text-principal/70">{t('filaTurnos.seActualiza')}</p>

      {/* Al acabar: quien todavia espera ve en su telefono que la fila termino. */}
      {!datos.terminada &&
        (preguntandoTerminar ? (
          <div
            aria-labelledby="terminar-fila-pregunta"
            className="mt-4 rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-3"
            role="alertdialog"
          >
            <p className="text-base font-semibold text-principal" id="terminar-fila-pregunta">
              {t('filaTurnos.terminar.pregunta', { cuantos: datos.en_espera ?? 0 })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-12 items-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-50"
                disabled={ocupado}
                onClick={() => terminar(true)}
                type="button"
              >
                {t('filaTurnos.terminar.si')}
              </button>
              <button
                className="inline-flex min-h-12 items-center rounded-xl border border-principal px-4 text-base font-semibold text-principal"
                onClick={() => setPreguntandoTerminar(false)}
                type="button"
              >
                {t('filaTurnos.terminar.no')}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="mt-4 inline-flex min-h-12 items-center gap-2 px-1 text-base font-semibold text-ya-recibio underline underline-offset-4 disabled:opacity-50"
            disabled={ocupado}
            onClick={() => setPreguntandoTerminar(true)}
            type="button"
          >
            <LuFlag aria-hidden="true" className="h-4 w-4" />
            {t('filaTurnos.terminar.boton')}
          </button>
        ))}
    </div>
  )
}

function AvisoError({ error }) {
  const { t } = useTranslation()
  return (
    <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
      {t(`filaTurnos.errores.${error}`, {
        defaultValue: t(`escaneo.errores.${error}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') }),
      })}
    </p>
  )
}
