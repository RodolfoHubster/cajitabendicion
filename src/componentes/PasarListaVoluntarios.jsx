import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuClipboardCheck, LuScanLine, LuSearch, LuUserRoundPlus } from 'react-icons/lu'
import Boton from './Boton'
import ElegirVoluntarios from './ElegirVoluntarios'
import Tarjeta from './Tarjeta'
import { ahoraSanDiego, formatearHora } from '../datos/disponibilidad'
import { horaDeMarca } from '../datos/filaAPie'
import { contarResultados, montonesParaPasarLista, pasarLista, registrarVoluntario } from '../datos/voluntarios'

const ENTRADA =
  'min-h-14 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

const ahoraCorta = () => ahoraSanDiego().slice(11, 16)

/**
 * Pasar lista (seccion 52): para los que llegaron y no escanearon su
 * credencial. Se tocan sus nombres y se anota su entrada de hoy, a la hora
 * que se diga, a todos de una vez. Arriba los que suelen venir; los que ya
 * estan se ven aparte, con su palomita. Si alguien no esta registrado, se
 * registra y se anota en el mismo paso.
 *
 * voluntarios: la lista. hoy: lo de asistenciasDelDia(). alCambiar: para
 * que se vuelva a pedir todo. alVolver: regresar al escaner.
 */
export default function PasarListaVoluntarios({ voluntarios, hoy, alCambiar, alVolver }) {
  const { t } = useTranslation()
  const [busqueda, setBusqueda] = useState('')
  const [elegidos, setElegidos] = useState(() => new Set())
  const [hora, setHora] = useState(ahoraCorta)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  //  { cuentas, hora } o { nuevo: nombre }, al terminar.
  const [listo, setListo] = useState(null)

  const montones = montonesParaPasarLista(voluntarios, hoy, busqueda)
  const nadie = montones.yaEstan.length + montones.suelenVenir.length + montones.demas.length === 0
  const ahora = ahoraCorta()
  const horaFutura = Boolean(hora) && hora > ahora
  //  La hora de ahora (o una que no se escribio) va como "ahora": sin segundos de mas.
  const horaParaMandar = !hora || hora >= ahora ? null : hora

  async function anotar() {
    setOcupado(true)
    setError(null)
    setListo(null)
    try {
      const filas = await pasarLista(elegidos, horaParaMandar)
      setListo({ cuentas: contarResultados(filas), hora: formatearHora(horaParaMandar ?? ahora) })
      setElegidos(new Set())
      setBusqueda('')
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function registrarYAnotar() {
    setOcupado(true)
    setError(null)
    setListo(null)
    try {
      const nuevo = await registrarVoluntario(busqueda)
      await pasarLista([nuevo.id], horaParaMandar)
      setListo({ nuevo: nuevo.nombre })
      setBusqueda('')
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const lista = [
    {
      clave: 'suelen',
      titulo: t('voluntarios.pasarLista.suelenVenir'),
      voluntarios: montones.suelenVenir,
      detalle: (v) => t('voluntarios.pasarLista.vino30', { count: v.visitas_30 }),
    },
    {
      clave: 'demas',
      titulo: montones.suelenVenir.length ? t('voluntarios.pasarLista.demas') : t('voluntarios.pasarLista.todos'),
      voluntarios: montones.demas,
    },
    {
      clave: 'ya',
      titulo: t('voluntarios.pasarLista.yaEstan'),
      voluntarios: montones.yaEstan,
      bloqueado: true,
      detalle: (v) =>
        v.asistencia.salida
          ? t('voluntarios.pasarLista.entroSalio', { entrada: horaDeMarca(v.asistencia.entrada), salida: horaDeMarca(v.asistencia.salida) })
          : t('voluntarios.resultado.entro', { hora: horaDeMarca(v.asistencia.entrada) }),
    },
  ]
  const otros = Object.entries(listo?.cuentas ?? {}).filter(([resultado]) => resultado !== 'ENTRADA')

  return (
    <Tarjeta>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <LuClipboardCheck aria-hidden="true" className="h-6 w-6 text-accion" />
          {t('voluntarios.pasarLista.titulo')}
        </h2>
        <button
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-principal/25 bg-superficie px-3 text-base font-semibold text-principal hover:border-principal"
          onClick={alVolver}
          type="button"
        >
          <LuScanLine aria-hidden="true" className="h-5 w-5" />
          {t('voluntarios.pasarLista.volver')}
        </button>
      </div>
      <p className="mt-1 text-base text-principal/80">{t('voluntarios.pasarLista.ayuda')}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-base font-semibold text-principal" htmlFor="pasar-lista-hora">
          {t('voluntarios.pasarLista.llegaron')}
          <input className={ENTRADA} id="pasar-lista-hora" max={ahora} onChange={(e) => setHora(e.target.value)} type="time" value={hora} />
        </label>
        <label className="flex flex-col gap-2 text-base font-semibold text-principal" htmlFor="pasar-lista-buscar">
          {t('voluntarios.pasarLista.buscar')}
          <span className="relative">
            <LuSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-principal/70" />
            <input
              autoComplete="off"
              className={`${ENTRADA} pl-11`}
              id="pasar-lista-buscar"
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('voluntarios.entrada.buscarEjemplo')}
              type="search"
              value={busqueda}
            />
          </span>
        </label>
      </div>
      {horaFutura && <p className="mt-2 text-base font-semibold text-ya-recibio">{t('voluntarios.pasarLista.horaFutura')}</p>}

      <div aria-live="polite" className="mt-3 space-y-2">
        {listo?.cuentas && (
          <div className="rounded-xl bg-puede-pasar/10 p-3 text-base text-principal" role="status">
            <p className="font-semibold text-puede-pasar">
              {t('voluntarios.pasarLista.listo', { count: listo.cuentas.ENTRADA?.cuantos ?? 0, hora: listo.hora })}
            </p>
            {otros.map(([resultado, { nombres }]) => (
              <p key={resultado}>{t(`voluntarios.pasarLista.otros.${resultado}`, { nombres: nombres.join(', '), count: nombres.length })}</p>
            ))}
          </div>
        )}
        {listo?.nuevo && (
          <p className="rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
            {t('voluntarios.pasarLista.nuevoListo', { nombre: listo.nuevo })}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}
      </div>

      <div className="mt-4">
        {nadie ? (
          busqueda.trim().length >= 2 ? (
            <div className="space-y-3 rounded-xl border-2 border-dashed border-principal/25 p-3">
              <p className="text-base text-principal">{t('voluntarios.pasarLista.noEsta', { nombre: busqueda.trim() })}</p>
              <button
                className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-marca px-4 text-base font-bold text-white disabled:opacity-50"
                disabled={ocupado || horaFutura}
                onClick={registrarYAnotar}
                type="button"
              >
                <LuUserRoundPlus aria-hidden="true" className="h-5 w-5" />
                {t('voluntarios.pasarLista.registrarYAnotar', { nombre: busqueda.trim() })}
              </button>
            </div>
          ) : (
            <p className="text-base text-principal/80">{t('voluntarios.pasarLista.vacia')}</p>
          )
        ) : (
          <ElegirVoluntarios alCambiar={setElegidos} elegidos={elegidos} montones={lista} />
        )}
      </div>

      {/* Con alguien escogido, el boton queda a la mano aunque la lista sea larga. */}
      {elegidos.size > 0 ? (
        <div className="sticky bottom-3 z-10 mt-4">
          <Boton className="shadow-elevada" disabled={ocupado || horaFutura} onClick={anotar} type="button">
            {t('voluntarios.pasarLista.anotar', { count: elegidos.size, hora: formatearHora(horaParaMandar ?? ahora) })}
          </Boton>
        </div>
      ) : (
        !nadie && <p className="mt-4 text-center text-base text-principal/80">{t('voluntarios.pasarLista.escoge')}</p>
      )}
    </Tarjeta>
  )
}
