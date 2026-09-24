import { sumarDias } from './disponibilidad'
import { clasificarError } from './errores'
import { conFila, filaParaConsulta } from './filas'
import { supabase } from '../lib/supabase'

/**
 * Reportes por rango de fechas: un renglon por dia con entrega, con las
 * cajas entregadas. Solo admin; la base lo revisa.
 */

// Errores de negocio que la base lanza como texto.
export const CODIGOS = ['RANGO_INVALIDO', 'RANGO_MUY_LARGO', 'FILA_INVALIDA']

/** Mas de un año por consulta no se pide (la base tampoco lo deja). */
export const MAXIMO_DIAS = 366

export const PERIODOS = ['esteMes', 'mesPasado', 'ultimos30', 'esteAnio']

/** Columnas del reporte en el orden del CSV. */
export const COLUMNAS = [
  'fecha',
  'capacidad',
  'con_cita',
  'recibieron',
  'no_asistieron',
  'pendientes',
  'canceladas',
  'con_excepcion',
  'sin_cita',
  'cajas',
  'intentos_repetidos',
]

const NUMERICAS = COLUMNAS.filter((columna) => columna !== 'fecha')
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const dos = (n) => String(n).padStart(2, '0')

/** Dias de "desde" a "hasta" ('AAAA-MM-DD'), sin que estorbe el cambio de horario. */
export function diasEntre(desde, hasta) {
  const utc = (fecha) => {
    const [anio, mes, dia] = fecha.split('-').map(Number)
    return Date.UTC(anio, mes - 1, dia)
  }

  return Math.round((utc(hasta) - utc(desde)) / 86400000)
}

/** null si el rango sirve; si no, el codigo del error. */
export function validarRango(desde, hasta) {
  if (!FECHA.test(desde ?? '') || !FECHA.test(hasta ?? '')) return 'RANGO_INVALIDO'

  const dias = diasEntre(desde, hasta)
  if (Number.isNaN(dias) || dias < 0) return 'RANGO_INVALIDO'
  if (dias > MAXIMO_DIAS) return 'RANGO_MUY_LARGO'

  return null
}

/** Ultimo dia de un mes (1 a 12). */
const ultimoDia = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

/**
 * Las fechas de un periodo rapido, a partir de hoy en San Diego. Los meses y
 * el año van completos (incluyen lo que viene); "ultimos30" termina hoy.
 */
export function rangoDePeriodo(periodo, hoy) {
  const [anio, mes] = hoy.split('-').map(Number)

  if (periodo === 'mesPasado') {
    const anioPasado = mes === 1 ? anio - 1 : anio
    const mesPasado = mes === 1 ? 12 : mes - 1
    return {
      desde: `${anioPasado}-${dos(mesPasado)}-01`,
      hasta: `${anioPasado}-${dos(mesPasado)}-${dos(ultimoDia(anioPasado, mesPasado))}`,
    }
  }

  if (periodo === 'ultimos30') return { desde: sumarDias(hoy, -29), hasta: hoy }
  if (periodo === 'esteAnio') return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` }

  return { desde: `${anio}-${dos(mes)}-01`, hasta: `${anio}-${dos(mes)}-${dos(ultimoDia(anio, mes))}` }
}

/** Que periodo rapido corresponde a esas fechas, para marcar su boton; null si ninguno. */
export function periodoActivo(desde, hasta, hoy) {
  return (
    PERIODOS.find((periodo) => {
      const rango = rangoDePeriodo(periodo, hoy)
      return rango.desde === desde && rango.hasta === hasta
    }) ?? null
  )
}

/** Las cuentas por dia, de una fila o juntas (la suma de las dos). */
export async function reportePorDias(desde, hasta, vistaFila = 'juntas') {
  const { data, error } = await supabase.rpc('reporte_por_dias', conFila({ p_desde: desde, p_hasta: hasta }, vistaFila))

  if (error) {
    const deNegocio = CODIGOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data ?? []
}

/** La suma de cada columna, y cuantos dias con entrega hubo. */
export function totalesReporte(filas) {
  const totales = Object.fromEntries(NUMERICAS.map((columna) => [columna, 0]))

  for (const fila of filas ?? []) {
    for (const columna of NUMERICAS) totales[columna] += Number(fila[columna]) || 0
  }

  return { ...totales, dias: (filas ?? []).length }
}

/** 9 de 10 -> 90. Sin total no hay porcentaje: null. */
export function porcentaje(parte, total) {
  return total > 0 ? Math.round((parte * 100) / total) : null
}

const celda = (valor) => {
  const texto = String(valor ?? '')
  return /[",;\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/**
 * CSV con encabezados: columnas = [{ clave, titulo }]. Renglones con \r\n,
 * como los espera Excel.
 */
export function aCsv(filas, columnas) {
  const renglones = [
    columnas.map((columna) => celda(columna.titulo)),
    ...(filas ?? []).map((fila) => columnas.map((columna) => celda(fila[columna.clave]))),
  ]

  return renglones.map((renglon) => renglon.join(',')).join('\r\n') + '\r\n'
}

/** Con la fila en el nombre, para no confundir un archivo de a pie con el total. */
export function nombreArchivoReporte(desde, hasta, vistaFila = 'juntas') {
  const fila = filaParaConsulta(vistaFila)
  return `cajita-reporte-${desde}_a_${hasta}${fila ? `_${fila}` : ''}.csv`
}
