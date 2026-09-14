import { ahoraSanDiego, horasEntre, restarHoras } from './disponibilidad'
import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

export { bloquesDelDia } from './panel'

/**
 * Cuantas horas antes que el publico entran los suscriptores. Son opciones
 * fijas a proposito: elegir "1 dia antes" se entiende mejor que capturar
 * una segunda fecha y hora.
 */
export const ANTICIPOS = { unaHora: 1, dosHoras: 2, unDia: 24 }

/** Las opciones del selector: las fijas y, al final, una fecha y hora exacta. */
export const OPCIONES_ANTICIPO = [...Object.keys(ANTICIPOS), 'personalizado']

/**
 * El codigo solo se pide mientras la fecha no ha abierto al publico. Si la
 * apertura ya paso, activar suscriptores no tendria ningun efecto: todos
 * se registran sin codigo.
 */
export function suscriptoresSinEfecto(conSuscriptores, abreEn) {
  return Boolean(conSuscriptores && abreEn && abreEn.slice(0, 16) <= ahoraSanDiego())
}

/** La hora de acceso anticipado para una apertura, o null si no hay. */
export function calcularAnticipado(abreEn, anticipo, personalizado = null) {
  if (anticipo === 'personalizado') return personalizado || null
  const horas = ANTICIPOS[anticipo] ?? 0
  return abreEn && horas > 0 ? restarHoras(abreEn, horas) : null
}

/**
 * La opcion que corresponde a una fecha ya guardada. Sin acceso anticipado
 * devuelve la que se propone al activarlo.
 */
export function anticipoDe(abreEn, abreAnticipadoEn) {
  if (!abreEn || !abreAnticipadoEn) return 'unDia'
  const horas = horasEntre(abreAnticipadoEn.slice(0, 16), abreEn.slice(0, 16))
  return Object.keys(ANTICIPOS).find((clave) => ANTICIPOS[clave] === horas) ?? 'personalizado'
}

/**
 * Gestion de fechas de entrega y sus horarios. Solo admin: la base lo
 * revisa en cada funcion.
 *
 * Las horas viajan como hora local de San Diego sin zona
 * ("2026-09-11T12:00"), que es lo que da un <input type="datetime-local">.
 */

// Errores de negocio que la base lanza como texto.
const CODIGOS = [
  'FECHA_PASADA',
  'HORARIO_INVALIDO',
  'CAPACIDAD_INVALIDA',
  'APERTURA_REQUERIDA',
  'ANTICIPADO_DESPUES_DE_APERTURA',
  'DIA_YA_EXISTE',
  'DIA_NO_EXISTE',
  'DIA_CON_CITAS',
  'BLOQUE_YA_EXISTE',
  'BLOQUE_CON_CITAS',
  'BLOQUE_NO_EXISTE',
]

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

export async function listarDiasEntrega() {
  return (await llamar('listar_dias_entrega', { p_desde: null })) ?? []
}

/** Crea la fecha y sus horarios. Devuelve el codigo de suscriptores. */
export function crearDiaEntrega({ fecha, horaInicio, horaFin, capacidad, abreEn, abreAnticipadoEn }) {
  return llamar('crear_dia_entrega', {
    p_fecha: fecha,
    p_hora_inicio: horaInicio,
    p_hora_fin: horaFin,
    p_capacidad: capacidad,
    p_abre_en: abreEn,
    p_abre_anticipado_en: abreAnticipadoEn || null,
  })
}

export function actualizarDiaEntrega({ fecha, abreEn, abreAnticipadoEn, cerrado }) {
  return llamar('actualizar_dia_entrega', {
    p_fecha: fecha,
    p_abre_en: abreEn,
    p_abre_anticipado_en: abreAnticipadoEn || null,
    p_cerrado: cerrado,
  })
}

export function regenerarCodigoAnticipado(fecha) {
  return llamar('regenerar_codigo_anticipado', { p_fecha: fecha })
}

export function eliminarDiaEntrega(fecha) {
  return llamar('eliminar_dia_entrega', { p_fecha: fecha })
}

export function actualizarBloque({ bloqueId, capacidad = null, cerrado = null }) {
  return llamar('actualizar_bloque', {
    p_bloque_id: bloqueId,
    p_capacidad: capacidad,
    p_cerrado: cerrado,
  })
}

export function agregarBloque({ fecha, hora, capacidad }) {
  return llamar('agregar_bloque', { p_fecha: fecha, p_hora: hora, p_capacidad: capacidad })
}

export function eliminarBloque(bloqueId) {
  return llamar('eliminar_bloque', { p_bloque_id: bloqueId })
}
