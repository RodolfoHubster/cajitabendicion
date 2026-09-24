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
//   node scripts/prueba-escaneo.mjs --pruebas <token_qr>     en la base de pruebas
//   node scripts/prueba-escaneo.mjs --base-real <token_qr>   en la real, a proposito
//
//  OJO: ese QR queda marcado como ENTREGADO. En la base real, usa una cita
//  de prueba de hoy (nunca la de una persona de verdad) y al terminar, en
//  Citas de hoy, "Deshacer entrega" y luego "Cancelar".
//
// Necesita en el .env que toque la URL, la anon key, PRUEBA_EMAIL y
// PRUEBA_PASSWORD: registrar_entrega() saca al voluntario de auth.uid() y
// no se puede llamar sin sesion.

import { createClient } from '@supabase/supabase-js'
import { cargarEntorno } from './entorno.mjs'

const { url, key, email, password, argumentos, pruebas } = cargarEntorno({
  escribe: true,
  uso: 'node scripts/prueba-escaneo.mjs <base> <token_qr>',
})
const token = argumentos[0]

if (!token) {
  console.error('Falta el token del QR de una cita de HOY.')
  console.error('')
  if (pruebas) {
    console.error('En la base de pruebas: corre supabase/pruebas/datos-de-prueba.sql y copia un token de la tabla que muestra.')
  } else {
    console.error('Como sacarlo:')
    console.error('  1. En el panel, "Registrar persona": a nombre de "Prueba Escaneo", con un horario de hoy.')
    console.error('  2. Toca "Ver QR". En la direccion de esa pagina, lo que va despues de /confirmacion/ es el token.')
    console.error('')
    console.error('Ese QR queda ENTREGADO. Al terminar, en Citas de hoy: "Deshacer entrega" y luego "Cancelar".')
  }
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
