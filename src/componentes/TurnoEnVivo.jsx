import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBellRing, LuCircleCheck, LuMegaphone, LuUsers } from 'react-icons/lu'
import useCadaRato from './useCadaRato'
import { CADA_MS_PERSONA, situacionDelTurno, turnoDeCita } from '../datos/filaAPie'
import { vibrar } from '../datos/sonido'

/**
 * El turno de la persona en la fila a pie, en vivo.
 *
 * El dia de la entrega se vuelve a preguntar cada pocos segundos: "Van en
 * el 12, faltan 3 antes de ti", "¡Es tu turno!". Otro dia solo se ve su
 * numero. Solo numeros: nunca quien esta antes o despues.
 *
 * turnoInicial: el que ya se sabe (de consultar_cita), para no esperar la
 * primera respuesta. alCambiar(datos): para que la pagina sepa cuando ya
 * recibio.
 */
export default function TurnoEnVivo({ token, turnoInicial = null, esHoy, alCambiar }) {
  const { t } = useTranslation()
  const [datos, setDatos] = useState(null)
  const anterior = useRef(null)

  const situacion = situacionDelTurno(datos)
  const terminado = situacion?.tipo === 'recibida' || situacion?.tipo === 'cancelada'

  useCadaRato(
    async () => {
      const nuevos = await turnoDeCita(token)
      setDatos(nuevos)
      alCambiar?.(nuevos)

      //  Cuando le toca, el telefono vibra (una vez, no en cada vuelta).
      const tipo = situacionDelTurno(nuevos)?.tipo
      if (tipo === 'tuTurno' && anterior.current && anterior.current !== 'tuTurno') vibrar([200, 100, 200])
      anterior.current = tipo
    },
    CADA_MS_PERSONA,
    //  Otro dia basta con preguntar una vez; ya recibida, ya no hay que preguntar.
    { activo: esHoy ? !terminado : datos === null },
  )

  const turno = datos?.turno ?? turnoInicial

  return (
    <div className="rounded-2xl border-4 border-accion bg-accion/10 p-4 text-center" aria-live="polite">
      <p className="text-lg font-bold uppercase tracking-wide text-principal/80">{t('turno.tuTurno')}</p>
      <p className="font-titulo text-7xl font-bold leading-none text-principal">{turno ?? '—'}</p>

      {!esHoy && datos && !terminado && (
        <p className="mt-3 text-base text-principal/80">{t('turno.otroDia')}</p>
      )}

      {esHoy && situacion?.tipo === 'esperando' && (
        <div className="mt-3 space-y-1">
          {situacion.actual != null && (
            <p className="flex items-center justify-center gap-2 text-xl font-bold text-principal">
              <LuMegaphone aria-hidden="true" className="h-6 w-6 text-accion" />
              {t('turno.van', { turno: situacion.actual })}
            </p>
          )}
          <p className="flex items-center justify-center gap-2 text-lg text-principal">
            <LuUsers aria-hidden="true" className="h-5 w-5 text-accion" />
            {situacion.antes === 0 ? t('turno.eresElSiguiente') : t('turno.antes', { count: situacion.antes })}
          </p>
        </div>
      )}

      {esHoy && situacion?.tipo === 'tuTurno' && (
        <p className="mt-3 flex items-center justify-center gap-2 rounded-xl border-2 border-puede-pasar bg-puede-pasar/15 px-3 py-3 text-xl font-bold text-puede-pasar" role="alert">
          <LuBellRing aria-hidden="true" className="h-6 w-6" />
          {t('turno.esTuTurno')}
        </p>
      )}

      {situacion?.tipo === 'teLlamaron' && (
        <p className="mt-3 rounded-xl bg-accion px-3 py-3 text-lg font-bold text-sobre-accion" role="alert">
          {t('turno.teLlamaron')}
        </p>
      )}

      {situacion?.tipo === 'recibida' && (
        <p className="mt-3 flex items-center justify-center gap-2 text-lg font-bold text-puede-pasar">
          <LuCircleCheck aria-hidden="true" className="h-6 w-6" />
          {t('turno.recibida')}
        </p>
      )}

      {esHoy && !terminado && <p className="mt-3 text-chica text-principal/70">{t('turno.seActualiza')}</p>}
    </div>
  )
}
