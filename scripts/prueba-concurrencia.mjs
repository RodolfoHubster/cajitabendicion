// Prueba obligatoria de concurrencia — reservar_cita()
//
// Comprueba lo que exige CLAUDE.md: un bloque con capacidad 2 y 50
// llamadas SIMULTANEAS deben producir exactamente 2 citas.
//
// Es la prueba que separa este sistema del Google Form. El formulario
// avisa que esta lleno pero deja pasar a todos; aqui el bloqueo de fila
// (select ... for update) serializa las reservas de verdad.
//
// Uso:  node --env-file=.env scripts/prueba-concurrencia.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.')
  console.error('Copia .env.example a .env y llena los valores, luego:')
  console.error('  node --env-file=.env scripts/prueba-concurrencia.mjs')
  process.exit(1)
}

const { bloque_id, personas } = JSON.parse(
  readFileSync(new URL('./datos-prueba.json', import.meta.url), 'utf8'),
)

const CAPACIDAD_ESPERADA = 2

const supabase = createClient(url, key)

console.log(`Bloque:   ${bloque_id}`)
console.log(`Personas: ${personas.length} (todas distintas)`)
console.log(`Esperado: exactamente ${CAPACIDAD_ESPERADA} citas\n`)
console.log('Disparando llamadas simultaneas...\n')

// Promise.all lanza las 50 peticiones sin esperar unas a otras: es lo
// mas parecido a que 50 personas piquen "reservar" en el mismo segundo.
const inicio = Date.now()
const resultados = await Promise.all(
  personas.map((persona_id) =>
    supabase
      .rpc('reservar_cita', { p_persona_id: persona_id, p_bloque_id: bloque_id })
      .then(({ error }) => (error ? { ok: false, msg: error.message } : { ok: true })),
  ),
)
const ms = Date.now() - inicio

const aceptadas = resultados.filter((r) => r.ok).length
const rechazos = new Map()
for (const r of resultados) {
  if (r.ok) continue
  const clave = /BLOQUE_LLENO/.test(r.msg) ? 'BLOQUE_LLENO' : r.msg
  rechazos.set(clave, (rechazos.get(clave) ?? 0) + 1)
}

console.log(`Terminado en ${ms} ms\n`)
console.log(`  Aceptadas: ${aceptadas}`)
for (const [motivo, veces] of rechazos) {
  console.log(`  Rechazadas (${motivo}): ${veces}`)
}

const inesperados = [...rechazos.keys()].filter((k) => k !== 'BLOQUE_LLENO')

console.log()
if (aceptadas === CAPACIDAD_ESPERADA && inesperados.length === 0) {
  console.log(`PASA. Exactamente ${CAPACIDAD_ESPERADA} citas, sin sobrecupo.`)
  process.exit(0)
}

if (aceptadas > CAPACIDAD_ESPERADA) {
  console.log(`FALLA. Entraron ${aceptadas} en un bloque de ${CAPACIDAD_ESPERADA}.`)
  console.log('Hay sobrecupo: es exactamente el bug del Google Form.')
} else if (aceptadas < CAPACIDAD_ESPERADA) {
  console.log(`FALLA. Solo entraron ${aceptadas} de ${CAPACIDAD_ESPERADA} lugares.`)
  console.log('Se estan rechazando reservas validas.')
}
if (inesperados.length > 0) {
  console.log(`Errores no esperados: ${inesperados.join(' | ')}`)
}
process.exit(1)
