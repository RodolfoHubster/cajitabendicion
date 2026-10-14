/**
 * El codigo corto con el "CB-" ya puesto: se escriben solo los numeros, con
 * el teclado de numeros. Los de antes tienen 4 y los nuevos 5 (seccion 45):
 * con 4 ya se busca, y con el quinto se vuelve a buscar. Sin tocar
 * "Buscar". Si se pega "CB-48213" o "cb 4871", se quedan los numeros.
 *
 * valor: los numeros escritos ('487'). alCambiar(numeros).
 */
export default function CampoCodigo({ id, etiqueta, ayuda = null, valor, alCambiar, alCompletar, autoFocus = false }) {
  function cambiar(evento) {
    const numeros = evento.target.value.replace(/\D/g, '').slice(0, 5)
    alCambiar(numeros)
    if (numeros.length >= 4) alCompletar?.(`CB-${numeros}`)
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
      {/* w-0 en el campo: sin eso, el navegador le reserva ~20 letras de ancho
          y en un telefono de 360 px empujaba toda la pagina de lado. */}
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
          className="w-0 min-w-0 flex-1 bg-transparent px-3 font-titulo text-2xl font-bold tracking-[0.2em] text-principal outline-none placeholder:text-principal/40"
          enterKeyHint="search"
          id={id}
          inputMode="numeric"
          maxLength={9}
          onChange={cambiar}
          pattern="[0-9]*"
          placeholder="4871"
          value={valor}
        />
      </div>
    </div>
  )
}
