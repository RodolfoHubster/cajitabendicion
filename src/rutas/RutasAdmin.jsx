import { Route } from 'react-router-dom'
import CitasDeHoy from '../paginas/admin/CitasDeHoy'
import HorariosAdmin from '../paginas/admin/Horarios'
import Login from '../paginas/admin/Login'
import Personas from '../paginas/admin/Personas'
import RegistrarPersona from '../paginas/admin/RegistrarPersona'
import Reportes from '../paginas/admin/Reportes'
import Escanear from '../paginas/escaneo/Escanear'
import DisenoAdmin from './DisenoAdmin'
import RutaProtegida from './RutaProtegida'
import SoloRol from './SoloRol'

export default function RutasAdmin() {
  return (
    <>
      <Route element={<Login />} path="/admin/login" />

      {/* RutaProtegida exige sesion y averigua el rol. */}
      <Route element={<RutaProtegida />}>
        {/* DisenoAdmin pone la barra de navegacion alrededor de todo. */}
        <Route element={<DisenoAdmin />}>
          <Route element={<SoloRol roles={['admin']} />}>
            <Route element={<CitasDeHoy />} path="/admin" />
            <Route element={<CitasDeHoy />} path="/admin/citas-hoy" />
            <Route element={<RegistrarPersona />} path="/admin/registrar" />
            <Route element={<HorariosAdmin />} path="/admin/horarios" />
            <Route element={<Personas />} path="/admin/personas" />
            <Route element={<Reportes />} path="/admin/reportes" />
          </Route>

          <Route element={<SoloRol roles={['admin', 'voluntario']} />}>
            <Route element={<Escanear />} path="/escanear" />
          </Route>
        </Route>
      </Route>
    </>
  )
}
