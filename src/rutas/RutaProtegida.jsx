import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Boton from '../componentes/Boton'
import Tarjeta from '../componentes/Tarjeta'
import { CLAVES_PERMISOS, PERMISOS_POR_PERSONA, misPermisos } from '../datos/permisos'
import { alCambiarSesion, cerrarSesion, obtenerRol, obtenerSesion } from '../datos/sesion'
import { EsqueletoNumeros, Hueso } from '../componentes/Esqueleto'

export default function RutaProtegida() {
  const { t } = useTranslation()
  const ubicacion = useLocation()
  const navegar = useNavigate()

  const [estado, setEstado] = useState({ revisando: true, sesion: null, rol: null, permisos: [], error: null })
  //  "Intentar de nuevo" vuelve a revisar sin recargar.
  const [intento, setIntento] = useState(0)
  //  Lo ultimo que se supo con acceso: si al despertar el telefono la senal
  //  todavia no regresa, no se le saca del panel por eso.
  const ultimoBueno = useRef(null)

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
        permisos = await misPermisos().catch(() =>
          rol === 'admin' ? [...CLAVES_PERMISOS, ...PERMISOS_POR_PERSONA] : [],
        )
      }

      //  Ya tenia acceso y solo fallo la revision (sin senal al despertar
      //  el telefono): se queda como estaba. La base revisa el permiso en
      //  cada accion de todos modos.
      if (error && sesion && ultimoBueno.current) {
        if (vigente) setEstado({ ...ultimoBueno.current, sesion })
        return
      }

      const nuevo = { revisando: false, sesion, rol, permisos, error }
      if (rol) ultimoBueno.current = nuevo
      if (vigente) setEstado(nuevo)
    }

    revisar()

    // Mantiene la pantalla al dia si la sesion se cierra (o se entra con
    // otra cuenta) desde otra pestana. La renovacion sola del token (cada
    // hora, o al despertar el telefono) no cambia quien es: no se revisa.
    const dejarDeEscuchar = alCambiarSesion((_sesion, evento) => {
      if (evento === 'TOKEN_REFRESHED' || evento === 'INITIAL_SESSION') return
      revisar()
    })

    return () => {
      vigente = false
      dejarDeEscuchar()
    }
  }, [intento])

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
        {/* Casi siempre es la senal: primero se ofrece volver a intentar. */}
        {estado.error && (
          <Boton
            className="mb-3"
            onClick={() => {
              setEstado((antes) => ({ ...antes, revisando: true }))
              setIntento((n) => n + 1)
            }}
          >
            {t('rol.reintentar')}
          </Boton>
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
