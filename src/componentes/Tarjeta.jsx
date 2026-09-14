export default function Tarjeta({ children, className = '' }) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(27,58,107,0.06),0_10px_28px_-14px_rgba(27,58,107,0.22)] ring-1 ring-principal/10 ${className}`}
    >
      {children}
    </section>
  )
}
