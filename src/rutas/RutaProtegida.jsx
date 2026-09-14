import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Boton from '../componentes/Boton'
import Tarjeta from '../componentes/Tarjeta'
import { alCambiarSesion, cerrarSesion, obtenerRol, obtenerSesion } from '../datos/sesion'

export default function RutaProtegida() {
  const { t } = useTranslation()
  const ubicacion = useLocation()
  const navegar = useNavigate()

  const [estado, setEstado] = useState({ revisando: true, sesion: null, rol: null, error: null })

  useEffect(() => {
    let vigente = true

    async function revisar() {
      const sesion = await obtenerSesion()
      let rol = null
      let error = null

      if (sesion) {
        try {
          rol = await obtenerRol()
        } catch (e) {
          error = e.message
        }
      }

      if (vigente) setEstado({ revisando: false, sesion, rol, error })
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
        <p className="text-base">{t('admin.verificando')}</p>
      </Tarjeta>
    )
  }

  if (!estado.sesion) {
    // Se recuerda a donde iba para regresarlo ahi despues de entrar.
    return <Navigate replace state={{ destino: ubicacion.pathname }} to="/admin/login" />
  }

  if (estado.error || !estado.rol) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">
          {estado.error ? t('rol.errorTitulo') : t('rol.sinRolTitulo')}
        </h1>
        <p className="mb-4 text-base">
          {estado.error
            ? t(`panel.errores.${estado.error}`, { defaultValue: t('panel.errores.ERROR_DESCONOCIDO') })
            : t('rol.sinRolTexto')}
        </p>
        <Boton onClick={salir} variant="secondary">
          {t('admin.salir')}
        </Boton>
      </Tarjeta>
    )
  }

  return <Outlet context={{ rol: estado.rol, correo: estado.sesion.user?.email ?? null }} />
}
