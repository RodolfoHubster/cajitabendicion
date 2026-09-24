import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuRefreshCw } from 'react-icons/lu'
import { clasificarErrorCamara, leerQR, zonaVisible } from '../datos/escaneo'

/**
 * Camara apuntando a un codigo QR.
 *
 * Llama a `alLeer` con el texto del codigo la primera vez que lo
 * reconoce, y deja de buscar hasta que el padre lo reactive. Sin eso
 * dispararia decenas de veces por segundo sobre el mismo codigo.
 */
export default function LectorQR({ activo, alLeer }) {
  const { t } = useTranslation()
  const videoRef = useRef(null)
  const lienzoRef = useRef(null)
  const [error, setError] = useState(null)
  //  Sube con "Intentar de nuevo": vuelve a pedir la camara sin recargar.
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!activo) return

    let flujo = null
    let cuadro = null
    let vigente = true

    async function encender() {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          // La camara trasera es la que apunta al telefono de la familia.
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })

        if (!vigente) {
          flujo.getTracks().forEach((t) => t.stop())
          return
        }

        const video = videoRef.current
        video.srcObject = flujo
        await video.play()
        buscar()
      } catch (e) {
        if (vigente) setError(clasificarErrorCamara(e))
      }
    }

    function buscar() {
      if (!vigente) return

      const video = videoRef.current
      const lienzo = lienzoRef.current

      if (video?.readyState === video?.HAVE_ENOUGH_DATA && lienzo) {
        lienzo.width = video.videoWidth
        lienzo.height = video.videoHeight

        const ctx = lienzo.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height)

        const { x, y, lado } = zonaVisible(lienzo.width, lienzo.height)
        const texto = leerQR(ctx.getImageData(x, y, lado, lado))

        if (texto) {
          alLeer(texto)
          return
        }
      }

      cuadro = requestAnimationFrame(buscar)
    }

    encender()

    // Apagar la camara al salir. Si no, la luz del telefono se queda
    // encendida y la bateria se va en una tarde de entrega.
    return () => {
      vigente = false
      if (cuadro) cancelAnimationFrame(cuadro)
      if (flujo) flujo.getTracks().forEach((t) => t.stop())
    }
  }, [activo, alLeer, intento])

  if (error) {
    return (
      <div className="space-y-3 rounded-xl bg-ya-recibio/10 p-4" role="alert">
        <p className="text-base font-semibold text-ya-recibio">{t(`escaneo.camara.${error}`)}</p>
        {/* Como arreglarlo, en pasos: el voluntario no tiene por que saber
            donde estan los permisos del navegador. */}
        {(error === 'SIN_PERMISO' || error === 'CAMARA_OCUPADA') && (
          <p className="text-base text-principal">{t(`escaneo.camara.comoArreglar.${error}`)}</p>
        )}
        {error !== 'SIN_CAMARA' && error !== 'SIN_HTTPS' && (
          <button
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold text-principal"
            onClick={() => {
              setError(null)
              setIntento((n) => n + 1)
            }}
            type="button"
          >
            <LuRefreshCw aria-hidden="true" className="h-5 w-5" />
            {t('escaneo.camara.reintentar')}
          </button>
        )}
        <p className="text-base text-principal/70">{t('escaneo.camara.usaManual')}</p>
      </div>
    )
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-xl bg-principal/5">
        <video
          className="aspect-square w-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        <canvas className="hidden" ref={lienzoRef} />

        {/* El cuadro guía: dónde va el QR. Lo de afuera se oscurece para que
            el ojo vaya al centro. Colores fijos: va sobre el video, no
            sobre la página, así que no cambia con el modo oscuro. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative aspect-square w-[68%] rounded-2xl shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]">
            <span className="absolute -left-1 -top-1 h-10 w-10 rounded-tl-2xl border-l-[6px] border-t-[6px] border-white" />
            <span className="absolute -right-1 -top-1 h-10 w-10 rounded-tr-2xl border-r-[6px] border-t-[6px] border-white" />
            <span className="absolute -bottom-1 -left-1 h-10 w-10 rounded-bl-2xl border-b-[6px] border-l-[6px] border-white" />
            <span className="absolute -bottom-1 -right-1 h-10 w-10 rounded-br-2xl border-b-[6px] border-r-[6px] border-white" />
          </div>
        </div>
      </div>
      {/* Vive aqui y no en la pagina para que no quede colgado cuando la
          camara no arranca. */}
      {/* Afuera del video y no encima: con la letra grande taparía el cuadro. */}
      <p className="mt-3 text-center text-lg font-bold text-principal">{t('escaneo.cuadro')}</p>
      <p className="text-center text-base text-principal/70">{t('escaneo.apunta')}</p>
    </>
  )
}

