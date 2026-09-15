/**
 * Lista desplegable con su etiqueta, del mismo alto que Campo. Con "activo"
 * (un filtro puesto) el contorno se marca, para ver de un vistazo que filtra.
 * Con "error", el contorno se pone rojo y el mensaje sale debajo, como en Campo.
 */
export default function Selector({ etiqueta, id, activo = false, error, className = '', children, ...props }) {
  const idError = error ? `${id}-error` : undefined

  const borde = error
    ? 'border-ya-recibio ring-2 ring-ya-recibio/25 focus:border-ya-recibio focus:ring-ya-recibio/25'
    : activo
      ? 'border-principal ring-2 ring-principal/25'
      : 'border-principal/25 focus:border-principal focus:ring-principal/15'

  return (
    <label className="flex w-full flex-col gap-2 text-left" htmlFor={id}>
      <span className="text-base font-semibold text-principal">{etiqueta}</span>
      <select
        aria-describedby={idError}
        aria-invalid={error ? true : undefined}
        className={`min-h-14 w-full rounded-xl border bg-white px-3 text-base text-principal shadow-sm outline-none transition focus:ring-4 ${borde} ${className}`}
        id={id}
        {...props}
      >
        {children}
      </select>
      {error && (
        <span className="text-base font-semibold text-ya-recibio" id={idError}>
          {error}
        </span>
      )}
    </label>
  )
}
