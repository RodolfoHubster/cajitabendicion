import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { nombrePais } from './mensajesValidacion'
import { PAISES, PRINCIPALES } from '../datos/paises'
import { normalizarTelefono } from '../datos/telefono'

/**
 * Telefono con selector de pais. Los paises mas comunes van arriba; el resto,
 * en orden alfabetico en el idioma de la pagina.
 *
 * Si la persona escribe la lada con "+" o "00" (+52 664...), el selector
 * cambia solo al pais que corresponde.
 */
export default function CampoTelefono({ id, etiqueta, pais, alCambiarPais, valor, alCambiarValor, onBlur, error }) {
  const { t, i18n } = useTranslation()
  const idioma = i18n.language

  const principales = useMemo(
    () => PRINCIPALES.map((codigo) => PAISES.find((p) => p.codigo === codigo)),
    [],
  )

  const resto = useMemo(
    () =>
      PAISES.filter((p) => !PRINCIPALES.includes(p.codigo))
        .map((p) => ({ ...p, nombre: nombrePais(p.codigo, idioma) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, idioma)),
    [idioma],
  )

  function cambiarValor(texto) {
    alCambiarValor(texto)

    if (/^\s*(\+|00)/.test(texto)) {
      const resultado = normalizarTelefono(pais, texto)
      if (resultado.error !== 'LADA_DESCONOCIDA' && resultado.pais !== pais) alCambiarPais(resultado.pais)
    }
  }

  const idError = error ? `${id}-error` : undefined
  const borde = error
    ? 'border-ya-recibio ring-2 ring-ya-recibio/25 focus:border-ya-recibio focus:ring-ya-recibio/25'
    : 'border-principal/25 focus:border-principal focus:ring-principal/15'

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <label className="text-base font-semibold text-principal" htmlFor={id}>
        {etiqueta}
      </label>

      <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <select
          aria-label={t('registro.pais')}
          className={`min-h-14 w-full rounded-xl border bg-superficie px-2 text-base text-principal shadow-sm outline-none focus:ring-4 ${borde}`}
          id={`${id}-pais`}
          onChange={(e) => alCambiarPais(e.target.value)}
          value={pais}
        >
          <optgroup label={t('registro.paisesPrincipales')}>
            {principales.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {nombrePais(p.codigo, idioma)} (+{p.lada})
              </option>
            ))}
          </optgroup>
          <optgroup label={t('registro.paisesTodos')}>
            {resto.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre} (+{p.lada})
              </option>
            ))}
          </optgroup>
        </select>

        <input
          aria-describedby={idError}
          aria-invalid={error ? true : undefined}
          autoComplete="tel"
          className={`min-h-14 w-full rounded-xl border bg-superficie px-4 text-base text-principal shadow-sm outline-none transition focus:ring-4 ${borde}`}
          id={id}
          inputMode="tel"
          onBlur={onBlur}
          onChange={(e) => cambiarValor(e.target.value)}
          type="tel"
          value={valor}
        />
      </div>

      {error && (
        <span className="text-base font-semibold text-ya-recibio" id={idError}>
          {error}
        </span>
      )}
    </div>
  )
}
