import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { cerrarSesion } from '../datos/sesion'

// Que ve cada rol en la barra. El voluntario solo escanea.
const SECCIONES = [
  { a: '/admin', clave: 'citasHoy', exacta: true, roles: ['admin'] },
  { a: '/admin/registrar', clave: 'registrar', roles: ['admin'] },
  { a: '/admin/horarios', clave: 'horarios', roles: ['admin'] },
  { a: '/admin/personas', clave: 'personas', roles: ['admin'] },
  { a: '/admin/reportes', clave: 'reportes', roles: ['admin'] },
  { a: '/admin/equipo', clave: 'equipo', roles: ['admin'] },
  { a: '/escanear', clave: 'escanear', roles: ['admin', 'voluntario'] },
]

export default function DisenoAdmin() {
  const { t } = useTranslation()
  const navegar = useNavigate()
  const contexto = useOutletContext()
  const { rol, correo } = contexto

  const secciones = SECCIONES.filter((seccion) => seccion.roles.includes(rol))

  async function salir() {
    await cerrarSesion()
    navegar('/admin/login', { replace: true })
  }

  const estilo = ({ isActive }) =>
    [
      'flex min-h-14 items-center whitespace-nowrap rounded-xl px-4 text-base font-semibold transition',
      isActive ? 'bg-principal text-white' : 'text-principal hover:bg-principal/10',
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
        En movil la navegacion es una fila que se desliza; en pantalla
        grande, una columna a un lado. El voluntario trabaja de pie con
        el telefono en una mano, asi que en movil no se roba altura.
      */}
      <nav className="lg:sticky lg:top-24 lg:w-60 lg:shrink-0">
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
          {secciones.map(({ a, clave, exacta }) => (
            <li key={a}>
              <NavLink className={estilo} end={exacta} to={a}>
                {t(`nav.${clave}`)}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-3 hidden rounded-xl bg-principal/5 p-3 lg:block">{cuenta}</div>
      </nav>

      <div className="min-w-0 flex-1">
        <Outlet context={contexto} />

        <div className="mt-4 rounded-xl bg-principal/5 p-3 lg:hidden">{cuenta}</div>
      </div>
    </div>
  )
}
