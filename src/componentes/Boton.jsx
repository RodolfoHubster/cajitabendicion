/**
 * El boton principal usa texto azul sobre naranja, no blanco.
 *
 * Blanco sobre #F5A03C tiene un contraste de 2.1:1, por debajo del minimo
 * legible (4.5:1). Azul #1B3A6B sobre el mismo naranja da 5.2:1. Con tantos
 * adultos mayores usando el sistema, se nota.
 */
export default function Boton({ children, className = '', variant = 'primary', ...props }) {
  const base =
    'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60'

  const variants = {
    primary:
      'bg-accion text-principal shadow-sm hover:brightness-95 active:brightness-90 focus-visible:ring-principal/30',
    secondary:
      'bg-principal text-white shadow-sm hover:brightness-110 active:brightness-95 focus-visible:ring-accion/50',
  }

  return (
    <button className={`${base} ${variants[variant] ?? variants.primary} ${className}`} {...props}>
      {children}
    </button>
  )
}
