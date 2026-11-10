import { supabase } from '../lib/supabase'
import { formatearHora } from './disponibilidad'
import { clasificarError } from './errores'

/**
 * La lista de quienes recibieron, para el pastor (9 de noviembre de 2026):
 * demostrarle al banco de alimentos y a quienes apoyan que la comida si se
 * entrega. Sale de Reportes en Excel, PDF o CSV, de las fechas escogidas.
 * Solo administradores (lista_de_personas, seccion 58 de la base).
 *
 * Dos versiones: la completa (uso interno: telefono, correo, domicilio) y
 * la de compartir, que ya sale de la base sin telefono, correo ni calle.
 * El aviso de privacidad promete no compartir los datos.
 *
 * Aqui va lo que no depende del formato: pedir los renglones, ordenarlos
 * por apellido, juntarlos por dia y escoger las columnas que traen algo.
 */

const CODIGOS = ['RANGO_INVALIDO', 'RANGO_MUY_LARGO', 'VERSION_INVALIDA', 'SIN_PERMISO', 'SIN_SESION']

export async function pedirLista({ desde, hasta, recibieron = true, noVinieron = false, aPie = false, version = 'completa' }) {
  const { data, error } = await supabase.rpc('lista_de_personas', {
    p_desde: desde,
    p_hasta: hasta,
    p_recibieron: Boolean(recibieron),
    p_no_vinieron: Boolean(noVinieron),
    p_a_pie: Boolean(aPie),
    p_version: version,
  })
  if (error) {
    const deNegocio = CODIGOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }
  return data ?? []
}

//  Todas las columnas posibles, en orden. `privada`: solo en la completa.
//  `siempre`: aunque venga vacia. `ancho`: en caracteres (Excel).
export const COLUMNAS = [
  { clave: 'numero', ancho: 5, siempre: true },
  { clave: 'apellidos', ancho: 22, siempre: true },
  { clave: 'nombres', ancho: 20, siempre: true },
  { clave: 'codigo', ancho: 11, siempre: true },
  { clave: 'telefono', ancho: 16, privada: true },
  { clave: 'correo', ancho: 28, privada: true },
  { clave: 'calle', ancho: 26, privada: true },
  { clave: 'numeroExterior', ancho: 9, privada: true },
  { clave: 'numeroInterior', ancho: 9, privada: true },
  { clave: 'colonia', ancho: 18, privada: true },
  { clave: 'direccion', ancho: 32, privada: true },
  { clave: 'ciudad', ancho: 16 },
  { clave: 'municipio', ancho: 16 },
  { clave: 'estado', ancho: 12 },
  { clave: 'codigoPostal', ancho: 10 },
  { clave: 'pais', ancho: 14 },
  { clave: 'horaCita', ancho: 11 },
  { clave: 'recibio', ancho: 11 },
  { clave: 'tipo', ancho: 22, siempre: true },
  { clave: 'fila', ancho: 13 },
  { clave: 'situacion', ancho: 12 },
]

const limpio = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim()
const anonima = (fila) => !limpio(fila.apellidos) && /^Turno \d+/.test(limpio(fila.nombre))

/** "15:05:30" -> 0.6288 (la fraccion del dia, como guarda Excel las horas). null si no hay. */
export function fraccionDelDia(hora) {
  const m = String(hora ?? '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0)) / 86400
}

/** "2026-11-09T15:05:12" (hora de San Diego, de la base) -> "3:05 PM". */
export function horaDe(marca) {
  return marca ? formatearHora(String(marca).slice(11, 16)) : ''
}

/** Un renglon de la base, ya con los textos que se ven. */
export function aRenglon(fila, t) {
  const sinApellido = !limpio(fila.apellidos) && !limpio(fila.nombres)
  const tipo =
    fila.fila === 'a_pie' && fila.turno && anonima(fila)
      ? t('listaPersonas.tipo.turno', { turno: fila.turno })
      : fila.tipo === 'acompanante'
        ? t('listaPersonas.tipo.acompanante', { codigo: fila.en_carro_de ?? '' })
        : t(`listaPersonas.tipo.${fila.tipo}`, { defaultValue: fila.tipo })
  return {
    fecha: fila.fecha,
    apellidos: limpio(fila.apellidos),
    nombres: sinApellido ? limpio(fila.nombre) : limpio(fila.nombres),
    codigo: limpio(fila.codigo_corto),
    telefono: limpio(fila.telefono),
    correo: limpio(fila.email),
    calle: limpio(fila.calle),
    numeroExterior: limpio(fila.numero_exterior),
    numeroInterior: limpio(fila.numero_interior),
    colonia: limpio(fila.colonia),
    direccion: limpio(fila.direccion),
    ciudad: limpio(fila.ciudad),
    municipio: limpio(fila.municipio),
    estado: limpio(fila.estado_domicilio),
    codigoPostal: limpio(fila.codigo_postal),
    pais: limpio(fila.pais),
    horaCita: fila.hora_cita ? formatearHora(String(fila.hora_cita).slice(0, 5)) : '',
    recibio: horaDe(fila.recibio_en),
    tipo,
    fila: t(`filas.nombre.${fila.fila}`, { defaultValue: fila.fila }),
    situacion: t(`listaPersonas.situacion.${fila.situacion}`, { defaultValue: fila.situacion }),
    //  Para ordenar y contar, y las horas como fraccion del dia (Excel las
    //  ordena bien asi: "10:00 AM" antes que "3:05 PM").
    _horaCita: fraccionDelDia(fila.hora_cita),
    _recibio: fraccionDelDia(fila.recibio_en ? String(fila.recibio_en).slice(11, 19) : null),
    _situacion: fila.situacion,
    _fila: fila.fila,
    _anonima: anonima(fila),
    _turno: fila.turno ?? 0,
  }
}

const comparar = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare

/**
 * El orden de cada dia: primero los que recibieron, luego los que no
 * vinieron; carro antes que a pie; por apellido y nombre de la A a la Z.
 * Los turnos a pie sin nombre van al final, por numero.
 */
export function ordenar(renglones) {
  const peso = (r) => (r._situacion === 'recibio' ? 0 : 1) * 4 + (r._fila === 'a_pie' ? 1 : 0) * 2 + (r._anonima ? 1 : 0)
  return [...renglones].sort(
    (a, b) =>
      peso(a) - peso(b) ||
      (a._anonima && b._anonima ? a._turno - b._turno : 0) ||
      comparar(a.apellidos || a.nombres, b.apellidos || b.nombres) ||
      comparar(a.nombres, b.nombres) ||
      comparar(a.codigo, b.codigo),
  )
}

/** Los renglones de la base, juntos por dia (en orden de fecha), ordenados y numerados. */
export function porDia(filas, t) {
  const dias = new Map()
  for (const fila of filas) {
    if (!dias.has(fila.fecha)) dias.set(fila.fecha, [])
    dias.get(fila.fecha).push(aRenglon(fila, t))
  }
  return [...dias.keys()].sort().map((fecha) => ({
    fecha,
    renglones: ordenar(dias.get(fecha)).map((r, i) => ({ ...r, numero: i + 1 })),
  }))
}

/**
 * Las columnas que van: las de siempre y las que traen algo en algun
 * renglon. En la version de compartir, nunca las privadas. "Fila" solo si
 * se pidio la fila a pie; "Situacion" solo si se pidieron los que no vinieron.
 */
export function columnasDe(dias, { version = 'completa', aPie = false, noVinieron = false } = {}) {
  const todos = dias.flatMap((d) => d.renglones)
  return COLUMNAS.filter((c) => {
    if (c.privada && version !== 'completa') return false
    if (c.clave === 'fila') return aPie
    if (c.clave === 'situacion') return noVinieron
    return c.siempre || todos.some((r) => r[c.clave])
  })
}

/** Cuantos por dia: recibieron en carro (con cita y con pase), a pie, y no vinieron. */
export function cuentas(dias) {
  return dias.map(({ fecha, renglones }) => {
    const recibieron = renglones.filter((r) => r._situacion === 'recibio')
    return {
      fecha,
      carro: recibieron.filter((r) => r._fila === 'carro').length,
      aPie: recibieron.filter((r) => r._fila === 'a_pie').length,
      recibieron: recibieron.length,
      noVinieron: renglones.filter((r) => r._situacion === 'no_vino').length,
    }
  })
}

/**
 * Donde viven quienes recibieron, por codigo postal y ciudad, con cuantos
 * por dia: lo que pregunta el banco de alimentos. Los que mas, primero.
 */
export function porLugar(dias, sinDato) {
  const lugares = new Map()
  for (const { fecha, renglones } of dias) {
    for (const r of renglones) {
      if (r._situacion !== 'recibio') continue
      const llave = `${r.codigoPostal}|${r.ciudad}`
      if (!lugares.has(llave)) lugares.set(llave, { codigoPostal: r.codigoPostal || sinDato, ciudad: r.ciudad || sinDato, dias: {}, total: 0 })
      const lugar = lugares.get(llave)
      lugar.dias[fecha] = (lugar.dias[fecha] ?? 0) + 1
      lugar.total++
    }
  }
  return [...lugares.values()].sort((a, b) => b.total - a.total || comparar(a.codigoPostal, b.codigoPostal))
}

/** cajita-lista-recibieron_2026-11-01_a_2026-11-30[_para-compartir].xlsx */
export function nombreArchivoLista(desde, hasta, version, extension) {
  return `cajita-lista-recibieron_${desde}_a_${hasta}${version === 'compartir' ? '_para-compartir' : ''}.${extension}`
}

/** "Lun 2 nov" (nombre de hoja de Excel: corto y sin / : ? * [ ]). */
export function nombreDeHoja(fecha, idioma) {
  const texto = new Intl.DateTimeFormat(idioma, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${fecha}T12:00:00Z`))
    .replace(/[.,]/g, '')
    .replace(/[\\/?*[\]:]/g, '-')
  return (texto.charAt(0).toUpperCase() + texto.slice(1)).slice(0, 31)
}

/** "Lunes, 2 de noviembre de 2026" (o en minuscula, para ir a media frase). */
export function fechaLarga(fecha, idioma, { mayuscula = true } = {}) {
  const texto = new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
  return mayuscula ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto
}
