/**
 * El codigo corto con el "CB-" ya puesto: se escriben solo los 4 numeros,
 * con el teclado de numeros. Al completar los 4 se llama alCompletar
 * ('CB-4871'), sin tener que tocar "Buscar". Si se pega "CB-4871" o
 * "cb 4871", se quedan los numeros.
 *
 * valor: los numeros escritos ('487'). alCambiar(numeros).
 */
export default function CampoCodigo({ id, etiqueta, ayuda = null, valor, alCambiar, alCompletar, autoFocus = false }) {
  function cambiar(evento) {
    const numeros = evento.target.value.replace(/\D/g, '').slice(0, 4)
    alCambiar(numeros)
    if (numeros.length === 4) alCompletar?.(`CB-${numeros}`)
  }

  return (
    <div>
      <label className="block text-base font-semibold text-principal" htmlFor={id}>
        {etiqueta}
      </label>
      {ayuda && (
        <p className="text-base text-principal/80" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      )}
      <div className="mt-1 flex min-h-14 items-stretch overflow-hidden rounded-xl border border-principal/25 bg-superficie shadow-sm transition focus-within:border-principal focus-within:ring-4 focus-within:ring-principal/15">
        <span
          aria-hidden="true"
          className="flex items-center border-r border-principal/15 bg-principal/5 px-3 font-titulo text-2xl font-bold text-principal"
        >
          CB-
        </span>
        <input
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent px-3 font-titulo text-2xl font-bold tracking-[0.2em] text-principal outline-none placeholder:text-principal/40"
          enterKeyHint="search"
          id={id}
          inputMode="numeric"
          maxLength={8}
          onChange={cambiar}
          pattern="[0-9]*"
          placeholder="4871"
          value={valor}
        />
      </div>
    </div>
  )
}
