import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleCheck } from 'react-icons/lu'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import CampoTelefono from '../../componentes/CampoTelefono'
import ExcepcionSemana from '../../componentes/ExcepcionSemana'
import Tarjeta from '../../componentes/Tarjeta'
import { mensajeCorreo, mensajeNombre, mensajeTelefono } from '../../componentes/mensajesValidacion'
import {
  aFechaLocal,
  agruparPorFecha,
  consultarDisponibilidad,
  formatearHora,
} from '../../datos/disponibilidad'
import { registrarDesdePanel } from '../../datos/panel'
import { normalizarTelefono } from '../../datos/telefono'
import { formatearNombre, sugerirCorreo, validarCorreo, validarNombre } from '../../datos/validaciones'
import { OTRA_ZONA, ZONAS } from '../../datos/zonas'

const VACIO = { nombres: '', apellidos: '', telefono: '', email: '', zona: '', otraZona: '' }

// En este orden se revisan; se enfoca el primero que tenga error.
const CAMPOS = ['nombres', 'apellidos', 'telefono', 'correo']

const ESTILO_SELECT =
  'min-h-14 w-full rounded-xl border border-principal/25 bg-white px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

/**
 * Registro desde el panel, para quien no puede registrarse por su cuenta:
 * el adulto mayor sin telefono, la persona que llega a la oficina.
 *
 * Solo admin. No aplica el limite por dispositivo (esta computadora
 * registra a muchas personas) y el correo es opcional. El cupo y la regla
 * de una cita por semana si aplican: los revisa la base de datos.
 *
 * Abajo, la excepcion para una segunda cita en la misma semana.
 */
export default function RegistrarPersona() {
  const { t, i18n } = useTranslation()

  const [bloques, setBloques] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [recarga, setRecarga] = useState(0)

  const [fecha, setFecha] = useState('')
  const [bloqueId, setBloqueId] = useState('')
  const [datos, setDatos] = useState(VACIO)
  const [pais, setPais] = useState('US')
  const [tocados, setTocados] = useState(() => new Set())
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [registrada, setRegistrada] = useState(null)

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

  const errores = {
    nombres: mensajeNombre(t, validarNombre(datos.nombres), 'nombres'),
    apellidos: mensajeNombre(t, validarNombre(datos.apellidos), 'apellidos'),
    telefono: mensajeTelefono(t, telefonoRevisado, i18n.language),
    // Muchos adultos mayores no tienen correo: aqui es opcional.
    correo: mensajeCorreo(t, validarCorreo(datos.email, { requerido: false })),
  }

  const errorDe = (campo) => (intento || tocados.has(campo) ? errores[campo] : undefined)
  const sugerencia = errores.correo ? null : sugerirCorreo(datos.email)

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)

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
      const cita = await registrarDesdePanel({
        nombres,
        apellidos,
        telefono: telefonoRevisado.e164,
        email: datos.email.trim(),
        ciudad: datos.zona === OTRA_ZONA ? datos.otraZona : datos.zona,
        bloqueId,
      })

      setRegistrada({ ...cita, nombre: `${nombres} ${apellidos}` })
      setDatos(VACIO)
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
        <p className="flex items-center gap-2 text-lg font-bold text-puede-pasar">
          <LuCircleCheck aria-hidden="true" className="h-6 w-6" />
          {t('registrarPanel.listo')}
        </p>
        <p className="mt-2 text-2xl font-bold first-letter:uppercase">
          {fechaLarga(registrada.fecha)}, {formatearHora(registrada.hora)}
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
            className="inline-flex min-h-14 items-center justify-center rounded-xl bg-principal px-4 text-base font-bold text-white shadow-sm transition hover:brightness-110"
            href={`/confirmacion/${registrada.token_qr}`}
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
          <div className="grid gap-4 sm:grid-cols-2">
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
            alCambiarPais={setPais}
            alCambiarValor={(valor) => cambiar('telefono', valor)}
            error={errorDe('telefono')}
            etiqueta={t('registro.telefono')}
            id="telefono"
            onBlur={() => tocar('telefono')}
            pais={pais}
            valor={datos.telefono}
          />

          <div className="grid items-start gap-4 sm:grid-cols-2">
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

            <label className="flex flex-col gap-2" htmlFor="zona">
              <span className="text-base font-semibold text-principal">{t('registro.zona')}</span>
              <select
                className={ESTILO_SELECT}
                id="zona"
                onChange={(e) => cambiar('zona', e.target.value)}
                value={datos.zona}
              >
                <option value="">{t('registro.zonaSinResponder')}</option>
                {ZONAS.map((nombreZona) => (
                  <option key={nombreZona} value={nombreZona}>
                    {nombreZona}
                  </option>
                ))}
                <option value={OTRA_ZONA}>{t('registro.zonaOtra')}</option>
              </select>
            </label>
          </div>

          {datos.zona === OTRA_ZONA && (
            <Campo
              etiqueta={t('registro.zonaOtraEtiqueta')}
              id="otraZona"
              onChange={(e) => cambiar('otraZona', e.target.value)}
              value={datos.otraZona}
            />
          )}

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
