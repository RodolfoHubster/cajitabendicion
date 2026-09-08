import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Encabezado from '../componentes/Encabezado'
import CitasDeHoy from '../paginas/admin/CitasDeHoy'
import HorariosAdmin from '../paginas/admin/Horarios'
import Login from '../paginas/admin/Login'
import Personas from '../paginas/admin/Personas'
import Reportes from '../paginas/admin/Reportes'
import Escanear from '../paginas/escaneo/Escanear'
import Calendario from '../paginas/publico/Calendario'
import Confirmacion from '../paginas/publico/Confirmacion'
import Horarios from '../paginas/publico/Horarios'
import Inicio from '../paginas/publico/Inicio'
import Registro from '../paginas/publico/Registro'

function LayoutBase() {
  return (
    <div className="min-h-screen bg-white">
      <Encabezado />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
        <Outlet />
      </main>
    </div>
  )
}

function RutaProtegida({ children }) {
  const haySesion = false

  // TODO: validar sesión real con Supabase Auth.
  return haySesion ? children : <Navigate to="/admin/login" replace />
}

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<LayoutBase />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/horarios/:fecha" element={<Horarios />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/confirmacion/:id" element={<Confirmacion />} />
        <Route path="/escanear" element={<Escanear />} />
        <Route path="/admin/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <RutaProtegida>
              <Outlet />
            </RutaProtegida>
          }
        >
          <Route index element={<CitasDeHoy />} />
          <Route path="citas-hoy" element={<CitasDeHoy />} />
          <Route path="horarios" element={<HorariosAdmin />} />
          <Route path="personas" element={<Personas />} />
          <Route path="reportes" element={<Reportes />} />
        </Route>
      </Route>
    </Routes>
  )
}
