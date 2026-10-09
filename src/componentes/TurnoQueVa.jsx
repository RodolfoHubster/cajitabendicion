import { useTranslation } from 'react-i18next'
import { LuPackageCheck, LuUserX, LuVolume2 } from 'react-icons/lu'
import { hablar, leerAnuncio, puedeHablar } from '../datos/voz'

/**
 * A pie, encima de la camara: el turno que va (en grande, para gritarlo),
 * los que siguen, y lo que se hace con el ahi mismo, sin bajar al panel:
 *
 *   Entregar sin QR    trae su numero pero perdio su pagina (seccion 44)
 *   No se presento     la fila sigue; si llega despues, su turno vale igual
 *   Decirlo en voz alta
 *
 * datos: lo de fila_de_turnos(). alEntregar(turno), alSaltar(turno).
 */
export default function TurnoQueVa({ datos, ocupado = false, alEntregar, alSaltar }) {
  const { t, i18n } = useTranslation()

  if (!datos) return null
  const actual = datos.actual
  const siguen = (datos.siguientes ?? []).slice(0, 4).map((s) => s.turno)

  if (!actual) {
    return (
      <p className="mb-3 rounded-xl border-2 border-accion bg-accion/10 px-3 py-2 text-base font-semibold text-principal" role="status">
        {datos.terminada ? t('filaTurnos.terminar.terminada') : t('filaTurnos.nadieEsperando')}
      </p>
    )
  }

  function decir() {
    //  Dos veces: en la calle, la primera se pierde.
    const frase = t('filaTurnos.frase', { turno: actual.turno })
    hablar(`${frase}. ${frase}.`, i18n.language, globalThis.window, { voz: leerAnuncio().voz })
  }

  return (
    <div aria-live="polite" className="mb-3 rounded-2xl border-2 border-accion bg-accion/10 p-3 text-principal">
      <div className="flex items-center gap-3">
        <span className="text-base font-bold uppercase leading-tight">{t('filaTurnos.va')}</span>
        <span className="font-titulo text-5xl font-bold leading-none">{actual.turno}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-base font-semibold">{actual.nombre}</span>
          {siguen.length > 0 && (
            <span className="block text-chica text-principal/80">
              {t('filaTurnos.sigueLista', { turnos: siguen.join(' · ') })}
            </span>
          )}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-marca px-2 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          disabled={ocupado}
          onClick={() => alEntregar(actual.turno)}
          type="button"
        >
          <LuPackageCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
          {t('filaTurnos.sinQr.boton')}
        </button>
        <button
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-2 text-base font-bold text-principal transition hover:border-principal disabled:opacity-60"
          disabled={ocupado}
          onClick={() => alSaltar(actual.turno)}
          type="button"
        >
          <LuUserX aria-hidden="true" className="h-5 w-5 shrink-0 text-ya-recibio" />
          {t('filaTurnos.noSePresento')}
        </button>
      </div>

      {puedeHablar() && (
        <button
          className="mt-1 inline-flex min-h-12 items-center gap-2 px-1 text-base font-semibold text-principal underline underline-offset-4"
          onClick={decir}
          type="button"
        >
          <LuVolume2 aria-hidden="true" className="h-5 w-5 text-accion" />
          {t('filaTurnos.decir')}
        </button>
      )}
    </div>
  )
}
