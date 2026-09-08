import { Route } from 'react-router-dom'
import CitasDeHoy from '../paginas/admin/CitasDeHoy'
import HorariosAdmin from '../paginas/admin/Horarios'
import Login from '../paginas/admin/Login'
import Personas from '../paginas/admin/Personas'
import Reportes from '../paginas/admin/Reportes'
import RutaProtegida from './RutaProtegida'

export default function RutasAdmin() {
  return (
    <>
      <Route element={<Login />} path="/admin/login" />
      <Route element={<RutaProtegida />}>
        <Route element={<CitasDeHoy />} path="/admin" />
        <Route element={<CitasDeHoy />} path="/admin/citas-hoy" />
        <Route element={<HorariosAdmin />} path="/admin/horarios" />
        <Route element={<Personas />} path="/admin/personas" />
        <Route element={<Reportes />} path="/admin/reportes" />
      </Route>
    </>
  )
}
