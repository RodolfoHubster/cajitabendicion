import { Route } from 'react-router-dom'
import Avisos from '../paginas/admin/Avisos'
import CitasDeHoy from '../paginas/admin/CitasDeHoy'
import Equipo from '../paginas/admin/Equipo'
import HorariosAdmin from '../paginas/admin/Horarios'
import Login from '../paginas/admin/Login'
import Pases from '../paginas/admin/Pases'
import Permisos from '../paginas/admin/Permisos'
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
          {/* Cada pantalla pide su palomita. Las mismas que revisa la base
              de datos, para que nadie vea un menu que luego le falla. */}
          <Route element={<SoloRol permiso="ver_citas_del_dia" />}>
            <Route element={<CitasDeHoy />} path="/admin" />
            <Route element={<CitasDeHoy />} path="/admin/citas-hoy" />
          </Route>

          <Route element={<SoloRol permiso="registrar_personas" />}>
            <Route element={<RegistrarPersona />} path="/admin/registrar" />
          </Route>

          <Route element={<SoloRol permiso="dar_pases" />}>
            <Route element={<Pases />} path="/admin/pases" />
          </Route>

          <Route element={<SoloRol permiso="ver_personas" />}>
            <Route element={<Personas />} path="/admin/personas" />
          </Route>

          <Route element={<SoloRol permiso="ver_reportes" />}>
            <Route element={<Reportes />} path="/admin/reportes" />
          </Route>

          <Route element={<SoloRol permiso="editar_textos" />}>
            <Route element={<Avisos />} path="/admin/avisos" />
          </Route>

          {/* Estas tres no se abren con ninguna palomita: en Equipo se dan
              los roles, en Horarios se mueve el cupo de toda la comunidad,
              y en Permisos se reparte todo lo demas. */}
          <Route element={<SoloRol roles={['admin']} />}>
            <Route element={<HorariosAdmin />} path="/admin/horarios" />
            <Route element={<Equipo />} path="/admin/equipo" />
            <Route element={<Permisos />} path="/admin/permisos" />
          </Route>

          <Route element={<SoloRol roles={['admin', 'voluntario']} />}>
            <Route element={<Escanear />} path="/escanear" />
          </Route>
        </Route>
      </Route>
    </>
  )
}
