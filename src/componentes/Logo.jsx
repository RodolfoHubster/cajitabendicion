import { useState } from 'react'
import { ORGANIZACION } from '../datos/organizacion'

/**
 * El techo naranja que comparten los dos logos, dibujado.
 * Es el respaldo si un archivo de logo no carga.
 */
export function TechoSvg({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 120 70"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 62 L60 12 L112 62"
        stroke="#F5A03C"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="10"
      />
      <path d="M28 43 V20" stroke="#F5A03C" strokeLinecap="round" strokeWidth="10" />
    </svg>
  )
}

/**
 * Imagen que, si el archivo no carga, muestra un respaldo en lugar del
 * icono de imagen rota.
 */
function ImagenConRespaldo({ alt, className, respaldo, src }) {
  const [fallo, setFallo] = useState(false)

  if (fallo) return respaldo

  return <img alt={alt} className={className} onError={() => setFallo(true)} src={src} />
}

/**
 * Logo de Iglesia Casa de Alabanza: el techo con el nombre en letras
 * blancas. SOLO sobre fondo azul; sobre blanco el nombre desaparece.
 *
 * Decorativo (alt vacio): siempre va junto al nombre escrito, y un lector
 * de pantalla lo leeria dos veces.
 */
export function LogoIglesia({ className = 'h-10 w-auto' }) {
  return (
    <ImagenConRespaldo
      alt=""
      className={className}
      respaldo={<TechoSvg className={className} />}
      src={ORGANIZACION.logos.iglesia}
    />
  )
}

/** Logo circular de Cajita de Bendicion, para la portada. */
export function LogoCompleto({ className = 'h-40 w-40' }) {
  return (
    <ImagenConRespaldo
      alt={`${ORGANIZACION.programa} · ${ORGANIZACION.lema} · ${ORGANIZACION.iglesia}`}
      className={`object-contain ${className}`}
      respaldo={
        <div className={`flex items-center justify-center ${className}`}>
          <TechoSvg className="w-3/5" />
        </div>
      }
      src={ORGANIZACION.logos.cajita}
    />
  )
}
