import Tarjeta from './Tarjeta'

/**
 * Carga esqueleto: la forma de lo que viene, pulsando, mientras llegan los
 * datos. Con mala señal una pantalla en blanco o un "Cargando…" suelto
 * parecen trabados, y la gente toca otra vez o se sale. La forma avisa que
 * algo viene y dónde va a quedar.
 *
 * Los huesos son bg-principal/10: salen de las variables del tema, así que
 * funcionan en modo oscuro. Quien pidió menos movimiento en su teléfono los
 * ve quietos (motion-safe). El lector de pantalla oye el texto de siempre
 * ("Cargando…"), no los huesos.
 */
export function Hueso({ className = '' }) {
  return <span aria-hidden="true" className={`block rounded-lg bg-principal/10 motion-safe:animate-pulse ${className}`} />
}

/** El contenedor: avisa "cargando" al lector de pantalla. */
export function Cargando({ texto, className = '', children }) {
  return (
    <div aria-busy="true" aria-live="polite" className={className} role="status">
      <span className="sr-only">{texto}</span>
      {children}
    </div>
  )
}

const ANCHOS = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3', 'w-3/4']

/** Renglones de texto, de largos distintos para que parezcan texto. */
export function EsqueletoLineas({ lineas = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lineas }, (_, i) => (
        <Hueso className={`h-4 ${ANCHOS[i % ANCHOS.length]}`} key={i} />
      ))}
    </div>
  )
}

/** Lo de arriba de cada paso: "Volver", los pasos y el título. */
function Cabeza({ conPasos = true }) {
  return (
    <>
      <Hueso className="mb-4 h-5 w-28" />
      {conPasos && (
        <div className="mb-4 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Hueso className="h-2 flex-1 rounded-full" key={i} />
          ))}
        </div>
      )}
      <Hueso className="mb-2 h-8 w-3/4" />
    </>
  )
}

/** Calendario: la próxima fecha, sus datos y los dos botones. */
export function EsqueletoProximaFecha({ texto }) {
  return (
    <Tarjeta>
      <Cargando texto={texto}>
        <Cabeza />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div className="flex items-center gap-3" key={i}>
              <Hueso className="size-5 shrink-0 rounded-full" />
              <Hueso className={`h-4 ${ANCHOS[i + 1]}`} />
            </div>
          ))}
        </div>
        <Hueso className="mt-4 h-14 w-full rounded-xl" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Hueso className="h-14 rounded-xl" />
          <Hueso className="h-14 rounded-xl" />
        </div>
      </Cargando>
    </Tarjeta>
  )
}

/** Horarios: la lista de bloques de 15 minutos. */
export function EsqueletoHorarios({ texto }) {
  return (
    <Tarjeta>
      <Cargando texto={texto}>
        <Cabeza />
        <Hueso className="mb-4 h-4 w-1/2" />
        <ul className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <li className="flex min-h-14 items-center justify-between rounded-xl border border-principal/10 px-4" key={i}>
              <Hueso className="h-5 w-24" />
              <Hueso className="h-6 w-20 rounded-full" />
            </li>
          ))}
        </ul>
      </Cargando>
    </Tarjeta>
  )
}

/** Registro y cambio de horario: el resumen de la cita y los campos. */
export function EsqueletoFormulario({ texto, campos = 4, conPasos = true }) {
  return (
    <Tarjeta>
      <Cargando texto={texto}>
        <Cabeza conPasos={conPasos} />
        <Hueso className="mb-5 h-16 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: campos }, (_, i) => (
            <div key={i}>
              <Hueso className="mb-2 h-4 w-24" />
              <Hueso className="h-14 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <Hueso className="mt-6 h-14 w-full rounded-xl" />
      </Cargando>
    </Tarjeta>
  )
}

/** La pantalla del QR (cita o pase): fecha, el cuadro del código y sus datos. */
export function EsqueletoQR({ texto }) {
  return (
    <Tarjeta>
      <Cargando className="text-center" texto={texto}>
        <Hueso className="mx-auto mb-2 h-4 w-32" />
        <Hueso className="mx-auto mb-5 h-8 w-3/4" />
        <Hueso className="mx-auto aspect-square w-full max-w-[17.5rem] rounded-xl" />
        <Hueso className="mx-auto mt-4 h-10 w-40" />
        <EsqueletoLineas className="mx-auto mt-4 max-w-sm [&>*]:mx-auto" lineas={2} />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Hueso className="h-14 rounded-xl" />
          <Hueso className="h-14 rounded-xl" />
        </div>
      </Cargando>
    </Tarjeta>
  )
}

/** Una lista del panel: renglones con su texto y una etiqueta a la derecha. */
export function EsqueletoLista({ texto, filas = 4 }) {
  return (
    <Cargando texto={texto}>
      <ul className="divide-y divide-principal/10">
        {Array.from({ length: filas }, (_, i) => (
          <li className="flex items-center justify-between gap-4 py-3" key={i}>
            <div className="min-w-0 flex-1 space-y-2">
              <Hueso className={`h-4 ${ANCHOS[(i + 2) % ANCHOS.length]} max-w-xs`} />
              <Hueso className="h-3 w-1/3 max-w-[10rem]" />
            </div>
            <Hueso className="h-8 w-20 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </Cargando>
  )
}

/** Los números del encabezado de Citas de hoy. */
export function EsqueletoNumeros({ texto, cuantos = 6 }) {
  return (
    <Cargando className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6" texto={texto}>
      {Array.from({ length: cuantos }, (_, i) => (
        <div className="rounded-xl bg-principal/5 p-3" key={i}>
          <Hueso className="mb-2 h-8 w-12" />
          <Hueso className="h-4 w-20" />
        </div>
      ))}
    </Cargando>
  )
}

/** Texto corrido: preguntas frecuentes, quiénes somos. */
export function EsqueletoTexto({ texto, parrafos = 3 }) {
  return (
    <Cargando className="space-y-5" texto={texto}>
      {Array.from({ length: parrafos }, (_, i) => (
        <div key={i}>
          <Hueso className="mb-3 h-5 w-1/2" />
          <EsqueletoLineas lineas={3} />
        </div>
      ))}
    </Cargando>
  )
}

/** La ficha de una persona (Ver): sus datos, el cuadro del QR y sus citas. */
export function EsqueletoFicha({ texto, conQr = false }) {
  return (
    <Cargando texto={texto}>
      <div className={conQr ? 'grid gap-5 sm:grid-cols-[minmax(0,1fr)_15rem]' : ''}>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Hueso className="mb-2 h-4 w-20" />
              <Hueso className={`h-5 ${ANCHOS[i + 2]}`} />
            </div>
          ))}
        </div>
        {conQr && <Hueso className="aspect-square w-full rounded-2xl" />}
      </div>
      <Hueso className="mb-3 mt-6 h-5 w-24" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Hueso className="h-10" key={i} />
        ))}
      </div>
      <Hueso className="mb-2 mt-6 h-5 w-24" />
      {[0, 1].map((i) => (
        <div className="flex items-center justify-between py-2" key={i}>
          <Hueso className="h-5 w-44" />
          <Hueso className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </Cargando>
  )
}
