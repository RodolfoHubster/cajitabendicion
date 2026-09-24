/**
 * Las citas que se hicieron desde este telefono.
 *
 * El problema que resuelve: la persona hace su cita, cierra la pagina y
 * pierde la captura. Sin esto no tenia forma de volver a ver su codigo.
 * Ahora, al entrar de nuevo al sitio, lo primero que ve es su cita.
 *
 * Solo vive en este navegador (localStorage), nunca sale de el. Se guarda
 * lo minimo: el nombre va corto ("Maria P.") y lo de dias pasados se tira
 * solo. Cada cita tiene su "quitar de este telefono", por si quien la hizo
 * fue un familiar o un voluntario desde su propio celular.
 *
 * Si el navegador no deja guardar (ventana privada, datos bloqueados), todo
 * sigue funcionando: simplemente no hay lista.
 */

export const LLAVE_MIS_CITAS = 'cajita-mis-citas'
export const MAXIMO_MIS_CITAS = 8

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** "María de la Luz Pérez García" -> "María P.": se reconoce sin exponer. */
export function nombreCorto(nombre) {
  const palabras = String(nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ''
  if (palabras.length === 1) return palabras[0]

  //  El apellido es la ultima palabra que no es particula ("de", "la"...).
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y'])
  const apellido = [...palabras.slice(1)].reverse().find((p) => !PARTICULAS.has(p.toLowerCase()))
  const primero = palabras[0]

  //  Con nombres compuestos ("María José Pérez") el apellido es el que
  //  viene despues de los nombres; con la ultima palabra basta para
  //  reconocerse, y no importa si es el paterno o el materno.
  return apellido ? `${primero} ${apellido.charAt(0).toLocaleUpperCase('es')}.` : primero
}

function valida(cita) {
  return (
    cita &&
    typeof cita.token === 'string' &&
    cita.token.length > 0 &&
    FECHA.test(cita.fecha ?? '') &&
    typeof cita.hora === 'string'
  )
}

/** La lista guardada, ya limpia. Lo que no se entiende se ignora. */
export function leerMisCitas(almacen = globalThis.localStorage) {
  try {
    const crudo = almacen?.getItem(LLAVE_MIS_CITAS)
    if (!crudo) return []
    const lista = JSON.parse(crudo)
    return Array.isArray(lista) ? lista.filter(valida) : []
  } catch {
    return []
  }
}

function escribir(lista, almacen) {
  try {
    almacen?.setItem(LLAVE_MIS_CITAS, JSON.stringify(lista))
    return true
  } catch {
    return false
  }
}

const enOrden = (a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`)

/** Las de hoy en adelante, de la mas cercana a la mas lejana. */
export function citasProximas(lista, hoy) {
  return (lista ?? []).filter((cita) => valida(cita) && cita.fecha >= hoy).sort(enOrden)
}

/**
 * Guarda (o actualiza) una cita. De paso tira las de dias pasados y se
 * queda con las mas cercanas si hay demasiadas.
 */
export function guardarMiCita({ token, codigo, fecha, hora, nombre }, hoy, almacen = globalThis.localStorage) {
  const nueva = {
    token,
    codigo: codigo ?? '',
    fecha,
    hora: String(hora ?? '').slice(0, 5),
    nombre: nombreCorto(nombre),
  }
  if (!valida(nueva)) return false

  const otras = leerMisCitas(almacen).filter((cita) => cita.token !== token)
  const lista = citasProximas([...otras, nueva], hoy).slice(0, MAXIMO_MIS_CITAS)

  return escribir(lista, almacen)
}

export function quitarMiCita(token, almacen = globalThis.localStorage) {
  const lista = leerMisCitas(almacen)
  const sin = lista.filter((cita) => cita.token !== token)
  if (sin.length === lista.length) return false
  return escribir(sin, almacen)
}

/** Las guardadas para una fecha: para ofrecerlas cuando el registro dice "ya tienes". */
export function citasDelDiaGuardadas(fecha, almacen = globalThis.localStorage) {
  return leerMisCitas(almacen)
    .filter((cita) => cita.fecha === fecha)
    .sort(enOrden)
}
