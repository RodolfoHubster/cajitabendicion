import { Navigate, Route, Routes } from 'react-router-dom'
import RutasAdmin from './RutasAdmin'
import RutasPublicas from './RutasPublicas'

export default function AppRouter() {
  return (
    <Routes>
      {/*
        RutasPublicas y RutasAdmin se invocan como funciones, no se montan
        como <RutasPublicas />. <Routes> solo acepta <Route> o fragmentos;
        un componente propio hace que React Router lance
        "is not a <Route> component" y la app queda en blanco.
        Al invocarlas se obtiene el fragmento que devuelven, que si acepta.
      */}
      {RutasPublicas()}
      {RutasAdmin()}
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
