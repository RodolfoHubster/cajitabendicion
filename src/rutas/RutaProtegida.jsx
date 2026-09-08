import { Navigate, Outlet } from 'react-router-dom'

export default function RutaProtegida() {
  const sesionActiva = false

  // TODO: validar sesión real del personal administrativo
  if (!sesionActiva) {
    return <Navigate replace to="/admin/login" />
  }

  return <Outlet />
}
