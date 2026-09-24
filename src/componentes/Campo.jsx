/**
 * Campo de texto con su etiqueta.
 *
 * Con error, el contorno se pone rojo y el mensaje sale debajo diciendo que
 * falta. En cuanto se corrige, el error deja de llegar y el campo vuelve a
 * como estaba.
 */
export default function Campo({ etiqueta, id, error, className = '', ...props }) {
  const idError = error ? `${id}-error` : undefined

  const borde = error
    ? 'border-ya-recibio ring-2 ring-ya-recibio/25 focus:border-ya-recibio focus:ring-ya-recibio/25'
    : 'border-principal/25 focus:border-principal focus:ring-principal/15'

  return (
    <label className="flex w-full flex-col gap-2 text-left" htmlFor={id}>
      {/* 16px: CLAUDE.md pide texto minimo de 15px, y antes la etiqueta era de 14. */}
      <span className="text-base font-semibold text-principal">{etiqueta}</span>
      <input
        aria-describedby={idError}
        aria-invalid={error ? true : undefined}
        className={`min-h-14 rounded-xl border bg-superficie px-4 text-base text-principal shadow-sm outline-none transition placeholder:text-principal/40 focus:ring-4 ${borde} ${className}`}
        id={id}
        {...props}
      />
      {error && (
        <span className="text-base font-semibold text-ya-recibio" id={idError}>
          {error}
        </span>
      )}
    </label>
  )
}
