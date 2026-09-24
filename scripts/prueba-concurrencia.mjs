// Prueba obligatoria de concurrencia — el corte de cupo de reservar_cita()
//
// Comprueba lo que exige CLAUDE.md: un bloque con capacidad 2 y 50
// llamadas SIMULTANEAS deben producir exactamente 2 citas.
//
// Es la prueba que separa este sistema del Google Form. El formulario
// avisa que esta lleno pero deja pasar a todos; aqui el bloqueo de fila
// (select ... for update) serializa las reservas de verdad.
//
// reservar_cita() ya no se puede llamar desde el navegador (seccion 21 del
// esquema): se prueba a traves de registrar_desde_panel(), que la llama por
// dentro. Hace falta una cuenta con rol admin en PRUEBA_EMAIL y
// PRUEBA_PASSWORD. Cada llamada crea una persona distinta; las que chocan
// con BLOQUE_LLENO se deshacen completas y no dejan personas sueltas.
//
// El bloque tiene que tener capacidad 2, estar vacio y ser de una fecha
// futura que no este cerrada. En la base de pruebas lo crea
// supabase/pruebas/datos-de-prueba.sql y lo muestra al final; si no se
// pasa, se usa el de scripts/datos-prueba.json.
//
// Uso:
//   node scripts/prueba-concurrencia.mjs --pruebas [bloque_id]
//   node scripts/prueba-concurrencia.mjs --base-real [bloque_id]

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { cargarEntorno } from './entorno.mjs'

const { url, key, email, password, argumentos } = cargarEntorno({
  escribe: true,
  uso: 'node scripts/prueba-concurrencia.mjs <base> [bloque_id]',
})

const bloque_id =
  argumentos[0] ?? JSON.parse(readFileSync(new URL('./datos-prueba.json', import.meta.url), 'utf8')).bloque_id

const LLAMADAS = 50
const CAPACIDAD_ESPERADA = 2

// 0 -> "A", 25 -> "Z", 26 -> "AA": apellidos distintos y sin numeros,
// porque la base rechaza nombres con digitos.
const letras = (n) => (n < 26 ? '' : letras(Math.floor(n / 26) - 1)) + String.fromCharCode(65 + (n % 26))

const supabase = createClient(url, key)

const { error: errorSesion } = await supabase.auth.signInWithPassword({ email, password })
if (errorSesion) {
  console.error(`No se pudo iniciar sesion con la cuenta de prueba: ${errorSesion.message}`)
  process.exit(1)
}

console.log(`Bloque:   ${bloque_id}`)
console.log(`Llamadas: ${LLAMADAS} (cada una con una persona distinta)`)
console.log(`Esperado: exactamente ${CAPACIDAD_ESPERADA} citas\n`)
console.log('Disparando llamadas simultaneas...\n')

// Promise.all lanza las peticiones sin esperar unas a otras: es lo mas
// parecido a que 50 personas piquen "reservar" en el mismo segundo.
const inicio = Date.now()
const resultados = await Promise.all(
  Array.from({ length: LLAMADAS }, (_, i) =>
    supabase
      .rpc('registrar_desde_panel', {
        p_nombre: 'Prueba',
        p_apellidos: `Concurrencia ${letras(i)}`,
        p_telefono: '+16195550100',
        p_bloque_id: bloque_id,
        p_pais: 'US',
        p_codigo_postal: '92105',
        p_calle: 'El Cajon Blvd',
        p_numero: '4250',
        p_acepto_privacidad: true,
      })
      .then(({ error }) => (error ? { ok: false, msg: error.message } : { ok: true })),
  ),
)
const ms = Date.now() - inicio

await supabase.auth.signOut()

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
