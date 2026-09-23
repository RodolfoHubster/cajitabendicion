import QRCode from 'qrcode'
import { ORGANIZACION } from './organizacion'

/**
 * El codigo del pase permanente, con el logo de Cajita en el centro.
 *
 * Es lo que lo distingue de un QR de cita a simple vista: el voluntario ve
 * el sello y sabe, antes de escanear, que esa persona trae pase.
 *
 * Tapar el centro quita modulos, asi que este codigo se genera con
 * correccion de errores ALTA (H, recupera hasta el 30%) en vez de la media
 * que usan las citas. De paso queda mas aguantador, que le hace falta: el
 * pase es un papel que la persona va a traer doblado durante meses.
 */

// Del viewBox de TechoSvg: el respaldo si la imagen del logo no carga.
const TECHO = { ancho: 120, alto: 70 }

/**
 * Cuanto ocupa el sello: el 32% del ancho.
 *
 * El tamano esta medido, no escogido a ojo. Con el codigo generado y vuelto
 * a leer con el mismo lector del escaner (jsQR), ensuciando la zona de
 * datos con manchas:
 *
 *   30% y 34% -> aguantan 12 manchas; se caen en 20
 *   38% y 42% -> se leen limpios, pero se caen con solo 6
 *
 * Asi que 38% es el precipicio. El 32% queda holgado dentro de lo que
 * aguanta, y ya se ve grande. Si alguien lo sube, que vuelva a correr esa
 * prueba: el logo es a color y estorba mas que un dibujo de linea, porque
 * el lector lo toma como modulos equivocados, que cuestan el doble que un
 * modulo simplemente tapado.
 */
export function medidasDelSello(ancho) {
  const caja = Math.round(ancho * 0.32)

  return {
    caja,
    centro: Math.round(ancho / 2),
    radio: Math.round(caja / 2),
    // Un anillo blanco delgado separa el logo de los modulos oscuros.
    radioLogo: Math.round((caja / 2) * 0.92),
  }
}

/** El techo naranja dibujado, para cuando la imagen no carga. */
function dibujarTecho(ctx, medidas) {
  const anchoTecho = Math.round(medidas.caja * 0.64)
  const altoTecho = Math.round((anchoTecho * TECHO.alto) / TECHO.ancho)
  const escala = anchoTecho / TECHO.ancho

  ctx.save()
  ctx.translate(medidas.centro - anchoTecho / 2, medidas.centro - altoTecho / 2)
  ctx.scale(escala, escala)

  ctx.strokeStyle = '#F5A03C'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(8, 62)
  ctx.lineTo(60, 12)
  ctx.lineTo(112, 62)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(28, 43)
  ctx.lineTo(28, 20)
  ctx.stroke()

  ctx.restore()
}

/** Carga el logo. Devuelve null si el archivo no esta o no carga. */
async function cargarLogo() {
  try {
    const imagen = new Image()
    imagen.src = ORGANIZACION.logos.cajita
    await imagen.decode()
    return imagen
  } catch {
    return null
  }
}

/** Dibuja el codigo con su sello y lo devuelve en PNG. */
export async function dibujarQRPase(
  texto,
  { documento = globalThis.document, ancho = 512 } = {},
) {
  const lienzo = documento.createElement('canvas')

  await QRCode.toCanvas(lienzo, texto, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: ancho,
    color: { dark: '#1B3A6B', light: '#FFFFFF' },
  })

  const ctx = lienzo.getContext('2d')
  const medidas = medidasDelSello(ancho)

  //  El circulo blanco de atras: limpia los modulos y le da al logo un
  //  borde parejo, se dibuje lo que se dibuje encima.
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(medidas.centro, medidas.centro, medidas.radio, 0, Math.PI * 2)
  ctx.fill()

  const logo = await cargarLogo()

  if (logo) {
    //  El logo es cuadrado con fondo blanco, asi que recortarlo en circulo
    //  solo se lleva esquinas blancas y se aprovecha todo el diametro.
    ctx.save()
    ctx.beginPath()
    ctx.arc(medidas.centro, medidas.centro, medidas.radioLogo, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(
      logo,
      medidas.centro - medidas.radioLogo,
      medidas.centro - medidas.radioLogo,
      medidas.radioLogo * 2,
      medidas.radioLogo * 2,
    )
    ctx.restore()
  } else {
    dibujarTecho(ctx, medidas)
  }

  return lienzo.toDataURL('image/png')
}
