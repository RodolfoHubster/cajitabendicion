import { useTranslation } from 'react-i18next'
import { LuPackageCheck, LuPlay, LuUndo2, LuUserX, LuVolume2 } from 'react-icons/lu'
import { formatearHora } from '../datos/disponibilidad'
import { hablar, leerAnuncio, puedeHablar } from '../datos/voz'

/**
 * A pie, encima de la camara: el turno que va (en grande, para gritarlo),
 * los que siguen, y lo que se hace con el ahi mismo, sin bajar al panel:
 *
 *   Empezar a entregar  mientras no se toque, la gente ve "Todavia no
 *                       empezamos" (seccion 57)
 *   Entregar sin QR     trae su numero pero perdio su pagina (seccion 44)
 *   No se presento      la fila sigue; si llega despues, su turno vale igual
 *   Decirlo en voz alta
 *
 * datos: lo de fila_de_turnos(). alEntregar(turno), alSaltar(turno),
 * alEmpezar(empezada): true empieza la entrega; false la deshace.
 */
export default function TurnoQueVa({ datos, ocupado = false, alEntregar, alSaltar, alEmpezar }) {
  const { t, i18n } = useTranslation()

  if (!datos) return null
  const actual = datos.actual
  const siguen = (datos.siguientes ?? []).slice(0, 4).map((s) => s.turno)

  //  Seccion 57. Sin el boton, la entrega empieza sola con la primera caja.
  const porEmpezar = datos.empezada === false && !datos.terminada
  //  Recien tocado y sin nada entregado: todavia se puede deshacer.
  const recienEmpezada =
    datos.empezada && datos.empezada_a_mano && !datos.atendidos && !(datos.saltados ?? []).length && !datos.terminada

  const empezar = porEmpezar ? (
    <div className="mb-3 rounded-2xl border-2 border-accion bg-accion/10 p-3 text-principal" role="status">
      <p className="text-base font-semibold">{t('filaTurnos.empezar.aunNo')}</p>
      <button
        className="mt-2 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-3 text-lg font-bold text-sobre-accion shadow-sm transition hover:brightness-95 disabled:opacity-60"
        disabled={ocupado}
        onClick={() => alEmpezar?.(true)}
        type="button"
      >
        <LuPlay aria-hidden="true" className="h-5 w-5 shrink-0" />
        {t('filaTurnos.empezar.boton')}
      </button>
      <p className="mt-2 text-chica text-principal/80">{t('filaTurnos.empezar.solo')}</p>
    </div>
  ) : recienEmpezada ? (
    <p className="mb-2 flex flex-wrap items-center gap-x-2 text-base text-principal" role="status">
      {t('filaTurnos.empezar.empezada', { hora: formatearHora(datos.empezo_en) })}
      <button
        className="inline-flex min-h-12 items-center gap-1 font-semibold underline underline-offset-4 disabled:opacity-60"
        disabled={ocupado}
        onClick={() => alEmpezar?.(false)}
        type="button"
      >
        <LuUndo2 aria-hidden="true" className="h-4 w-4" />
        {t('filaTurnos.empezar.deshacer')}
      </button>
    </p>
  ) : null

  if (!actual) {
    return (
      <>
        {empezar}
        <p className="mb-3 rounded-xl border-2 border-accion bg-accion/10 px-3 py-2 text-base font-semibold text-principal" role="status">
          {datos.terminada ? t('filaTurnos.terminar.terminada') : t('filaTurnos.nadieEsperando')}
        </p>
      </>
    )
  }

  function decir() {
    //  Dos veces: en la calle, la primera se pierde.
    const frase = t('filaTurnos.frase', { turno: actual.turno })
    hablar(`${frase}. ${frase}.`, i18n.language, globalThis.window, { voz: leerAnuncio().voz })
  }

  return (
    <>
      {empezar}
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
    </>
  )
}
