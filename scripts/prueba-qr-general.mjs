// Prueba de concurrencia del QR general: el turno a pie sin datos (seccion 42)
//
// Lo que pasa a las 9 de la manana cuando abre la fila y todos escanean el
// QR de la entrada al mismo tiempo:
//
//   1. 50 telefonos distintos tocan "Sacar mi turno" en el MISMO segundo.
//      Cada uno tiene que recibir un turno distinto, seguidos, sin repetir
//      ni saltar ninguno.
//   2. UN telefono toca el boton 10 veces al mismo tiempo (mala senal, dedo
//      nervioso). Tiene que recibir UN solo turno: los demas toques le
//      devuelven el mismo.
//
// Se llama como el publico: sin sesion. Hace falta la fila a pie de HOY,
// abierta, con lugar para 51 turnos mas: la deja
// supabase/pruebas/datos-de-prueba.sql (60 lugares). Para repetir la prueba,
// vuelve a correr ese archivo.
//
// Uso:
//   node scripts/prueba-qr-general.mjs --pruebas
//   node scripts/prueba-qr-general.mjs --base-real   (no: llena la fila de hoy)

import { createClient } from '@supabase/supabase-js'
import { cargarEntorno } from './entorno.mjs'

const { url, key } = cargarEntorno({ escribe: true, uso: 'node scripts/prueba-qr-general.mjs <base>' })

const TELEFONOS = 50
const TOQUES = 10
const vuelta = Math.random().toString(36).slice(2, 8)
const supabase = createClient(url, key)

const sacar = (dispositivo) =>
  supabase
    .rpc('sacar_turno_a_pie', { p_dispositivo: dispositivo, p_cambiar_carro: false })
    .then(({ data, error }) => (error ? { error: error.message } : (Array.isArray(data) ? data[0] : data)))

console.log(`1. ${TELEFONOS} telefonos distintos, al mismo tiempo...`)
let inicio = Date.now()
const distintos = await Promise.all(Array.from({ length: TELEFONOS }, (_, i) => sacar(`prueba-qr-${vuelta}-${i}`)))
console.log(`   Terminado en ${Date.now() - inicio} ms`)

const errores = distintos.filter((r) => r?.error || !['NUEVO'].includes(r?.resultado))
const turnos = distintos.filter((r) => r?.resultado === 'NUEVO').map((r) => r.turno).sort((a, b) => a - b)
const repetidos = turnos.filter((t, i) => i > 0 && t === turnos[i - 1])
const seguidos = turnos.length > 0 && turnos.at(-1) - turnos[0] + 1 === turnos.length

console.log(`   Con turno: ${turnos.length} (del ${turnos[0]} al ${turnos.at(-1)})`)
if (errores.length) console.log(`   Sin turno: ${errores.length} -> ${[...new Set(errores.map((r) => r?.error ?? r?.resultado))].join(' | ')}`)

console.log(`\n2. Un telefono toca el boton ${TOQUES} veces al mismo tiempo...`)
inicio = Date.now()
const mismo = await Promise.all(Array.from({ length: TOQUES }, () => sacar(`prueba-qr-${vuelta}-nervioso`)))
console.log(`   Terminado en ${Date.now() - inicio} ms`)

const nuevos = mismo.filter((r) => r?.resultado === 'NUEVO')
const yaTenia = mismo.filter((r) => r?.resultado === 'YA_TENIA')
const tokens = new Set(mismo.map((r) => r?.token_qr).filter(Boolean))
console.log(`   NUEVO: ${nuevos.length} · YA_TENIA: ${yaTenia.length} · turnos distintos: ${tokens.size}`)

const pasaUno = turnos.length === TELEFONOS && repetidos.length === 0 && seguidos && errores.length === 0
const pasaDos = nuevos.length === 1 && yaTenia.length === TOQUES - 1 && tokens.size === 1

console.log()
console.log(pasaUno ? `PASA 1. ${TELEFONOS} turnos distintos y seguidos.` : `FALLA 1. Repetidos: ${repetidos.join(', ') || 'ninguno'} · seguidos: ${seguidos}`)
console.log(pasaDos ? 'PASA 2. Un solo turno para el telefono que toco 10 veces.' : 'FALLA 2. El mismo telefono recibio mas de un turno.')
if (errores.some((r) => /NO_HAY_FILA|AUN_NO_ABRE|BLOQUE_LLENO|CERRADA/.test(r?.error ?? r?.resultado ?? ''))) {
  console.log('\nLa fila a pie de hoy no esta lista o ya se lleno: vuelve a correr supabase/pruebas/datos-de-prueba.sql.')
}
process.exit(pasaUno && pasaDos ? 0 : 1)
