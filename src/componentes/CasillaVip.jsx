import { useTranslation } from 'react-i18next'
import { LuCrown } from 'react-icons/lu'
import { BORDE_ORO, FONDO_ORO } from './SelloVip'

/**
 * "Pase VIP", enmarcado en dorado para que no pase desapercibido. Solo la
 * ve el administrador (la base tambien lo revisa).
 */
export default function CasillaVip({ id, marcada, alCambiar }) {
  const { t } = useTranslation()

  return (
    <label
      className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition ${
        marcada ? `${BORDE_ORO} ${FONDO_ORO}` : 'border-dashed border-[#B8860B]/60 hover:bg-[#F2C94C]/10'
      }`}
      htmlFor={id}
    >
      <input
        checked={marcada}
        className="mt-1 h-6 w-6 shrink-0 accent-[#B8860B]"
        id={id}
        onChange={(e) => alCambiar(e.target.checked)}
        type="checkbox"
      />
      <LuCrown aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#B8860B]" />
      <span>
        <span className="block text-base font-bold text-principal">{t('pases.opcionVip')}</span>
        <span className="block text-chica text-principal/70">{t('pases.opcionVipAyuda')}</span>
      </span>
    </label>
  )
}
