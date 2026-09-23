import AvisoIdioma from './componentes/AvisoIdioma'
import Encabezado from './componentes/Encabezado'
import Pie from './componentes/Pie'
import AppRouter from './rutas/AppRouter'
import IrArriba from './rutas/IrArriba'
import { useAnchoPagina } from './rutas/anchoPagina'

export default function App() {
  // Lo publico va angosto; el panel, ancho (ver rutas/anchoPagina.js).
  const ancho = useAnchoPagina()

  return (
    <div className="min-h-screen bg-fondo text-principal">
      {/* Antes del encabezado: no dibuja nada, solo sube el scroll al
          cambiar de pantalla. */}
      <IrArriba />

      <Encabezado />
      {/* Fuera del encabezado fijo: se va con el scroll en vez de robarle
          altura a la pantalla todo el tiempo. */}
      <AvisoIdioma />
      <main className={`mx-auto w-full ${ancho} p-4`}>
        <AppRouter />
      </main>
      <Pie />
    </div>
  )
}
