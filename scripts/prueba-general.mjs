// Prueba general del escaneo, de principio a fin, contra la base de pruebas.
//
// Lo que pasa en la fila de verdad, con la cuenta de prueba (admin) y las
// personas de supabase/pruebas/datos-de-prueba.sql:
//
//   * un QR a pie escaneado en la fila de carros (y al reves): se manda a su
//     fila y el codigo NO se quema
//   * escanear y entregar; escanear otra vez: "ya recibio"
//   * deshacer una entrega: el codigo vuelve a servir y, a pie, la persona
//     regresa a la fila con su mismo turno
//   * "no se presento" y regresarlo a la fila
//   * 10 voluntarios escaneando el MISMO QR al mismo tiempo: una sola caja
//
// Deja entregas hechas: para empezar de cero, vuelve a correr
// datos-de-prueba.sql en la base de pruebas.
//
// Uso:
//   node scripts/prueba-general.mjs --pruebas

import { createClient } from '@supabase/supabase-js'
import { cargarEntorno } from './entorno.mjs'

const { url, key, email, password } = cargarEntorno({
  escribe: true,
  uso: 'node scripts/prueba-general.mjs <base>',
})

const supabase = createClient(url, key)
const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

let pasaron = 0
let fallaron = 0
function revisar(prueba, condicion, detalle = '') {
  if (condicion) pasaron += 1
  else fallaron += 1
  console.log(`  ${condicion ? 'ok' : 'FALLA'}  ${prueba}${condicion || !detalle ? '' : ` -> ${detalle}`}`)
}

async function rpc(funcion, parametros = {}) {
  const { data, error } = await supabase.rpc(funcion, parametros)
  if (error) throw new Error(`${funcion}: ${error.message}`)
  return data
}
const uno = (data) => (Array.isArray(data) ? data[0] : data) ?? null

const { error: errorSesion } = await supabase.auth.signInWithPassword({ email, password })
if (errorSesion) {
  console.error(`No se pudo iniciar sesion con la cuenta de prueba: ${errorSesion.message}`)
  process.exit(1)
}

try {
  //  Los QR de hoy: carro (CB-9001, 2:45 PM) y a pie (CB-9008 a CB-9011, 4:30 PM).
  const tokenDe = async (codigo, hora) => {
    try {
      return uno(await rpc('qr_de_cita', { p_codigo: codigo, p_fecha: hoy, p_hora: hora }))?.token ?? null
    } catch {
      return null
    }
  }
  const carro = await tokenDe('CB-9001', '14:45')
  const aPie = {}
  for (const codigo of ['CB-9008', 'CB-9009', 'CB-9010', 'CB-9011']) aPie[codigo] = await tokenDe(codigo, '16:30')

  if (!carro || Object.values(aPie).some((t) => !t)) {
    console.error('No estan las personas de prueba de hoy (CB-9001 y CB-9008 a CB-9011).')
    console.error('Corre supabase/pruebas/datos-de-prueba.sql en la base de pruebas y vuelve a intentar.')
    process.exit(1)
  }
  const estado = async (token) => uno(await rpc('consultar_cita', { p_token: token }))?.estado
  const entregar = async (token) => uno(await rpc('registrar_entrega', { p_token: token }))?.resultado

  //  Cada quien como nuevo: si una corrida anterior (o una prueba a mano) ya
  //  los entrego o los salto, se deshace. Asi la prueba se puede repetir.
  for (const [codigo, token] of [['CB-9001', carro], ...Object.entries(aPie)]) {
    if ((await estado(token)) === 'entregada') {
      await rpc('anular_entrega', { p_codigo: codigo, p_motivo: 'Prueba general: empezar de cero' })
    }
  }
  await rpc('elegir_fila', { p_fila: 'a_pie' })
  for (const token of Object.values(aPie)) {
    const turno = uno(await rpc('turno_de_cita', { p_token: token }))
    if (turno?.saltado) await rpc('saltar_turno', { p_turno: turno.turno, p_saltado: false })
  }

  console.log('\nLa fila equivocada')
  await rpc('elegir_fila', { p_fila: 'carro' })
  revisar('En carros, un QR a pie se manda a su fila', (await entregar(aPie['CB-9008'])) === 'OTRA_FILA')
  revisar('...y su codigo no se quema', (await estado(aPie['CB-9008'])) === 'reservada')
  await rpc('elegir_fila', { p_fila: 'a_pie' })
  revisar('A pie, un QR de carro se manda a su fila', (await entregar(carro)) === 'OTRA_FILA')
  revisar('...y su codigo no se quema', (await estado(carro)) === 'reservada')

  console.log('\nEntregar, "ya recibio" y deshacer (a pie)')
  revisar('Su fila, su QR: puede pasar', (await entregar(aPie['CB-9008'])) === 'VALIDO')
  revisar('El mismo QR otra vez: ya recibio', (await entregar(aPie['CB-9008'])) === 'YA_USADO')
  const turnoAntes = uno(await rpc('turno_de_cita', { p_token: aPie['CB-9008'] }))?.turno
  revisar('Deshacer la entrega', (await rpc('anular_entrega', { p_codigo: 'CB-9008', p_motivo: 'Prueba general' })) === 'ANULADA')
  const despues = uno(await rpc('turno_de_cita', { p_token: aPie['CB-9008'] }))
  revisar('Regresa a la fila con su mismo turno', despues?.estado === 'reservada' && despues?.turno === turnoAntes,
    JSON.stringify(despues))
  revisar('Su QR vuelve a servir', (await entregar(aPie['CB-9008'])) === 'VALIDO')

  console.log('\n"No se presento"')
  let fila = await rpc('fila_de_turnos', { p_fecha: null })
  const va = fila?.actual?.turno
  revisar('La voluntaria ve el turno que va', Number.isInteger(va), JSON.stringify(fila?.actual))
  await rpc('saltar_turno', { p_turno: va, p_saltado: true })
  fila = await rpc('fila_de_turnos', { p_fecha: null })
  revisar('La fila pasa al siguiente', fila?.actual?.turno !== va && fila?.saltados?.some((s) => s.turno === va),
    `va ${fila?.actual?.turno}`)
  await rpc('saltar_turno', { p_turno: va, p_saltado: false })
  fila = await rpc('fila_de_turnos', { p_fecha: null })
  revisar('Y se le puede regresar a la fila', fila?.actual?.turno === va, `va ${fila?.actual?.turno}`)

  console.log('\n10 voluntarios escanean el mismo QR al mismo tiempo')
  const resultados = await Promise.all(Array.from({ length: 10 }, () => entregar(aPie['CB-9010']).catch((e) => e.message)))
  const validos = resultados.filter((r) => r === 'VALIDO').length
  revisar('Una sola caja', validos === 1 && resultados.filter((r) => r === 'YA_USADO').length === 9,
    resultados.join(', '))

  console.log('\nDe regreso a carros')
  await rpc('elegir_fila', { p_fila: 'carro' })
  revisar('En carros, su QR: puede pasar', (await entregar(carro)) === 'VALIDO')
  revisar('Deshacer la entrega de carro', (await rpc('anular_entrega', { p_codigo: 'CB-9001', p_motivo: 'Prueba general' })) === 'ANULADA')
  revisar('Su QR vuelve a servir', (await estado(carro)) === 'reservada')
} catch (e) {
  fallaron += 1
  console.log(`  FALLA  ${e.message}`)
} finally {
  await supabase.auth.signOut()
}

console.log(`\n${pasaron} de ${pasaron + fallaron} pasaron.${fallaron ? ' Revisa las marcadas con FALLA.' : ' Todo bien.'}`)
process.exit(fallaron ? 1 : 0)
