import { useTranslation } from 'react-i18next'
import { LuInfo } from 'react-icons/lu'
import { formatearHora } from '../datos/disponibilidad'
import { aperturaDeCampos, aperturaRecomendada, otraHoraInicial, revisarApertura } from '../datos/filaAPie'
import { hoyLocal } from '../datos/panel'

const ESTILO_INPUT =
  'min-h-12 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal disabled:opacity-50'

/**
 * Lo que se captura de la fila a pie de un dia: a que hora se empieza a
 * entregar, cuantos turnos (o sin limite) y cuando se abren los turnos. Se
 * usa al crear la fecha (Nueva fecha) y al cambiarla (dentro de cada dia).
 *
 * valor: { hora, sinLimite, cupo, otraHora, abreEn } (ver camposFilaAPie).
 * fecha: la del dia, para calcular "una hora antes"; puede faltar todavia.
 */
export default function CamposFilaAPie({ id, fecha, valor, alCambiar }) {
  const { t } = useTranslation()
  const cambiar = (cambios) => alCambiar({ ...valor, ...cambios })

  const recomendada = fecha && valor.hora ? aperturaRecomendada(fecha, valor.hora) : ''
  const revision = revisarApertura({ fecha, hora: valor.hora, abreEn: aperturaDeCampos(fecha, valor) })

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1" htmlFor={`aPieHora-${id}`}>
        <span className="text-base font-semibold">{t('filaAPieAdmin.hora')}</span>
        <input
          className={`${ESTILO_INPUT} w-40`}
          id={`aPieHora-${id}`}
          onChange={(e) => cambiar({ hora: e.target.value })}
          required
          step="900"
          type="time"
          value={valor.hora}
        />
      </label>

      <fieldset>
        <legend className="text-base font-semibold">{t('filaAPieAdmin.cupo')}</legend>
        <div className="mt-1 space-y-2">
          <label className="flex min-h-12 items-center gap-3 text-base">
            <input
              checked={valor.sinLimite}
              className="h-5 w-5"
              name={`aPieCupo-${id}`}
              onChange={() => cambiar({ sinLimite: true })}
              type="radio"
            />
            {t('filaAPieAdmin.sinLimite')}
          </label>
          <label className="flex min-h-12 flex-wrap items-center gap-3 text-base">
            <input
              checked={!valor.sinLimite}
              className="h-5 w-5"
              name={`aPieCupo-${id}`}
              onChange={() => cambiar({ sinLimite: false })}
              type="radio"
            />
            {t('filaAPieAdmin.conLimite')}
            <input
              aria-label={t('filaAPieAdmin.cuantos')}
              className={`${ESTILO_INPUT} w-24`}
              disabled={valor.sinLimite}
              inputMode="numeric"
              min="1"
              onChange={(e) => cambiar({ cupo: e.target.value })}
              type="number"
              value={valor.cupo}
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-base font-semibold">{t('filaAPieAdmin.apertura')}</legend>
        <label className="mt-1 flex min-h-12 items-center gap-3 text-base">
          <input
            checked={!valor.otraHora}
            className="h-5 w-5"
            name={`aPieAbre-${id}`}
            onChange={() => cambiar({ otraHora: false })}
            type="radio"
          />
          {recomendada
            ? t('filaAPieAdmin.unaHoraAntes', { hora: formatearHora(recomendada.slice(11)) })
            : t('filaAPieAdmin.unaHoraAntesSinHora')}
        </label>
        <label className="flex min-h-12 flex-wrap items-center gap-3 text-base">
          <input
            checked={valor.otraHora}
            className="h-5 w-5"
            name={`aPieAbre-${id}`}
            onChange={() =>
              cambiar({ otraHora: true, abreEn: valor.abreEn || otraHoraInicial(fecha, valor.hora, hoyLocal()) })
            }
            type="radio"
          />
          {t('filaAPieAdmin.otraHora')}
          <input
            aria-label={t('filaAPieAdmin.otraHora')}
            className={ESTILO_INPUT}
            disabled={!valor.otraHora}
            onChange={(e) => cambiar({ abreEn: e.target.value })}
            type="datetime-local"
            value={valor.abreEn}
          />
        </label>

        {/* Un aviso chiquito, sin estorbar: solo con "otra hora". */}
        {valor.otraHora && revision !== 'DESPUES_DE_INICIO' && (
          <p className="mt-1 flex items-center gap-1.5 text-chica text-principal/80" role="status">
            <LuInfo aria-hidden="true" className="h-4 w-4 shrink-0 text-accion" />
            {revision === 'MAS_TEMPRANO' ? t('filaAPieAdmin.masTemprano') : t('filaAPieAdmin.recomendado')}
          </p>
        )}
        {revision === 'DESPUES_DE_INICIO' && (
          <p className="mt-1 text-chica font-semibold text-ya-recibio" role="alert">
            {t('filaAPieAdmin.despuesDeInicio')}
          </p>
        )}
      </fieldset>
    </div>
  )
}
