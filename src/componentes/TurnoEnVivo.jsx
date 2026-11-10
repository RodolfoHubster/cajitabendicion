import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBellRing, LuCircleCheck, LuClock, LuCopyX, LuFlag, LuMegaphone, LuUsers } from 'react-icons/lu'
import EsperaAproximada from './EsperaAproximada'
import useCadaRato from './useCadaRato'
import usePantallaEncendida from './usePantallaEncendida'
import { formatearHora } from '../datos/disponibilidad'
import { CADA_MS_PERSONA, situacionDelTurno, turnoDeCita } from '../datos/filaAPie'
import { avisoCerca, avisoEsTuTurno } from '../datos/sonido'
import { avisoQueToca } from '../datos/turnoAPie'

/**
 * El turno de la persona en la fila a pie, en vivo.
 *
 * El dia de la entrega se vuelve a preguntar cada pocos segundos: "Van en
 * el 12, faltan 3 antes de ti", "¡Es tu turno!". Otro dia solo se ve su
 * numero. Solo numeros: nunca quien esta antes o despues. Antes de que
 * empiecen a entregar dice "Todavia no empezamos" (seccion 57) y, ya
 * empezada, cuanto falta mas o menos (la espera aproximada).
 *
 * turnoInicial: el que ya se sabe (de consultar_cita), para no esperar la
 * primera respuesta. alCambiar(datos): para que la pagina sepa cuando ya
 * recibio. accionPerdido: lo que se ofrece si su turno se anulo porque
 * llego tarde (en /turno, "Sacar un turno nuevo"; seccion 46).
 * accionLlamado: lo que se ofrece si lo llamaron y no estaba (en /turno,
 * cambiarlo por uno al final; seccion 59). enMedio: lo
 * que va entre el numero y como va la fila (en /turno, su QR y su codigo:
 * asi el numero, el QR y el codigo caben en una sola captura).
 *
 * Cuando faltan 3 y cuando le toca, el telefono suena y vibra (vibrar, solo
 * en Android). Mientras espera, la pantalla no se apaga sola.
 */
export default function TurnoEnVivo({
  token,
  turnoInicial = null,
  esHoy,
  alCambiar,
  accionPerdido = null,
  accionLlamado = null,
  enMedio = null,
}) {
  const { t } = useTranslation()
  const [datos, setDatos] = useState(null)
  const anterior = useRef(null)

  const situacion = situacionDelTurno(datos)
  const terminado =
    situacion?.tipo === 'recibida' || situacion?.tipo === 'cancelada' || situacion?.tipo === 'anulado' || situacion?.tipo === 'repetido'
  //  La fila de hoy ya termino: se sigue preguntando (despacio no hace
  //  falta: si la voluntaria lo toco por error y lo deshace, aqui se ve).
  const filaTerminada = situacion?.tipo === 'terminada'

  useCadaRato(
    async () => {
      const nuevos = await turnoDeCita(token)
      setDatos(nuevos)
      alCambiar?.(nuevos)

      //  Una vez, cuando cambia: faltan 3, o ya le toca.
      const nueva = situacionDelTurno(nuevos)
      const aviso = avisoQueToca(anterior.current, nueva)
      if (aviso === 'turno') avisoEsTuTurno()
      if (aviso === 'cerca') avisoCerca()
      anterior.current = nueva
    },
    CADA_MS_PERSONA,
    //  Otro dia basta con preguntar una vez; ya recibida, ya no hay que preguntar.
    { activo: esHoy ? !terminado : datos === null },
  )

  const turno = datos?.turno ?? turnoInicial
  usePantallaEncendida(Boolean(esHoy) && !terminado && !filaTerminada && situacion?.tipo !== 'teLlamaron')

  const leToca = esHoy && situacion?.tipo === 'tuTurno'

  return (
    //  Le toca: todo en verde, y el aviso ARRIBA de su QR, para que se lea
    //  sin tapar el codigo que la voluntaria tiene que escanear.
    <div
      aria-live="polite"
      className={`rounded-2xl border-4 p-4 text-center ${leToca ? 'border-puede-pasar bg-puede-pasar/10' : 'border-accion bg-accion/10'}`}
    >
      <p className="text-lg font-bold uppercase tracking-wide text-principal/80">{t('turno.tuTurno')}</p>
      <p className="font-titulo text-7xl font-bold leading-none text-principal">{turno ?? '—'}</p>

      {leToca && (
        <p
          className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl bg-puede-pasar px-3 py-3 text-xl font-bold text-white"
          role="alert"
        >
          <LuBellRing aria-hidden="true" className="h-6 w-6 shrink-0" />
          <span className="min-w-[min(10rem,100%)] flex-1 basis-0">{t('turno.esTuTurno')}</span>
        </p>
      )}

      {enMedio}

      {!esHoy && datos && !terminado && (
        <p className="mt-3 text-base text-principal/80">{t('turno.otroDia')}</p>
      )}

      {esHoy && situacion?.tipo === 'esperando' && (
        <div className="mt-3 space-y-1">
          {situacion.actual != null && (
            <p className="flex items-center justify-center gap-2 text-xl font-bold text-principal">
              <LuMegaphone aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
              <span className="min-w-0">{t('turno.van', { turno: situacion.actual })}</span>
            </p>
          )}
          <p className="flex items-center justify-center gap-2 text-lg text-principal">
            <LuUsers aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
            <span className="min-w-0">
              {situacion.antes === 0 ? t('turno.eresElSiguiente') : t('turno.antes', { count: situacion.antes })}
            </span>
          </p>
          <EsperaAproximada antes={situacion.antes} segundos={datos?.segundos_por_turno} />
        </div>
      )}

      {/* Todavia no empiezan a entregar (seccion 57): antes decia "va el 1"
          y al del 1 le sonaba "es tu turno". */}
      {esHoy && situacion?.tipo === 'porEmpezar' && (
        <div className="mt-3 space-y-1">
          <p className="flex items-center justify-center gap-2 text-xl font-bold text-principal">
            <LuClock aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
            <span className="min-w-0">{t('turno.porEmpezar')}</span>
          </p>
          {datos?.hora && (
            <p className="text-lg text-principal">{t('turnoAPie.empiezaA', { hora: formatearHora(datos.hora) })}</p>
          )}
          {situacion.antes > 0 && (
            <p className="flex items-center justify-center gap-2 text-lg text-principal">
              <LuUsers aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
              <span className="min-w-0">{t('turno.antes', { count: situacion.antes })}</span>
            </p>
          )}
          <p className="text-base text-principal/80">{t('turno.porEmpezarAyuda')}</p>
        </div>
      )}

      {situacion?.tipo === 'teLlamaron' && (
        <div className="mt-3 rounded-xl bg-accion px-3 py-3 text-sobre-accion" role="alert">
          <p className="text-lg font-bold">{t('turno.teLlamaron')}</p>
          {accionLlamado}
        </div>
      )}

      {/* Llego tarde y la voluntaria anulo su turno (seccion 46). */}
      {situacion?.tipo === 'anulado' && (
        <div className="mt-3 space-y-3 rounded-xl border-2 border-ya-recibio bg-ya-recibio/10 px-3 py-3 text-principal" role="alert">
          <p className="text-lg font-bold">{t('turno.anulado')}</p>
          {accionPerdido}
        </div>
      )}

      {/* Ya tenia otro turno y la voluntaria cancelo este (seccion 53). */}
      {situacion?.tipo === 'repetido' && (
        <div className="mt-3 space-y-1 rounded-xl border-2 border-ya-recibio bg-ya-recibio/10 px-3 py-3 text-principal" role="alert">
          <p className="flex items-center justify-center gap-2 text-lg font-bold">
            <LuCopyX aria-hidden="true" className="h-6 w-6 shrink-0" />
            <span className="min-w-0">
              {situacion.seQueda ? t('turno.repetidoCon', { turno: situacion.seQueda }) : t('turno.repetido')}
            </span>
          </p>
          <p className="text-base">{t('turno.repetidoAyuda')}</p>
        </div>
      )}

      {situacion?.tipo === 'terminada' && (
        <p className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-principal/10 px-3 py-3 text-lg font-bold text-principal" role="status">
          <LuFlag aria-hidden="true" className="h-6 w-6 shrink-0" />
          <span className="min-w-0">{t('turno.terminada')}</span>
        </p>
      )}

      {situacion?.tipo === 'recibida' && (
        <p className="mt-3 flex items-center justify-center gap-2 text-lg font-bold text-puede-pasar">
          <LuCircleCheck aria-hidden="true" className="h-6 w-6 shrink-0" />
          <span className="min-w-0">{t('turno.recibida')}</span>
        </p>
      )}

      {esHoy && !terminado && !filaTerminada && <p className="mt-3 text-chica text-principal/70">{t('turno.seActualiza')}</p>}
    </div>
  )
}
