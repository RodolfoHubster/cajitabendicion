export default function Tarjeta({ children, className = '' }) {
  return (
    <section
      className={`rounded-2xl bg-superficie p-5 shadow-tarjeta ring-1 ring-principal/10 ${className}`}
    >
      {children}
    </section>
  )
}
