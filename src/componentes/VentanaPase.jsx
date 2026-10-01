import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCopy, LuCrown, LuDownload, LuShieldAlert, LuStar, LuX } from 'react-icons/lu'
import { EsqueletoQR } from './Esqueleto'
import { BORDE_ORO, FONDO_ORO } from './SelloVip'
import { dibujarTarjetaCita, guardarImagen, nombreArchivoCita } from '../datos/imagenCita'
import { ORGANIZACION } from '../datos/organizacion'
import { paseDeCodigo } from '../datos/pases'
import { dibujarQRPase } from '../datos/qrPase'

/**
 * El pase de alguien, visto desde el panel: sin salir a otra pagina.
 *
 * Desde aqui se guarda la imagen (para imprimirla o mandarla) y se copia el
 * enlace para mandarselo a la persona. El enlace es como su llave: quien lo
 * tenga ve el QR. Por eso la ventana lo recuerda, y dice que hacer si se
 * paso a quien no debia (cambiar el codigo en Pases).
 */
export default function VentanaPase({ token, alCerrar }) {
  const { t } = useTranslation()

  const [pase, setPase] = useState(null)
  const [qr, setQr] = useState(null)
  const [error, setError] = useState(null)
  // La tarjeta se dibuja al llegar: el iPhone solo abre "compartir" si se
  // pide en el mismo toque (ver datos/imagenCita.js).
  const [tarjeta, setTarjeta] = useState(null)
  const [guardado, setGuardado] = useState(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let vigente = true

    paseDeCodigo(token)
      .then(async (datos) => {
        if (!datos) throw new Error('PASE_NO_EXISTE')
        const imagen = await dibujarQRPase(token, { vip: Boolean(datos.vip) })
        if (!vigente) return
        setPase(datos)
        setQr(imagen)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })

    return () => {
      vigente = false
    }
  }, [token])

  useEffect(() => {
    if (!pase || !qr) return undefined

    let vigente = true
    dibujarTarjetaCita({
      qr,
      codigo: pase.codigo_corto,
      nombre: pase.nombre,
      textos: {
        programa: ORGANIZACION.programa,
        iglesia: ORGANIZACION.iglesia,
        lista: pase.vip ? t('vip.etiqueta') : t('pase.etiqueta'),
        fecha: t('pase.titulo'),
        hora: t('pase.dias'),
        siNoSeLee: t('confirmacion.siNoSeLee'),
        aNombreDe: t('confirmacion.aNombreDe'),
      },
    })
      .then((blob) => {
        if (vigente) setTarjeta(blob)
      })
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [pase, qr, t])

  useEffect(() => {
    const escape = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [alCerrar])

  async function guardar() {
    setGuardado(null)
    try {
      const blob = tarjeta ?? (await (await fetch(qr)).blob())
      setGuardado(await guardarImagen(blob, nombreArchivoCita(`pase-${pase.codigo_corto}`)))
    } catch {
      setGuardado('descargada')
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pase/${token}`)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div
      aria-labelledby="ventana-pase-titulo"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-principal/40 p-0 sm:items-center sm:p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
      role="dialog"
    >
      <div className="ventana-sube max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie shadow-xl sm:rounded-2xl">
        <div
          className={`sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-principal/10 px-5 py-4 ${
            pase?.vip ? FONDO_ORO : 'bg-superficie'
          }`}
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-bold text-principal">
              {pase?.vip ? (
                <LuCrown aria-hidden="true" className="h-5 w-5 text-[#B8860B]" />
              ) : (
                <LuStar aria-hidden="true" className="h-5 w-5" />
              )}
              {pase?.vip ? t('vip.etiqueta') : t('pase.etiqueta')}
            </p>
            <h2 className="truncate text-xl font-bold text-principal" id="ventana-pase-titulo">
              {pase?.nombre ?? t('pase.titulo')}
            </h2>
            {pase && <p className="font-titulo text-lg font-bold text-principal/70">{pase.codigo_corto}</p>}
          </div>
          <button
            aria-label={t('detalle.cerrar')}
            className="-mr-2 flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl text-principal transition hover:bg-principal/10"
            onClick={alCerrar}
            type="button"
          >
            <LuX aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>

        <div className="px-5 py-4">
          {error && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`citas.errores.${error}`, { defaultValue: t('pase.noEncontrado') })}
            </p>
          )}

          {!error && !qr && <EsqueletoQR texto={t('pase.cargando')} />}

          {pase && qr && (
            <>
              {!pase.activo && (
                <p className="mb-3 rounded-xl bg-ya-recibio/10 p-3 text-base font-semibold text-ya-recibio" role="alert">
                  {t('pase.revocado')}
                </p>
              )}

              <img
                alt={t('confirmacion.qrAlt')}
                className={`aparecer mx-auto w-full max-w-[16rem] rounded-xl bg-white p-2 shadow-sm ${
                  pase.vip ? `border-4 ${BORDE_ORO}` : 'border border-principal/15'
                }`}
                src={qr}
              />

              <div className="mt-4 grid gap-2">
                <button
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-base font-bold text-sobre-accion shadow-sm transition hover:brightness-95"
                  onClick={guardar}
                  type="button"
                >
                  <LuDownload aria-hidden="true" className="h-5 w-5" />
                  {t('confirmacion.guardarImagen')}
                </button>
                <button
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-principal px-4 text-base font-semibold text-principal transition hover:bg-principal/10"
                  onClick={copiar}
                  type="button"
                >
                  <LuCopy aria-hidden="true" className="h-5 w-5" />
                  {copiado ? t('personas.copiado') : t('personas.copiar')}
                </button>
              </div>

              {guardado === 'descargada' && (
                <p className="mt-3 rounded-xl bg-principal/5 p-3 text-base text-principal" role="status">
                  {t('confirmacion.descargada')}
                </p>
              )}

              {/* El enlace es como su llave: quien lo tenga ve el QR. */}
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-principal/5 p-3 text-base text-principal">
                <LuShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
                {t('ventanaPase.cuidado')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
