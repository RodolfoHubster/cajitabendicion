import { useTranslation } from 'react-i18next'
import Campo from './Campo'
import { OPCIONES_ANTICIPO, suscriptoresSinEfecto } from '../datos/diasEntrega'
import { restarHoras } from '../datos/disponibilidad'

const ESTILO_SELECT =
  'min-h-14 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

/**
 * Cuando se abren los registros al publico y, si se activa, desde cuando
 * entran los suscriptores de Facebook. Lo que venga en children (el codigo)
 * se muestra solo con el acceso activado.
 */
export default function CamposApertura({
  id,
  abreEn,
  alCambiarAbreEn,
  conSuscriptores,
  alCambiarConSuscriptores,
  anticipo,
  alCambiarAnticipo,
  abreAnticipadoEn,
  alCambiarAbreAnticipadoEn,
  children,
}) {
  const { t } = useTranslation()

  function elegirAnticipo(valor) {
    alCambiarAnticipo(valor)
    // Al pedir fecha exacta se propone un dia antes, para no empezar en blanco.
    if (valor === 'personalizado' && !abreAnticipadoEn && abreEn) {
      alCambiarAbreAnticipadoEn(restarHoras(abreEn, 24))
    }
  }

  return (
    <div className="space-y-4">
      <Campo
        etiqueta={t('diasAdmin.abreEn')}
        id={`${id}-abreEn`}
        onChange={(e) => alCambiarAbreEn(e.target.value)}
        required
        type="datetime-local"
        value={abreEn}
      />

      <label className="flex min-h-12 items-center gap-3" htmlFor={`${id}-suscriptores`}>
        <input
          checked={conSuscriptores}
          className="h-6 w-6 shrink-0 accent-principal"
          id={`${id}-suscriptores`}
          onChange={(e) => alCambiarConSuscriptores(e.target.checked)}
          type="checkbox"
        />
        <span className="text-base font-semibold text-principal">{t('diasAdmin.activarSuscriptores')}</span>
      </label>

      {conSuscriptores && (
        <div className="space-y-3 border-l-4 border-accion pl-4">
          <label className="flex flex-col gap-2" htmlFor={`${id}-anticipo`}>
            <span className="text-base font-semibold text-principal">{t('diasAdmin.entran')}</span>
            <select
              className={ESTILO_SELECT}
              id={`${id}-anticipo`}
              onChange={(e) => elegirAnticipo(e.target.value)}
              value={anticipo}
            >
              {OPCIONES_ANTICIPO.map((clave) => (
                <option key={clave} value={clave}>
                  {t(`diasAdmin.anticipo.${clave}`)}
                </option>
              ))}
            </select>
          </label>

          {anticipo === 'personalizado' && (
            <Campo
              etiqueta={t('diasAdmin.abreAnticipado')}
              id={`${id}-abreAnticipadoEn`}
              max={abreEn || undefined}
              onChange={(e) => alCambiarAbreAnticipadoEn(e.target.value)}
              required
              type="datetime-local"
              value={abreAnticipadoEn}
            />
          )}

          {suscriptoresSinEfecto(conSuscriptores, abreEn) && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base font-semibold text-ya-recibio" role="alert">
              {t('diasAdmin.suscriptoresYaAbierta')}
            </p>
          )}

          {children}
        </div>
      )}
    </div>
  )
}
