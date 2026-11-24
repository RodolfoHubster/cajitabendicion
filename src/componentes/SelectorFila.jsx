import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import { LuLayers } from 'react-icons/lu'
import { VISTAS } from '../datos/filas'

const ICONOS = { juntas: LuLayers, carro: FaCarSide, a_pie: FaPersonWalking }

/**
 * Juntas · En carro · A pie. Tres botones de un toque, no una lista
 * desplegable: se cambia de vista a media entrega, con prisa.
 *
 * En el telefono el icono va arriba de la palabra: lado a lado, en un
 * telefono de 360 px, "En carro" salia como "En c…". Con la letra grande,
 * uno debajo del otro.
 */
export default function SelectorFila({ valor, alCambiar, className = '' }) {
  const { t } = useTranslation()

  return (
    <div
      aria-label={t('filas.titulo')}
      className={`inline-grid w-full grid-cols-1 gap-1 rounded-2xl bg-principal/5 p-1 ring-1 ring-principal/10 min-[20em]:grid-cols-3 sm:w-auto ${className}`}
      role="radiogroup"
    >
      {VISTAS.map((vista) => {
        const Icono = ICONOS[vista]
        const activa = vista === valor

        return (
          <button
            aria-checked={activa}
            className={`flex min-h-12 flex-row items-center justify-center gap-x-2 gap-y-0.5 rounded-xl px-2 py-1 text-center text-base font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/40 min-[20em]:flex-col sm:flex-row sm:px-3 ${
              activa ? 'bg-marca text-white shadow-sm' : 'text-principal hover:bg-principal/10'
            }`}
            key={vista}
            onClick={() => alCambiar(vista)}
            role="radio"
            type="button"
          >
            <Icono aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{t(`filas.vista.${vista}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
