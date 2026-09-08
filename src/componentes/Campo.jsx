export default function Campo({ etiqueta, id, ...props }) {
  return (
    <label className="flex w-full flex-col gap-2 text-left" htmlFor={id}>
      <span className="text-sm font-medium text-principal">{etiqueta}</span>
      <input
        className="min-h-14 rounded-xl border border-principal/20 px-3 outline-none focus:border-principal"
        id={id}
        {...props}
      />
    </label>
  )
}
