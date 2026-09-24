import { describe, expect, it } from 'vitest'
import { SECCIONES, seccionActual, seccionesVisibles } from './menu'
import { CLAVES_PERMISOS } from '../datos/permisos'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vi from '../i18n/vi.json'

describe('quién ve qué en el menú', () => {
  it('el administrador ve todas las secciones', () => {
    expect(seccionesVisibles('admin', CLAVES_PERMISOS)).toHaveLength(SECCIONES.length)
  })

  it('un voluntario sin palomitas solo escanea, como antes', () => {
    expect(seccionesVisibles('voluntario', []).map((s) => s.clave)).toEqual(['escanear'])
  })

  it('con una palomita aparece su sección, y nada más', () => {
    expect(seccionesVisibles('voluntario', ['ver_reportes']).map((s) => s.clave)).toEqual(['reportes', 'escanear'])
  })

  //  La regla del pastor: aunque se prendan todas.
  it('ni con todas las palomitas, un voluntario ve equipo, horarios ni permisos', () => {
    const claves = seccionesVisibles('voluntario', CLAVES_PERMISOS).map((s) => s.clave)

    expect(claves).not.toContain('equipo')
    expect(claves).not.toContain('horarios')
    expect(claves).not.toContain('permisos')
  })

  it('quien no es del personal no ve nada', () => {
    expect(seccionesVisibles(null, CLAVES_PERMISOS)).toEqual([])
  })
})

describe('el nombre del botón del menú', () => {
  const todas = seccionesVisibles('admin', CLAVES_PERMISOS)

  it.each([
    ['/admin', 'citasHoy'],
    ['/admin/permisos', 'permisos'],
    ['/admin/equipo', 'equipo'],
    ['/escanear', 'escanear'],
  ])('en %s dice %s', (ruta, clave) => {
    expect(seccionActual(todas, ruta)?.clave).toBe(clave)
  })

  //  '/admin' es exacta: si no, se quedaria pegada en todas las pantallas
  //  del panel, porque todas empiezan con '/admin'.
  it('no se queda pegada en "Citas de hoy"', () => {
    expect(seccionActual(todas, '/admin/reportes')?.clave).toBe('reportes')
  })

  it('en una ruta que no está en el menú, no inventa una sección', () => {
    expect(seccionActual(todas, '/admin/citas-hoy')).toBeUndefined()
    expect(seccionActual(todas, '/')).toBeUndefined()
    expect(seccionActual(todas, null)).toBeUndefined()
  })

  it('solo ofrece secciones que el de enfrente puede ver', () => {
    const suyas = seccionesVisibles('voluntario', [])
    expect(seccionActual(suyas, '/admin/permisos')).toBeUndefined()
  })
})

describe('el menú y los textos', () => {
  it('cada sección tiene su nombre en los tres idiomas', () => {
    for (const { clave } of SECCIONES) {
      for (const [idioma, textos] of [
        ['es', es],
        ['en', en],
        ['vi', vi],
      ]) {
        expect(textos.nav[clave], `nav.${clave} (${idioma})`).toBeTruthy()
      }
    }

    // Lo que dice el botón cuando no se sabe en qué sección se está.
    expect(es.nav.menu && en.nav.menu && vi.nav.menu).toBeTruthy()
  })

  //  Una palomita inventada deja la sección invisible para siempre y sin
  //  decir por qué.
  it('las secciones usan palomitas que existen', () => {
    const usadas = SECCIONES.filter((s) => s.permiso).map((s) => s.permiso)

    expect(usadas.length).toBeGreaterThan(0)
    for (const clave of usadas) expect(CLAVES_PERMISOS).toContain(clave)
  })

  it('ninguna sección se queda sin candado', () => {
    for (const seccion of SECCIONES) {
      expect(Boolean(seccion.roles) || Boolean(seccion.permiso), seccion.a).toBe(true)
    }
  })
})
