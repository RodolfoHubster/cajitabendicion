import { formatearHora } from './disponibilidad'
import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Incidencias del dia: el camion llega tarde, llueve, dia festivo.
 *
 * Tres salidas, solo del administrador y desde Horarios: avisar un retraso
 * (nadie se mueve), mover la entrega completa a otra fecha (cada cita con
 * su mismo QR y su hora) o cancelarla. La base revisa todo; aqui se llama y
 * se arman los textos.
 */

export const TIPOS_INCIDENCIA = ['retraso', 'movida', 'cancelada']
export const MINUTOS_RETRASO = [15, 30, 45, 60, 90, 120, 180]

export const CODIGOS_INCIDENCIA = [
  'FECHA_PASADA',
  'DIA_NO_EXISTE',
  'DIA_YA_RESUELTO',
  'MINUTOS_INVALIDOS',
  'FECHA_NUEVA_INVALIDA',
  'FECHA_YA_TIENE_ENTREGA',
]

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS_INCIDENCIA.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

const limpio = (texto) => texto?.trim() || null

/** Avisa un retraso. Con 0 minutos, quita el aviso. */
export function anunciarRetraso({ fecha, minutos, mensaje }) {
  return llamar('anunciar_retraso', { p_fecha: fecha, p_minutos: Number(minutos), p_mensaje: limpio(mensaje) })
}

/** Mueve la entrega completa. Devuelve { movidas, sin_mover }. */
export async function moverEntrega({ fecha, fechaNueva, mensaje }) {
  const data = await llamar('mover_entrega', { p_fecha: fecha, p_fecha_nueva: fechaNueva, p_mensaje: limpio(mensaje) })
  const fila = Array.isArray(data) ? data[0] : data
  return { movidas: fila?.movidas ?? 0, sin_mover: fila?.sin_mover ?? 0 }
}

/** Cancela la entrega. Devuelve cuantas citas se cancelaron. */
export async function cancelarEntrega({ fecha, mensaje }) {
  return (await llamar('cancelar_entrega', { p_fecha: fecha, p_mensaje: limpio(mensaje) })) ?? 0
}

/** El historial de una fecha. Solo admin. */
export async function incidenciasDeFecha(fecha) {
  return (await llamar('incidencias_de_fecha', { p_fecha: fecha })) ?? []
}

/** A quien avisar, con su telefono y su token. Solo admin. */
export async function personasAAvisar(fecha) {
  return (await llamar('personas_a_avisar', { p_fecha: fecha })) ?? []
}

/**
 * Lo vigente de hoy en adelante, para el aviso de la portada. Si falla (sin
 * senal, o la base todavia sin la migracion) no hay aviso: la portada no
 * se rompe por esto.
 */
export async function incidenciasPublicas() {
  try {
    return (await llamar('incidencias_publicas', {})) ?? []
  } catch {
    return []
  }
}

/** Lo que le toca a una cita (su retraso, si se movio o se cancelo). Nunca falla. */
export async function incidenciaDeCita(token) {
  try {
    return (await llamar('incidencia_de_cita', { p_token: token })) ?? []
  } catch {
    return []
  }
}

/** '14:45:00' + 30 -> '15:15:00'. No pasa de las 11:59 PM. */
export function horaConRetraso(hora, minutos) {
  const [h, m] = hora.split(':').map(Number)
  const total = Math.min(h * 60 + m + (Number(minutos) || 0), 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}

/** Enlace de WhatsApp con el mensaje ya escrito. null si no hay telefono. */
export function enlaceWhatsApp(telefono, texto) {
  const digitos = (telefono ?? '').replace(/\D/g, '')
  if (digitos.length < 7) return null
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`
}

/** '2026-09-27' -> 'sábado, 27 de septiembre' (o en ingles). */
export function fechaLarga(fecha, idioma = 'es') {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    new Date(anio, mes - 1, dia),
  )
}

/**
 * El mensaje de WhatsApp para una persona: en espanol y en ingles (no
 * sabemos en que idioma lee cada quien). Lleva el enlace a SU QR o, si se
 * cancelo, al calendario.
 *
 * incidencia: { tipo, fecha, fecha_nueva, minutos, mensaje }
 * persona:    { hora } (la hora de su cita)
 * enlaces:    { cita, calendario }
 */
export function textoWhatsApp(incidencia, persona, enlaces) {
  const { tipo, fecha, fecha_nueva: fechaNueva, minutos, mensaje } = incidencia
  const hora = persona?.hora ? formatearHora(persona.hora) : ''
  const extra = mensaje ? `\n${mensaje}` : ''

  if (tipo === 'retraso') {
    const nueva = persona?.hora ? formatearHora(horaConRetraso(persona.hora, minutos)) : ''
    return [
      `Cajita de Bendición: la entrega del ${fechaLarga(fecha)} va con ${minutos} minutos de retraso. Tu nueva hora aproximada es ${nueva}. Tu mismo código sirve.${extra}`,
      enlaces.cita,
      '',
      `The ${fechaLarga(fecha, 'en')} delivery is running ${minutos} minutes late. Your new approximate time is ${nueva}. Your same code works.`,
    ].join('\n')
  }

  if (tipo === 'movida') {
    return [
      `Cajita de Bendición: la entrega del ${fechaLarga(fecha)} se movió al ${fechaLarga(fechaNueva)}, a la misma hora (${hora}). Tu mismo código sirve.${extra}`,
      enlaces.cita,
      '',
      `The ${fechaLarga(fecha, 'en')} delivery moved to ${fechaLarga(fechaNueva, 'en')}, same time (${hora}). Your same code works.`,
    ].join('\n')
  }

  return [
    `Cajita de Bendición: se canceló la entrega del ${fechaLarga(fecha)}.${extra}`,
    `Puedes sacar una nueva cita aquí: ${enlaces.calendario}`,
    '',
    `The ${fechaLarga(fecha, 'en')} delivery was cancelled. You can book a new appointment here: ${enlaces.calendario}`,
  ].join('\n')
}

/**
 * La incidencia que manda en una fecha: si ya se movio o se cancelo, esa;
 * si no, el retraso vigente. null si no hay nada.
 */
export function incidenciaVigente(historial, fecha) {
  const vigentes = (historial ?? []).filter((i) => !i.retirada && i.fecha === fecha)
  return (
    vigentes.find((i) => i.tipo === 'movida' || i.tipo === 'cancelada') ??
    vigentes.find((i) => i.tipo === 'retraso') ??
    null
  )
}
