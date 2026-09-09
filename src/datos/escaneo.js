import jsQR from 'jsqr'

/**
 * Lee un codigo QR de los pixeles de una imagen.
 *
 * Recibe el ImageData de un lienzo, que es lo que devuelve tanto una
 * imagen fija como un cuadro de video de la camara. Devuelve el texto
 * del codigo, o null si en ese cuadro no se ve ninguno -- lo normal
 * mientras el voluntario esta apuntando.
 */
export function leerQR(imageData) {
  const resultado = jsQR(imageData.data, imageData.width, imageData.height)
  return resultado?.data ?? null
}

/** Atajo para leer un QR de una imagen ya cargada. */
export async function leerQRDeImagen(src) {
  const img = new Image()
  img.src = src
  await img.decode()

  const lienzo = document.createElement('canvas')
  lienzo.width = img.width
  lienzo.height = img.height

  const contexto = lienzo.getContext('2d')
  contexto.drawImage(img, 0, 0)

  return leerQR(contexto.getImageData(0, 0, lienzo.width, lienzo.height))
}
