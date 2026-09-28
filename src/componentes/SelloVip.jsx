import { useTranslation } from 'react-i18next'
import { LuCrown } from 'react-icons/lu'

//  El dorado del VIP, el mismo del QR (datos/qrPase.js).
export const BORDE_ORO = 'border-[#B8860B]'
export const FONDO_ORO = 'bg-[#F2C94C]/25'

/**
 * "VIP · Pasa directo, sin hacer fila", en dorado. Lo ve el voluntario al
 * escanear un pase VIP (para) y la persona en su pase (tu).
 */
export default function SelloVip({ para = 'voluntario', className = '' }) {
  const { t } = useTranslation()

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-4 ${BORDE_ORO} ${FONDO_ORO} px-4 py-3 text-principal ${className}`}
      role="status"
    >
      <LuCrown aria-hidden="true" className="h-9 w-9 shrink-0 text-[#B8860B]" />
      <span>
        <span className="block font-titulo text-3xl font-bold leading-none tracking-wide">VIP</span>
        <span className="block text-base font-semibold">{t(`vip.${para}`)}</span>
      </span>
    </div>
  )
}
