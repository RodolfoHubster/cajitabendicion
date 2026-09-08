export default function Boton({ children, tipo = 'button', variante = 'primario' }) {
  const clases =
    variante === 'primario'
      ? 'bg-accion text-azul-principal'
      : 'bg-white text-azul-principal border border-azul-principal'

  return (
    <button type={tipo} className={`min-h-14 w-full rounded-lg px-4 py-3 font-semibold ${clases}`}>
      {children}
    </button>
  )
}
