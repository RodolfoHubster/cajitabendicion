import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

//  Los cortes de pantalla de tailwind.config.js van en em (sm: '40em'...).
//  Con eso, Tailwind ignora sin error un min-[20rem]: o min-[420px]: (solo
//  avisa "mixed units" al compilar) y la pantalla se acomoda distinto de lo
//  pensado. Paso del 10 al 21 de noviembre de 2026 con 40 clases: se
//  escriben en em (min-[20em]:), que en un corte de pantalla mide lo mismo.
function archivosDeCodigo(dir, encontrados = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) archivosDeCodigo(ruta, encontrados)
    else if (/\.(jsx|js)$/.test(entrada.name) && !entrada.name.endsWith('.test.js')) encontrados.push(ruta)
  }
  return encontrados
}

describe('cortes de pantalla a la medida', () => {
  it('ningún min-[…] ni max-[…] en rem o px: van en em, como los de tailwind.config.js', () => {
    const malos = []
    for (const archivo of archivosDeCodigo('src')) {
      for (const encontrado of readFileSync(archivo, 'utf8').matchAll(/\b(?:min|max)-\[[\d.]+(?:rem|px)\]:/g)) {
        malos.push(`${encontrado[0]} (en ${relative('src', archivo).split(sep).join('/')})`)
      }
    }
    expect(malos).toEqual([])
  })
})
