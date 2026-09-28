import QRCode from 'qrcode'
import { ORGANIZACION } from './organizacion'

/**
 * Un codigo QR con un sello en el centro.
 *
 * El sello dice de un vistazo que clase de codigo trae la persona, antes de
 * escanear:
 *
 *   'logo'   el logo de Cajita: un pase permanente
 *   'carro'  un carrito azul: cita de la fila de carros
 *   'a_pie'  una persona caminando, en naranja: turno de la fila a pie
 *
 * Tapar el centro quita modulos, asi que estos codigos se generan con
 * correccion de errores ALTA (H, recupera hasta el 30%) en vez de la media.
 * De paso quedan mas aguantadores: pantallas rayadas y papeles doblados.
 */

//  Los cuadritos del QR: azul de siempre, o dorado oscuro en el VIP. El
//  dorado oscuro contrasta con el blanco igual que el azul (mas de 6 a 1):
//  un dorado claro se veria bonito, pero la camara no lo distingue del fondo.
export const AZUL_QR = '#1B3A6B'
export const ORO_QR = '#7A5C12'

// Del viewBox de TechoSvg: el respaldo si la imagen del logo no carga.
const TECHO = { ancho: 120, alto: 70 }

/**
 * Los iconos de las filas, los mismos de la pantalla (Font Awesome, CC BY
 * 4.0): se dibujan del trazo para no depender de cargar una imagen.
 */
export const ICONOS_FILA = {
  carro: {
    ancho: 640,
    alto: 512,
    color: '#1B3A6B',
    trazo:
      'M171.3 96L224 96l0 96-112.7 0 30.4-75.9C146.5 104 158.2 96 171.3 96zM272 192l0-96 81.2 0c9.7 0 18.9 4.4 25 12l67.2 84L272 192zm256.2 1L428.2 68c-18.2-22.8-45.8-36-75-36L171.3 32c-39.3 0-74.6 23.9-89.1 60.3L40.6 196.4C16.8 205.8 0 228.9 0 256L0 368c0 17.7 14.3 32 32 32l33.3 0c7.6 45.4 47.1 80 94.7 80s87.1-34.6 94.7-80l130.7 0c7.6 45.4 47.1 80 94.7 80s87.1-34.6 94.7-80l33.3 0c17.7 0 32-14.3 32-32l0-48c0-65.2-48.8-119-111.8-127zM434.7 368a48 48 0 1 1 90.5 32 48 48 0 1 1 -90.5-32zM160 336a48 48 0 1 1 0 96 48 48 0 1 1 0-96z',
  },
  //  El pase VIP (seccion 40): corona dorada. Pasa directo, sin fila.
  vip: {
    ancho: 576,
    alto: 512,
    color: '#B8860B',
    trazo:
      'M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z',
  },
  a_pie: {
    ancho: 320,
    alto: 512,
    color: '#F5A03C',
    trazo:
      'M160 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM126.5 199.3c-1 .4-1.9 .8-2.9 1.2l-8 3.5c-16.4 7.3-29 21.2-34.7 38.2l-2.6 7.8c-5.6 16.8-23.7 25.8-40.5 20.2s-25.8-23.7-20.2-40.5l2.6-7.8c11.4-34.1 36.6-61.9 69.4-76.5l8-3.5c20.8-9.2 43.3-14 66.1-14c44.6 0 84.8 26.8 101.9 67.9L281 232.7l21.4 10.7c15.8 7.9 22.2 27.1 14.3 42.9s-27.1 22.2-42.9 14.3L247 287.3c-10.3-5.2-18.4-13.8-22.8-24.5l-9.6-23-19.3 65.5 49.5 54c5.4 5.9 9.2 13 11.2 20.8l23 92.1c4.3 17.1-6.1 34.5-23.3 38.8s-34.5-6.1-38.8-23.3l-22-88.1-70.7-77.1c-14.8-16.1-20.3-38.6-14.7-59.7l16.9-63.5zM68.7 398l25-62.4c2.1 3 4.5 5.8 7 8.6l40.7 44.4-14.5 36.2c-2.4 6-6 11.5-10.6 16.1L54.6 502.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L68.7 398z',
  },
}

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
 * prueba (qrPase.test.js lo revisa con el centro lleno de ruido, que es lo
 * peor que un dibujo puede hacer).
 */
export function medidasDelSello(ancho) {
  const caja = Math.round(ancho * 0.32)

  return {
    caja,
    centro: Math.round(ancho / 2),
    radio: Math.round(caja / 2),
    // Un anillo blanco delgado separa el sello de los modulos oscuros.
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

/**
 * Donde va el icono de una fila dentro del sello: centrado y del 58% de la
 * caja por su lado mas largo, para que el anillo de color respire.
 */
export function lugarDelIcono(medidas, icono) {
  const lado = medidas.caja * 0.58
  const escala = lado / Math.max(icono.ancho, icono.alto)
  const ancho = icono.ancho * escala
  const alto = icono.alto * escala

  return { escala, x: medidas.centro - ancho / 2, y: medidas.centro - alto / 2, ancho, alto }
}

/** El icono de la fila, con un anillo de su color alrededor. */
function dibujarIconoFila(ctx, medidas, icono) {
  ctx.save()
  ctx.strokeStyle = icono.color
  ctx.lineWidth = Math.max(2, Math.round(medidas.caja * 0.05))
  ctx.beginPath()
  ctx.arc(medidas.centro, medidas.centro, medidas.radioLogo - ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()

  const lugar = lugarDelIcono(medidas, icono)
  ctx.translate(lugar.x, lugar.y)
  ctx.scale(lugar.escala, lugar.escala)
  ctx.fillStyle = icono.color
  ctx.fill(new Path2D(icono.trazo))
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

/** Dibuja el codigo con su sello ('logo', 'carro' o 'a_pie') y lo devuelve en PNG. */
export async function dibujarQRConSello(
  texto,
  { sello = 'logo', documento = globalThis.document, ancho = 512, oscuro = AZUL_QR } = {},
) {
  const lienzo = documento.createElement('canvas')

  await QRCode.toCanvas(lienzo, texto, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: ancho,
    color: { dark: oscuro, light: '#FFFFFF' },
  })

  const ctx = lienzo.getContext('2d')
  const medidas = medidasDelSello(ancho)

  //  El circulo blanco de atras: limpia los modulos y le da al sello un
  //  borde parejo, se dibuje lo que se dibuje encima.
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(medidas.centro, medidas.centro, medidas.radio, 0, Math.PI * 2)
  ctx.fill()

  const icono = ICONOS_FILA[sello]

  if (icono) {
    dibujarIconoFila(ctx, medidas, icono)
  } else {
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
  }

  return lienzo.toDataURL('image/png')
}

/** El codigo del pase permanente, con el logo de Cajita en el centro. */
export function dibujarQRPase(texto, { vip = false, ...opciones } = {}) {
  //  El VIP es dorado de punta a punta: los cuadritos y la corona.
  if (vip) return dibujarQRConSello(texto, { ...opciones, sello: 'vip', oscuro: ORO_QR })
  return dibujarQRConSello(texto, { ...opciones, sello: 'logo' })
}
