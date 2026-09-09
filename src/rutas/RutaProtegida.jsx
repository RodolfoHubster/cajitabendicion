import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Tarjeta from '../componentes/Tarjeta'
import { alCambiarSesion, obtenerSesion } from '../datos/sesion'

export default function RutaProtegida() {
  const { t } = useTranslation()
  const ubicacion = useLocation()
  const [sesion, setSesion] = useState(null)
  const [revisando, setRevisando] = useState(true)

  useEffect(() => {
    let vigente = true

    obtenerSesion()
      .then((actual) => {
        if (vigente) setSesion(actual)
      })
      .finally(() => {
        if (vigente) setRevisando(false)
      })

    // Mantiene la pantalla al dia si la sesion caduca o se cierra desde
    // otra pestana, en vez de dejar al voluntario viendo datos viejos.
    return alCambiarSesion((actual) => {
      if (vigente) setSesion(actual)
    })
  }, [])

  // Recuperar la sesion guardada tarda un instante. Sin esta espera, al
  // recargar cualquier pantalla del panel se rebotaria al login aunque
  // la sesion siga siendo valida.
  if (revisando) {
    return (
      <Tarjeta>
        <p className="text-base">{t('admin.verificando')}</p>
      </Tarjeta>
    )
  }

  if (!sesion) {
    // Se recuerda a donde iba para regresarlo ahi despues de entrar.
    return <Navigate replace state={{ destino: ubicacion.pathname }} to="/admin/login" />
  }

  return <Outlet />
}
