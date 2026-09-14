import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { leerQR } from '../datos/escaneo'

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
        if (vigente) setError(clasificar(e))
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

        const texto = leerQR(ctx.getImageData(0, 0, lienzo.width, lienzo.height))

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
  }, [activo, alLeer])

  if (error) {
    return (
      <div className="rounded-xl bg-ya-recibio/10 p-4">
        <p className="text-base text-ya-recibio">{t(`escaneo.camara.${error}`)}</p>
        <p className="mt-2 text-base text-principal/70">{t('escaneo.camara.usaManual')}</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-principal/5">
        <video
          className="aspect-square w-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        <canvas className="hidden" ref={lienzoRef} />
      </div>
      {/* Vive aqui y no en la pagina para que no quede colgado cuando la
          camara no arranca. */}
      <p className="mt-3 text-center text-base text-principal/70">{t('escaneo.apunta')}</p>
    </>
  )
}

function clasificar(error) {
  if (error.name === 'NotAllowedError') return 'SIN_PERMISO'
  if (error.name === 'NotFoundError') return 'SIN_CAMARA'
  // Los navegadores solo dan camara en HTTPS (localhost es la excepcion).
  if (error.name === 'NotSupportedError' || !window.isSecureContext) return 'SIN_HTTPS'
  return 'ERROR_CAMARA'
}
