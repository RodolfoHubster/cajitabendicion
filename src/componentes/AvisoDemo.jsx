import { useTranslation } from 'react-i18next'
import { LuClapperboard } from 'react-icons/lu'
import { useLocation } from 'react-router-dom'
import { enDemo, esDelPersonal } from '../datos/demo'

/**
 * La franja del modo de ejemplo (?demo=1, datos/demo.js): avisa que nada
 * se guarda y que el codigo que salga no sirve, por si el enlace llega a
 * quien no debia. Para el video se recorta. En el panel no sale.
 */
export default function AvisoDemo() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  if (!enDemo() || esDelPersonal(pathname)) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-marca px-3 py-2 text-center text-base text-white" role="note">
      <span className="inline-flex items-center gap-2 font-semibold">
        <LuClapperboard aria-hidden="true" className="h-5 w-5 shrink-0" />
        {t('demo.aviso')}
      </span>
      {/* Recarga completa: asi se olvida el ejemplo en esta pestana. */}
      <a className="font-bold underline underline-offset-4" href="/?demo=0">
        {t('demo.salir')}
      </a>
    </div>
  )
}
