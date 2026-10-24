import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPrinter } from 'react-icons/lu'
import { useLocation } from 'react-router-dom'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import { EsqueletoLista } from '../../componentes/Esqueleto'
import { ORGANIZACION } from '../../datos/organizacion'
import { dibujarQRVoluntario } from '../../datos/qrPase'
import { listarVoluntarios, marcarCredencialEnviada } from '../../datos/voluntarios'

/**
 * Credenciales para imprimir (seccion 49): 8 por hoja carta, para quien no
 * tiene telefono. Salen las que se estaban viendo en la lista (con su
 * filtro), o todas las activas. Al imprimir solo salen las tarjetas (ver
 * index.css, .solo-imprimir). Despues se puede anotar que se entregaron en
 * papel.
 */
export default function ImprimirCredenciales() {
  const { t } = useTranslation()
  const { state } = useLocation()
  const ids = state?.ids ?? null
  const [tarjetas, setTarjetas] = useState(null)
  const [error, setError] = useState(null)
  const [entregadas, setEntregadas] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vigente = true
    listarVoluntarios()
      .then(async (lista) => {
        const escogidos = ids ? lista.filter((v) => ids.includes(v.id)) : lista.filter((v) => v.activo)
        const conQr = await Promise.all(escogidos.map(async (v) => ({ ...v, qr: await dibujarQRVoluntario(v.token) })))
        if (vigente) setTarjetas(conQr)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [ids])

  async function marcarEntregadas() {
    setOcupado(true)
    setError(null)
    try {
      for (const v of tarjetas) await marcarCredencialEnviada(v.id, 'impresa')
      setEntregadas(tarjetas.length)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="solo-imprimir space-y-4">
      <Tarjeta className="print:hidden">
        <EnlaceVolver a="/admin/voluntarios">{t('constancia.volver')}</EnlaceVolver>
        <h1 className="mt-3 text-2xl font-bold">{t('imprimirCredenciales.titulo', { count: tarjetas?.length ?? 0 })}</h1>
        <p className="text-base text-principal/80">{t('imprimirCredenciales.ayuda')}</p>
        {tarjetas?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accion px-5 text-base font-bold text-sobre-accion shadow-sm transition hover:brightness-95"
              onClick={() => window.print()}
              type="button"
            >
              <LuPrinter aria-hidden="true" className="h-5 w-5" />
              {t('imprimirCredenciales.imprimir')}
            </button>
            {entregadas === null && (
              <button
                className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal disabled:opacity-50"
                disabled={ocupado}
                onClick={marcarEntregadas}
                type="button"
              >
                {t('imprimirCredenciales.marcarEntregadas')}
              </button>
            )}
          </div>
        )}
        {entregadas !== null && (
          <p className="mt-3 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
            {t('imprimirCredenciales.entregadas', { count: entregadas })}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}
      </Tarjeta>

      {tarjetas === null && !error && <EsqueletoLista texto={t('voluntarios.cargando')} />}
      {tarjetas?.length === 0 && <p className="text-base text-principal/80">{t('imprimirCredenciales.ninguna')}</p>}

      {tarjetas?.length > 0 && (
        <div className="mx-auto grid max-w-[8.5in] grid-cols-1 gap-3 sm:grid-cols-2 print:max-w-none print:grid-cols-2 print:gap-0">
          {tarjetas.map((v) => (
            <div
              className="flex break-inside-avoid flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-[#1B3A6B]/40 bg-white p-3 text-center text-[#1B3A6B] print:h-[2.45in] print:rounded-none print:p-2"
              key={v.id}
            >
              {/* Con alto fijo al imprimir: nada se encoge, o el nombre desaparece. */}
              <p className="shrink-0 font-titulo text-base font-bold leading-tight">{ORGANIZACION.programa}</p>
              <p className="shrink-0 text-chica font-bold uppercase tracking-widest text-[#2E8B57]">{t('credencial.etiqueta')}</p>
              <img
                alt={t('credencial.qrAlt', { nombre: v.nombre })}
                className="h-32 w-32 shrink-0 print:h-[1.1in] print:w-[1.1in]"
                src={v.qr}
              />
              <p className="max-w-full shrink-0 truncate font-titulo text-lg font-bold leading-tight">{v.nombre}</p>
              <p className="shrink-0 text-chica leading-tight">{t('credencial.enseniala')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
