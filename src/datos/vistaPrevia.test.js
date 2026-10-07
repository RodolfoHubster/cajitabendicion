import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

//  Lo que se ve al compartir el enlace en Facebook o WhatsApp: index.html le
//  dice a cada red que imagen, titulo y descripcion poner. La imagen sale de
//  scripts/vista-previa.ps1.
const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
const SITIO = 'https://citas.casadealabanzasd.com'

const etiqueta = (atributo, nombre) =>
  html.match(new RegExp(`<meta\\s+${atributo}="${nombre}"\\s+content="([^"]*)"`))?.[1] ?? null

/** Ancho y alto de un PNG, de su encabezado. */
function medidasPng(archivo) {
  const datos = readFileSync(archivo)
  return { ancho: datos.readUInt32BE(16), alto: datos.readUInt32BE(20), bytes: datos.length }
}

describe('la vista previa al compartir el enlace', () => {
  it('la imagen tiene dirección completa (Facebook no acepta una a medias) y existe', () => {
    const imagen = etiqueta('property', 'og:image')
    expect(imagen).toBe(`${SITIO}/vista-previa.png`)
    expect(etiqueta('name', 'twitter:image')).toBe(imagen)
    const { ancho, alto, bytes } = medidasPng(join(RAIZ, 'public/vista-previa.png'))
    expect({ ancho, alto }).toEqual({ ancho: 1200, alto: 630 })
    //  Facebook no la toma si pesa más de 8 MB; ligera carga rápido con datos.
    expect(bytes).toBeLessThan(1024 * 1024)
  })

  it('dice su tamaño, y lleva título, descripción y dirección', () => {
    expect(etiqueta('property', 'og:image:width')).toBe('1200')
    expect(etiqueta('property', 'og:image:height')).toBe('630')
    expect(etiqueta('property', 'og:image:alt')).toBeTruthy()
    expect(etiqueta('property', 'og:title')).toBeTruthy()
    expect(etiqueta('property', 'og:description')).toBeTruthy()
    expect(etiqueta('property', 'og:url')).toBe(`${SITIO}/`)
    expect(etiqueta('name', 'twitter:card')).toBe('summary_large_image')
  })
})
