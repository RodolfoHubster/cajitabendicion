import { Navigate, Outlet, useOutletContext } from 'react-router-dom'
import { puedeEntrar } from '../datos/permisos'

/**
 * Deja pasar por rol o por palomita.
 *
 * Con `roles` la pantalla es de esos roles y punto: asi se quedan Equipo y
 * accesos, Horarios y cupos, y Permisos, que no se abren a un voluntario
 * ni marcando nada. Con `permiso` pasa quien tenga esa palomita puesta.
 *
 * No es la seguridad: esa la pone la base de datos, que niega los datos
 * aunque alguien escriba la direccion a mano. Esto solo evita mostrarle a
 * un voluntario una pantalla que de todos modos le fallaria, y lo manda a
 * la suya.
 */
export default function SoloRol({ roles, permiso }) {
  const contexto = useOutletContext()

  if (!puedeEntrar({ roles, permiso }, contexto?.rol, contexto?.permisos)) {
    return <Navigate replace to="/escanear" />
  }

  return <Outlet context={contexto} />
}
