// Prueba de concurrencia de la fila a pie: los turnos (seccion 38 del esquema)
//
// 50 personas sacan turno en el MISMO segundo en una fila a pie de 30
// lugares. Tienen que quedar exactamente 30, con los turnos 1 a 30: ni uno
// repetido, ni uno saltado. Las otras 20 reciben BLOQUE_LLENO ("ya no hay
// turnos").
//
// El turno lo pone un disparador al guardar la cita, y lo ordena el mismo
// candado de reservar_cita() sobre la fila del horario. Si alguien quitara
// ese candado, dos personas saldrian con el mismo turno o se pasaria del cupo.
//
// Se prueba a traves de registrar_desde_panel(), que llama a reservar_cita()
// por dentro. Hace falta una cuenta admin en PRUEBA_EMAIL y PRUEBA_PASSWORD.
// Cada llamada es una persona distinta, con su propio telefono: con el mismo
// telefono, la regla de "la misma persona el mismo dia" las haria esperar en
// fila y ya no serian simultaneas.
//
// La fila vacia de 30 lugares la deja supabase/pruebas/datos-de-prueba.sql.
// Si no se pasa su id, se busca sola (la primera fecha futura con una fila a
// pie de 30 lugares y sin nadie).
//
// Uso:
//   node scripts/prueba-turnos.mjs --pruebas [bloque_id]
//   node scripts/prueba-turnos.mjs --base-real [bloque_id]

import { createClient } from '@supabase/supabase-js'
import { cargarEntorno } from './entorno.mjs'

const { url, key, email, password, argumentos } = cargarEntorno({
  escribe: true,
  uso: 'node scripts/prueba-turnos.mjs <base> [bloque_id]',
})

const LLAMADAS = 50
const CUPO = 30

// 0 -> "A", 25 -> "Z", 26 -> "AA": apellidos distintos y sin numeros.
const letras = (n) => (n < 26 ? '' : letras(Math.floor(n / 26) - 1)) + String.fromCharCode(65 + (n % 26))

const supabase = createClient(url, key)

const { error: errorSesion } = await supabase.auth.signInWithPassword({ email, password })
if (errorSesion) {
  console.error(`No se pudo iniciar sesion con la cuenta de prueba: ${errorSesion.message}`)
  process.exit(1)
}

let bloque_id = argumentos[0]
if (!bloque_id) {
  const { data, error } = await supabase.rpc('listar_dias_entrega', { p_desde: null })
  if (error) {
    console.error(`No se pudo buscar la fila a pie: ${error.message}`)
    process.exit(1)
  }
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const libre = (data ?? []).find(
    (d) => d.fecha > hoy && d.a_pie_bloque_id && d.a_pie_capacidad === CUPO && d.a_pie_ocupados === 0 && !d.a_pie_cerrado,
  )
  if (!libre) {
    console.error(`No hay una fila a pie vacia de ${CUPO} lugares en una fecha futura.`)
    console.error('Corre supabase/pruebas/datos-de-prueba.sql en la base de pruebas y vuelve a intentar.')
    process.exit(1)
  }
  bloque_id = libre.a_pie_bloque_id
}

console.log(`Fila a pie: ${bloque_id}`)
console.log(`Llamadas:   ${LLAMADAS} (cada una con una persona y un telefono distintos)`)
console.log(`Esperado:   exactamente ${CUPO} turnos, del 1 al ${CUPO}\n`)
console.log('Disparando llamadas simultaneas...\n')

const inicio = Date.now()
const resultados = await Promise.all(
  Array.from({ length: LLAMADAS }, (_, i) =>
    supabase
      .rpc('registrar_desde_panel', {
        p_nombre: 'Prueba',
        p_apellidos: `Turnos ${letras(i)}`,
        p_telefono: `+1619555${String(2000 + i).padStart(4, '0')}`,
        p_bloque_id: bloque_id,
        p_pais: 'US',
        p_codigo_postal: '92105',
        p_calle: 'El Cajon Blvd',
        p_numero: '4250',
        p_acepto_privacidad: true,
      })
      .then(({ data, error }) => {
        if (error) return { ok: false, msg: error.message }
        const fila = Array.isArray(data) ? data[0] : data
        return { ok: true, token: fila?.token_qr }
      }),
  ),
)
const ms = Date.now() - inicio

//  El turno de cada quien, como lo ve su pagina.
const turnos = []
for (const r of resultados.filter((r) => r.ok)) {
  const { data } = await supabase.rpc('consultar_cita', { p_token: r.token })
  turnos.push((Array.isArray(data) ? data[0] : data)?.turno ?? null)
}

await supabase.auth.signOut()

const aceptadas = turnos.length
const rechazos = new Map()
for (const r of resultados) {
  if (r.ok) continue
  const clave = /BLOQUE_LLENO/.test(r.msg) ? 'BLOQUE_LLENO' : r.msg
  rechazos.set(clave, (rechazos.get(clave) ?? 0) + 1)
}

const ordenados = [...turnos].sort((a, b) => a - b)
const esperados = Array.from({ length: CUPO }, (_, i) => i + 1)
const repetidos = ordenados.filter((t, i) => i > 0 && t === ordenados[i - 1])
const faltan = esperados.filter((t) => !ordenados.includes(t))

console.log(`Terminado en ${ms} ms\n`)
console.log(`  Con turno: ${aceptadas}`)
for (const [motivo, veces] of rechazos) console.log(`  Rechazadas (${motivo}): ${veces}`)
console.log(`  Turnos:    ${ordenados.join(', ')}`)

const inesperados = [...rechazos.keys()].filter((k) => k !== 'BLOQUE_LLENO')

console.log()
if (aceptadas === CUPO && repetidos.length === 0 && faltan.length === 0 && inesperados.length === 0) {
  console.log(`PASA. Exactamente ${CUPO} turnos, del 1 al ${CUPO}, sin repetir ni saltar.`)
  process.exit(0)
}

if (aceptadas > CUPO) console.log(`FALLA. Entraron ${aceptadas} en una fila de ${CUPO}: se paso del cupo.`)
if (aceptadas < CUPO) console.log(`FALLA. Solo entraron ${aceptadas} de ${CUPO}: se rechazaron turnos validos.`)
if (repetidos.length) console.log(`FALLA. Turnos repetidos: ${[...new Set(repetidos)].join(', ')}`)
if (faltan.length && aceptadas === CUPO) console.log(`FALLA. Turnos que se saltaron: ${faltan.join(', ')}`)
if (inesperados.length) console.log(`Errores no esperados: ${inesperados.join(' | ')}`)
process.exit(1)
