import { Route } from 'react-router-dom'
import Calendario from '../paginas/publico/Calendario'
import CambiarHorario from '../paginas/publico/CambiarHorario'
import Confirmacion from '../paginas/publico/Confirmacion'
import Horarios from '../paginas/publico/Horarios'
import Inicio from '../paginas/publico/Inicio'
import Pase from '../paginas/publico/Pase'
import Preguntas from '../paginas/publico/Preguntas'
import QuienesSomos from '../paginas/publico/QuienesSomos'
import Registro from '../paginas/publico/Registro'

export default function RutasPublicas() {
  return (
    <>
      <Route element={<Inicio />} path="/" />
      <Route element={<Calendario />} path="/calendario" />
      <Route element={<Horarios />} path="/horarios/:fecha" />
      <Route element={<Registro />} path="/registro" />
      <Route element={<Confirmacion />} path="/confirmacion/:id" />
      <Route element={<CambiarHorario />} path="/cambiar/:id" />
      <Route element={<Pase />} path="/pase/:id" />
      <Route element={<Preguntas />} path="/preguntas" />
      <Route element={<QuienesSomos />} path="/quienes-somos" />
    </>
  )
}
