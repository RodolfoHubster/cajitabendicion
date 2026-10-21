import { Navigate, Route } from 'react-router-dom'
import Calendario from '../paginas/publico/Calendario'
import CambiarHorario from '../paginas/publico/CambiarHorario'
import Credencial from '../paginas/publico/Credencial'
import Confirmacion from '../paginas/publico/Confirmacion'
import Horarios from '../paginas/publico/Horarios'
import Inicio from '../paginas/publico/Inicio'
import Pase from '../paginas/publico/Pase'
import Preguntas from '../paginas/publico/Preguntas'
import QuienesSomos from '../paginas/publico/QuienesSomos'
import Registro from '../paginas/publico/Registro'
import Turno from '../paginas/publico/Turno'

export default function RutasPublicas() {
  return (
    <>
      <Route element={<Inicio />} path="/" />
      <Route element={<Calendario />} path="/calendario" />
      {/* El QR general de la entrada lleva a /turno: turno a pie sin datos. */}
      <Route element={<Turno />} path="/turno" />
      <Route element={<Navigate replace to="/turno" />} path="/a-pie" />
      <Route element={<Horarios />} path="/horarios/:fecha" />
      <Route element={<Registro />} path="/registro" />
      <Route element={<Confirmacion />} path="/confirmacion/:id" />
      <Route element={<CambiarHorario />} path="/cambiar/:id" />
      <Route element={<Pase />} path="/pase/:id" />
      <Route element={<Credencial />} path="/voluntario/:token" />
      <Route element={<Preguntas />} path="/preguntas" />
      <Route element={<QuienesSomos />} path="/quienes-somos" />
    </>
  )
}
