import AvisoIdioma from './componentes/AvisoIdioma'
import Encabezado from './componentes/Encabezado'
import Pie from './componentes/Pie'
import AppRouter from './rutas/AppRouter'

export default function App() {
  return (
    <div className="min-h-screen bg-fondo text-principal">
      <Encabezado />
      {/* Fuera del encabezado fijo: se va con el scroll en vez de robarle
          altura a la pantalla todo el tiempo. */}
      <AvisoIdioma />
      <main className="mx-auto w-full max-w-3xl p-4">
        <AppRouter />
      </main>
      <Pie />
    </div>
  )
}
