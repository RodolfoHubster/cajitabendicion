import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCopy, LuDownload, LuHandHeart, LuShieldAlert, LuX } from 'react-icons/lu'
import { EsqueletoQR } from './Esqueleto'
import { dibujarTarjetaCredencial, nombreArchivoCredencial } from '../datos/credencial'
import { guardarImagen } from '../datos/imagenCita'
import { dibujarQRVoluntario } from '../datos/qrPase'
import { enlaceCredencial } from '../datos/voluntarios'

/**
 * La credencial de un voluntario, desde el panel (seccion 48): su QR para
 * guardarlo o imprimirlo, y su enlace para mandarselo por WhatsApp. El
 * enlace es como su llave; si se le paso a quien no debia, "Cambiar QR".
 *
 * voluntario: { nombre, token, activo }.
 */
export default function VentanaCredencial({ voluntario, alCerrar }) {
  const { t } = useTranslation()
  const [qr, setQr] = useState(null)
  // La tarjeta se dibuja al llegar: el iPhone solo abre "compartir" si se
  // pide en el mismo toque (ver datos/imagenCita.js).
  const [tarjeta, setTarjeta] = useState(null)
  const [guardado, setGuardado] = useState(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let vigente = true
    dibujarQRVoluntario(voluntario.token)
      .then((imagen) => {
        if (vigente) setQr(imagen)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [voluntario.token])

  useEffect(() => {
    if (!qr) return undefined
    let vigente = true
    dibujarTarjetaCredencial({ qr, nombre: voluntario.nombre, t })
      .then((blob) => {
        if (vigente) setTarjeta(blob)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [qr, voluntario.nombre, t])

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
      setGuardado(await guardarImagen(blob, nombreArchivoCredencial(voluntario.nombre)))
    } catch {
      setGuardado('descargada')
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlaceCredencial(voluntario.token))
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div
      aria-labelledby="ventana-credencial-titulo"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-principal/40 p-0 sm:items-center sm:p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
      role="dialog"
    >
      <div className="ventana-sube max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-principal/10 bg-superficie px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-bold text-puede-pasar">
              <LuHandHeart aria-hidden="true" className="h-5 w-5" />
              {t('credencial.etiqueta')}
            </p>
            <h2 className="truncate text-xl font-bold text-principal" id="ventana-credencial-titulo">
              {voluntario.nombre}
            </h2>
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
          {!qr && <EsqueletoQR texto={t('credencial.cargando')} />}

          {qr && (
            <>
              {voluntario.activo === false && (
                <p className="mb-3 rounded-xl bg-ya-recibio/10 p-3 text-base font-semibold text-ya-recibio" role="alert">
                  {t('credencial.inactiva')}
                </p>
              )}

              <img
                alt={t('credencial.qrAlt', { nombre: voluntario.nombre })}
                className="aparecer mx-auto w-full max-w-[16rem] rounded-xl border-4 border-puede-pasar/60 bg-white p-2 shadow-sm"
                src={qr}
              />
              <p className="mt-3 text-center text-base text-principal/80">{t('credencial.comoFunciona')}</p>

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
                  {copiado ? t('personas.copiado') : t('credencial.copiar')}
                </button>
              </div>

              {guardado === 'descargada' && (
                <p className="mt-3 rounded-xl bg-principal/5 p-3 text-base text-principal" role="status">
                  {t('confirmacion.descargada')}
                </p>
              )}

              <p className="mt-4 flex items-start gap-2 rounded-xl bg-principal/5 p-3 text-base text-principal">
                <LuShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
                {t('credencial.cuidado')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
