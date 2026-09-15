import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus } from 'react-icons/lu'
import Campo from './Campo'
import { mensajeNombre } from './mensajesValidacion'
import { anularEntradaSinCita, registrarEntradaSinCita } from '../datos/citas'
import { formatearNombre, validarNombre } from '../datos/validaciones'

/**
 * "Entro sin cita": anota a una persona que paso sin cita.
 *
 * Solo lo ve el administrador (la base tambien lo exige). Pide solo el
 * nombre y da un codigo de comprobante (SC-1234) para la persona. Si fue un
 * error, se anula: deja de contar pero queda registrado.
 */
export default function EntradaSinCita({ alCambiar, className = '' }) {
  const { t } = useTranslation()

  const [nombre, setNombre] = useState('')
  const [tocado, setTocado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  // { codigo, nombre, total, anulada }
  const [comprobante, setComprobante] = useState(null)
  const [preguntando, setPreguntando] = useState(false)

  const errorNombre = tocado ? mensajeNombre(t, validarNombre(nombre), 'sinCita') : undefined

  async function anotar(evento) {
    evento.preventDefault()
    setTocado(true)
    if (validarNombre(nombre)) return

    setOcupado(true)
    setError(null)

    try {
      const nombreListo = formatearNombre(nombre)
      const { codigo, total } = await registrarEntradaSinCita(nombreListo)
      setComprobante({ codigo, nombre: nombreListo, total, anulada: false })
      setPreguntando(false)
      setNombre('')
      setTocado(false)
      alCambiar?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function anular() {
    setOcupado(true)
    setError(null)

    try {
      await anularEntradaSinCita(comprobante.codigo)
      setComprobante((actual) => ({ ...actual, anulada: true }))
      setPreguntando(false)
      alCambiar?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className={className}>
      <form className="space-y-3" noValidate onSubmit={anotar}>
        <Campo
          autoComplete="off"
          error={errorNombre}
          etiqueta={t('sinCita.nombre')}
          id="nombreSinCita"
          onBlur={() => {
            if (nombre.trim()) setTocado(true)
          }}
          onChange={(e) => setNombre(e.target.value)}
          value={nombre}
        />
        <button
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-principal bg-white px-4 text-base font-bold text-principal transition hover:bg-principal/5 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={ocupado}
          type="submit"
        >
          <LuPlus aria-hidden="true" className="h-5 w-5" />
          {ocupado && !comprobante ? t('sinCita.registrando') : t('sinCita.boton')}
        </button>
      </form>

      {error && (
        <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      {comprobante && !comprobante.anulada && (
        <div className="mt-3 rounded-xl border-2 border-dashed border-principal/30 bg-white p-4 text-center" role="status">
          <p className="text-base font-semibold text-puede-pasar">
            {t('sinCita.anotado', { total: comprobante.total })}
          </p>
          <p className="mt-2 text-base text-principal/70">{t('sinCita.comprobante')}</p>
          <p className="font-titulo text-4xl font-bold tracking-wide text-principal">{comprobante.codigo}</p>
          <p className="text-base font-semibold text-principal">{comprobante.nombre}</p>
          <p className="mt-2 text-base text-principal/70">{t('sinCita.darCodigo')}</p>

          {!preguntando ? (
            <button
              className="mt-2 min-h-12 text-base font-semibold text-ya-recibio underline underline-offset-4"
              onClick={() => setPreguntando(true)}
              type="button"
            >
              {t('sinCita.anular')}
            </button>
          ) : (
            <div className="mt-3 rounded-xl bg-ya-recibio/5 p-3 text-left">
              <p className="text-base font-semibold text-principal">
                {t('sinCita.preguntaAnular', { nombre: comprobante.nombre })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-ya-recibio px-4 text-base font-bold text-white disabled:opacity-60"
                  disabled={ocupado}
                  onClick={anular}
                  type="button"
                >
                  {t('sinCita.confirmarAnular')}
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/25 bg-white px-4 text-base font-bold text-principal"
                  onClick={() => setPreguntando(false)}
                  type="button"
                >
                  {t('sinCita.noAnular')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {comprobante?.anulada && (
        <p className="mt-3 rounded-xl bg-principal/5 p-3 text-base text-principal" role="status">
          {t('sinCita.anulada', { nombre: comprobante.nombre })}
        </p>
      )}
    </div>
  )
}
