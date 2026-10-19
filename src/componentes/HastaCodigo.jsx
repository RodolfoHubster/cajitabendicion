import { useTranslation } from 'react-i18next'
import { LuInfo } from 'react-icons/lu'
import { codigoNuncaSePide } from '../datos/filaAPie'

const ESTILO_INPUT =
  'min-h-12 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal disabled:opacity-50'

/**
 * Hasta que hora se pide el codigo del dia (seccion 47): todo el dia, o
 * hasta cierta hora. Despues de esa hora cualquiera saca turno con el QR del
 * cartel y queda al final de la fila. Se usa al crear la fila a pie
 * (CamposFilaAPie) y ya creada (CodigoDelDia).
 *
 * conHora: si se escogio "hasta las"; hasta: '13:00'. alCambiar({ conHora, hasta }).
 * sugerida: con que hora llenar "hasta las" al escogerlo (la de empezar).
 * fecha y abreEn ('2026-10-19T13:00'): para avisar si esa hora es antes de
 * que se abran los turnos, porque entonces nunca se pediria.
 */
export default function HastaCodigo({ id, conHora, hasta, sugerida = '', fecha, abreEn, disabled = false, alCambiar }) {
  const { t } = useTranslation()
  const nunca = conHora && codigoNuncaSePide(fecha, abreEn, hasta)

  return (
    <fieldset disabled={disabled}>
      <legend className="text-base font-semibold text-principal">{t('codigoDelDia.hasta.titulo')}</legend>
      <label className="mt-1 flex min-h-12 items-center gap-3 text-base">
        <input
          checked={!conHora}
          className="h-5 w-5"
          name={`codigoHasta-${id}`}
          onChange={() => alCambiar({ conHora: false, hasta })}
          type="radio"
        />
        {t('codigoDelDia.hasta.todoElDia')}
      </label>
      <label className="flex min-h-12 flex-wrap items-center gap-3 text-base">
        <input
          checked={conHora}
          className="h-5 w-5"
          name={`codigoHasta-${id}`}
          onChange={() => alCambiar({ conHora: true, hasta: hasta || sugerida })}
          type="radio"
        />
        {t('codigoDelDia.hasta.hastaLas')}
        <input
          aria-label={t('codigoDelDia.hasta.hora')}
          className={`${ESTILO_INPUT} w-40`}
          disabled={!conHora}
          id={`codigoHastaHora-${id}`}
          onChange={(e) => alCambiar({ conHora: true, hasta: e.target.value })}
          step="900"
          type="time"
          value={hasta}
        />
      </label>
      <p className="mt-1 text-base text-principal/70">{t('codigoDelDia.hasta.ayuda')}</p>
      {nunca && (
        <p className="mt-1 flex items-center gap-1.5 text-chica font-semibold text-ya-recibio" role="alert">
          <LuInfo aria-hidden="true" className="h-4 w-4 shrink-0" />
          {t('codigoDelDia.hasta.antesDeAbrir')}
        </p>
      )}
    </fieldset>
  )
}
