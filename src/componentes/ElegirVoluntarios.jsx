import { useTranslation } from 'react-i18next'
import { LuCircleCheck, LuSquare, LuSquareCheck } from 'react-icons/lu'

/**
 * Escoger a varios voluntarios tocando su nombre (seccion 52): para pasar
 * lista o para anotar un dia pasado. Por montones, cada uno con su titulo y
 * "Escoger a todos". Los de un monton "bloqueado" (los que ya estan) se ven
 * con su palomita, pero no se escogen.
 *
 * montones: [{ clave, titulo, voluntarios, bloqueado?, detalle?(v) }]
 * elegidos: Set de ids. alCambiar(nuevoSet).
 */
export default function ElegirVoluntarios({ montones, elegidos, alCambiar }) {
  const { t } = useTranslation()

  function cambiar(id) {
    const nuevos = new Set(elegidos)
    if (nuevos.has(id)) nuevos.delete(id)
    else nuevos.add(id)
    alCambiar(nuevos)
  }

  function todos(lista, poner) {
    const nuevos = new Set(elegidos)
    for (const v of lista) {
      if (poner) nuevos.add(v.id)
      else nuevos.delete(v.id)
    }
    alCambiar(nuevos)
  }

  return (
    <div className="space-y-5">
      {montones
        .filter((m) => m.voluntarios.length > 0)
        .map((m) => {
          const todosElegidos = !m.bloqueado && m.voluntarios.every((v) => elegidos.has(v.id))
          return (
            <section aria-labelledby={`monton-${m.clave}`} key={m.clave}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-principal" id={`monton-${m.clave}`}>
                  {m.titulo} <span className="font-normal text-principal/70">({m.voluntarios.length})</span>
                </h3>
                {!m.bloqueado && m.voluntarios.length > 1 && (
                  <button
                    className="min-h-12 rounded-xl px-3 text-base font-semibold text-principal underline decoration-principal/30 underline-offset-4 hover:decoration-principal"
                    onClick={() => todos(m.voluntarios, !todosElegidos)}
                    type="button"
                  >
                    {todosElegidos ? t('voluntarios.elegir.quitarTodos') : t('voluntarios.elegir.todos')}
                  </button>
                )}
              </div>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {m.voluntarios.map((v) => {
                  const detalle = m.detalle?.(v)
                  if (m.bloqueado) {
                    return (
                      <li className="flex min-h-14 items-center gap-3 rounded-xl bg-puede-pasar/10 px-3 py-2" key={v.id}>
                        <LuCircleCheck aria-hidden="true" className="h-7 w-7 shrink-0 text-puede-pasar" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-principal">{v.nombre}</span>
                          {detalle && <span className="block text-base text-principal/80">{detalle}</span>}
                        </span>
                      </li>
                    )
                  }
                  const elegido = elegidos.has(v.id)
                  return (
                    <li key={v.id}>
                      <button
                        aria-pressed={elegido}
                        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition ${
                          elegido ? 'border-puede-pasar bg-puede-pasar/10' : 'border-principal/15 bg-superficie hover:border-principal/40'
                        }`}
                        onClick={() => cambiar(v.id)}
                        type="button"
                      >
                        {elegido ? (
                          <LuSquareCheck aria-hidden="true" className="h-7 w-7 shrink-0 text-puede-pasar" />
                        ) : (
                          <LuSquare aria-hidden="true" className="h-7 w-7 shrink-0 text-principal/70" />
                        )}
                        <span className="min-w-0">
                          <span className="block font-semibold text-principal">{v.nombre}</span>
                          {detalle && <span className="block text-base text-principal/80">{detalle}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
    </div>
  )
}
