import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCalendarPlus, LuSearch } from 'react-icons/lu'
import Boton from './Boton'
import Campo from './Campo'
import ElegirVoluntarios from './ElegirVoluntarios'
import { hoyLocal } from '../datos/panel'
import { anotarDiaVoluntarios, contarResultados, nombreComparable } from '../datos/voluntarios'

const ENTRADA =
  'min-h-12 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal'

/** '2026-10-26' -> 'lunes 26 de octubre'. */
function diaLargo(fecha, idioma) {
  return new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
}

/**
 * Un dia que no se escaneo, a varios a la vez (seccion 52, solo el
 * administrador): la fecha, la hora de entrada y de salida, el motivo, y se
 * tocan los nombres de quienes vinieron. Quien ya tenia ese dia no se
 * repite (lo dice).
 *
 * voluntarios: la lista. horaSalida: la de siempre ('18:30'). alCambiar.
 * alCerrar.
 */
export default function AnotarDiaVoluntarios({ voluntarios, horaSalida, alCambiar, alCerrar }) {
  const { t, i18n } = useTranslation()
  const hoy = hoyLocal()
  const [fecha, setFecha] = useState(hoy)
  const [entrada, setEntrada] = useState('14:00')
  const [salida, setSalida] = useState(horaSalida ?? '18:30')
  const [motivo, setMotivo] = useState(() => t('voluntarios.dia.motivoSugerido'))
  const [busqueda, setBusqueda] = useState('')
  const [elegidos, setElegidos] = useState(() => new Set())
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [listo, setListo] = useState(null)

  const buscado = nombreComparable(busqueda)
  const coincide = (v) => !buscado || nombreComparable(v.nombre).includes(buscado)
  const lista = (voluntarios ?? []).filter(coincide)
  const montones = [
    { clave: 'activos', titulo: t('voluntarios.dia.activos'), voluntarios: lista.filter((v) => v.activo) },
    { clave: 'baja', titulo: t('voluntarios.dia.deBaja'), voluntarios: lista.filter((v) => !v.activo) },
  ]

  const horasMal = !entrada || !salida || salida <= entrada
  const problema = !fecha || fecha > hoy ? 'fecha' : horasMal ? 'horas' : !motivo.trim() ? 'motivo' : null

  async function anotar() {
    setOcupado(true)
    setError(null)
    setListo(null)
    try {
      const filas = await anotarDiaVoluntarios(elegidos, { fecha, entrada, salida, motivo })
      setListo(contarResultados(filas))
      setElegidos(new Set())
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <LuCalendarPlus aria-hidden="true" className="h-6 w-6 text-accion" />
          {t('voluntarios.dia.titulo')}
        </h2>
      </div>
      <p className="text-base text-principal/80">{t('voluntarios.dia.ayuda')}</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor="dia-fecha">
          {t('voluntarios.dia.fecha')}
          <input className={ENTRADA} id="dia-fecha" max={hoy} onChange={(e) => setFecha(e.target.value)} type="date" value={fecha} />
        </label>
        <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor="dia-entrada">
          {t('voluntarios.horas.entrada')}
          <input className={ENTRADA} id="dia-entrada" onChange={(e) => setEntrada(e.target.value)} type="time" value={entrada} />
        </label>
        <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor="dia-salida">
          {t('voluntarios.horas.salida')}
          <input className={ENTRADA} id="dia-salida" onChange={(e) => setSalida(e.target.value)} type="time" value={salida} />
        </label>
      </div>
      {fecha && fecha <= hoy && <p className="text-base font-semibold text-principal">{diaLargo(fecha, i18n.language)}</p>}
      {problema === 'horas' && entrada && salida && (
        <p className="text-base font-semibold text-ya-recibio">{t('voluntarios.errores.HORAS_INVALIDAS')}</p>
      )}
      <Campo
        etiqueta={t('voluntarios.horas.motivo')}
        id="dia-motivo"
        maxLength={200}
        onChange={(e) => setMotivo(e.target.value)}
        value={motivo}
      />

      <label className="flex flex-col gap-2 text-base font-semibold text-principal" htmlFor="dia-buscar">
        {t('voluntarios.pasarLista.buscar')}
        <span className="relative">
          <LuSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-principal/70" />
          <input
            autoComplete="off"
            className={`${ENTRADA} min-h-14 pl-11`}
            id="dia-buscar"
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t('voluntarios.entrada.buscarEjemplo')}
            type="search"
            value={busqueda}
          />
        </span>
      </label>

      <div aria-live="polite" className="space-y-2">
        {listo && (
          <div className="rounded-xl bg-puede-pasar/10 p-3 text-base text-principal" role="status">
            <p className="font-semibold text-puede-pasar">{t('voluntarios.dia.listo', { count: listo.ANOTADA?.cuantos ?? 0 })}</p>
            {listo.YA_VINO && (
              <p>{t('voluntarios.dia.yaTenian', { count: listo.YA_VINO.cuantos, nombres: listo.YA_VINO.nombres.join(', ') })}</p>
            )}
          </div>
        )}
        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}
      </div>

      <ElegirVoluntarios alCambiar={setElegidos} elegidos={elegidos} montones={montones} />

      {elegidos.size > 0 ? (
        <div className="sticky bottom-3 z-10">
          <Boton className="shadow-elevada" disabled={ocupado || Boolean(problema)} onClick={anotar} type="button">
            {t('voluntarios.dia.anotar', { count: elegidos.size })}
          </Boton>
        </div>
      ) : (
        <p className="text-center text-base text-principal/80">{t('voluntarios.pasarLista.escoge')}</p>
      )}
      <button
        className="inline-flex min-h-12 items-center rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal"
        onClick={alCerrar}
        type="button"
      >
        {t('voluntarios.dia.cerrar')}
      </button>
    </div>
  )
}
