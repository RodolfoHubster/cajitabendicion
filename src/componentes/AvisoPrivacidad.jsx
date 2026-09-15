import { useTranslation } from 'react-i18next'
import { LuLock } from 'react-icons/lu'

/**
 * Aviso de privacidad y la casilla "comparto esta informacion por mi
 * voluntad". Sin la casilla no se registra; la base guarda cuando se acepto.
 * Desde el panel, la casilla dice que la persona se lo confirmo al pastor.
 */
export default function AvisoPrivacidad({ acepto, alCambiar, error, panel = false }) {
  const { t } = useTranslation()
  const idError = error ? 'consentimiento-error' : undefined

  return (
    <div
      className={`rounded-2xl border bg-principal/5 p-4 ${
        error ? 'border-ya-recibio ring-2 ring-ya-recibio/25' : 'border-principal/15'
      }`}
    >
      <p className="flex items-center gap-2 text-base font-bold text-principal">
        <LuLock aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
        {t('privacidad.titulo')}
      </p>
      <p className="mt-1 text-base text-principal/80">{t('privacidad.texto')}</p>

      <label className="mt-3 flex cursor-pointer items-start gap-3" htmlFor="consentimiento">
        <input
          aria-describedby={idError}
          aria-invalid={error ? true : undefined}
          checked={acepto}
          className="mt-1 h-6 w-6 shrink-0 accent-principal"
          id="consentimiento"
          onChange={(e) => alCambiar(e.target.checked)}
          type="checkbox"
        />
        <span className="text-base font-semibold text-principal">
          {t(panel ? 'privacidad.casillaPanel' : 'privacidad.casilla')}
        </span>
      </label>

      {error && (
        <p className="mt-2 text-base font-semibold text-ya-recibio" id={idError}>
          {error}
        </p>
      )}
    </div>
  )
}
