import AvisoIdioma from './componentes/AvisoIdioma'
import AvisoPruebas from './componentes/AvisoPruebas'
import Encabezado from './componentes/Encabezado'
import Pie from './componentes/Pie'
import RedDeSeguridad from './componentes/RedDeSeguridad'
import { useLocation } from 'react-router-dom'
import AppRouter from './rutas/AppRouter'
import IrArriba from './rutas/IrArriba'
import { useAnchoPagina } from './rutas/anchoPagina'

export default function App() {
  // Lo publico va angosto; el panel, ancho (ver rutas/anchoPagina.js).
  const ancho = useAnchoPagina()
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen bg-fondo text-principal">
      {/* Antes del encabezado: no dibuja nada, solo sube el scroll al
          cambiar de pantalla. */}
      <IrArriba />

      {/* Solo con la base de pruebas: que nunca se confundan. */}
      <AvisoPruebas />
      <Encabezado />
      {/* Fuera del encabezado fijo: se va con el scroll en vez de robarle
          altura a la pantalla todo el tiempo. */}
      <AvisoIdioma />
      <main className={`mx-auto w-full ${ancho} p-4`}>
        {/* Si una pantalla falla, un aviso con que hacer, no una pagina en
            blanco. Con key: al cambiar de pagina se reinicia. */}
        <RedDeSeguridad key={pathname}>
          <AppRouter />
        </RedDeSeguridad>
      </main>
      <Pie />
    </div>
  )
}
