import { describe, expect, it, vi } from 'vitest'
import {
  MAXIMO_QRS,
  agregarQr,
  copiarImagen,
  leerQrs,
  nombreArchivoQr,
  normalizarUrl,
  quitarQr,
  urlParaMostrar,
} from './cartelQr'

function almacenDePrueba() {
  const datos = new Map()
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) }
}

describe('la dirección del QR', () => {
  it('sin "https://" se le pone', () => {
    expect(normalizarUrl('citas.casadealabanzasd.com/a-pie')).toEqual({
      url: 'https://citas.casadealabanzasd.com/a-pie',
    })
    expect(normalizarUrl('  https://casadealabanzasd.com  ')).toEqual({ url: 'https://casadealabanzasd.com/' })
    expect(normalizarUrl('http://localhost:5173/a-pie').url).toBe('http://localhost:5173/a-pie')
  })

  it('lo que no es una página no se convierte en QR', () => {
    expect(normalizarUrl('')).toEqual({ error: 'VACIA' })
    expect(normalizarUrl('   ')).toEqual({ error: 'VACIA' })
    expect(normalizarUrl('hola')).toEqual({ error: 'INVALIDA' })
    expect(normalizarUrl('casa de alabanza.com')).toEqual({ error: 'INVALIDA' })
    expect(normalizarUrl('javascript:alert(1)')).toEqual({ error: 'INVALIDA' })
    expect(normalizarUrl('ftp://archivos.com')).toEqual({ error: 'INVALIDA' })
  })

  it('se escribe corta debajo del QR', () => {
    expect(urlParaMostrar('https://citas.casadealabanzasd.com/')).toBe('citas.casadealabanzasd.com')
    expect(urlParaMostrar('https://citas.casadealabanzasd.com/a-pie')).toBe('citas.casadealabanzasd.com/a-pie')
  })

  it('el archivo se llama como la página', () => {
    expect(nombreArchivoQr('https://citas.casadealabanzasd.com/a-pie')).toBe(
      'cajita-qr-citas-casadealabanzasd-com-a-pie.png',
    )
    expect(nombreArchivoQr('')).toBe('cajita-qr-codigo.png')
  })
})

describe('copiar la imagen', () => {
  it('si el navegador no deja copiar imágenes, lo dice sin tronar', async () => {
    await expect(copiarImagen(new Blob(['x']), {})).resolves.toBe(false)
    const roto = { clipboard: { write: vi.fn().mockRejectedValue(new Error('no')) } }
    vi.stubGlobal('ClipboardItem', class {})
    await expect(copiarImagen(new Blob(['x']), roto)).resolves.toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('los QR creados', () => {
  it('cada uno queda aparte: crear otro no cambia los anteriores', () => {
    const almacen = almacenDePrueba()
    expect(leerQrs(almacen)).toEqual([])
    agregarQr({ url: 'https://casadealabanzasd.com/', texto: ' Visítanos ' }, almacen)
    const lista = agregarQr({ url: 'https://citas.casadealabanzasd.com/a-pie' }, almacen)
    expect(lista.map((qr) => qr.url)).toEqual(['https://citas.casadealabanzasd.com/a-pie', 'https://casadealabanzasd.com/'])
    expect(lista[1].texto).toBe('Visítanos')
    expect(leerQrs(almacen)).toEqual(lista)
  })

  it('se quita uno sin tocar los demás', () => {
    const almacen = almacenDePrueba()
    agregarQr({ url: 'https://uno.com' }, almacen)
    const [segundo] = agregarQr({ url: 'https://dos.com' }, almacen)
    expect(quitarQr(segundo.id, almacen).map((qr) => qr.url)).toEqual(['https://uno.com'])
  })

  it('se guardan hasta ${MAXIMO_QRS}', () => {
    const almacen = almacenDePrueba()
    for (let i = 0; i < MAXIMO_QRS + 5; i += 1) agregarQr({ url: `https://pagina${i}.com` }, almacen)
    expect(leerQrs(almacen)).toHaveLength(MAXIMO_QRS)
  })

  it('algo raro guardado, o un navegador que no deja guardar, no rompe nada', () => {
    const raro = almacenDePrueba()
    raro.setItem('cajita-codigos-qr', '{no es una lista')
    expect(leerQrs(raro)).toEqual([])
    const roto = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(leerQrs(roto)).toEqual([])
    expect(agregarQr({ url: 'https://uno.com' }, roto)).toHaveLength(1)
  })
})
