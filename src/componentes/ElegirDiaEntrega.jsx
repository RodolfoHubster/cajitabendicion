import { useTranslation } from 'react-i18next'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { aFechaLocal } from '../datos/disponibilidad'
import { fechasVecinas } from '../datos/fechasEntrega'

const ESTILO_FLECHA =
  'flex h-14 w-12 shrink-0 items-center justify-center rounded-xl border border-principal/25 bg-superficie text-principal transition hover:border-principal disabled:opacity-40 disabled:hover:border-principal/25'

/**
 * Escoger un dia de entrega de una lista (lunes, jueves, lunes...) en vez
 * de un calendario, donde habia que adivinar en que dia hubo entrega. Con
 * las flechas se pasa al dia de entrega de antes o de despues.
 *
 * `fechas`: [{ fecha, cerrado }] de fechasDeEntrega(); null mientras llega. Si no llego
 * (la base todavia no tiene la actualizacion), sale el calendario de antes:
 * la pantalla sigue sirviendo.
 */
export default function ElegirDiaEntrega({ id, etiqueta, fechas, valor, alCambiar, hoy, flechas = true }) {
  const { t, i18n } = useTranslation()

  //  Mes corto: en el telefono, junto a las flechas, el largo no cabe.
  const nombreDia = (fecha) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' }).format(
      aFechaLocal(fecha),
    )

  // Mientras llega la lista, el lugar apartado (sin brincos al llegar).
  if (fechas === null) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-base font-semibold text-principal">{etiqueta}</span>
        <div aria-hidden="true" className="h-14 animate-pulse rounded-xl bg-principal/10" />
      </div>
    )
  }

  if (fechas.length === 0) {
    return (
      <label className="flex flex-col gap-2" htmlFor={id}>
        <span className="text-base font-semibold text-principal">{etiqueta}</span>
        <input
          className="min-h-14 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal"
          id={id}
          onChange={(e) => e.target.value && alCambiar(e.target.value)}
          type="date"
          value={valor ?? ''}
        />
      </label>
    )
  }

  const lista = fechas.map((dia) => dia.fecha)
  const enLista = lista.includes(valor)
  const { anterior, siguiente } = fechasVecinas(lista, valor ?? hoy)

  const select = (
    <select
      className="min-h-14 w-full min-w-0 rounded-xl border border-principal/25 bg-superficie px-2 text-base font-semibold text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
      id={id}
      onChange={(e) => alCambiar(e.target.value)}
      value={enLista ? valor : ''}
    >
      {!enLista && (
        <option disabled value="">
          {t('diaEntrega.elegir')}
        </option>
      )}
      {fechas.map((dia) => {
        const notas = [dia.fecha === hoy && t('diaEntrega.hoy'), dia.cerrado && t('diaEntrega.cerrado')].filter(Boolean)
        const texto = nombreDia(dia.fecha)
        return (
          <option key={dia.fecha} value={dia.fecha}>
            {texto.charAt(0).toUpperCase() + texto.slice(1)}
            {notas.length > 0 && ` · ${notas.join(' · ')}`}
          </option>
        )
      })}
    </select>
  )

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className="text-base font-semibold text-principal" htmlFor={id}>
        {etiqueta}
      </label>
      {flechas ? (
        <div className="flex items-center gap-2">
          <button
            aria-label={t('diaEntrega.anterior')}
            className={ESTILO_FLECHA}
            disabled={!anterior}
            onClick={() => anterior && alCambiar(anterior)}
            title={t('diaEntrega.anterior')}
            type="button"
          >
            <LuChevronLeft aria-hidden="true" className="h-6 w-6" />
          </button>
          {select}
          <button
            aria-label={t('diaEntrega.siguiente')}
            className={ESTILO_FLECHA}
            disabled={!siguiente}
            onClick={() => siguiente && alCambiar(siguiente)}
            title={t('diaEntrega.siguiente')}
            type="button"
          >
            <LuChevronRight aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>
      ) : (
        select
      )}
    </div>
  )
}
