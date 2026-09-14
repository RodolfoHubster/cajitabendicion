import { Navigate, Outlet, useOutletContext } from 'react-router-dom'

/**
 * Deja pasar solo a ciertos roles.
 *
 * No es la seguridad: esa la pone la base de datos, que niega los datos
 * aunque alguien escriba la direccion a mano. Esto solo evita mostrarle a
 * un voluntario una pantalla que de todos modos le fallaria, y lo manda a
 * la suya.
 */
export default function SoloRol({ roles }) {
  const contexto = useOutletContext()

  if (!roles.includes(contexto?.rol)) {
    return <Navigate replace to="/escanear" />
  }

  return <Outlet context={contexto} />
}
