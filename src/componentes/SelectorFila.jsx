import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import { LuLayers } from 'react-icons/lu'
import { VISTAS } from '../datos/filas'

const ICONOS = { juntas: LuLayers, carro: FaCarSide, a_pie: FaPersonWalking }

/**
 * Juntas · En carro · A pie. Tres botones de un toque, no una lista
 * desplegable: se cambia de vista a media entrega, con prisa.
 */
export default function SelectorFila({ valor, alCambiar, className = '' }) {
  const { t } = useTranslation()

  return (
    <div
      aria-label={t('filas.titulo')}
      className={`inline-grid w-full grid-cols-3 gap-1 rounded-2xl bg-principal/5 p-1 ring-1 ring-principal/10 sm:w-auto ${className}`}
      role="radiogroup"
    >
      {VISTAS.map((vista) => {
        const Icono = ICONOS[vista]
        const activa = vista === valor

        return (
          <button
            aria-checked={activa}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/40 ${
              activa ? 'bg-marca text-white shadow-sm' : 'text-principal hover:bg-principal/10'
            }`}
            key={vista}
            onClick={() => alCambiar(vista)}
            role="radio"
            type="button"
          >
            <Icono aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(`filas.vista.${vista}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
