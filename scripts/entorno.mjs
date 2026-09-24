// A que base se conectan los scripts de prueba, y el candado para no
// escribir en la base REAL por accidente.
//
//   node scripts/prueba-escaneo.mjs --pruebas <token>     base de pruebas (.env.pruebas)
//   node scripts/prueba-escaneo.mjs --base-real <token>   base real (.env), a proposito
//
// Sin ninguna de las dos, un script que ESCRIBE se niega a correr: las
// pruebas de concurrencia crean personas y marcan entregas, y en la base
// real eso cuenta en los reportes al banco de alimentos.

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = new URL('../', import.meta.url)
const ruta = (nombre) => fileURLToPath(new URL(nombre, RAIZ))

/** Lee un .env como objeto, sin meterlo al ambiente. */
export function leerArchivoEnv(archivo) {
  try {
    return Object.fromEntries(
      readFileSync(archivo, 'utf8')
        .split(/\r?\n/)
        .filter((linea) => linea.includes('=') && !linea.trim().startsWith('#'))
        .map((linea) => {
          const i = linea.indexOf('=')
          return [linea.slice(0, i).trim(), linea.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
        }),
    )
  } catch {
    return {}
  }
}

/**
 * Carga el .env que toca y devuelve las variables y los argumentos que no
 * son banderas (por ejemplo, el token). Si algo no cuadra, explica y sale.
 */
export function cargarEntorno({ escribe = true, uso = '' } = {}) {
  const argumentos = process.argv.slice(2)
  const pruebas = argumentos.includes('--pruebas')
  const real = argumentos.includes('--base-real')
  const resto = argumentos.filter((a) => a !== '--pruebas' && a !== '--base-real')

  if (pruebas && real) {
    console.error('Escoge una: --pruebas o --base-real, no las dos.')
    process.exit(1)
  }

  if (escribe && !pruebas && !real) {
    console.error('Esta prueba ESCRIBE en la base: crea personas o marca entregas.')
    console.error('')
    console.error('  En la base de pruebas (lo normal):   ' + uso.replace('<base>', '--pruebas'))
    console.error('  En la base real, sabiendo que cuenta: ' + uso.replace('<base>', '--base-real'))
    console.error('')
    console.error('Como armar la base de pruebas: docs/base-de-pruebas.md')
    process.exit(1)
  }

  const archivo = pruebas ? '.env.pruebas' : '.env'
  if (!existsSync(ruta(archivo))) {
    console.error(`No existe ${archivo}.`)
    if (pruebas) console.error('Copia .env.pruebas.example a .env.pruebas y llena los datos de tu proyecto de pruebas.')
    process.exit(1)
  }

  const valores = leerArchivoEnv(ruta(archivo))

  //  Con --pruebas, la URL no puede ser la misma que la de la base real.
  if (pruebas && existsSync(ruta('.env'))) {
    const urlReal = leerArchivoEnv(ruta('.env')).VITE_SUPABASE_URL
    if (urlReal && urlReal === valores.VITE_SUPABASE_URL) {
      console.error('.env.pruebas apunta a la MISMA base que .env (la real). No se corrio nada.')
      process.exit(1)
    }
  }

  const variables = {
    url: valores.VITE_SUPABASE_URL,
    key: valores.VITE_SUPABASE_ANON_KEY,
    email: valores.PRUEBA_EMAIL,
    password: valores.PRUEBA_PASSWORD,
  }

  const faltan = Object.entries({
    VITE_SUPABASE_URL: variables.url,
    VITE_SUPABASE_ANON_KEY: variables.key,
    PRUEBA_EMAIL: variables.email,
    PRUEBA_PASSWORD: variables.password,
  })
    .filter(([, valor]) => !valor)
    .map(([nombre]) => nombre)

  if (faltan.length > 0) {
    console.error(`Faltan en ${archivo}: ${faltan.join(', ')}`)
    process.exit(1)
  }

  console.log(pruebas ? 'Base: PRUEBAS (.env.pruebas)' : 'Base: REAL (.env), a proposito')
  return { ...variables, argumentos: resto, pruebas }
}

/**
 * Lo que tiene de malo abrir la app con `npm run dev:pruebas`, o null si
 * todo cuadra. Vite, si no encuentra .env.pruebas, se regresa callado a
 * .env: la base REAL, sin franja amarilla. Aqui se atrapa eso.
 *
 * @param {object} p
 * @param {boolean} p.existeArchivo  si existe .env.pruebas
 * @param {object}  p.final          las variables que Vite le va a dar a la app
 * @param {object}  p.real           las de .env (la base real)
 */
export function problemaConLaBaseDePruebas({ existeArchivo, final, real }) {
  if (!existeArchivo) {
    return 'No existe .env.pruebas. Sin él, Vite usaría .env: la base REAL.\n' +
      'Copia .env.pruebas.example a .env.pruebas y llénalo con el proyecto de PRUEBAS.'
  }
  if (!final.VITE_SUPABASE_URL || !final.VITE_SUPABASE_ANON_KEY) {
    return '.env.pruebas no tiene VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.\n' +
      'Van los del proyecto de PRUEBAS (Supabase > Project Settings > API).'
  }
  const normalizar = (url) => String(url ?? '').trim().replace(/\/+$/, '').toLowerCase()
  if (real.VITE_SUPABASE_URL && normalizar(final.VITE_SUPABASE_URL) === normalizar(real.VITE_SUPABASE_URL)) {
    return '.env.pruebas apunta a la MISMA base que .env: la real.\n' +
      'Pon la URL y la anon key del proyecto de PRUEBAS.'
  }
  if (final.VITE_ENTORNO !== 'pruebas') {
    return 'Falta VITE_ENTORNO=pruebas en .env.pruebas. Sin eso no sale la franja amarilla\n' +
      'y no hay forma de distinguir a simple vista en qué base estás.'
  }
  return null
}
