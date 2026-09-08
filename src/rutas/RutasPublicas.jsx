import { Route } from 'react-router-dom'
import Escanear from '../paginas/escaneo/Escanear'
import Calendario from '../paginas/publico/Calendario'
import Confirmacion from '../paginas/publico/Confirmacion'
import Horarios from '../paginas/publico/Horarios'
import Inicio from '../paginas/publico/Inicio'
import Registro from '../paginas/publico/Registro'

export default function RutasPublicas() {
  return (
    <>
      <Route element={<Inicio />} path="/" />
      <Route element={<Calendario />} path="/calendario" />
      <Route element={<Horarios />} path="/horarios/:fecha" />
      <Route element={<Registro />} path="/registro" />
      <Route element={<Confirmacion />} path="/confirmacion/:id" />
      <Route element={<Escanear />} path="/escanear" />
    </>
  )
}
