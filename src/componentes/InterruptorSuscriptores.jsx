import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaFacebook } from 'react-icons/fa6'
import Tarjeta from './Tarjeta'
import { cambiarAccesoSuscriptores } from '../datos/diasEntrega'

/**
 * El interruptor general del registro para suscriptores de Facebook, al pie
 * de Horarios y cupos. El 23 de noviembre de 2026 el pastor pidio quitarlo:
 * todos hacen su cita directo. Quedo apagado, sin borrarlo, para poder
 * volver a prenderlo.
 *
 * Apagado: la pagina solo ensena "Hacer cita" y la casilla de cada fecha
 * se esconde. Prendido: cada fecha lo activa por su lado, como antes. La
 * regla de verdad esta en la base (seccion 60 de schema.sql).
 *
 * activo: true / false, o null mientras se lee (o si no se pudo leer).
 */
export default function InterruptorSuscriptores({ activo, errorAlLeer, alCambiar }) {
  const { t } = useTranslation()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  async function alternar() {
    setOcupado(true)
    setError(null)
    try {
      alCambiar(await cambiarAccesoSuscriptores(!activo))
    } catch (e) {
      setError(e.message)
    }
    setOcupado(false)
  }

  const falla = error ?? errorAlLeer
  const conocido = activo === true || activo === false

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <FaFacebook aria-hidden="true" className="h-5 w-5 shrink-0 text-[#1560D4] dark:text-[#8AB4FF]" />
            <span className="min-w-0" id="interruptor-suscriptores">
              {t('diasAdmin.interruptor.titulo')}
            </span>
          </h2>
          {(conocido || !falla) && (
            <p className="mt-1 text-base text-principal/70">
              {conocido
                ? t(activo ? 'diasAdmin.interruptor.prendido' : 'diasAdmin.interruptor.apagado')
                : t('diasAdmin.interruptor.leyendo')}
            </p>
          )}
        </div>

        {conocido && (
          <button
            aria-checked={activo}
            aria-labelledby="interruptor-suscriptores"
            className="inline-flex min-h-14 shrink-0 items-center gap-3 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-bold text-principal transition hover:border-principal focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-principal/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={ocupado}
            onClick={alternar}
            role="switch"
            type="button"
          >
            <span
              aria-hidden="true"
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${activo ? 'bg-marca' : 'bg-principal/25'}`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full border border-principal/20 bg-superficie shadow transition-all ${activo ? 'left-6' : 'left-1'}`}
              />
            </span>
            <span aria-hidden="true">{activo ? t('diasAdmin.interruptor.si') : t('diasAdmin.interruptor.no')}</span>
          </button>
        )}
      </div>

      {falla && (
        <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`diasAdmin.errores.${falla}`, { defaultValue: t('diasAdmin.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}
    </Tarjeta>
  )
}
