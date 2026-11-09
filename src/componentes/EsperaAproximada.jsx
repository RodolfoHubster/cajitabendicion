import { useTranslation } from 'react-i18next'
import { LuTimer } from 'react-icons/lu'
import { minutosDeEspera, textoEspera } from '../datos/filaAPie'

/**
 * La espera aproximada en la fila a pie (seccion 57): cuantos tiene antes
 * por el promedio entre una caja y la siguiente. Siempre con el aviso de
 * que es un promedio y no una hora exacta: que nadie se vaya confiado.
 *
 * antes: cuantos esperan antes. segundos: segundos_por_turno de la base
 * (nulo mientras van menos de 5 cajas). nuevo: para quien todavia no tiene
 * turno, "si sacas turno ahora...".
 */
export default function EsperaAproximada({ antes, segundos, nuevo = false }) {
  const { t } = useTranslation()

  if (!(antes > 0)) return null

  const minutos = minutosDeEspera(antes, segundos)

  if (minutos === null) {
    return <p className="mt-2 text-base text-principal/80">{t('espera.calculando')}</p>
  }

  const tiempo = textoEspera(t, minutos)

  return (
    <div className="mt-3 rounded-xl bg-superficie px-3 py-2 text-center text-principal">
      <p className="flex items-center justify-center gap-2 text-lg font-bold">
        <LuTimer aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
        {nuevo ? t('espera.siSacasAhora', { tiempo }) : t('espera.tuya', { tiempo })}
      </p>
      <p className="text-base text-principal/80">{t('espera.aviso')}</p>
    </div>
  )
}
