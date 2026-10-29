import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaPersonWalking } from 'react-icons/fa6'
import { LuCheck, LuCircleCheck, LuFlag, LuHourglass, LuMegaphone, LuTicket, LuUsers, LuWifiOff } from 'react-icons/lu'
import { Link } from 'react-router-dom'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import useCadaRato from '../../componentes/useCadaRato'
import { Hueso } from '../../componentes/Esqueleto'
import { formatearHora } from '../../datos/disponibilidad'
import { CADA_MS_PERSONA, fichasDeLaFila, filaAPieEnVivo } from '../../datos/filaAPie'
import { hoyLocal } from '../../datos/panel'
import { leerMiTurno } from '../../datos/turnoAPie'

const ENLACE =
  'flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-accion px-4 text-xl font-bold text-sobre-accion shadow-sm transition hover:brightness-95'

//  Cada numero de la tira: el que ya recibio, el que estan llamando y el que sigue.
const FICHA = {
  recibio: { icono: LuCheck, clase: 'h-16 w-16 bg-puede-pasar/15 text-puede-pasar', numero: 'text-2xl' },
  llamando: { icono: LuMegaphone, clase: 'h-20 w-20 bg-marca text-white shadow-sm ring-4 ring-marca/20', numero: 'text-3xl' },
  sigue: { icono: LuHourglass, clase: 'h-16 w-16 border-2 border-dashed border-principal/30 text-principal/80', numero: 'text-2xl' },
}

/**
 * La fila a pie de hoy, en vivo, para cualquiera (seccion 51): que turno
 * estan llamando, cuantos esperan, cuantos ya recibieron. No hace falta tener
 * turno; sirve tambien en una tele en la entrada. Solo numeros: nunca nombres
 * ni codigos. Arriba de todo va el boton para sacar (o ver) SU turno.
 */
export default function FilaEnVivo() {
  const { t } = useTranslation()
  //  undefined: preguntando; null: hoy no hay fila a pie.
  const [fila, setFila] = useState(undefined)
  const [sinSenal, setSinSenal] = useState(false)
  const miTurno = leerMiTurno(hoyLocal())

  useCadaRato(async () => {
    try {
      setFila(await filaAPieEnVivo())
      setSinSenal(false)
    } catch {
      //  Sin senal: se queda lo ultimo que se supo.
      setSinSenal(true)
      setFila((antes) => (antes === undefined ? null : antes))
    }
  }, CADA_MS_PERSONA)

  const enCurso = fila && !fila.terminada && fila.abierta

  return (
    <div className="space-y-4">
      <Tarjeta>
        {/* De aqui se regresa a sacar (o ver) su turno. */}
        <EnlaceVolver a="/turno">{t('aPie.volver')}</EnlaceVolver>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accion/20">
            <FaPersonWalking aria-hidden="true" className="h-7 w-7 text-principal" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">{t('filaEnVivo.titulo')}</h1>
            <p className="text-base text-principal/70">{t('filaEnVivo.subtitulo')}</p>
          </div>
        </div>

        {fila === undefined && (
          <div className="space-y-3" role="status">
            <span className="sr-only">{t('filaEnVivo.cargando')}</span>
            <Hueso className="h-16 w-full" />
            <Hueso className="h-40 w-full" />
          </div>
        )}

        {fila === null && <p className="text-lg">{t('filaEnVivo.noHay')}</p>}

        {fila && fila.terminada && (
          <p className="flex items-center gap-2 rounded-xl bg-principal/10 p-4 text-lg font-bold text-principal" role="status">
            <LuFlag aria-hidden="true" className="h-6 w-6 shrink-0" />
            {t('filaEnVivo.terminada', { count: fila.atendidos })}
          </p>
        )}

        {fila && !fila.terminada && !fila.abierta && (
          <p className="rounded-xl bg-accion/15 p-4 text-lg font-semibold text-principal" role="status">
            {fila.abre_en
              ? t('filaEnVivo.porAbrir', { hora: formatearHora(String(fila.abre_en).slice(11, 16)) })
              : t('filaEnVivo.noHay')}
          </p>
        )}

        {/* Lo primero: SU turno, con el boton grande. */}
        {miTurno ? (
          <Link className={`${ENLACE} mt-4`} to="/turno">
            <LuTicket aria-hidden="true" className="h-7 w-7" />
            {t('filaEnVivo.miTurno', { turno: miTurno.turno })}
          </Link>
        ) : (
          enCurso &&
          !fila.cerrada && (
            <Link className={ENLACE} to="/turno">
              <LuTicket aria-hidden="true" className="h-7 w-7" />
              {t('filaEnVivo.sacar')}
            </Link>
          )
        )}

        {enCurso && (
          <section aria-live="polite" className="mt-5 rounded-2xl border-2 border-principal/15 bg-principal/5 p-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-principal">
              <LuUsers aria-hidden="true" className="h-5 w-5 shrink-0" />
              {t('filaEnVivo.asiVa')}
            </h2>
            <p className="text-base text-principal/80">
              {miTurno ? t('filaEnVivo.tuNumero', { turno: miTurno.turno }) : t('filaEnVivo.noEsTuyo')}
            </p>

            {fila.actual == null && (
              <p className="mt-3 text-lg font-bold text-principal">{t('filaEnVivo.nadieEspera')}</p>
            )}

            <ol className="mt-3 flex flex-wrap items-end justify-center gap-2">
              {fichasDeLaFila(fila).map(({ numero, tipo }) => {
                const { icono: Icono, clase, numero: tamano } = FICHA[tipo]
                return (
                  <li className="flex w-20 flex-col items-center gap-1 text-center" key={numero}>
                    <span className={`flex flex-col items-center justify-center rounded-2xl ${clase}`}>
                      <Icono aria-hidden="true" className="h-4 w-4" />
                      <span className={`font-titulo font-bold leading-none ${tamano}`}>{numero}</span>
                    </span>
                    <span className="text-chica font-semibold text-principal">{t(`filaEnVivo.${tipo}`)}</span>
                  </li>
                )
              })}
            </ol>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ['esperando', fila.en_espera, LuUsers],
                ['recibieron', fila.atendidos, LuCircleCheck],
                ['dados', fila.total, LuTicket],
              ].map(([clave, numero, Icono]) => (
                <div className="rounded-xl bg-superficie p-2" key={clave}>
                  <dt className="flex items-center justify-center gap-1 text-base text-principal/80">
                    <Icono aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {t(`filaEnVivo.${clave}`)}
                  </dt>
                  <dd className="font-titulo text-2xl font-bold text-principal">{numero}</dd>
                </div>
              ))}
            </dl>

            {fila.cerrada && <p className="mt-3 text-base font-semibold text-principal">{t('filaEnVivo.yaNoSeDan')}</p>}
          </section>
        )}

        {sinSenal && fila && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
            <LuWifiOff aria-hidden="true" className="h-5 w-5 shrink-0" />
            {t('filaEnVivo.sinSenal')}
          </p>
        )}

        {fila !== undefined && <p className="mt-3 text-center text-chica text-principal/70">{t('turno.seActualiza')}</p>}
      </Tarjeta>
    </div>
  )
}
