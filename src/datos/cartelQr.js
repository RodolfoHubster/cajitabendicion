import { dibujarQRConSello } from './qrPase'

/**
 * Codigos QR para carteles: cualquier direccion, con el logo de Cajita de
 * Bendicion en medio (el mismo sello y la misma correccion alta del pase).
 * Sirve para imprimir el cartel de la fila con la pagina oficial.
 */

/**
 * Revisa lo que se escribio como direccion. Sin "https://" se le pone.
 * Devuelve { url } o { error: 'VACIA' | 'INVALIDA' }.
 */
export function normalizarUrl(texto) {
  const limpio = String(texto ?? '').trim()
  if (!limpio) return { error: 'VACIA' }

  const conProtocolo = /^[a-z][a-z0-9+.-]*:\/\//i.test(limpio) ? limpio : `https://${limpio}`

  let url
  try {
    url = new URL(conProtocolo)
  } catch {
    return { error: 'INVALIDA' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'INVALIDA' }
  //  Un nombre de pagina de verdad lleva punto (casadealabanzasd.com), salvo localhost.
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') return { error: 'INVALIDA' }
  if (/\s/.test(limpio)) return { error: 'INVALIDA' }

  return { url: url.href }
}

/** 'https://citas.casadealabanzasd.com/a-pie' -> 'citas.casadealabanzasd.com/a-pie', para leerla. */
export function urlParaMostrar(url) {
  return String(url ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
}

/** El nombre del archivo: 'cajita-qr-citas-casadealabanzasd-com-a-pie.png'. */
export function nombreArchivoQr(url) {
  const base = urlParaMostrar(url)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `cajita-qr-${base || 'codigo'}.png`
}

const AZUL = '#1B3A6B'
const NARANJA = '#F5A03C'
const TITULO = '"Roboto Slab Variable", Georgia, serif'
const TEXTO = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
const ANCHO = 1080
const ALTO = 1350

/** Escribe centrado; si no cabe, baja la letra. Si aun asi no cabe, parte en dos renglones. */
function escribir(ctx, texto, y, { tamano, peso = 700, familia = TEXTO, color = AZUL, maximo = 960 }) {
  let actual = tamano
  do {
    ctx.font = `${peso} ${actual}px ${familia}`
    if (ctx.measureText(texto).width <= maximo) break
    actual -= 2
  } while (actual > Math.round(tamano * 0.6))

  ctx.fillStyle = color
  if (ctx.measureText(texto).width <= maximo) {
    ctx.fillText(texto, ANCHO / 2, y)
    return y
  }

  const palabras = texto.split(' ')
  const mitad = Math.ceil(palabras.length / 2)
  ctx.fillText(palabras.slice(0, mitad).join(' '), ANCHO / 2, y)
  ctx.fillText(palabras.slice(mitad).join(' '), ANCHO / 2, y + actual * 1.15)
  return y + actual * 1.15
}

/**
 * El cartel (1080 x 1350, listo para imprimir o mandar): arriba el nombre del
 * programa, el mensaje si hay, el QR con el logo y abajo la direccion
 * escrita, por si alguien no puede escanear. Devuelve el PNG.
 */
export async function dibujarCartelQr({ url, mensaje = '', programa, iglesia, documento = globalThis.document }) {
  const qr = await dibujarQRConSello(url, { sello: 'logo', documento, ancho: 1024 })

  const lienzo = documento.createElement('canvas')
  lienzo.width = ANCHO
  lienzo.height = ALTO
  const ctx = lienzo.getContext('2d')

  try {
    await documento.fonts?.load?.(`700 64px ${TITULO}`)
  } catch {
    // Sin la letra tambien se dibuja.
  }

  const imagen = new Image()
  imagen.src = qr
  await imagen.decode()

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, ANCHO, ALTO)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = AZUL
  ctx.fillRect(0, 0, ANCHO, 190)
  ctx.fillStyle = NARANJA
  ctx.fillRect(0, 0, ANCHO, 14)
  escribir(ctx, programa, 110, { tamano: 72, familia: TITULO, color: '#FFFFFF' })
  escribir(ctx, iglesia, 160, { tamano: 34, peso: 500, color: NARANJA })

  const conMensaje = mensaje.trim() !== ''
  const finMensaje = conMensaje ? escribir(ctx, mensaje.trim(), 280, { tamano: 64, familia: TITULO }) : 190

  const lado = conMensaje ? 820 : 880
  const arriba = conMensaje ? Math.max(finMensaje + 40, 320) : 240
  ctx.drawImage(imagen, (ANCHO - lado) / 2, arriba, lado, lado)

  escribir(ctx, urlParaMostrar(url), arriba + lado + 70, { tamano: 40, peso: 600, color: '#4A5F85' })

  ctx.fillStyle = NARANJA
  ctx.fillRect(0, ALTO - 24, ANCHO, 24)

  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('SIN_IMAGEN'))), 'image/png')
  })
}

/** Copia la imagen al portapapeles. false si el navegador no deja. */
export async function copiarImagen(blob, navegador = globalThis.navigator) {
  try {
    if (!navegador?.clipboard?.write || typeof globalThis.ClipboardItem !== 'function') return false
    await navegador.clipboard.write([new globalThis.ClipboardItem({ [blob.type || 'image/png']: blob })])
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------
//  Los QR que se han creado
// ------------------------------------------------------------
//  Cada uno por su lado: crear otro no cambia los anteriores. Se guardan en
//  este navegador (solo la direccion y el texto; la imagen se vuelve a
//  dibujar), y se quitan cuando ya no hacen falta.

export const LLAVE_QRS = 'cajita-codigos-qr'
export const MAXIMO_QRS = 40

const valido = (qr) => Boolean(qr && typeof qr.id === 'string' && normalizarUrl(qr.url).url)

export function leerQrs(almacen = globalThis.localStorage) {
  try {
    const lista = JSON.parse(almacen?.getItem(LLAVE_QRS) || '[]')
    return Array.isArray(lista) ? lista.filter(valido) : []
  } catch {
    return []
  }
}

function escribirQrs(lista, almacen) {
  try {
    almacen?.setItem(LLAVE_QRS, JSON.stringify(lista))
  } catch {
    // Sin almacenamiento: la lista vale mientras la pagina este abierta.
  }
  return lista
}

/** Agrega uno nuevo al principio y devuelve la lista. */
export function agregarQr({ url, texto = '' }, almacen = globalThis.localStorage, ahora = new Date()) {
  const nuevo = {
    id: globalThis.crypto?.randomUUID?.() ?? `qr-${ahora.getTime()}-${Math.random().toString(36).slice(2)}`,
    url,
    texto: String(texto ?? '').trim(),
    creado: ahora.toISOString(),
  }
  return escribirQrs([nuevo, ...leerQrs(almacen)].slice(0, MAXIMO_QRS), almacen)
}

export function quitarQr(id, almacen = globalThis.localStorage) {
  return escribirQrs(
    leerQrs(almacen).filter((qr) => qr.id !== id),
    almacen,
  )
}
