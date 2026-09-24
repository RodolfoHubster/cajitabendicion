import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

//  Mientras llegan los datos se ve la forma de lo que viene (Esqueleto.jsx),
//  no un "Cargando…" suelto que con mala señal parece trabado. Esta prueba
//  falla si alguien vuelve a poner uno.
const RAIZ = fileURLToPath(new URL('../', import.meta.url))

function archivosJsx(dir = RAIZ) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? archivosJsx(join(dir, e.name)) : e.name.endsWith('.jsx') ? [join(dir, e.name)] : [],
  )
}

describe('carga esqueleto', () => {
  it('ninguna pantalla enseña un "Cargando…" suelto en un párrafo', () => {
    const sueltos = archivosJsx()
      .filter((archivo) => /<p[^>]*>\s*\{t\('[\w.]*(cargando|verificando)[\w]*'\)\}\s*<\/p>/i.test(readFileSync(archivo, 'utf8')))
      .map((archivo) => relative(RAIZ, archivo).split(sep).join('/'))
    expect(sueltos).toEqual([])
  })

  it('nada se queda en blanco mientras carga (return null) para luego aparecer de golpe', () => {
    const enBlanco = archivosJsx()
      .filter((archivo) => /=== null\) return null/.test(readFileSync(archivo, 'utf8')))
      .map((archivo) => relative(RAIZ, archivo).split(sep).join('/'))
    expect(enBlanco).toEqual([])
  })

  it('la portada aparece junta, no bloque por bloque', () => {
    const inicio = readFileSync(join(RAIZ, 'paginas/publico/Inicio.jsx'), 'utf8')
    expect(inicio).not.toMatch(/animationDelay|animate-aparecer/)
  })

  it('antes de que llegue la app ya se ve la forma de la página (index.html)', () => {
    const html = readFileSync(join(RAIZ, '../index.html'), 'utf8')
    expect(html).toMatch(/<div id="root">\s*<div aria-busy="true"[^>]*class="pre-pagina"/)
    expect(html).toMatch(/prefers-reduced-motion: reduce\) \{ \.pre-pulso \{ animation: none/)
    expect(html).toMatch(/\[data-tema='oscuro'\] \.pre-pagina/)
  })

  it('los huesos salen del tema y se quedan quietos para quien pidió menos movimiento', () => {
    const texto = readFileSync(join(RAIZ, 'componentes/Esqueleto.jsx'), 'utf8')
    expect(texto).toMatch(/bg-principal\/10 motion-safe:animate-pulse/)
    expect(texto).not.toMatch(/(?<!motion-safe:)animate-pulse/)
  })

  it('el lector de pantalla oye "cargando": role="status" y aria-busy', () => {
    const texto = readFileSync(join(RAIZ, 'componentes/Esqueleto.jsx'), 'utf8')
    expect(texto).toMatch(/aria-busy="true"/)
    expect(texto).toMatch(/role="status"/)
    expect(texto).toMatch(/className="sr-only">\{texto\}/)
  })
})
