import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSlidersHorizontal, LuX } from 'react-icons/lu'

/**
 * El buscador siempre a la vista y, debajo, el resto de filtros. En el
 * celular esos filtros se esconden tras un boton, para que la lista no quede
 * hasta abajo; el boton dice cuantos hay puestos.
 */
export default function PanelFiltros({ id, busqueda, columnas = '', ocultos = 0, hayFiltros, alLimpiar, children }) {
  const { t } = useTranslation()
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="mb-3 space-y-3 rounded-xl bg-principal/5 p-3">
      {busqueda}

      <button
        aria-controls={id}
        aria-expanded={abierto}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal sm:hidden"
        onClick={() => setAbierto((antes) => !antes)}
        type="button"
      >
        <LuSlidersHorizontal aria-hidden="true" className="h-5 w-5" />
        {abierto ? t('filtros.ocultarFiltros') : t('filtros.masFiltros')}
        {ocultos > 0 && (
          <span className="rounded-full bg-marca px-2 text-base font-bold text-white">{ocultos}</span>
        )}
      </button>

      <div className={`${abierto ? 'grid' : 'hidden'} gap-3 sm:grid ${columnas}`} id={id}>
        {children}
      </div>

      {hayFiltros && (
        <button
          className="inline-flex min-h-12 items-center gap-2 rounded-xl px-2 text-base font-semibold text-principal underline underline-offset-4"
          onClick={alLimpiar}
          type="button"
        >
          <LuX aria-hidden="true" className="h-5 w-5" />
          {t('filtros.limpiar')}
        </button>
      )}
    </div>
  )
}
