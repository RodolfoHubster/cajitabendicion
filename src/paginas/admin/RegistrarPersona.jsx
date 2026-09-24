import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleCheck, LuInfo } from 'react-icons/lu'
import AvisoPrivacidad from '../../componentes/AvisoPrivacidad'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import CampoTelefono from '../../componentes/CampoTelefono'
import CamposDomicilio from '../../componentes/CamposDomicilio'
import ExcepcionSemana from '../../componentes/ExcepcionSemana'
import Tarjeta from '../../componentes/Tarjeta'
import {
  mensajeCorreo,
  mensajeNombre,
  mensajeTelefono,
  mensajesDomicilio,
} from '../../componentes/mensajesValidacion'
import useCodigoPostal from '../../componentes/useCodigoPostal'
import {
  aFechaLocal,
  agruparPorFecha,
  consultarDisponibilidad,
  formatearHora,
} from '../../datos/disponibilidad'
import { DOMICILIO_VACIO, PAISES_DOMICILIO, validarDomicilio } from '../../datos/domicilio'
import { registrarDesdePanel } from '../../datos/panel'
import { crearPase } from '../../datos/pases'
import { normalizarTelefono } from '../../datos/telefono'
import { formatearNombre, sugerirCorreo, validarCorreo, validarNombre } from '../../datos/validaciones'

const VACIO = { nombres: '', apellidos: '', telefono: '', email: '' }

// En este orden se revisan; se enfoca el primero que tenga error.
const CAMPOS = [
  'nombres',
  'apellidos',
  'telefono',
  'correo',
  'codigoPostal',
  'colonia',
  'calle',
  'numero',
  'interior',
  'consentimiento',
]

const ESTILO_SELECT =
  'min-h-14 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

/**
 * Registro desde el panel, para quien no puede registrarse por su cuenta:
 * el adulto mayor sin telefono, la persona que llega a la oficina.
 *
 * Solo admin. No aplica el limite por dispositivo (esta computadora
 * registra a muchas personas) y el correo es opcional. El domicilio y la
 * confirmacion de privacidad se piden igual que en el registro publico. El
 * cupo y la regla de una cita por semana si aplican: los revisa la base.
 *
 * Abajo, la excepcion para una segunda cita en la misma semana.
 */
export default function RegistrarPersona() {
  const { t, i18n } = useTranslation()

  const [bloques, setBloques] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [recarga, setRecarga] = useState(0)

  // 'cita' = se le aparta un horario. 'pase' = permanente, sin horario.
  const [tipo, setTipo] = useState('cita')
  const [motivoPase, setMotivoPase] = useState('')

  const [fecha, setFecha] = useState('')
  const [bloqueId, setBloqueId] = useState('')
  const [datos, setDatos] = useState(VACIO)
  const [pais, setPais] = useState('US')
  const [domicilio, setDomicilio] = useState(DOMICILIO_VACIO)
  const [acepto, setAcepto] = useState(false)
  const [tocados, setTocados] = useState(() => new Set())
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [registrada, setRegistrada] = useState(null)

  const busqueda = useCodigoPostal(domicilio.pais, domicilio.codigoPostal)

  // Se vuelve a consultar despues de cada registro: los lugares cambiaron.
  useEffect(() => {
    let vigente = true

    consultarDisponibilidad()
      .then((resultado) => {
        if (!vigente) return
        setBloques(resultado)
        setErrorCarga(null)
      })
      .catch((e) => {
        if (vigente) setErrorCarga(e.message)
      })

    return () => {
      vigente = false
    }
  }, [recarga])

  const fechaLarga = (valor) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(aFechaLocal(valor))

  const cambiar = (campo, valor) => setDatos((actual) => ({ ...actual, [campo]: valor }))
  const tocar = (campo) => setTocados((actuales) => new Set(actuales).add(campo))

  const telefonoRevisado = normalizarTelefono(pais, datos.telefono)
  const erroresDomicilio = validarDomicilio(domicilio, busqueda)

  const errores = {
    nombres: mensajeNombre(t, validarNombre(datos.nombres), 'nombres'),
    apellidos: mensajeNombre(t, validarNombre(datos.apellidos), 'apellidos'),
    telefono: mensajeTelefono(t, telefonoRevisado, i18n.language),
    // Muchos adultos mayores no tienen correo: aqui es opcional.
    correo: mensajeCorreo(t, validarCorreo(datos.email, { requerido: false })),
    ...mensajesDomicilio(t, erroresDomicilio),
    consentimiento: acepto ? undefined : t('privacidad.faltaPanel'),
  }

  // La casilla y "revisando el codigo postal" solo se avisan al intentar enviar.
  const errorDe = (campo) => {
    if (!intento && (campo === 'consentimiento' || erroresDomicilio[campo] === 'BUSCANDO')) return undefined
    return intento || tocados.has(campo) ? errores[campo] : undefined
  }

  const sugerencia = errores.correo ? null : sugerirCorreo(datos.email)

  // Mientras no haya escrito el codigo postal, el domicilio sigue al pais del telefono.
  function cambiarPaisTelefono(nuevo) {
    setPais(nuevo)
    if (!domicilio.codigoPostal && PAISES_DOMICILIO.includes(nuevo)) {
      setDomicilio((antes) => ({ ...antes, pais: nuevo }))
    }
  }

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)

    if (tipo === 'cita' && !bloqueId) {
      setIntento(true)
      setError('FALTA_HORARIO')
      document.getElementById('fecha')?.focus()
      return
    }

    const conError = CAMPOS.find((campo) => errores[campo])
    if (conError) {
      setIntento(true)
      document.getElementById(conError)?.focus()
      return
    }

    setEnviando(true)

    const nombres = formatearNombre(datos.nombres)
    const apellidos = formatearNombre(datos.apellidos)

    try {
      const esPase = tipo === 'pase'

      const alta = await registrarDesdePanel({
        nombres,
        apellidos,
        telefono: telefonoRevisado.e164,
        email: datos.email.trim(),
        domicilio,
        aceptoPrivacidad: acepto,
        // El pase no aparta lugar: se da de alta a la persona y ya.
        bloqueId: esPase ? null : bloqueId,
      })

      const pase = esPase ? await crearPase(alta.codigo_corto, motivoPase) : null

      setRegistrada({ ...alta, pase, nombre: `${nombres} ${apellidos}` })
      setMotivoPase('')
      setDatos(VACIO)
      setDomicilio(DOMICILIO_VACIO)
      setAcepto(false)
      setTocados(new Set())
      setIntento(false)
      setFecha('')
      setBloqueId('')
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (registrada) {
    return (
      <Tarjeta className="max-w-2xl">
        {/* La misma persona ya tenia cita ese dia: se muestra la suya en
            vez de darle una segunda (seccion 33 de schema.sql). */}
        {registrada.ya_existia ? (
          <>
            <p className="flex items-center gap-2 text-lg font-bold text-principal">
              <LuInfo aria-hidden="true" className="h-6 w-6 text-accion" />
              {t('registrarPanel.yaTenia')}
            </p>
            <p className="mt-1 text-base text-principal/80">{t('registrarPanel.yaTeniaAyuda')}</p>
          </>
        ) : (
          <p className="flex items-center gap-2 text-lg font-bold text-puede-pasar">
            <LuCircleCheck aria-hidden="true" className="h-6 w-6" />
            {t('registrarPanel.listo')}
          </p>
        )}
        <p className="mt-2 text-2xl font-bold first-letter:uppercase">
          {registrada.pase
            ? t('pases.permanente')
            : `${fechaLarga(registrada.fecha)}, ${formatearHora(registrada.hora)}`}
        </p>
        <p className="mt-3 text-base text-principal/70">
          {t('confirmacion.aNombreDe')} <span className="font-semibold">{registrada.nombre}</span>
        </p>
        <p className="my-2 font-titulo text-4xl font-bold tracking-wide text-principal">
          {registrada.codigo_corto}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {/* En otra pestana: para ensenar o imprimir el QR sin perder el panel. */}
          <a
            className="inline-flex min-h-14 items-center justify-center rounded-xl bg-marca px-4 text-base font-bold text-white shadow-sm transition hover:brightness-110"
            href={registrada.pase ? `/pase/${registrada.pase.token}` : `/confirmacion/${registrada.token_qr}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('registrarPanel.verQR')}
          </a>
          <Boton onClick={() => setRegistrada(null)}>{t('registrarPanel.otra')}</Boton>
        </div>
      </Tarjeta>
    )
  }

  const dias = agruparPorFecha(bloques ?? [])
  const horarios = (bloques ?? []).filter((bloque) => bloque.fecha === fecha)

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Tarjeta>
        <h1 className="mb-1 text-2xl font-bold">{t('registrarPanel.titulo')}</h1>
        <p className="mb-4 text-base text-principal/70">{t('registrarPanel.ayuda')}</p>

        {errorCarga && (
          <p className="mb-4 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t('registrarPanel.errorCarga')}
          </p>
        )}

        {bloques && dias.length === 0 && (
          <p className="mb-4 text-base">{t('registrarPanel.sinFechas')}</p>
        )}

        <form className="space-y-4" noValidate onSubmit={enviar}>
          {/* Cita para una fecha, o pase permanente. El pase no aparta
              lugar y no tiene horario: por eso se esconden las dos
              casillas de arriba. */}
          <fieldset>
            <legend className="mb-2 text-base font-semibold text-principal">
              {t('registrarPanel.tipo')}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {['cita', 'pase'].map((valor) => (
                <label
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 ${
                    tipo === valor ? 'border-2 border-principal bg-principal/5' : 'border-principal/25'
                  }`}
                  key={valor}
                >
                  <input
                    checked={tipo === valor}
                    className="h-5 w-5 shrink-0 accent-principal"
                    name="tipo-registro"
                    onChange={() => setTipo(valor)}
                    type="radio"
                    value={valor}
                  />
                  <span className="text-base font-semibold text-principal">
                    {t(`registrarPanel.tipos.${valor}`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {tipo === 'pase' && (
            <>
              <p className="rounded-xl bg-accion/15 p-3 text-base text-principal">
                {t('registrarPanel.avisoPase')}
              </p>
              <Campo
                etiqueta={t('registrarPanel.motivoPase')}
                id="motivo-pase"
                onChange={(e) => setMotivoPase(e.target.value)}
                type="text"
                value={motivoPase}
              />
            </>
          )}

          <div className={`grid gap-4 sm:grid-cols-2 ${tipo === 'pase' ? 'hidden' : ''}`}>
            <label className="flex flex-col gap-2" htmlFor="fecha">
              <span className="text-base font-semibold text-principal">{t('registrarPanel.fecha')}</span>
              <select
                className={ESTILO_SELECT}
                id="fecha"
                onChange={(e) => {
                  setFecha(e.target.value)
                  setBloqueId('')
                }}
                value={fecha}
              >
                <option value="">{t('registrarPanel.elegirFecha')}</option>
                {dias.map((dia) => (
                  <option disabled={dia.libres === 0} key={dia.fecha} value={dia.fecha}>
                    {fechaLarga(dia.fecha)} ·{' '}
                    {dia.libres > 0
                      ? t('registrarPanel.lugares', { count: dia.libres })
                      : t('registrarPanel.lleno')}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2" htmlFor="horario">
              <span className="text-base font-semibold text-principal">{t('registrarPanel.horario')}</span>
              <select
                className={ESTILO_SELECT}
                disabled={!fecha}
                id="horario"
                onChange={(e) => setBloqueId(e.target.value)}
                value={bloqueId}
              >
                <option value="">{t('registrarPanel.elegirHorario')}</option>
                {horarios.map((bloque) => (
                  <option disabled={bloque.libres === 0} key={bloque.bloque_id} value={bloque.bloque_id}>
                    {formatearHora(bloque.hora)} ·{' '}
                    {bloque.libres > 0
                      ? t('registrarPanel.lugares', { count: bloque.libres })
                      : t('registrarPanel.lleno')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              error={errorDe('nombres')}
              etiqueta={t('registro.nombre')}
              id="nombres"
              onBlur={() => {
                tocar('nombres')
                cambiar('nombres', formatearNombre(datos.nombres))
              }}
              onChange={(e) => cambiar('nombres', e.target.value)}
              required
              value={datos.nombres}
            />
            <Campo
              error={errorDe('apellidos')}
              etiqueta={t('registro.apellidos')}
              id="apellidos"
              onBlur={() => {
                tocar('apellidos')
                cambiar('apellidos', formatearNombre(datos.apellidos))
              }}
              onChange={(e) => cambiar('apellidos', e.target.value)}
              required
              value={datos.apellidos}
            />
          </div>

          <CampoTelefono
            alCambiarPais={cambiarPaisTelefono}
            alCambiarValor={(valor) => cambiar('telefono', valor)}
            error={errorDe('telefono')}
            etiqueta={t('registro.telefono')}
            id="telefono"
            onBlur={() => tocar('telefono')}
            pais={pais}
            valor={datos.telefono}
          />

          <div>
            <Campo
              error={errorDe('correo')}
              etiqueta={t('registrarPanel.correoOpcional')}
              id="correo"
              inputMode="email"
              onBlur={() => tocar('correo')}
              onChange={(e) => cambiar('email', e.target.value)}
              type="email"
              value={datos.email}
            />
            {sugerencia && (
              <p className="mt-1 text-base text-principal">
                {t('validacion.correo.sugerencia', { correo: sugerencia })}{' '}
                <button
                  className="min-h-10 font-semibold underline underline-offset-4"
                  onClick={() => cambiar('email', sugerencia)}
                  type="button"
                >
                  {t('validacion.correo.usarSugerencia')}
                </button>
              </p>
            )}
          </div>

          <CamposDomicilio
            alCambiar={setDomicilio}
            busqueda={busqueda}
            errorDe={errorDe}
            panel
            tocar={tocar}
            valor={domicilio}
          />

          <AvisoPrivacidad acepto={acepto} alCambiar={setAcepto} error={errorDe('consentimiento')} panel />

          {error && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`registro.errores.${error}`, {
                defaultValue: t(`panel.errores.${error}`, {
                  defaultValue: t('registro.errores.ERROR_DESCONOCIDO'),
                }),
              })}
            </p>
          )}

          <Boton disabled={enviando || !bloqueId} type="submit">
            {enviando ? t('registrarPanel.registrando') : t('registrarPanel.registrar')}
          </Boton>
        </form>
      </Tarjeta>

      {/* Para quien ya tiene su cita de la semana y necesita otra. */}
      <ExcepcionSemana alAutorizar={() => setRecarga((n) => n + 1)} bloques={bloques} />
    </div>
  )
}
