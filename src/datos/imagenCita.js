/**
 * La imagen de la cita para guardar en el celular.
 *
 * Un enlace <a download> no sirve en el iPhone: Safari no guarda la imagen en
 * Fotos (a lo mucho la abre o la manda a Archivos). Por eso se usa el menu de
 * compartir del telefono, que trae "Guardar imagen". Donde no existe (una
 * computadora, un navegador viejo) se descarga como archivo.
 *
 * La tarjeta lleva lo necesario para la fila aunque no haya internet: el QR,
 * la fecha y hora, el codigo CB y el nombre.
 */

/** "CB-1234" -> "cajita-cita-CB-1234.png". */
export function nombreArchivoCita(codigo) {
  const limpio = String(codigo ?? '').replace(/[^0-9A-Za-z-]/g, '')
  return `cajita-cita-${limpio || 'codigo'}.png`
}

function puedeCompartir(navegador, archivo) {
  try {
    return typeof navegador?.share === 'function' && Boolean(navegador.canShare?.({ files: [archivo] }))
  } catch {
    return false
  }
}

/**
 * Guarda la imagen. Devuelve:
 *   'compartida' -> se abrio el menu del telefono y la persona eligio algo
 *   'cancelada'  -> cerro el menu sin elegir
 *   'descargada' -> no hay menu de compartir: se bajo como archivo
 *
 * IMPORTANTE: llamarla directo desde el toque del boton, con la imagen ya
 * lista. Si antes se espera a dibujarla, Safari ya no abre el menu.
 */
export async function guardarImagen(
  blob,
  nombre,
  { navegador = globalThis.navigator, documento = globalThis.document, urls = globalThis.URL } = {},
) {
  const archivo = new File([blob], nombre, { type: blob.type || 'image/png' })

  if (puedeCompartir(navegador, archivo)) {
    try {
      // Solo el archivo: con titulo o texto, el iPhone guarda tambien una nota.
      await navegador.share({ files: [archivo] })
      return 'compartida'
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelada'
      // Otro error (permiso, tamano): se intenta descargar.
    }
  }

  const url = urls.createObjectURL(blob)
  const enlace = documento.createElement('a')
  enlace.href = url
  enlace.download = nombre
  documento.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => urls.revokeObjectURL(url), 1000)

  return 'descargada'
}

const AZUL = '#1B3A6B'
const NARANJA = '#F5A03C'
const VERDE = '#2E8B57'
const TITULO = '"Roboto Slab Variable", Georgia, serif'
const TEXTO = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

/** Escribe centrado; si no cabe en "maximo", baja el tamano de letra. */
function escribir(ctx, texto, y, { tamano, peso = 700, familia = TEXTO, color = AZUL, maximo = 640 }) {
  let actual = tamano
  do {
    ctx.font = `${peso} ${actual}px ${familia}`
    if (ctx.measureText(texto).width <= maximo) break
    actual -= 2
  } while (actual > 14)

  ctx.fillStyle = color
  ctx.fillText(texto, 360, y)
}

/**
 * Dibuja la tarjeta de la cita (720 x 1080) y la devuelve como PNG.
 * textos: { programa, iglesia, lista, fecha, hora, siNoSeLee, aNombreDe }.
 */
export async function dibujarTarjetaCita({ qr, codigo, nombre, textos, documento = globalThis.document }) {
  const lienzo = documento.createElement('canvas')
  lienzo.width = 720
  lienzo.height = 1080
  const ctx = lienzo.getContext('2d')

  // Que la letra de los titulos este cargada antes de dibujar; si no, usa Georgia.
  try {
    await documento.fonts?.load?.(`700 44px ${TITULO}`)
  } catch {
    // Sin la letra tambien se dibuja.
  }

  const imagen = new Image()
  imagen.src = qr
  await imagen.decode()

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, 720, 1080)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Encabezado azul con el nombre del programa.
  ctx.fillStyle = AZUL
  ctx.fillRect(0, 0, 720, 150)
  ctx.fillStyle = NARANJA
  ctx.fillRect(0, 0, 720, 10)
  escribir(ctx, textos.programa, 82, { tamano: 46, familia: TITULO, color: '#FFFFFF' })
  escribir(ctx, textos.iglesia, 124, { tamano: 26, peso: 500, color: NARANJA })

  escribir(ctx, textos.lista, 208, { tamano: 30, color: VERDE })
  escribir(ctx, textos.fecha, 262, { tamano: 40, familia: TITULO })
  escribir(ctx, textos.hora, 326, { tamano: 56, familia: TITULO })

  ctx.drawImage(imagen, 150, 350, 420, 420)

  escribir(ctx, textos.siNoSeLee, 822, { tamano: 26, peso: 500, color: '#4A5F85' })
  escribir(ctx, codigo, 900, { tamano: 72, familia: TITULO })
  escribir(ctx, `${textos.aNombreDe} ${nombre}`, 960, { tamano: 28, peso: 600 })

  ctx.fillStyle = NARANJA
  ctx.fillRect(0, 1060, 720, 20)

  return new Promise((resolver, rechazar) => {
    lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error('SIN_IMAGEN'))), 'image/png')
  })
}
