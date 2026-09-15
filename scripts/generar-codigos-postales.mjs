// Genera la migracion con el catalogo de codigos postales de California
// (Estados Unidos) y Baja California (Mexico) a partir de GeoNames.
//
// Uso:
//   1. Descargar y descomprimir https://download.geonames.org/export/zip/US.zip
//      y https://download.geonames.org/export/zip/MX.zip
//   2. node scripts/generar-codigos-postales.mjs ruta/US.txt ruta/MX.txt \
//        supabase/migraciones/AAAA-MM-DD-codigos-postales-datos.sql
//   3. Pegar el archivo generado en el SQL Editor de Supabase.
//
// Datos: GeoNames (https://www.geonames.org/), licencia CC BY 4.0. Hay que
// dar credito a GeoNames donde se hable de estos datos.

import { readFileSync, writeFileSync } from 'node:fs'

const [archivoUS, archivoMX, salida] = process.argv.slice(2)

if (!archivoUS || !archivoMX || !salida) {
  console.error('Uso: node scripts/generar-codigos-postales.mjs US.txt MX.txt salida.sql')
  process.exit(1)
}

// Columnas de GeoNames (separadas por tabulador):
// 0 pais, 1 codigo, 2 lugar, 3 estado, 4 clave del estado, 5 municipio o condado,
// 6 clave, 7 ciudad (en Mexico), 8 clave, 9 latitud, 10 longitud, 11 precision
const leer = (archivo) =>
  readFileSync(archivo, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((linea) => linea.split('\t'))

const vacio = (texto) => (texto?.trim() ? texto.trim() : null)
const filas = new Map()
let descartadas = 0

function agregar(fila) {
  if (!/^\d{5}$/.test(fila[1]) || !fila[3] || !fila[5]) {
    descartadas += 1
    return
  }
  filas.set(fila.join('|'), fila)
}

// Estados Unidos: una fila por ZIP. "lugar" es la ciudad; no hay colonia.
for (const c of leer(archivoUS)) {
  if (c[4] !== 'CA') continue
  agregar(['US', c[1], null, vacio(c[2]), vacio(c[5]), vacio(c[3])])
}

// Mexico: una fila por colonia. Si no trae ciudad (zona rural), la del municipio.
for (const c of leer(archivoMX)) {
  if (c[3] !== 'Baja California') continue
  agregar(['MX', c[1], vacio(c[2]), vacio(c[7]) ?? vacio(c[5]), vacio(c[5]), vacio(c[3])])
}

const ordenadas = [...filas.values()].sort((a, b) =>
  `${a[0]}|${a[1]}|${a[2] ?? ''}`.localeCompare(`${b[0]}|${b[1]}|${b[2] ?? ''}`, 'es'),
)

const literal = (valor) => (valor === null ? 'null' : `'${valor.replace(/'/g, "''")}'`)
const cuenta = (pais) => ordenadas.filter((fila) => fila[0] === pais).length
const codigos = (pais) => new Set(ordenadas.filter((fila) => fila[0] === pais).map((fila) => fila[1])).size

const sql = [
  '-- ============================================================',
  '--  Cajita de Bendicion - Catalogo de codigos postales (datos)',
  '--',
  `--  California: ${cuenta('US')} codigos ZIP.`,
  `--  Baja California: ${cuenta('MX')} colonias en ${codigos('MX')} codigos postales.`,
  '--',
  '--  Fuente: GeoNames (https://www.geonames.org/), licencia CC BY 4.0.',
  '--  Generado con scripts/generar-codigos-postales.mjs.',
  '--',
  '--  Requiere 2026-09-15-domicilio-y-privacidad.sql. Se puede repetir:',
  '--  borra el catalogo y lo vuelve a cargar (no toca a ninguna persona).',
  '-- ============================================================',
  '',
  'begin;',
  '',
  'delete from codigos_postales;',
  '',
  'insert into codigos_postales (pais, codigo, colonia, ciudad, municipio, estado) values',
  ordenadas.map((fila) => `(${fila.map(literal).join(', ')})`).join(',\n') + ';',
  '',
  'commit;',
  '',
].join('\n')

writeFileSync(salida, sql)
console.log(
  `Listo: ${salida}\n  California: ${cuenta('US')} ZIP\n  Baja California: ${cuenta('MX')} colonias en ${codigos('MX')} codigos\n  Descartadas: ${descartadas}`,
)
