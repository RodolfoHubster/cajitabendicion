import { clasificarError } from './errores'
import { obtenerDispositivo } from './registro'
import { supabase } from '../lib/supabase'

/**
 * El turno a pie SIN DATOS, desde el QR general de la entrada (seccion 42
 * de la base). La persona toca "Sacar mi turno" y recibe su numero y su QR;
 * no se le pide nombre, edad ni telefono.
 *
 * Un turno vivo por telefono por dia: el telefono se reconoce con el mismo
 * identificador al azar del registro (nada personal). El turno se guarda en
 * este telefono para que, al volver a abrir la pagina, salga el suyo.
 */

export const CODIGOS_TURNO = ['DISPOSITIVO_INVALIDO', 'FILA_A_PIE_NO_EXISTE', 'DIA_CERRADO', 'OTRA_FILA']

let dispositivoDeRespaldo = null

/** El identificador del telefono. Sin almacen (ventana privada), uno por visita. */
export function dispositivoParaTurno(obtener = obtenerDispositivo) {
  const guardado = obtener()
  if (guardado) return guardado
  dispositivoDeRespaldo ??= `sin-almacen-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  return dispositivoDeRespaldo
}

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)
  if (error) {
    const deNegocio = CODIGOS_TURNO.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }
  return (Array.isArray(data) ? data[0] : data) ?? null
}

/**
 * Saca (o recupera) el turno de este telefono. Devuelve { resultado, ... }:
 * NUEVO, YA_TENIA, TIENE_CITA_EN_CARRO, YA_RECIBIO_EN_CARRO, AUN_NO_ABRE,
 * NO_HAY_FILA o CERRADA. Con cambiarCarro, acepta que su cita de carro de
 * hoy se cancele; si es el dueno del carro (acompanantes > 0), tambien las
 * de sus acompanantes, que sacan su propio turno.
 *
 * Si ese dia se pide el codigo del dia (seccion 43), tambien FALTA_CODIGO,
 * CODIGO_INCORRECTO o DEMASIADOS_INTENTOS (con `espera`: los segundos que
 * faltan para volver a intentar).
 */
export function sacarTurnoAPie({ cambiarCarro = false, codigo = '' } = {}) {
  const parametros = { p_dispositivo: dispositivoParaTurno(), p_cambiar_carro: Boolean(cambiarCarro) }
  //  Solo los numeros, y solo si escribio algo: sin codigo se llama igual
  //  que antes.
  const limpio = String(codigo ?? '').replace(/\D/g, '')
  if (limpio) parametros.p_codigo = limpio
  return llamar('sacar_turno_a_pie', parametros)
}

/**
 * La fila a pie de hoy, para la pagina del turno: { hora, abre_en, abierta,
 * cerrada, pide_codigo }, o null si hoy no hay. Dice SI se pide el codigo
 * del dia, nunca cual es.
 */
export function filaAPieHoy() {
  return llamar('fila_a_pie_hoy', {})
}

/**
 * La voluntaria le da turno a quien no tiene telefono: { token_qr, codigo,
 * turno, nombre }. La sena es opcional ("chamarra roja"), para reconocerla
 * si dos dicen que son el mismo numero.
 */
export const MAXIMO_SENA = 40

export function darTurnoSinTelefono(sena = '') {
  const limpia = String(sena ?? '').trim().slice(0, MAXIMO_SENA)
  return llamar('dar_turno_sin_telefono', limpia ? { p_sena: limpia } : {})
}

/** Las respuestas del codigo del dia: no traen turno, se corrigen en la misma pantalla. */
export const RESULTADOS_DE_CODIGO = ['FALTA_CODIGO', 'CODIGO_INCORRECTO', 'DEMASIADOS_INTENTOS']

/** 299 -> '4:59'. Para la cuenta regresiva del freno. */
export function relojDeEspera(segundos) {
  const s = Math.max(0, Math.ceil(Number(segundos) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** El resultado que trae turno (para guardarlo y mostrarlo). */
export function traeTurno(respuesta) {
  return ['NUEVO', 'YA_TENIA'].includes(respuesta?.resultado) && Boolean(respuesta?.token_qr)
}

// ------------------------------------------------------------
//  El turno de hoy, guardado en este telefono
// ------------------------------------------------------------

export const LLAVE_MI_TURNO = 'cajita-mi-turno'

/** El turno guardado, solo si es de hoy. */
export function leerMiTurno(hoy, almacen = globalThis.localStorage) {
  try {
    const guardado = JSON.parse(almacen?.getItem(LLAVE_MI_TURNO) ?? 'null')
    return guardado?.fecha === hoy && guardado?.token ? guardado : null
  } catch {
    return null
  }
}

export function guardarMiTurno({ fecha, token, turno, codigo }, almacen = globalThis.localStorage) {
  try {
    almacen?.setItem(LLAVE_MI_TURNO, JSON.stringify({ fecha, token, turno, codigo }))
    return true
  } catch {
    return false
  }
}

export function olvidarMiTurno(almacen = globalThis.localStorage) {
  try {
    almacen?.removeItem(LLAVE_MI_TURNO)
  } catch {
    //  Nada que hacer: al volver a sacar turno se reemplaza.
  }
}

/**
 * Que aviso dar cuando cambia la situacion del turno (sonido y vibracion):
 *   'turno' -> le acaba de tocar
 *   'cerca' -> faltan 3 o menos (una sola vez)
 *   null    -> nada nuevo
 * La primera vez que se pregunta (anterior = null) no suena: si abre la
 * pagina y ya le toca, la pantalla lo dice; el sonido es para el cambio.
 */
export const FALTAN_PARA_AVISAR = 3

export function avisoQueToca(anterior, actual) {
  if (!anterior || !actual) return null
  if (actual.tipo === 'tuTurno' && anterior.tipo !== 'tuTurno') return 'turno'
  const cerca = (situacion) => situacion?.tipo === 'esperando' && situacion.antes <= FALTAN_PARA_AVISAR
  if (cerca(actual) && !cerca(anterior) && anterior.tipo === 'esperando') return 'cerca'
  return null
}
