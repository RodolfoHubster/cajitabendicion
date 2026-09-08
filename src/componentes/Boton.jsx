export default function Boton({ children, className = '', variant = 'primary', ...props }) {
  const base = 'inline-flex min-h-14 w-full items-center justify-center rounded-xl px-4 text-base font-semibold transition'
  const variants = {
    primary: 'bg-accion text-white hover:opacity-90',
    secondary: 'bg-principal text-white hover:opacity-90',
  }

  return (
    <button className={`${base} ${variants[variant] ?? variants.primary} ${className}`} {...props}>
      {children}
    </button>
  )
}
