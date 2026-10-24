import { aCsv } from './reportes'
import { clasificarError } from './errores'
import { normalizarTelefono } from './telefono'
import { supabase } from '../lib/supabase'

/**
 * Voluntarios: su credencial con QR permanente, su entrada y su salida
 * (seccion 48 de schema.sql).
 *
 * No son cuentas del panel: solo su nombre y, si quiere, su telefono y su
 * correo (seccion 49: por separado). Al llegar y al irse se reportan con un administrador, que escanea
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
  //  Seccion 49.
  'TELEFONO_INVALIDO',
  'CORREO_INVALIDO',
  'MEDIO_INVALIDO',
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

/**
 * Lo registra y devuelve { id, nombre, token }: el token es su credencial.
 * telefono con lada ('+16195550101') y correo, los dos opcionales (ver
 * separarContacto).
 */
export async function registrarVoluntario(nombre, { telefono = null, correo = null } = {}) {
  return primera(
    await llamar('registrar_voluntario', { p_nombre: nombre, p_telefono: opcional(telefono), p_correo: opcional(correo) }),
  )
}

/** Cambia su nombre, su telefono y su correo (vacio: se quita). */
export function editarVoluntario(id, nombre, { telefono = null, correo = null } = {}) {
  return llamar('editar_voluntario', {
    p_id: id,
    p_nombre: nombre,
    p_telefono: opcional(telefono),
    p_correo: opcional(correo),
  })
}

/** Dar de baja (false) o de alta (true). */
export function activarVoluntario(id, activo) {
  return llamar('activar_voluntario', { p_id: id, p_activo: Boolean(activo) })
}

/** Otra credencial: la anterior deja de servir. Devuelve el token nuevo. */
export function nuevoQrVoluntario(id) {
  return llamar('nuevo_qr_voluntario', { p_id: id })
}

/**
 * Todos, los activos primero: { id, nombre, telefono, correo, contacto_viejo,
 * token, activo, creado_en, dentro_desde, ultima_entrada, sin_salida,
 * enviada_en, enviada_medio }.
 */
export async function listarVoluntarios() {
  return (await llamar('listar_voluntarios', {})) ?? []
}

/** Lo que ve el voluntario con su enlace: { nombre, activo, dias, minutos }, o null. */
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

// ------------------------------------------------------------
//  Seccion 49: telefono y correo, mandar la credencial, ordenar y filtrar
// ------------------------------------------------------------

/**
 * Lo que se escribio en "Telefono o correo", separado: el correo (lo que
 * lleva @) y el telefono con lada. Se pueden poner los dos ("619 555 0101,
 * juana@gmail.com"). Sin lada, un numero de 10 digitos es de Estados Unidos,
 * salvo los que empiezan con 664 o 665 (Tijuana y Tecate); con +52 adelante,
 * de Mexico.
 *
 * Devuelve { telefono: '+16195550101' | null, pais: 'US' | 'MX' | ...,
 * correo: 'juana@gmail.com' | null, error: null | 'TELEFONO_INVALIDO' |
 * 'CORREO_INVALIDO' }.
 */
export function separarContacto(texto) {
  const crudo = String(texto ?? '').trim()
  const vacio = { telefono: null, pais: null, correo: null, error: null }
  if (!crudo) return vacio

  const conArroba = crudo.match(/[^\s,;/]*@[^\s,;/]*/)
  let correo = null
  let error = null
  if (conArroba) {
    correo = conArroba[0].toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) || correo.length > 120) error = 'CORREO_INVALIDO'
  }

  const resto = (conArroba ? crudo.replace(conArroba[0], ' ') : crudo).replace(/[,;/]/g, ' ').trim()
  if (!resto) return { ...vacio, correo, error }

  const digitos = resto.replace(/\D/g, '')
  const sinLada = !/^\s*(\+|00)/.test(resto)
  const deMexico = (digitos.length === 10 && /^66[45]/.test(digitos)) || /^52\d{10}$/.test(digitos)
  const preferido = sinLada && deMexico ? 'MX' : 'US'
  const telefono = normalizarTelefono(preferido, resto)
  if (!telefono.valido) return { telefono: null, pais: null, correo, error: error ?? 'TELEFONO_INVALIDO' }
  return { telefono: telefono.e164, pais: telefono.pais, correo, error }
}

/** Lo que se escribe en el campo al editar: lo que tiene, junto. */
export function contactoEnTexto(voluntario) {
  const juntos = [voluntario?.telefono, voluntario?.correo].filter(Boolean).join(', ')
  return juntos || voluntario?.contacto_viejo || ''
}

/** '+16195550101' -> '+1 619 555 0101'; '+526641234567' -> '+52 664 123 4567'. */
export function telefonoBonito(e164) {
  const texto = String(e164 ?? '')
  const m = /^\+(1|52)(\d{3})(\d{3})(\d{4})$/.exec(texto)
  return m ? `+${m[1]} ${m[2]} ${m[3]} ${m[4]}` : texto
}

/** Que se le dice al mandarle su credencial. */
export function mensajeCredencial(t, nombre, enlace) {
  const primero = String(nombre ?? '').trim().split(/\s+/)[0] ?? ''
  return t('voluntarios.envio.mensaje', { nombre: primero, enlace })
}

/** Abre WhatsApp con el mensaje ya escrito; la persona toca Enviar. */
export function enlaceWhatsAppCredencial(telefono, mensaje) {
  const digitos = String(telefono ?? '').replace(/\D/g, '')
  if (digitos.length < 8) return null
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`
}

/**
 * Abre los mensajes de texto (SMS) del telefono con el numero y el mensaje
 * ya escritos, para quien no tiene WhatsApp. "?&body=" lo entienden el
 * iPhone y Android.
 */
export function enlaceSmsCredencial(telefono, mensaje) {
  const digitos = String(telefono ?? '').replace(/\D/g, '')
  if (digitos.length < 8) return null
  return `sms:+${digitos}?&body=${encodeURIComponent(mensaje)}`
}

/** Abre el correo del telefono con el asunto y el mensaje ya escritos. */
export function enlaceCorreoCredencial(correo, asunto, mensaje) {
  if (!correo) return null
  return `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`
}

/**
 * El mismo correo, pero en Gmail o en Outlook del navegador. En una
 * computadora sin programa de correo, "mailto:" solo hace que Windows
 * pregunte con que abrirlo (23 de octubre de 2026).
 */
export function enlaceGmailCredencial(correo, asunto, mensaje) {
  if (!correo) return null
  const datos = new URLSearchParams({ view: 'cm', fs: '1', to: correo, su: asunto, body: mensaje })
  return `https://mail.google.com/mail/?${datos.toString()}`
}

/** Outlook en el navegador (cuentas de Microsoft 365, como la de la iglesia, y Hotmail). */
export function enlaceOutlookCredencial(correo, asunto, mensaje) {
  if (!correo) return null
  const datos = new URLSearchParams({ to: correo, subject: asunto, body: mensaje })
  return `https://outlook.office.com/mail/deeplink/compose?${datos.toString()}`
}

/** Por donde se le mando: whatsapp, sms, correo o impresa. */
export function marcarCredencialEnviada(id, medio) {
  return llamar('marcar_credencial_enviada', { p_voluntario: id, p_medio: medio })
}

/** Marcar la salida, a esa hora ('13:30', o ahora), de quienes siguen adentro. Devuelve cuantos. */
export function cerrarDiaVoluntarios(hora = null) {
  return llamar('cerrar_dia_voluntarios', { p_hora: hora || null })
}

/** Sus ultimas visitas completas, para su credencial: [{ fecha, entrada, salida, minutos }]. */
export async function historialDeCredencial(token) {
  return (await llamar('historial_de_credencial', { p_token: token })) ?? []
}

export const ORDENES = ['recientes', 'antiguos', 'nombre', 'ultimaVez']

/** Ordena sin cambiar la lista original. Los dados de baja, siempre al final. */
export function ordenarVoluntarios(lista, orden = 'recientes') {
  const porNombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' })
  const porFecha = (campo, direccion) => (a, b) => {
    const x = a[campo] ?? ''
    const y = b[campo] ?? ''
    if (x === y) return porNombre(a, b)
    if (!x) return 1
    if (!y) return -1
    return direccion * (x < y ? -1 : 1)
  }
  const criterio = {
    recientes: porFecha('creado_en', -1),
    antiguos: porFecha('creado_en', 1),
    nombre: porNombre,
    ultimaVez: porFecha('ultima_entrada', -1),
  }[orden] ?? porNombre
  return [...(lista ?? [])].sort((a, b) => Number(b.activo) - Number(a.activo) || criterio(a, b))
}

export const FILTROS = [
  'activos',
  'pendiente',
  'enviada',
  'conTelefono',
  'conCorreo',
  'sinContacto',
  'adentro',
  'sinSalida',
  'deBaja',
]

/** Quienes entran en un filtro. Salvo "deBaja", solo los activos. */
export function filtrarVoluntarios(lista, filtro = 'activos') {
  const prueba = {
    activos: () => true,
    pendiente: (v) => !v.enviada_en,
    enviada: (v) => Boolean(v.enviada_en),
    conTelefono: (v) => Boolean(v.telefono),
    conCorreo: (v) => Boolean(v.correo),
    sinContacto: (v) => !v.telefono && !v.correo,
    adentro: (v) => Boolean(v.dentro_desde),
    sinSalida: (v) => v.sin_salida > 0,
  }[filtro]
  if (filtro === 'deBaja') return (lista ?? []).filter((v) => !v.activo)
  return (lista ?? []).filter((v) => v.activo && (prueba ? prueba(v) : true))
}

/** Cuantos hay en cada filtro, para ponerlo en la lista de filtros. */
export function contarPorFiltro(lista) {
  return Object.fromEntries(FILTROS.map((filtro) => [filtro, filtrarVoluntarios(lista, filtro).length]))
}
