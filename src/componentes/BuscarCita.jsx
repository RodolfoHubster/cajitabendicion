import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuList, LuSearch, LuX } from 'react-icons/lu'
import Boton from './Boton'
import ListaDelDia from './ListaDelDia'
import { textoParaBuscar } from '../datos/codigoCorto'
import { aFechaLocal, formatearHora } from '../datos/disponibilidad'
import { buscarParaEscaneo } from '../datos/escaneo'
import { hoyLocal } from '../datos/panel'

/**
 * Carros, debajo de la camara (10 de noviembre de 2026): buscar a alguien de
 * hoy por nombre o codigo mientras se escribe, sin salir de la camara. Antes
 * habia que tocar "Buscar por nombre o codigo", la camara se cerraba y para
 * el siguiente coche habia que tocar "Escanear otro". Ahora es como la
 * busqueda de turnos de la fila a pie: todo en el mismo lugar.
 *
 *   Al escribir     la gente de hoy que se parece (ListaDelDia), con
 *                   "Ver cita" y "Registrar entrega"
 *   Ver la lista    toda la gente de hoy, sin escribir
 *   Otras fechas    si no esta hoy, su codigo en otras fechas
 *
 * alEntregar(persona) y alVer(persona): lo de siempre del escaner. version:
 * cambia con cada entrega, para volver a pedir la lista.
 */
export default function BuscarCita({ version = 0, ocupado = false, alEntregar, alVer }) {
  const { t, i18n } = useTranslation()
  const [texto, setTexto] = useState('')
  const [verLista, setVerLista] = useState(false)
  //  Lo de "Buscar tambien en otras fechas" (null: no se ha buscado).
  const [encontrados, setEncontrados] = useState(null)
  const [error, setError] = useState(null)
  const campo = useRef(null)
  const hoy = hoyLocal()

  function escribir(valor) {
    setTexto(valor)
    setEncontrados(null)
    setError(null)
  }

  async function buscarOtras(evento) {
    evento.preventDefault()
    if (!texto.trim()) return
    setError(null)
    try {
      //  "cb 4871", "4871" o "CB487l" se buscan como CB-4871.
      setEncontrados(await buscarParaEscaneo(textoParaBuscar(texto)))
    } catch (e) {
      setError(e.message)
    }
  }

  //  Lo que se hace con alguien deja la busqueda lista para el siguiente.
  const hecho = (accion) => (persona) => {
    escribir('')
    setVerLista(false)
    accion?.(persona)
  }

  const fechaLarga = (fecha) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(aFechaLocal(fecha))
  const buscando = texto.trim() !== ''
  const ayudaId = 'buscar-cita-ayuda'

  return (
    <div className="mt-4 rounded-2xl border-2 border-principal/20 p-3">
      <form onSubmit={buscarOtras}>
        <label className="flex items-center gap-2 text-lg font-bold text-principal" htmlFor="buscar-cita">
          <LuSearch aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
          <span className="min-w-0">{t('escaneo.buscarCita.etiqueta')}</span>
        </label>
        <p className="text-base text-principal/80" id={ayudaId}>
          {t('escaneo.buscarCita.ayuda')}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          <input
            aria-describedby={ayudaId}
            autoComplete="off"
            className="min-h-14 w-0 min-w-[min(6rem,100%)] flex-1 rounded-xl border-2 border-principal/30 bg-superficie px-3 text-lg text-principal placeholder:text-principal/40 focus:border-principal"
            enterKeyHint="search"
            id="buscar-cita"
            onChange={(e) => escribir(e.target.value)}
            placeholder={t('escaneo.lista.ejemplo')}
            ref={campo}
            value={texto}
          />
          {texto && (
            <button
              aria-label={t('escaneo.turnos.borrar')}
              className="flex min-h-14 w-12 shrink-0 items-center justify-center rounded-xl border border-principal/30 text-principal"
              onClick={() => {
                escribir('')
                campo.current?.focus()
              }}
              type="button"
            >
              <LuX aria-hidden="true" className="h-6 w-6" />
            </button>
          )}
        </div>

        {buscando && (
          <Boton className="mt-2" type="submit" variant="secondary">
            {t('escaneo.lista.buscarOtras')}
          </Boton>
        )}
      </form>

      {error && (
        <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`escaneo.errores.${error}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      {encontrados && encontrados.length === 0 && (
        <p className="mt-3 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
          {t('escaneo.sinResultados')}
        </p>
      )}

      {encontrados && encontrados.length > 0 && (
        <ul className="mt-3 space-y-3">
          {encontrados.map((persona) => {
            const deOtroDia = persona.fecha !== hoy
            return (
              <li
                className={`rounded-xl border p-3 ${deOtroDia ? 'border-accion/60 bg-accion/5' : 'border-principal/20'}`}
                key={`${persona.codigo_corto}-${persona.fecha}`}
              >
                {/* No hubo ese codigo exacto: este se le parece (un numero
                    distinto o dos al reves). Se confirma con el nombre. */}
                {persona.parecido && (
                  <p className="mb-1 inline-block rounded-lg bg-accion/20 px-2 py-0.5 text-base font-bold text-principal">
                    {t('escaneo.parecido')}
                  </p>
                )}
                <p className="text-lg font-semibold text-principal">{persona.nombre}</p>
                <p className="text-base text-principal/70">
                  {persona.codigo_corto} · {formatearHora(persona.hora)}
                </p>
                <p className="mt-1 text-base text-principal/80">
                  {deOtroDia
                    ? `${t('escaneo.resultado.OTRA_FECHA')}: ${fechaLarga(persona.fecha)}`
                    : t(`escaneo.estadoPrevio.${persona.estado}`, { defaultValue: persona.estado })}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Boton onClick={() => hecho(alVer)(persona)} variant="secondary">
                    {t('escaneo.verCita')}
                  </Boton>
                  {/* De hoy y sin recibir: se entrega aqui mismo. Si es de la
                      otra fila, la base lo detiene y no se quema. */}
                  {!deOtroDia && ['reservada', 'llego'].includes(persona.estado) && (
                    <Boton disabled={ocupado} onClick={() => hecho(alEntregar)(persona)}>
                      {ocupado ? t('escaneo.registrando') : t('escaneo.registrarEntrega')}
                    </Boton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {(buscando || verLista) && encontrados === null && (
        <ListaDelDia alEntregar={hecho(alEntregar)} alVer={hecho(alVer)} ocupado={ocupado} texto={texto} version={version} />
      )}

      {!buscando && (
        <button
          aria-expanded={verLista}
          className="mt-2 inline-flex min-h-12 items-center gap-2 text-left text-base font-semibold text-principal underline underline-offset-4"
          onClick={() => setVerLista((antes) => !antes)}
          type="button"
        >
          <LuList aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
          <span className="min-w-0">{verLista ? t('escaneo.buscarCita.ocultarLista') : t('escaneo.buscarCita.verLista')}</span>
        </button>
      )}
    </div>
  )
}
