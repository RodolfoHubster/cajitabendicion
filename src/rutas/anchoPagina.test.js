import { describe, expect, it } from 'vitest'
import { ANCHO_PANEL, ANCHO_PUBLICO, anchoPagina, esRutaPanel } from './anchoPagina'

describe('esRutaPanel', () => {
  it.each([
    ['/admin', true],
    ['/admin/', true],
    ['/admin/citas-hoy', true],
    ['/admin/equipo', true],
    ['/escanear', true],
    ['/escanear/', true],
    ['/admin/login', false],
    ['/admin/login/', false],
    ['/', false],
    ['/calendario', false],
    ['/horarios/2026-09-14', false],
    ['/registro', false],
    ['/confirmacion/abc123', false],
    // Que empiecen igual no las hace del panel.
    ['/administracion', false],
    ['/escaneo', false],
    ['', false],
    [undefined, false],
  ])('%j -> %s', (ruta, esperado) => {
    expect(esRutaPanel(ruta)).toBe(esperado)
  })
})

describe('anchoPagina', () => {
  it('el panel va ancho; lo publico y el login, angostos', () => {
    expect(anchoPagina('/admin')).toBe(ANCHO_PANEL)
    expect(anchoPagina('/escanear')).toBe(ANCHO_PANEL)
    expect(anchoPagina('/admin/login')).toBe(ANCHO_PUBLICO)
    expect(anchoPagina('/calendario')).toBe(ANCHO_PUBLICO)
  })

  it('son clases de Tailwind escritas completas', () => {
    expect(ANCHO_PANEL).toBe('max-w-7xl')
    expect(ANCHO_PUBLICO).toBe('max-w-3xl')
  })
})
