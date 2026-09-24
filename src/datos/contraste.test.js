import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * ¿Se lee? Con números, no a ojo.
 *
 * WCAG pide 4.5 a 1 entre la letra y su fondo para texto normal, y 3 a 1
 * para texto grande o para iconos. Aquí se calcula con los colores de
 * verdad (src/index.css), en modo claro Y en modo oscuro, incluidas las
 * transparencias (text-principal/70 es el azul al 70% sobre el fondo).
 *
 * Mucha de la gente que usa esto es de la tercera edad: una letra gris
 * clarito que "se ve bonita" es una letra que no leen.
 */

const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

function variables(bloque) {
  const colores = {}
  for (const [, nombre, r, g, b] of bloque.matchAll(/--c-([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)/g)) {
    colores[nombre] = [Number(r), Number(g), Number(b)]
  }
  return colores
}

const claro = variables(CSS.slice(CSS.indexOf(':root {'), CSS.indexOf("[data-tema='oscuro']")))
const oscuro = { ...claro, ...variables(CSS.slice(CSS.indexOf("[data-tema='oscuro']"), CSS.indexOf('body {'))) }
const BLANCO = [255, 255, 255]

/** Luminancia relativa (WCAG 2.x). */
function luminancia([r, g, b]) {
  const canal = (c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** El color de la letra con transparencia, ya puesto encima del fondo. */
function mezclar(frente, fondo, alfa = 1) {
  return frente.map((c, i) => Math.round(c * alfa + fondo[i] * (1 - alfa)))
}

function contraste(frente, fondo, alfa = 1) {
  const a = luminancia(mezclar(frente, fondo, alfa))
  const b = luminancia(fondo)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

//  [qué es, letra, fondo, transparencia, mínimo]
const PAREJAS = (c) => [
  ['letra normal sobre tarjeta', c.principal, c.superficie, 1, 4.5],
  ['letra normal sobre la página', c.principal, c.fondo, 1, 4.5],
  ['letra secundaria (/70) sobre tarjeta', c.principal, c.superficie, 0.7, 4.5],
  ['letra secundaria (/70) sobre la página', c.principal, c.fondo, 0.7, 4.5],
  ['"quedan lugares" en verde sobre tarjeta', c['puede-pasar'], c.superficie, 1, 4.5],
  ['"lleno" en rojo sobre tarjeta', c['ya-recibio'], c.superficie, 1, 4.5],
  ['letra blanca sobre el azul de la marca', BLANCO, c.marca, 1, 4.5],
  ['letra blanca secundaria (/70) sobre la marca', BLANCO, c.marca, 0.7, 4.5],
  ['letra naranja sobre la marca ("Box of Blessings")', c.accion, c.marca, 1, 4.5],
  ['letra sobre el botón naranja', c['sobre-accion'], c.accion, 1, 4.5],
  ['letra blanca sobre el botón rojo', BLANCO, c.peligro, 1, 4.5],
]

describe.each([
  ['modo claro', claro],
  ['modo oscuro', oscuro],
])('%s', (_modo, colores) => {
  it.each(PAREJAS(colores))('%s', (_que, letra, fondo, alfa, minimo) => {
    expect(contraste(letra, fondo, alfa)).toBeGreaterThanOrEqual(minimo)
  })
})

//  El texto gris clarito (/40, /50, /60) no llega a 4.5 en modo claro.
//  Solo se permite en lo que está apagado a propósito (un horario lleno,
//  un botón deshabilitado), que WCAG no le exige.
describe('nadie escribe letra demasiado clara', () => {
  it('text-principal/40, /50 y /60 solo en cosas apagadas a propósito', () => {
    const raiz = fileURLToPath(new URL('../', import.meta.url))
    const recorrer = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? recorrer(join(dir, e.name)) : e.name.endsWith('.jsx') ? [join(dir, e.name)] : [],
      )

    const malos = []
    for (const ruta of recorrer(raiz)) {
      const lineas = readFileSync(ruta, 'utf8').split('\n')
      lineas.forEach((linea, i) => {
        if (!/\btext-principal\/(40|50|60)\b/.test(linea)) return
        //  Permitidos: placeholders, deshabilitados y lo lleno/apagado.
        if (/placeholder:text-principal|disabled:text-principal|lleno|apagad|cerrad/i.test(linea)) return
        malos.push(`${relative(raiz, ruta).split(sep).join('/')}:${i + 1}`)
      })
    }

    expect(malos).toEqual([])
  })
})
