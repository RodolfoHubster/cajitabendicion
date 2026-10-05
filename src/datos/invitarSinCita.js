import { enlaceWhatsApp, fechaLarga } from './incidencias'

/**
 * Invitar por WhatsApp a sacar cita a quienes entraron sin cita un dia.
 *
 * Aprobado por el Pastor David el 4 de octubre de 2026. Se manda desde el
 * telefono de quien lo hace, UNO POR UNO: la pagina abre WhatsApp con el
 * numero y el mensaje ya escritos y la persona toca Enviar. Desde una pagina
 * no se puede mandar solo, y no se intenta: mandar en automatico desde un
 * numero personal va contra las reglas de WhatsApp y le bloquean el numero.
 * Lo que evita que lo tomen como spam es que lleve su nombre, diga de donde
 * viene, ofrezca dejar de recibirlos y lo mande una persona.
 *
 * Un mensaje por telefono: si una familia dio el mismo numero, le llega uno
 * con todos sus nombres.
 */

/** "María de la Luz Pérez" -> "María". */
export function primerNombre(nombre) {
  return String(nombre ?? '').trim().split(/\s+/)[0] ?? ''
}

/** El telefono en solo digitos: asi se reconoce aunque venga con espacios o guiones. */
export const claveTelefono = (telefono) => String(telefono ?? '').replace(/\D/g, '')
const digitosDe = claveTelefono

/** Con lada: 10 digitos o mas (+1 619..., +52 664...). */
export function telefonoValido(telefono) {
  return digitosDe(telefono).length >= 10
}

/**
 * A quienes se les manda. Fuera las anuladas (fueron un error) y las que no
 * tienen telefono; los repetidos se juntan en un solo mensaje.
 *
 * filas: [{ nombre, telefono, anulada, codigo }] de entradasSinCitaDelDia().
 */
export function prepararInvitaciones(filas) {
  const vigentes = (filas ?? []).filter((fila) => !fila.anulada)
  const porTelefono = new Map()
  let sinTelefono = 0

  for (const fila of vigentes) {
    if (!telefonoValido(fila.telefono)) {
      sinTelefono += 1
      continue
    }
    const clave = digitosDe(fila.telefono)
    const envio = porTelefono.get(clave) ?? { telefono: fila.telefono, clave, nombres: [], codigos: [] }
    const nombre = primerNombre(fila.nombre)
    if (nombre && !envio.nombres.includes(nombre)) envio.nombres.push(nombre)
    if (fila.codigo) envio.codigos.push(fila.codigo)
    porTelefono.set(clave, envio)
  }

  const envios = [...porTelefono.values()]
  const conTelefono = vigentes.length - sinTelefono
  return { envios, sinTelefono, repetidos: conTelefono - envios.length }
}

/** ['María', 'José', 'Ana'] -> 'María, José y Ana' (o 'and'). */
export function juntarNombres(nombres, conjuncion = 'y') {
  const lista = (nombres ?? []).filter(Boolean)
  if (lista.length <= 1) return lista[0] ?? ''
  return `${lista.slice(0, -1).join(', ')} ${conjuncion} ${lista.at(-1)}`
}

/**
 * El mensaje, en espanol y en ingles: no sabemos en que idioma lee cada
 * quien. Dice de donde viene, lleva el enlace para sacar cita y como dejar
 * de recibirlos.
 */
export function textoInvitacion({ nombres, fecha, enlace }) {
  const es = juntarNombres(nombres, 'y')
  const en = juntarNombres(nombres, 'and')
  const saludoEs = es ? `Hola ${es}` : 'Hola'
  const saludoEn = en ? `Hi ${en}` : 'Hi'

  return [
    `${saludoEs}, te saluda Cajita de Bendición, de la Iglesia Casa de Alabanza. Gracias por venir el ${fechaLarga(fecha)}. Para la próxima entrega puedes sacar tu cita aquí, es gratis:`,
    enlace,
    'Cada persona de 18 años o más necesita su propia cita. Si ya no quieres recibir estos mensajes, contéstanos "NO".',
    '',
    `${saludoEn}, this is Cajita de Bendición from Iglesia Casa de Alabanza. Thank you for coming on ${fechaLarga(fecha, 'en')}. For the next distribution you can book your appointment here, it's free:`,
    enlace,
    'Each person 18 or older needs their own appointment. If you no longer want these messages, reply "NO".',
  ].join('\n')
}

/**
 * Una sola persona (un renglon de la tabla, o el comprobante recien dado):
 * el mismo envio que en la fila, con su nombre. null si no hay telefono.
 */
export function envioDe({ nombre, telefono }) {
  if (!telefonoValido(telefono)) return null
  return { telefono, clave: claveTelefono(telefono), nombres: [primerNombre(nombre)].filter(Boolean), codigos: [] }
}

/** El enlace de WhatsApp de un envio. */
export function enlaceInvitacion(envio, fecha, sitio) {
  return enlaceWhatsApp(envio.telefono, textoInvitacion({ nombres: envio.nombres, fecha, enlace: `${sitio}/` }))
}

// ------------------------------------------------------------
//  A quienes ya se les mando (en este telefono)
// ------------------------------------------------------------
//  Para pausar y seguir despues. Vive en el telefono de quien manda: es una
//  sola persona la que lo hace. Se guardan los numeros, no los nombres.

export const LLAVE_INVITADAS = 'cajita-invitadas-sin-cita'

function leerTodo(almacen) {
  try {
    const todo = JSON.parse(almacen?.getItem(LLAVE_INVITADAS) ?? '{}')
    return todo && typeof todo === 'object' && !Array.isArray(todo) ? todo : {}
  } catch {
    return {}
  }
}

/** Los telefonos (solo digitos) a los que ya se les mando por ese dia. */
export function leerInvitadas(fecha, almacen = globalThis.localStorage) {
  const lista = leerTodo(almacen)[fecha]
  return new Set(Array.isArray(lista) ? lista : [])
}

/** Marca (o desmarca) un envio. Se queda solo con los ultimos 10 dias. */
export function marcarInvitada(fecha, clave, enviada = true, almacen = globalThis.localStorage) {
  const todo = leerTodo(almacen)
  const actuales = new Set(Array.isArray(todo[fecha]) ? todo[fecha] : [])
  if (enviada) actuales.add(clave)
  else actuales.delete(clave)
  todo[fecha] = [...actuales]

  const recientes = Object.keys(todo).sort().slice(-10)
  const limpio = Object.fromEntries(recientes.map((dia) => [dia, todo[dia]]))
  try {
    almacen?.setItem(LLAVE_INVITADAS, JSON.stringify(limpio))
  } catch {
    //  Sin almacen se sigue pudiendo mandar; solo no se recuerda al recargar.
  }
  return new Set(limpio[fecha] ?? [])
}

/** El siguiente que falta, sin contar los que se saltaron. */
export function siguienteEnvio(envios, invitadas, saltadas = new Set()) {
  return (envios ?? []).find((envio) => !invitadas.has(envio.clave) && !saltadas.has(envio.clave)) ?? null
}
