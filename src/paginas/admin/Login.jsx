import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FcGoogle } from 'react-icons/fc'
import { useLocation, useNavigate } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Tarjeta from '../../componentes/Tarjeta'
import { iniciarSesion, iniciarSesionConGoogle, obtenerRol, obtenerSesion } from '../../datos/sesion'

// A donde entra cada rol si no venia de otra pantalla: el voluntario va
// directo a escanear, que es lo unico que hace.
async function inicioSegunRol() {
  const rol = await obtenerRol().catch(() => null)
  return rol === 'voluntario' ? '/escanear' : '/admin'
}

export default function Login() {
  const { t } = useTranslation()
  const navegar = useNavigate()
  const { state } = useLocation()

  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState(null)

  const destinoPedido = state?.destino

  // Si ya hay sesion, no tiene caso mostrar el formulario.
  useEffect(() => {
    let vigente = true

    obtenerSesion().then(async (sesion) => {
      if (!vigente || !sesion) return
      const destino = destinoPedido ?? (await inicioSegunRol())
      if (vigente) navegar(destino, { replace: true })
    })

    return () => {
      vigente = false
    }
  }, [destinoPedido, navegar])

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)
    setEntrando(true)

    try {
      await iniciarSesion(correo, contrasena)
      navegar(destinoPedido ?? (await inicioSegunRol()), { replace: true })
    } catch (e) {
      setError(e.message)
      setEntrando(false)
    }
  }

  // La pagina se va a Google y regresa al panel; el voluntario que llegue a
  // /admin es enviado a escanear por SoloRol.
  async function entrarConGoogle() {
    setError(null)
    setEntrando(true)

    try {
      await iniciarSesionConGoogle(destinoPedido ?? '/admin')
    } catch (e) {
      setError(e.message)
      setEntrando(false)
    }
  }

  return (
    <Tarjeta>
      <h1 className="mb-1 text-2xl font-bold">{t('pages.adminLogin')}</h1>
      <p className="mb-4 text-base text-principal/70">{t('admin.soloPersonal')}</p>

      <button
        className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-bold text-principal shadow-sm transition hover:border-principal focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-principal/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={entrando}
        onClick={entrarConGoogle}
        type="button"
      >
        <FcGoogle aria-hidden="true" className="h-6 w-6 shrink-0" />
        {t('admin.google')}
      </button>

      <div className="my-5 flex items-center gap-3 text-base text-principal/70">
        <span aria-hidden="true" className="h-px flex-1 bg-principal/15" />
        {t('admin.oCorreo')}
        <span aria-hidden="true" className="h-px flex-1 bg-principal/15" />
      </div>

      <form className="space-y-4" onSubmit={enviar}>
        <Campo
          autoComplete="email"
          etiqueta={t('admin.correo')}
          id="correo"
          inputMode="email"
          onChange={(e) => setCorreo(e.target.value)}
          required
          type="email"
          value={correo}
        />

        <Campo
          autoComplete="current-password"
          etiqueta={t('admin.contrasena')}
          id="contrasena"
          onChange={(e) => setContrasena(e.target.value)}
          required
          type="password"
          value={contrasena}
        />

        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`admin.errores.${error}`, { defaultValue: t('admin.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}

        <Boton disabled={entrando} type="submit" variant="secondary">
          {entrando ? t('admin.entrando') : t('admin.entrar')}
        </Boton>
      </form>
    </Tarjeta>
  )
}
