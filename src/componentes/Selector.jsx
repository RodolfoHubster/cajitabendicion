/**
 * Lista desplegable con su etiqueta, del mismo alto que Campo. Con "activo"
 * (un filtro puesto) el contorno se marca, para ver de un vistazo que filtra.
 */
export default function Selector({ etiqueta, id, activo = false, className = '', children, ...props }) {
  const borde = activo
    ? 'border-principal ring-2 ring-principal/25'
    : 'border-principal/25 focus:border-principal focus:ring-principal/15'

  return (
    <label className="flex w-full flex-col gap-2 text-left" htmlFor={id}>
      <span className="text-base font-semibold text-principal">{etiqueta}</span>
      <select
        className={`min-h-14 w-full rounded-xl border bg-white px-3 text-base text-principal shadow-sm outline-none transition focus:ring-4 ${borde} ${className}`}
        id={id}
        {...props}
      >
        {children}
      </select>
    </label>
  )
}
