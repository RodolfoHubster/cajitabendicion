import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaPersonWalking } from 'react-icons/fa6'
import { LuSearch, LuUndo2, LuUserX, LuVolume2 } from 'react-icons/lu'
import { Hueso } from './Esqueleto'
import useCadaRato from './useCadaRato'
import { formatearHora } from '../datos/disponibilidad'
import { CADA_MS_VOLUNTARIA, esSinLimite, filaDeTurnos, saltarTurno } from '../datos/filaAPie'
import {
  alCambiarVoces,
  guardarAnuncio,
  hablar,
  leerAnuncio,
  puedeHablar,
  turnoParaAnunciar,
  vocesDelIdioma,
} from '../datos/voz'

/**
 * La fila a pie en vivo, en el telefono de la voluntaria que llama los
 * turnos: el que va (en grande, para gritarlo), los que siguen, los que no
 * se presentaron y las cuentas del dia. Se vuelve a pedir cada pocos
 * segundos, y de inmediato cuando cambia `version` (se acaba de entregar).
 *
 * alActualizar(datos): la pantalla de escaneo guarda el turno que va para
 * avisar cuando alguien llega antes de su turno. alBuscar(): abre la
 * busqueda por nombre o codigo.
 */
export default function PanelTurnos({ version = 0, alActualizar, alBuscar }) {
  const { t, i18n } = useTranslation()
  const [datos, setDatos] = useState(undefined)
  const [sinConexion, setSinConexion] = useState(false)
  //  Lo que fallo al preguntar por la fila (se quita solo en la siguiente
  //  vuelta) y lo que fallo al tocar un boton (se queda hasta el siguiente).
  const [errorFila, setErrorFila] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  //  El ultimo "no se presento", para poder deshacerlo al momento.
  const [saltado, setSaltado] = useState(null)
  const [cambios, setCambios] = useState(0)

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

  function cambiarAnuncio(cambios) {
    const nuevo = { ...anuncio, ...cambios }
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

  async function noSePresento(turno, siSaltado = true) {
    setOcupado(true)
    setError(null)
    try {
      await saltarTurno(turno, siSaltado)
      setSaltado(siSaltado ? turno : null)
      setCambios((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
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

  const actual = datos.actual
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

      {/* El turno que va, en grande: es el que se grita. */}
      <div className="mt-3 rounded-2xl border-4 border-accion bg-accion/10 p-4 text-center" aria-live="polite">
        <p className="text-base font-bold uppercase tracking-wide text-principal/80">{t('filaTurnos.va')}</p>
        {actual ? (
          <>
            <p className="font-titulo text-7xl font-bold leading-none text-principal">{actual.turno}</p>
            <p className="mt-2 text-xl font-bold text-principal">{actual.nombre}</p>
            <p className="text-base text-principal/70">{actual.codigo_corto}</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {puedeHablar() && (
                <button
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-3 text-base font-bold text-principal transition hover:border-principal"
                  onClick={() => decirTurno(actual.turno)}
                  type="button"
                >
                  <LuVolume2 aria-hidden="true" className="h-5 w-5 text-accion" />
                  {t('filaTurnos.decir')}
                </button>
              )}
              <button
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-3 text-base font-bold text-principal transition hover:border-principal disabled:opacity-60"
                disabled={ocupado}
                onClick={() => noSePresento(actual.turno)}
                type="button"
              >
                <LuUserX aria-hidden="true" className="h-5 w-5 text-ya-recibio" />
                {t('filaTurnos.noSePresento')}
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-lg font-semibold text-principal">{t('filaTurnos.nadieEsperando')}</p>
        )}
      </div>

      {saltado && (
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-principal/5 p-2 text-base text-principal" role="status">
          {t('filaTurnos.saltado', { turno: saltado })}
          <button
            className="inline-flex min-h-12 items-center gap-1 font-semibold underline underline-offset-4"
            disabled={ocupado}
            onClick={() => noSePresento(saltado, false)}
            type="button"
          >
            <LuUndo2 aria-hidden="true" className="h-4 w-4" />
            {t('filaTurnos.deshacer')}
          </button>
        </p>
      )}

      {error && <AvisoError error={error} />}

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
              <li className="flex items-center gap-3 px-3 py-2" key={persona.turno}>
                <span className="w-12 shrink-0 font-titulo text-2xl font-bold text-principal">{persona.turno}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-principal">{persona.nombre}</span>
                  <span className="block text-chica text-principal/70">{persona.codigo_corto}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {saltados.length > 0 && (
        <details className="mt-3 rounded-xl border border-principal/15 p-3">
          <summary className="min-h-10 cursor-pointer text-base font-bold text-principal">
            {t('filaTurnos.noSePresentaron', { count: saltados.length })}
          </summary>
          <p className="mt-1 text-chica text-principal/70">{t('filaTurnos.noSePresentaronAyuda')}</p>
          <ul className="mt-2 space-y-2">
            {saltados.map((persona) => (
              <li className="flex flex-wrap items-center justify-between gap-2" key={persona.turno}>
                <span className="text-base text-principal">
                  <span className="font-bold">{persona.turno}</span> · {persona.nombre} · {persona.codigo_corto}
                </span>
                <button
                  className="inline-flex min-h-12 items-center text-base font-semibold text-principal underline underline-offset-4"
                  disabled={ocupado}
                  onClick={() => noSePresento(persona.turno, false)}
                  type="button"
                >
                  {t('filaTurnos.regresar')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {alBuscar && (
        <button
          className="mt-3 inline-flex min-h-12 items-center gap-2 text-base font-semibold text-principal underline underline-offset-4"
          onClick={alBuscar}
          type="button"
        >
          <LuSearch aria-hidden="true" className="h-4 w-4" />
          {t('filaTurnos.buscar')}
        </button>
      )}

      <p className="mt-2 text-chica text-principal/70">{t('filaTurnos.seActualiza')}</p>
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
