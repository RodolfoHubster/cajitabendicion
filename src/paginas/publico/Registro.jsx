import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import CampoTelefono from '../../componentes/CampoTelefono'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Pasos from '../../componentes/Pasos'
import Tarjeta from '../../componentes/Tarjeta'
import { mensajeCorreo, mensajeNombre, mensajeTelefono } from '../../componentes/mensajesValidacion'
import { leerCodigoAnticipado } from '../../datos/anticipado'
import { aFechaLocal, consultarBloquesDeFecha, formatearHora } from '../../datos/disponibilidad'
import { registrarYReservar } from '../../datos/registro'
import { normalizarTelefono } from '../../datos/telefono'
import { formatearNombre, sugerirCorreo, validarCorreo, validarNombre } from '../../datos/validaciones'
import { OTRA_ZONA, ZONAS } from '../../datos/zonas'

// En este orden se revisan; se enfoca el primero que tenga error.
const CAMPOS = ['nombres', 'apellidos', 'telefono', 'correo']

export default function Registro() {
  const { t, i18n } = useTranslation()
  const [parametros] = useSearchParams()
  const navegar = useNavigate()

  const bloqueId = parametros.get('bloque')
  const fecha = parametros.get('fecha')

  const [bloque, setBloque] = useState(null)
  const [cargando, setCargando] = useState(Boolean(bloqueId && fecha))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [pais, setPais] = useState('US')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [zona, setZona] = useState('')
  const [otraZona, setOtraZona] = useState('')

  // Un campo se marca en rojo al salir de el o al intentar enviar. Desde ahi
  // el mensaje cambia mientras escribe y desaparece en cuanto queda bien.
  const [tocados, setTocados] = useState(() => new Set())
  const [intento, setIntento] = useState(false)

  useEffect(() => {
    if (!bloqueId || !fecha) return

    let vigente = true

    consultarBloquesDeFecha(fecha)
      .then((bloques) => {
        if (vigente) setBloque(bloques.find((b) => b.bloque_id === bloqueId) ?? null)
      })
      .catch(() => {
        if (vigente) setBloque(null)
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [bloqueId, fecha])

  const volver = (
    <Boton onClick={() => navegar('/calendario')} variant="secondary">
      {t('horarios.volverCalendario')}
    </Boton>
  )

  if (!bloqueId || !fecha) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.registro')}</h1>
        <p className="mb-4 text-base">{t('registro.sinHorario')}</p>
        {volver}
      </Tarjeta>
    )
  }

  if (cargando) {
    return (
      <Tarjeta>
        <p className="text-base">{t('registro.cargando')}</p>
      </Tarjeta>
    )
  }

  if (!bloque) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.registro')}</h1>
        <p className="mb-4 text-base">{t('registro.horarioNoDisponible')}</p>
        {volver}
      </Tarjeta>
    )
  }

  // Fecha bloqueada: sin codigo de suscriptor no se llega aqui ni escribiendo
  // la direccion. La base de datos lo vuelve a revisar al guardar.
  if (bloque.abierto === false && !leerCodigoAnticipado(fecha)) {
    return <Navigate replace to="/calendario" />
  }

  const encabezado = `${new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(bloque.fecha))}, ${formatearHora(bloque.hora)}`

  const telefonoRevisado = normalizarTelefono(pais, telefono)

  const errores = {
    nombres: mensajeNombre(t, validarNombre(nombres), 'nombres'),
    apellidos: mensajeNombre(t, validarNombre(apellidos), 'apellidos'),
    telefono: mensajeTelefono(t, telefonoRevisado, i18n.language),
    correo: mensajeCorreo(t, validarCorreo(email)),
  }

  const errorDe = (campo) => (intento || tocados.has(campo) ? errores[campo] : undefined)
  const tocar = (campo) => setTocados((actuales) => new Set(actuales).add(campo))
  const sugerencia = errores.correo ? null : sugerirCorreo(email)

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

    const nombresListos = formatearNombre(nombres)
    const apellidosListos = formatearNombre(apellidos)

    try {
      const cita = await registrarYReservar({
        nombres: nombresListos,
        apellidos: apellidosListos,
        telefono: telefonoRevisado.e164,
        email: email.trim(),
        ciudad: zona === OTRA_ZONA ? otraZona : zona,
        bloqueId,
        fecha,
      })

      // Se pasa el nombre porque la funcion no lo devuelve y la pantalla de
      // confirmacion lo muestra ("A nombre de..."). Al recargar se obtiene
      // de consultar_cita.
      navegar(`/confirmacion/${cita.token_qr}`, {
        state: { ...cita, nombre: `${nombresListos} ${apellidosListos}` },
      })
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <EnlaceVolver a={`/horarios/${fecha}`}>{t('navegacion.cambiarHorario')}</EnlaceVolver>
      <Pasos actual={3} />

      <h1 className="mb-1 text-2xl font-bold">{t('pages.registro')}</h1>
      <p className="mb-4 text-base text-principal/70">{encabezado}</p>

      {/* noValidate: los avisos del navegador salen en ingles y en globitos que
          desaparecen; los nuestros se quedan junto al campo y en su idioma. */}
      <form className="space-y-4" noValidate onSubmit={enviar}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            autoComplete="given-name"
            error={errorDe('nombres')}
            etiqueta={t('registro.nombre')}
            id="nombres"
            onBlur={() => {
              tocar('nombres')
              setNombres(formatearNombre(nombres))
            }}
            onChange={(e) => setNombres(e.target.value)}
            required
            value={nombres}
          />
          <Campo
            autoComplete="family-name"
            error={errorDe('apellidos')}
            etiqueta={t('registro.apellidos')}
            id="apellidos"
            onBlur={() => {
              tocar('apellidos')
              setApellidos(formatearNombre(apellidos))
            }}
            onChange={(e) => setApellidos(e.target.value)}
            required
            value={apellidos}
          />
        </div>

        <CampoTelefono
          alCambiarPais={setPais}
          alCambiarValor={setTelefono}
          error={errorDe('telefono')}
          etiqueta={t('registro.telefono')}
          id="telefono"
          onBlur={() => tocar('telefono')}
          pais={pais}
          valor={telefono}
        />

        <div>
          <Campo
            autoComplete="email"
            error={errorDe('correo')}
            etiqueta={t('registro.correo')}
            id="correo"
            inputMode="email"
            onBlur={() => tocar('correo')}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
          {sugerencia && (
            <p className="mt-1 text-base text-principal">
              {t('validacion.correo.sugerencia', { correo: sugerencia })}{' '}
              <button
                className="min-h-10 font-semibold underline underline-offset-4"
                onClick={() => setEmail(sugerencia)}
                type="button"
              >
                {t('validacion.correo.usarSugerencia')}
              </button>
            </p>
          )}
          <p className="mt-1 text-base text-principal/60">{t('registro.correoAyuda')}</p>
        </div>

        <div>
          <label className="flex w-full flex-col gap-2 text-left" htmlFor="zona">
            <span className="text-base font-medium text-principal">{t('registro.zona')}</span>
            <select
              className="min-h-14 rounded-xl border border-principal/20 bg-white px-3 text-base outline-none focus:border-principal"
              id="zona"
              onChange={(e) => setZona(e.target.value)}
              value={zona}
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

          {zona === OTRA_ZONA && (
            <div className="mt-3">
              <Campo
                etiqueta={t('registro.zonaOtraEtiqueta')}
                id="otraZona"
                onChange={(e) => setOtraZona(e.target.value)}
                value={otraZona}
              />
            </div>
          )}

          <p className="mt-1 text-base text-principal/60">{t('registro.zonaAyuda')}</p>
        </div>

        <p className="text-base text-principal/70">{t('registro.privacidad')}</p>

        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`registro.errores.${error}`, { defaultValue: t('registro.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}

        <Boton disabled={enviando} type="submit">
          {enviando ? t('registro.enviando') : t('registro.confirmar')}
        </Boton>
      </form>
    </Tarjeta>
  )
}
