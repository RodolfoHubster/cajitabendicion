import { useTranslation } from 'react-i18next'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { TAMANOS_PAGINA, paginasVisibles } from '../datos/filtros'

const BASE =
  'inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border px-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-40'
const NORMAL = `${BASE} border-principal/25 bg-white text-principal hover:border-principal`
const ACTUAL = `${BASE} border-principal bg-principal text-white`

/**
 * Pie de una lista larga: cuantas se ven, cambiar de pagina y cuantas por
 * pagina. "resultado" es lo que devuelve paginar().
 */
export default function Paginacion({
  id,
  ancla,
  resultado,
  porPagina,
  totalSinFiltro,
  alCambiarPagina,
  alCambiarPorPagina,
}) {
  const { t } = useTranslation()
  const { pagina, totalPaginas, total, desde, hasta } = resultado

  function irA(numero) {
    alCambiarPagina(numero)

    // En el celular la lista es larga: si su inicio ya quedo arriba, se vuelve a el.
    const inicio = ancla ? document.getElementById(ancla) : null
    if (inicio && inicio.getBoundingClientRect().top < 0) inicio.scrollIntoView({ block: 'start' })
  }

  return (
    <nav
      aria-label={t('filtros.paginacion')}
      className="mt-3 flex flex-col gap-3 border-t border-principal/10 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
    >
      <p aria-live="polite" className="text-base text-principal/70">
        {t('filtros.mostrando', { desde, hasta, total })}
        {totalSinFiltro > total && ` ${t('filtros.deTotal', { total: totalSinFiltro })}`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {totalPaginas > 1 && (
          <>
            <button
              aria-label={t('filtros.anterior')}
              className={NORMAL}
              disabled={pagina <= 1}
              onClick={() => irA(pagina - 1)}
              type="button"
            >
              <LuChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>

            {/* En el celular no caben los numeros: solo "Pagina 2 de 5". */}
            <span className="px-1 text-base font-semibold text-principal sm:hidden">
              {t('filtros.pagina', { pagina, total: totalPaginas })}
            </span>

            <ul className="hidden items-center gap-1 sm:flex">
              {paginasVisibles(pagina, totalPaginas).map((numero, i) =>
                numero === '…' ? (
                  <li aria-hidden="true" className="px-1 text-base text-principal/60" key={`hueco-${i}`}>
                    …
                  </li>
                ) : (
                  <li key={numero}>
                    <button
                      aria-current={numero === pagina ? 'page' : undefined}
                      aria-label={t('filtros.irPagina', { pagina: numero })}
                      className={numero === pagina ? ACTUAL : NORMAL}
                      onClick={() => irA(numero)}
                      type="button"
                    >
                      {numero}
                    </button>
                  </li>
                ),
              )}
            </ul>

            <button
              aria-label={t('filtros.siguiente')}
              className={NORMAL}
              disabled={pagina >= totalPaginas}
              onClick={() => irA(pagina + 1)}
              type="button"
            >
              <LuChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </>
        )}

        {total > TAMANOS_PAGINA[0] && (
          <label className="flex items-center gap-2" htmlFor={`${id}-por-pagina`}>
            <span className="text-base text-principal/70">{t('filtros.porPagina')}</span>
            <select
              className="min-h-12 rounded-xl border border-principal/25 bg-white px-3 text-base text-principal outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
              id={`${id}-por-pagina`}
              onChange={(e) => alCambiarPorPagina(Number(e.target.value))}
              value={porPagina}
            >
              {TAMANOS_PAGINA.map((tamano) => (
                <option key={tamano} value={tamano}>
                  {tamano}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </nav>
  )
}
