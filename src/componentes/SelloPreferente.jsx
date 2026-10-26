import { useTranslation } from 'react-i18next'
import { FaWheelchair } from 'react-icons/fa6'

/**
 * "Preferente", con el simbolo de accesibilidad (seccion 50). Lo ve el
 * voluntario al escanear un pase preferente (para="voluntario": revisa que
 * sea la persona) y la persona en su pase (para="persona").
 */
export default function SelloPreferente({ para = 'voluntario', className = '' }) {
  const { t } = useTranslation()

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-4 border-principal bg-principal/10 px-4 py-3 text-principal ${className}`}
      role="status"
    >
      <FaWheelchair aria-hidden="true" className="h-9 w-9 shrink-0" />
      <span>
        <span className="block font-titulo text-2xl font-bold leading-none">{t('preferente.etiqueta')}</span>
        <span className="block text-base font-semibold">{t(`preferente.${para}`)}</span>
      </span>
    </div>
  )
}
