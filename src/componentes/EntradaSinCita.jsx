import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaWhatsapp } from 'react-icons/fa6'
import { LuMessageCircle, LuPlus } from 'react-icons/lu'
import Campo from './Campo'
import CampoTelefono from './CampoTelefono'
import { mensajeNombre, mensajeTelefono } from './mensajesValidacion'
import { anularEntradaSinCita, registrarEntradaSinCita } from '../datos/citas'
import { normalizarTelefono } from '../datos/telefono'
import { formatearNombre, validarNombre } from '../datos/validaciones'

/**
 * "Entro sin cita": anota a una persona que paso sin cita.
 *
 * Con la palomita "anotar sin cita" (la base tambien lo exige). Pide el
 * nombre y, si lo da, el telefono (decision del pastor, 24 de septiembre de
 * 2026), y da un codigo de comprobante (SC-1234). Si fue un error, se anula:
 * deja de contar pero queda registrado.
 *
 * Mandarle el comprobante por WhatsApp o mensaje todavia no existe: falta
 * que el pastor decida el canal. Los botones estan, apagados, con
 * "Proximamente".
 */
export default function EntradaSinCita({ alCambiar, className = '' }) {
  const { t, i18n } = useTranslation()

  const [nombre, setNombre] = useState('')
  // Opcional: vacio es valido.
  const [telefono, setTelefono] = useState('')
  const [pais, setPais] = useState('US')
  const [tocado, setTocado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  // { codigo, nombre, total, anulada }
  const [comprobante, setComprobante] = useState(null)
  const [preguntando, setPreguntando] = useState(false)
  //  Esa persona ya se anoto hoy: { nombre, telefono, codigo, porTelefono }.
  const [repetido, setRepetido] = useState(null)

  const errorNombre = tocado ? mensajeNombre(t, validarNombre(nombre), 'sinCita') : undefined
  const telefonoRevisado = telefono.trim() ? normalizarTelefono(pais, telefono) : null
  const errorTelefono = tocado && telefonoRevisado ? mensajeTelefono(t, telefonoRevisado, i18n.language) : undefined

  function limpiar() {
    setNombre('')
    setTelefono('')
    setTocado(false)
  }

  async function anotar(evento, { confirmarRepetido = false } = {}) {
    evento?.preventDefault()
    setTocado(true)
    if (validarNombre(nombre)) {
      document.getElementById('nombreSinCita')?.focus()
      return
    }
    if (telefonoRevisado && !telefonoRevisado.valido) {
      document.getElementById('telefonoSinCita')?.focus()
      return
    }

    setOcupado(true)
    setError(null)
    setRepetido(null)

    const nombreListo = formatearNombre(nombre)
    const telefonoListo = telefonoRevisado?.e164 ?? null

    try {
      const { codigo, total } = await registrarEntradaSinCita(nombreListo, { confirmarRepetido, telefono: telefonoListo })
      setComprobante({ codigo, nombre: nombreListo, telefono: telefonoListo, total, anulada: false })
      setPreguntando(false)
      limpiar()
      alCambiar?.()
    } catch (e) {
      if (e.message === 'NOMBRE_YA_ANOTADO_HOY' || e.message === 'TELEFONO_YA_ANOTADO_HOY') {
        setRepetido({
          nombre: nombreListo,
          telefono: telefonoListo,
          codigo: e.codigoPrevio,
          porTelefono: e.message === 'TELEFONO_YA_ANOTADO_HOY',
        })
      } else {
        setError(e.message)
      }
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
        <div>
          <CampoTelefono
            alCambiarPais={setPais}
            alCambiarValor={setTelefono}
            error={errorTelefono}
            etiqueta={t('sinCita.telefono')}
            id="telefonoSinCita"
            onBlur={() => {
              if (telefono.trim()) setTocado(true)
            }}
            pais={pais}
            valor={telefono}
          />
          <p className="mt-1 text-chica text-principal/70">{t('sinCita.telefonoAyuda')}</p>
        </div>
        <button
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-principal bg-superficie px-4 text-base font-bold text-principal transition hover:bg-principal/5 disabled:cursor-not-allowed disabled:opacity-60"
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

      {/* Ya se anoto hoy: se pregunta antes de contar una caja de mas. */}
      {repetido && (
        <div className="mt-3 space-y-3 rounded-xl border-2 border-accion bg-accion/10 p-4" role="alert">
          <p className="text-base font-bold text-principal">
            {repetido.porTelefono
              ? t('sinCita.repetido.tituloTelefono', { telefono: repetido.telefono, codigo: repetido.codigo })
              : t('sinCita.repetido.titulo', { nombre: repetido.nombre, codigo: repetido.codigo })}
          </p>
          <p className="text-base text-principal/80">{t('sinCita.repetido.ayuda')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="inline-flex min-h-14 items-center justify-center rounded-xl bg-marca px-4 text-base font-bold text-white"
              onClick={() => {
                setRepetido(null)
                limpiar()
              }}
              type="button"
            >
              {t('sinCita.repetido.esLaMisma')}
            </button>
            <button
              className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/30 bg-superficie px-4 text-base font-bold text-principal disabled:opacity-60"
              disabled={ocupado}
              onClick={() => anotar(null, { confirmarRepetido: true })}
              type="button"
            >
              {t('sinCita.repetido.esOtra')}
            </button>
          </div>
        </div>
      )}

      {comprobante && !comprobante.anulada && (
        <div className="mt-3 rounded-xl border-2 border-dashed border-principal/30 bg-superficie p-4 text-center" role="status">
          <p className="text-base font-semibold text-puede-pasar">
            {t('sinCita.anotado', { total: comprobante.total })}
          </p>
          <p className="mt-2 text-base text-principal/70">{t('sinCita.comprobante')}</p>
          <p className="font-titulo text-4xl font-bold tracking-wide text-principal">{comprobante.codigo}</p>
          <p className="text-base font-semibold text-principal">{comprobante.nombre}</p>
          {comprobante.telefono && <p className="text-base text-principal/80">{comprobante.telefono}</p>}
          <p className="mt-2 text-base text-principal/70">{t('sinCita.darCodigo')}</p>

          {/* Pendiente con el pastor: el canal y el texto del mensaje. */}
          <div className="mt-3 rounded-xl bg-principal/5 p-3">
            <p className="text-base font-semibold text-principal">{t('sinCita.enviar.titulo')}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {[
                { clave: 'whatsapp', Icono: FaWhatsapp },
                { clave: 'mensaje', Icono: LuMessageCircle },
              ].map(({ clave, Icono }) => (
                <button
                  aria-describedby="sin-cita-proximamente"
                  className="inline-flex min-h-12 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-dashed border-principal/30 px-3 text-base font-semibold text-principal/70"
                  disabled
                  key={clave}
                  type="button"
                >
                  <Icono aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t(`sinCita.enviar.${clave}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-chica text-principal/70" id="sin-cita-proximamente">
              <span className="mr-1 rounded-full bg-accion/20 px-2 py-0.5 font-bold text-principal">
                {t('sinCita.enviar.proximamente')}
              </span>
              {t('sinCita.enviar.ayuda')}
            </p>
          </div>

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
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-60"
                  disabled={ocupado}
                  onClick={anular}
                  type="button"
                >
                  {t('sinCita.confirmarAnular')}
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/25 bg-superficie px-4 text-base font-bold text-principal"
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
