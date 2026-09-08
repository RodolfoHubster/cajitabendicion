import { Navigate, Route, Routes } from 'react-router-dom'
import RutasAdmin from './RutasAdmin'
import RutasPublicas from './RutasPublicas'

export default function AppRouter() {
  return (
    <Routes>
      <RutasPublicas />
      <RutasAdmin />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
