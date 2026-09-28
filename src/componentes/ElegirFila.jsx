import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'

//  Cada fila con su color, igual que su QR: carro azul, a pie naranja.
const OPCIONES = [
  { fila: 'carro', Icono: FaCarSide, clase: 'bg-marca text-white focus-visible:ring-accion/60' },
  { fila: 'a_pie', Icono: FaPersonWalking, clase: 'bg-accion text-sobre-accion focus-visible:ring-principal/40' },
]

/**
 * "¿En qué fila estás hoy?", antes de abrir la cámara.
 *
 * Se elige una vez al día. Asi nadie entrega en la fila equivocada por
 * haber dejado el telefono como estaba ayer. `asignada` es la que le dieron
 * en Equipo, para marcarla como la de siempre.
 */
export default function ElegirFila({ asignada, alElegir, ocupado = false, error = null }) {
  const { t } = useTranslation()

  return (
    <div>
      <h2 className="text-xl font-bold text-principal">{t('elegirFila.pregunta')}</h2>
      <p className="mt-1 text-base text-principal/70">{t('elegirFila.ayuda')}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OPCIONES.map(({ fila, Icono, clase }) => (
          <button
            className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-4 text-center shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${clase}`}
            disabled={ocupado}
            key={fila}
            onClick={() => alElegir(fila)}
            type="button"
          >
            <Icono aria-hidden="true" className="h-10 w-10" />
            <span className="text-xl font-bold">{t(`filas.nombre.${fila}`)}</span>
            {asignada === fila && (
              <span className="rounded-full bg-white/25 px-3 py-0.5 text-chica font-semibold">
                {t('elegirFila.laDeSiempre')}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`escaneo.errores.${error}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}
    </div>
  )
}
