import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuClock, LuLock } from 'react-icons/lu'
import { aFechaLocal, formatearFechaHora, formatearHora, segundosHasta, tiempoRestante } from '../datos/disponibilidad'

/** Con menos de esto para abrir, vale la pena dejar la pagina abierta. */
const UN_DIA = 86400

/**
 * Cuando se abren los turnos de la fila a pie, con una cuenta regresiva que
 * avanza cada segundo. Para la de hoy que todavia no abre (`esHoy`) y para
 * la proxima fecha cuando hoy no hay fila: asi la gente sabe cuando volver.
 *
 * Al llegar la hora llama a alAbrir(): la pagina vuelve a preguntar y
 * aparece el boton, sin recargar. Lo que de verdad impide sacar turno antes
 * de tiempo es la base (sacar_turno_a_pie contesta AUN_NO_ABRE).
 */
export default function AperturaFilaAPie({ fila, esHoy = false, alAbrir }) {
  const { t, i18n } = useTranslation()
  const [faltan, setFaltan] = useState(() => segundosHasta(fila.abre_en))

  //  Un segundo a la vez hasta la hora; ahi se detiene y avisa.
  useEffect(() => {
    if (faltan <= 0) return undefined
    const reloj = setTimeout(() => {
      const nuevo = segundosHasta(fila.abre_en)
      setFaltan(nuevo)
      if (nuevo <= 0) alAbrir?.()
    }, 1000)
    return () => clearTimeout(reloj)
  }, [faltan, fila.abre_en, alAbrir])

  const fecha = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    aFechaLocal(fila.fecha),
  )

  return (
    <div className={esHoy ? '' : 'mt-4 border-t border-principal/15 pt-4'}>
      {!esHoy && (
        <>
          <p className="text-base font-semibold uppercase tracking-wide text-accion">{t('aPie.proxima')}</p>
          <p className="mt-1 font-titulo text-2xl font-bold leading-tight first-letter:uppercase">{fecha}</p>
        </>
      )}

      <p className="mt-2 flex items-start gap-2 text-base">
        <LuClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
        {t('turnoAPie.empiezaA', { hora: formatearHora(fila.hora) })}
      </p>

      <div className="mt-3 rounded-xl bg-principal/5 p-4">
        <p className="flex items-start gap-2 text-base font-semibold">
          <LuLock aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-accion" />
          {esHoy
            ? t('turnoAPie.resultado.AUN_NO_ABRE', { hora: formatearHora(String(fila.abre_en).slice(11, 19)) })
            : t('aPie.abreA', { cuando: formatearFechaHora(fila.abre_en, i18n.language) })}
        </p>
        {/* role="timer": los lectores de pantalla no la leen cada segundo. */}
        {faltan > 0 && (
          <p className="mt-1 font-titulo text-2xl font-bold text-principal" role="timer">
            {t('proxima.faltan', { tiempo: tiempoRestante(t, faltan) })}
          </p>
        )}
        {(esHoy || faltan < UN_DIA) && <p className="mt-2 text-base text-principal/80">{t('aPie.seActualiza')}</p>}
      </div>
    </div>
  )
}
