import { useTranslation } from 'react-i18next'
import { LuMail } from 'react-icons/lu'

/**
 * La casilla del boletin (seccion 54): opcional y sin marcar. Solo con ella
 * el correo entra a la lista de informacion general de la iglesia. Los
 * correos de su cita le llegan de todos modos.
 */
export default function CasillaBoletin({ acepto, alCambiar }) {
  const { t } = useTranslation()

  return (
    <div className="rounded-2xl border border-principal/15 p-4">
      <label className="flex cursor-pointer items-start gap-3" htmlFor="boletin">
        <input
          aria-describedby="boletin-ayuda"
          checked={acepto}
          className="mt-1 h-6 w-6 shrink-0 accent-principal"
          id="boletin"
          onChange={(e) => alCambiar(e.target.checked)}
          type="checkbox"
        />
        <span className="flex items-start gap-2 text-base font-semibold text-principal">
          <LuMail aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
          {t('boletin.casilla')}
        </span>
      </label>
      <p className="mt-2 text-base text-principal/80" id="boletin-ayuda">
        {t('boletin.ayuda')}
      </p>
    </div>
  )
}
