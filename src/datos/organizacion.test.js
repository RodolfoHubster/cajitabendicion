import { describe, expect, it } from 'vitest'
import { ORGANIZACION } from './organizacion'

// Parametros que agregan las apps al compartir un enlace: rastrean y a veces caducan.
const RASTREO = ['_r', '_t', 'stkn', 'igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'attribution_id']

const enlaces = [
  ...Object.entries(ORGANIZACION.redes).map(([nombre, href]) => [`redes.${nombre}`, href]),
  ...Object.entries(ORGANIZACION.apoyo).map(([nombre, href]) => [`apoyo.${nombre}`, href]),
]

describe('enlaces de la organizacion', () => {
  it.each(enlaces.filter(([, href]) => href))('%s es https y sin parametros de rastreo', (_, href) => {
    const url = new URL(href)
    expect(url.protocol).toBe('https:')
    for (const parametro of RASTREO) expect(url.searchParams.has(parametro)).toBe(false)
  })

  it('PayPal es el PayPal.me fijo de la iglesia, no una sesion con token que caduca', () => {
    const url = new URL(ORGANIZACION.apoyo.paypal)

    expect(url.hostname).toBe('www.paypal.me')
    expect(url.pathname).toBe('/IglesiaCDASD')
    expect(url.searchParams.has('token')).toBe(false)
  })

  it('las redes de la iglesia y de Cajita estan puestas', () => {
    for (const red of ['facebookDespensa', 'tiktokCajita', 'facebookIglesia', 'instagramIglesia', 'tiktokIglesia']) {
      expect(ORGANIZACION.redes[red]).toMatch(/^https:\/\//)
    }
  })
})
