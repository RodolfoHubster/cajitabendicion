import { aCsv } from './reportes'
import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Voluntarios: su credencial con QR permanente, su entrada y su salida
 * (seccion 48 de schema.sql).
 *
 * No son cuentas del panel: solo su nombre y, si quiere, un telefono o
 * correo. Al llegar y al irse se reportan con un administrador, que escanea
 * su credencial: si no ha entrado es su entrada, si ya entro es su salida.
 * Todo es del administrador; el voluntario solo ve su credencial con su
 * enlace, como los pases.
 */

// Errores de negocio que la base lanza como texto.
export const CODIGOS_VOLUNTARIOS = [
  'NOMBRE_INVALIDO',
  'CONTACTO_INVALIDO',
  'VOLUNTARIO_NO_EXISTE',
  'ASISTENCIA_NO_EXISTE',
  'ASISTENCIA_ANULADA',
  'FUERA_DE_PLAZO',
  'MOTIVO_REQUERIDO',
  'HORAS_INVALIDAS',
  'HORA_FUTURA',
  'TRASLAPE',
  'RANGO_INVALIDO',
]

/** Lo que lleva el QR de una credencial: "vol" y 48 letras o numeros. */
export const PATRON_CREDENCIAL = /^vol[0-9a-f]{48}$/

/** Si un QR es la credencial de un voluntario. */
export function esCredencial(texto) {
  return PATRON_CREDENCIAL.test(String(texto ?? '').trim().toLowerCase())
}

/** Si un QR parece el de una cita o un pase (48, sin "vol"). */
export function esQrDeCita(texto) {
  return /^[0-9a-f]{48}$/.test(String(texto ?? '').trim().toLowerCase())
}

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS_VOLUNTARIOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

const primera = (data) => (Array.isArray(data) ? data[0] : data) ?? null
const opcional = (texto) => String(texto ?? '').trim() || null

// ------------------------------------------------------------
//  Registrar y cambiar
// ------------------------------------------------------------

/** Lo registra y devuelve { id, nombre, token }: el token es su credencial. */
export async function registrarVoluntario(nombre, contacto = '') {
  return primera(await llamar('registrar_voluntario', { p_nombre: nombre, p_contacto: opcional(contacto) }))
}

export function editarVoluntario(id, nombre, contacto = '') {
  return llamar('editar_voluntario', { p_id: id, p_nombre: nombre, p_contacto: opcional(contacto) })
}

/** Dar de baja (false) o de alta (true). */
export function activarVoluntario(id, activo) {
  return llamar('activar_voluntario', { p_id: id, p_activo: Boolean(activo) })
}

/** Otra credencial: la anterior deja de servir. Devuelve el token nuevo. */
export function nuevoQrVoluntario(id) {
  return llamar('nuevo_qr_voluntario', { p_id: id })
}

/** Todos, los activos primero: { id, nombre, contacto, token, activo, dentro_desde, ultima_entrada, sin_salida }. */
export async function listarVoluntarios() {
  return (await llamar('listar_voluntarios', {})) ?? []
}

/** Lo que ve el voluntario con su enlace: { nombre, activo }, o null. */
export async function credencialVoluntario(token) {
  return primera(await llamar('credencial_voluntario', { p_token: token }))
}

// ------------------------------------------------------------
//  Entrada y salida
// ------------------------------------------------------------

/**
 * Escanear su credencial ({ token }) o escogerlo de la lista ({ voluntario }).
 * Devuelve { resultado, asistencia_id, nombre, entrada_en, salida_en, minutos, olvido }:
 * ENTRADA, SALIDA, YA_ENTRO, YA_SALIO, INACTIVO o NO_EXISTE.
 */
export async function marcarAsistencia({ token = null, voluntario = null } = {}) {
  const parametros = voluntario ? { p_voluntario: voluntario } : { p_token: String(token ?? '').trim() }
  return primera(await llamar('marcar_asistencia', parametros))
}

/** Lo recien marcado, en sus primeros 2 minutos. */
export function deshacerAsistencia(id) {
  return llamar('deshacer_asistencia', { p_id: id })
}

/** Quien entro un dia (hoy, si no se dice), con su hora de entrada y salida. */
export async function asistenciasDelDia(fecha = null) {
  return (await llamar('asistencias_del_dia', { p_fecha: fecha })) ?? []
}

/** entrada y salida como '2026-10-20T09:00' (hora de San Diego). */
export function corregirAsistencia(id, { entrada, salida, motivo }) {
  return llamar('corregir_asistencia', {
    p_id: id,
    p_entrada: entrada,
    p_salida: salida,
    p_motivo: String(motivo ?? '').trim(),
  })
}

/** Una asistencia que no se escaneo. */
export function agregarAsistencia(voluntario, { entrada, salida, motivo }) {
  return llamar('agregar_asistencia', {
    p_voluntario: voluntario,
    p_entrada: entrada,
    p_salida: salida,
    p_motivo: String(motivo ?? '').trim(),
  })
}

export function anularAsistencia(id, motivo) {
  return llamar('anular_asistencia', { p_id: id, p_motivo: String(motivo ?? '').trim() })
}

// ------------------------------------------------------------
//  Las horas
// ------------------------------------------------------------

/** Por voluntario entre dos fechas: { voluntario_id, nombre, activo, dias, minutos, sin_salida }. */
export async function horasDeVoluntarios(desde, hasta) {
  return (await llamar('horas_de_voluntarios', { p_desde: desde, p_hasta: hasta })) ?? []
}

/** Cada asistencia de uno, la mas nueva primero (anuladas incluidas). */
export async function asistenciasDeVoluntario(id, desde, hasta) {
  return (await llamar('asistencias_de_voluntario', { p_voluntario: id, p_desde: desde, p_hasta: hasta })) ?? []
}

/** Lo que falta para corregir o agregar, o null si se puede mandar. */
export function problemaAsistencia({ entrada, salida, motivo }) {
  if (!entrada || !salida || salida <= entrada) return 'HORAS_INVALIDAS'
  if (!String(motivo ?? '').trim()) return 'MOTIVO_REQUERIDO'
  return null
}

/** Del primero del mes de hoy hasta hoy. hoy: '2026-10-20'. */
export function rangoDelMes(hoy) {
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy }
}

/** 255 -> '4 h 15 min'; 45 -> '45 min'; 120 -> '2 h'. */
export function textoDuracion(t, minutos) {
  const total = Math.max(0, Math.round(Number(minutos) || 0))
  const horas = Math.floor(total / 60)
  const resto = total % 60
  if (!horas) return t('voluntarios.duracion.min', { m: resto })
  if (!resto) return t('voluntarios.duracion.h', { h: horas })
  return t('voluntarios.duracion.hMin', { h: horas, m: resto })
}

/** Horas con dos decimales, para Excel: 255 -> 4.25. */
export function horasDecimales(minutos) {
  return Math.round(((Number(minutos) || 0) / 60) * 100) / 100
}

/** El CSV de las horas: nombre, dias, horas y cuantas quedaron sin salida. */
export function csvDeHoras(filas, titulos) {
  return aCsv(
    (filas ?? []).map((f) => ({ ...f, horas: horasDecimales(f.minutos) })),
    [
      { clave: 'nombre', titulo: titulos.nombre },
      { clave: 'dias', titulo: titulos.dias },
      { clave: 'horas', titulo: titulos.horas },
      { clave: 'sin_salida', titulo: titulos.sinSalida },
    ],
  )
}

export function nombreArchivoHoras(desde, hasta) {
  return `cajita-horas-voluntarios-${desde}_a_${hasta}.csv`
}

/** El enlace de su credencial, para mandarselo. */
export function enlaceCredencial(token, origen = globalThis.location?.origin ?? '') {
  return `${origen}/voluntario/${token}`
}

/**
 * Para buscarlo por nombre sin acentos: "jose" encuentra a "José".
 * Los activos primero, como vienen de la base.
 */
export function buscarVoluntarios(lista, texto, maximo = 8) {
  const limpiar = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
  const buscado = limpiar(texto)
  if (!buscado) return []
  return (lista ?? []).filter((v) => limpiar(v.nombre).includes(buscado)).slice(0, maximo)
}
