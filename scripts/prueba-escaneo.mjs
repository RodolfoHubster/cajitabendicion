// Prueba obligatoria de concurrencia — registrar_entrega()
//
// Comprueba la segunda regla que exige CLAUDE.md: un QR es de un solo
// uso. Diez voluntarios escaneando el MISMO codigo en el mismo instante
// deben producir un unico VALIDO y nueve YA_USADO.
//
// Es la regla "1 QR = 1 caja". Si fallara, el total de escaneos dejaria
// de cuadrar con las cajas reportadas al banco de alimentos.
//
// Uso:
//   node --env-file=.env scripts/prueba-escaneo.mjs <token_qr>
//
// Requiere en .env, ademas de la URL y la anon key:
//   PRUEBA_EMAIL=...
//   PRUEBA_PASSWORD=...
// porque registrar_entrega() saca al voluntario de auth.uid() y ya no
// se puede llamar sin sesion iniciada.

import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.PRUEBA_EMAIL
const password = process.env.PRUEBA_PASSWORD
const token = process.argv[2]

const faltan = []
if (!url) faltan.push('VITE_SUPABASE_URL')
if (!key) faltan.push('VITE_SUPABASE_ANON_KEY')
if (!email) faltan.push('PRUEBA_EMAIL')
if (!password) faltan.push('PRUEBA_PASSWORD')

if (faltan.length > 0) {
  console.error(`Faltan variables en .env: ${faltan.join(', ')}`)
  process.exit(1)
}
if (!token) {
  console.error('Falta el token del QR.')
  console.error('Uso: node --env-file=.env scripts/prueba-escaneo.mjs <token_qr>')
  process.exit(1)
}

const LLAMADAS = 10
const supabase = createClient(url, key)

const { data: sesion, error: errorSesion } =
  await supabase.auth.signInWithPassword({ email, password })

if (errorSesion) {
  console.error(`No se pudo iniciar sesion: ${errorSesion.message}`)
  console.error('Revisa PRUEBA_EMAIL y PRUEBA_PASSWORD, y que el usuario')
  console.error('este confirmado (Auto Confirm User al crearlo).')
  process.exit(1)
}

console.log(`Voluntario: ${sesion.user.email}`)
console.log(`Token:      ${token.slice(0, 12)}...`)
console.log(`Esperado:   1 VALIDO y ${LLAMADAS - 1} YA_USADO\n`)
console.log('Escaneando el mismo codigo simultaneamente...\n')

const inicio = Date.now()
const resultados = await Promise.all(
  Array.from({ length: LLAMADAS }, () =>
    supabase.rpc('registrar_entrega', { p_token: token }).then(({ data, error }) => {
      if (error) return { estado: `ERROR: ${error.message}` }
      const fila = Array.isArray(data) ? data[0] : data
      return { estado: fila?.resultado ?? 'SIN_RESULTADO', fila }
    }),
  ),
)
const ms = Date.now() - inicio

const conteo = new Map()
for (const r of resultados) conteo.set(r.estado, (conteo.get(r.estado) ?? 0) + 1)

console.log(`Terminado en ${ms} ms\n`)
for (const [estado, veces] of [...conteo].sort()) {
  console.log(`  ${estado}: ${veces}`)
}

const validos = conteo.get('VALIDO') ?? 0
const yaUsados = conteo.get('YA_USADO') ?? 0
const inesperados = [...conteo.keys()].filter((k) => k !== 'VALIDO' && k !== 'YA_USADO')

const quien = resultados.find((r) => r.estado === 'VALIDO')?.fila
if (quien) {
  console.log(`\n  Entregada a: ${quien.nombre} (${quien.codigo_corto}), bloque ${quien.hora}`)
}

console.log()
if (validos === 1 && yaUsados === LLAMADAS - 1 && inesperados.length === 0) {
  console.log('PASA. Un solo VALIDO: el QR no se puede usar dos veces.')
  process.exit(0)
}

if (validos > 1) {
  console.log(`FALLA. ${validos} entregas con el mismo codigo.`)
  console.log('Se estarian repartiendo cajas de mas y el conteo no cuadraria.')
} else if (validos === 0) {
  console.log('FALLA. Ningun VALIDO.')
  if (conteo.has('OTRA_FECHA')) {
    console.log('Salio OTRA_FECHA: el bloque de la cita no es de hoy.')
  }
  if (conteo.has('NO_EXISTE')) {
    console.log('Salio NO_EXISTE: el token no corresponde a ninguna cita.')
  }
}
if (inesperados.length > 0) {
  console.log(`Resultados no esperados: ${inesperados.join(' | ')}`)
}
process.exit(1)
