import Encabezado from './componentes/Encabezado'
import AppRouter from './rutas/AppRouter'

export default function App() {
  return (
    <div className="min-h-screen bg-fondo text-principal">
      <Encabezado />
      <main className="mx-auto w-full max-w-3xl p-4">
        <AppRouter />
      </main>
    </div>
  )
}
