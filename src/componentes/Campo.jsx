export default function Campo({ etiqueta, placeholder }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-azul-principal">
      <span>{etiqueta}</span>
      <input
        className="min-h-14 rounded-lg border border-slate-300 px-3"
        placeholder={placeholder}
      />
    </label>
  )
}
