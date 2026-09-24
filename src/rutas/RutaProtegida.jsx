import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Boton from '../componentes/Boton'
import Tarjeta from '../componentes/Tarjeta'
import { CLAVES_PERMISOS, misPermisos } from '../datos/permisos'
import { alCambiarSesion, cerrarSesion, obtenerRol, obtenerSesion } from '../datos/sesion'
import { EsqueletoNumeros, Hueso } from '../componentes/Esqueleto'

export default function RutaProtegida() {
  const { t } = useTranslation()
  const ubicacion = useLocation()
  const navegar = useNavigate()

  const [estado, setEstado] = useState({ revisando: true, sesion: null, rol: null, permisos: [], error: null })

  useEffect(() => {
    let vigente = true

    async function revisar() {
      const sesion = await obtenerSesion()
      let rol = null
      let permisos = []
      let error = null

      if (sesion) {
        try {
          rol = await obtenerRol()
        } catch (e) {
          error = e.message
        }
      }

      if (rol) {
        // Si la lista todavia no existe en la base (migracion sin aplicar),
        // el panel no se cae: el administrador sigue con todo y el
        // voluntario se queda como estaba, nada mas escaneando.
        permisos = await misPermisos().catch(() => (rol === 'admin' ? CLAVES_PERMISOS : []))
      }

      if (vigente) setEstado({ revisando: false, sesion, rol, permisos, error })
    }

    revisar()

    // Mantiene la pantalla al dia si la sesion caduca o se cierra desde
    // otra pestana, en vez de dejar al voluntario viendo datos viejos.
    const dejarDeEscuchar = alCambiarSesion(() => {
      revisar()
    })

    return () => {
      vigente = false
      dejarDeEscuchar()
    }
  }, [])

  async function salir() {
    await cerrarSesion()
    navegar('/admin/login', { replace: true })
  }

  // Recuperar la sesion guardada tarda un instante. Sin esta espera, al
  // recargar cualquier pantalla del panel se rebotaria al login aunque
  // la sesion siga siendo valida.
  if (estado.revisando) {
    return (
      <Tarjeta>
        <Hueso className="mb-4 h-8 w-1/2" />
        <EsqueletoNumeros texto={t('admin.verificando')} />
      </Tarjeta>
    )
  }

  if (!estado.sesion) {
    // Se recuerda a donde iba para regresarlo ahi despues de entrar.
    return <Navigate replace state={{ destino: ubicacion.pathname }} to="/admin/login" />
  }

  if (estado.error || !estado.rol) {
    return (
      <Tarjeta className="mx-auto max-w-xl">
        <h1 className="mb-2 text-2xl font-bold">
          {estado.error ? t('rol.errorTitulo') : t('rol.sinRolTitulo')}
        </h1>
        <p className="mb-4 text-base">
          {estado.error
            ? t(`panel.errores.${estado.error}`, { defaultValue: t('panel.errores.ERROR_DESCONOCIDO') })
            : t('rol.sinRolTexto')}
        </p>
        {/* Con Google es facil entrar con la cuenta equivocada: se dice cual. */}
        {!estado.error && estado.sesion.user?.email && (
          <p className="mb-4 text-base text-principal/70">
            {t('rol.cuentaActual', { correo: estado.sesion.user.email })}
          </p>
        )}
        <Boton onClick={salir} variant="secondary">
          {t('admin.salir')}
        </Boton>
      </Tarjeta>
    )
  }

  return (
    <Outlet
      context={{ rol: estado.rol, permisos: estado.permisos, correo: estado.sesion.user?.email ?? null }}
    />
  )
}
