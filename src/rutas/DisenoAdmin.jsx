import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuCircleHelp, LuMenu } from 'react-icons/lu'
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import GuiaDelPanel from '../componentes/guia/GuiaDelPanel'
import {
  VERSION_GUIA,
  guiaDeRol,
  marcarGuiaVista,
  pasosDeGuia,
  pasosPendientes,
  versionVista,
} from '../datos/guia'
import { cerrarSesion } from '../datos/sesion'
import { seccionActual, seccionesVisibles } from './menu'

export default function DisenoAdmin() {
  const { t } = useTranslation()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const contexto = useOutletContext()
  const { rol, correo, permisos } = contexto

  // En movil el menu empieza cerrado: deslizar una fila de diez pestanas
  // para llegar a la ultima era lentisimo con el telefono en una mano.
  const [abierto, setAbierto] = useState(false)

  const secciones = seccionesVisibles(rol, permisos)
  const actual = seccionActual(secciones, pathname)

  // La guia paso a paso: { pasos, novedades } mientras esta abierta.
  const [guia, setGuia] = useState(null)
  const tipoGuia = guiaDeRol(rol)

  //  La primera vez que esta cuenta entra al panel (o si hay novedades desde
  //  la ultima vez), la guia se abre sola. Se guarda por cuenta: en un
  //  telefono compartido, el segundo voluntario tambien la ve.
  useEffect(() => {
    let vigente = true

    versionVista(tipoGuia, correo).then((vista) => {
      if (!vigente || vista >= VERSION_GUIA) return
      const claves = seccionesVisibles(rol, permisos).map((seccion) => seccion.clave)
      const pendientes = pasosPendientes(pasosDeGuia({ rol, permisos, secciones: claves }), vista)
      //  Si lo nuevo es de pantallas que no le tocan, no hay nada que ensenarle.
      if (pendientes.length > 0) setGuia({ pasos: pendientes, novedades: vista > 0 })
      else marcarGuiaVista(tipoGuia, correo)
    })

    return () => {
      vigente = false
    }
  }, [tipoGuia, correo, rol, permisos])

  //  Terminada, saltada o cerrada: ya la vio. Se vuelve a abrir desde el menu.
  const cerrarGuia = useCallback(() => {
    setGuia(null)
    marcarGuiaVista(tipoGuia, correo)
  }, [tipoGuia, correo])

  function abrirGuia() {
    setAbierto(false)
    const claves = secciones.map((seccion) => seccion.clave)
    setGuia({ pasos: pasosDeGuia({ rol, permisos, secciones: claves }), novedades: false })
  }

  async function salir() {
    await cerrarSesion()
    navegar('/admin/login', { replace: true })
  }

  const estilo = ({ isActive }) =>
    [
      'flex min-h-14 items-center whitespace-nowrap rounded-xl px-4 text-base font-semibold transition',
      isActive ? 'bg-marca text-white' : 'text-principal hover:bg-principal/10',
    ].join(' ')

  const cuenta = (
    <>
      <p className="break-all text-base text-principal/70">{correo}</p>
      <p className="text-base font-semibold text-principal">{t(`rol.nombre.${rol}`)}</p>
      <button
        className="mt-2 min-h-14 w-full rounded-xl border border-principal text-base font-semibold text-principal"
        onClick={salir}
        type="button"
      >
        {t('admin.salir')}
      </button>
    </>
  )

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/*
        En movil, un boton que abre la lista completa de una vez. En
        pantalla grande, la misma lista siempre a la vista, a un lado.
      */}
      <nav className="lg:sticky lg:top-24 lg:w-60 lg:shrink-0">
        <button
          aria-controls="menu-panel"
          aria-expanded={abierto}
          className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal shadow-sm lg:hidden"
          onClick={() => setAbierto((estaba) => !estaba)}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-3">
            <LuMenu aria-hidden="true" className="h-6 w-6 shrink-0" />
            {/* El nombre de donde se esta: el boton dice algo, no solo tres rayas. */}
            <span className="truncate">{actual ? t(`nav.${actual.clave}`) : t('nav.menu')}</span>
          </span>
          <LuChevronDown
            aria-hidden="true"
            className={`h-6 w-6 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`}
          />
        </button>

        <ul
          className={`${
            abierto ? 'mt-2' : 'hidden'
          } space-y-1 rounded-xl border border-principal/15 bg-superficie p-2 shadow-lg lg:mt-0 lg:block lg:space-y-2 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
          id="menu-panel"
        >
          {secciones.map(({ a, clave, exacta }) => (
            <li key={a}>
              {/* Se cierra al escoger: en movil, si no, tapa la pantalla. */}
              <NavLink className={estilo} end={exacta} onClick={() => setAbierto(false)} to={a}>
                {t(`nav.${clave}`)}
              </NavLink>
            </li>
          ))}
          <li>
            {/* La guia paso a paso, para volver a verla cuando se quiera. */}
            <button
              className="flex min-h-14 w-full items-center gap-2 whitespace-nowrap rounded-xl px-4 text-left text-base font-semibold text-principal transition hover:bg-principal/10"
              onClick={abrirGuia}
              type="button"
            >
              <LuCircleHelp aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
              {t('guia.abrir')}
            </button>
          </li>
        </ul>

        <div className="mt-3 hidden rounded-xl bg-principal/5 p-3 lg:block">{cuenta}</div>
      </nav>

      <div className="min-w-0 flex-1">
        <Outlet context={contexto} />

        <div className="mt-4 rounded-xl bg-principal/5 p-3 lg:hidden">{cuenta}</div>
      </div>

      {guia && <GuiaDelPanel alCerrar={cerrarGuia} novedades={guia.novedades} pasos={guia.pasos} />}
    </div>
  )
}
