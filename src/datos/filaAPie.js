import { consultarDisponibilidad, horasEntre, restarHoras, sumarDias } from './disponibilidad'
import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * La fila a pie por turnos (seccion 38 de schema.sql).
 *
 * No va por horarios de 15 minutos: cada dia hay UNA fila con turnos
 * numerados, como en Costco. La gente llega por el cartel del QR, hace el
 * mismo registro que en carro y recibe su QR y su numero de turno. El
 * registro abre a su propia hora, por lo general una hora antes de empezar
 * a entregar. La voluntaria ve en su telefono el turno que va y los que
 * siguen; la persona ve en el suyo cuantos tiene antes.
 *
 * "En vivo" es volver a preguntar cada pocos segundos. Sin conexiones
 * abiertas: con los datos del celular y la senal de la calle es lo que
 * mejor aguanta.
 */

/** El cupo que la base guarda con "sin limite" (cupo_sin_limite()). */
export const CUPO_SIN_LIMITE = 10000

/** Cada cuanto se vuelve a preguntar. La voluntaria, mas seguido: ella llama los turnos. */
export const CADA_MS_PERSONA = 5000
export const CADA_MS_VOLUNTARIA = 3000

/** Lo recomendado: el registro abre una hora antes de empezar a entregar. */
export const HORAS_RECOMENDADAS = 1

/** A que hora empieza una fila a pie nueva, si no se dice otra. */
export const HORA_A_PIE = '14:00'

export function esSinLimite(capacidad) {
  return Number(capacidad) >= CUPO_SIN_LIMITE
}

// Errores de negocio que la base lanza como texto.
export const CODIGOS_FILA_A_PIE = [
  'FECHA_PASADA',
  'DIA_NO_EXISTE',
  'DIA_CERRADO',
  'HORARIO_INVALIDO',
  'CAPACIDAD_INVALIDA',
  'APERTURA_DESPUES_DE_INICIO',
  'FILA_A_PIE_NO_EXISTE',
  'BLOQUE_CON_CITAS',
  'BLOQUE_NO_EXISTE',
  'TURNO_NO_EXISTE',
  'SOLO_HOY',
  'OTRA_FILA',
  'FILA_INVALIDA',
  'DIA_YA_EXISTE',
]

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS_FILA_A_PIE.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

const primeraFila = (data) => (Array.isArray(data) ? data[0] : data) ?? null

// ------------------------------------------------------------
//  El publico
// ------------------------------------------------------------

/** Las filas a pie de hoy y las proximas tres semanas que ya tienen su hora de apertura. */
export function consultarFilasAPie(hoy) {
  return consultarDisponibilidad({ desde: hoy, hasta: sumarDias(hoy, 21), fila: 'a_pie' })
}

/** La que se muestra: la mas cercana (la de hoy, si hay). */
export function proximaFilaAPie(filas) {
  return [...(filas ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null
}

/** 'no_hay' | 'por_abrir' | 'llena' | 'abierta'. */
export function estadoFilaAPie(fila) {
  if (!fila) return 'no_hay'
  if (fila.abierto === false) return 'por_abrir'
  if (fila.libres <= 0) return 'llena'
  return 'abierta'
}

/** Su turno en vivo: { turno, estado, saltado, actual, antes, atendidos, en_espera, fecha, hora }, o null. */
export async function turnoDeCita(token) {
  return primeraFila(await llamar('turno_de_cita', { p_token: token }))
}

/**
 * Que decirle a la persona segun su turno:
 *
 *   recibida    ya le entregaron
 *   cancelada   la cancelo
 *   teLlamaron  la llamaron y no estaba: que se acerque, su QR sigue sirviendo
 *   tuTurno     es el turno que va
 *   esperando   faltan `antes` turnos (va en el `actual`)
 */
export function situacionDelTurno(datos) {
  if (!datos) return null
  if (datos.estado === 'entregada') return { tipo: 'recibida' }
  if (datos.estado === 'cancelada') return { tipo: 'cancelada' }
  if (datos.saltado) return { tipo: 'teLlamaron' }
  if (datos.actual === datos.turno) return { tipo: 'tuTurno' }
  return { tipo: 'esperando', antes: datos.antes ?? 0, actual: datos.actual ?? null }
}

// ------------------------------------------------------------
//  La voluntaria
// ------------------------------------------------------------

/** La fila en vivo del dia (null si no hay fila a pie). Ver fila_de_turnos(). */
export async function filaDeTurnos(fecha = null) {
  return (await llamar('fila_de_turnos', { p_fecha: fecha })) ?? null
}

/** "No se presento" (o, con saltado = false, regresarlo a la fila). */
export function saltarTurno(turno, saltado = true) {
  return llamar('saltar_turno', { p_turno: turno, p_saltado: saltado })
}

/** En que fila esta hoy quien escanea. */
export function elegirFila(fila) {
  return llamar('elegir_fila', { p_fila: fila })
}

/**
 * La que eligio hoy, o null si todavia no elige. Si la base no conoce la
 * funcion (falta actualizarla), tambien null: el escaner sigue como antes.
 */
export async function miFilaDeHoy() {
  const { data, error } = await supabase.rpc('mi_fila_de_hoy')
  if (error) return null
  return data === 'carro' || data === 'a_pie' ? data : null
}

/**
 * Si el codigo que se escaneo es de un turno que todavia no llaman. Pasa
 * igual, pero la voluntaria lo decide: no se entrega solo.
 */
export function turnoAdelantado(turno, actual) {
  return Number.isInteger(turno) && Number.isInteger(actual) && turno > actual
}

// ------------------------------------------------------------
//  El administrador (Horarios)
// ------------------------------------------------------------

/** '2026-09-28' y '16:30:00' -> '2026-09-28T15:30': una hora antes de empezar. */
export function aperturaRecomendada(fecha, hora) {
  return restarHoras(`${fecha}T${String(hora).slice(0, 5)}`, HORAS_RECOMENDADAS)
}

/**
 * Revisa la hora de apertura del registro contra la de inicio:
 *
 *   'DESPUES_DE_INICIO'  abre cuando ya se esta entregando: no se puede
 *   'MAS_TEMPRANO'       abre con mas de una hora de anticipacion: se puede,
 *                        pero se avisa (se recomienda una hora antes)
 *   null                 bien
 */
export function revisarApertura({ fecha, hora, abreEn }) {
  if (!fecha || !hora || !abreEn) return null
  const inicio = `${fecha}T${String(hora).slice(0, 5)}`
  const horas = horasEntre(abreEn.slice(0, 16), inicio)
  if (horas < 0) return 'DESPUES_DE_INICIO'
  if (horas > HORAS_RECOMENDADAS) return 'MAS_TEMPRANO'
  return null
}

/**
 * Lo que se captura en pantalla para la fila a pie de un dia (ver
 * CamposFilaAPie): de un dia que ya la tiene, o lo de arranque para uno
 * nuevo (sin limite y los turnos una hora antes, mientras se decide con el
 * pastor).
 */
export function camposFilaAPie(dia = null) {
  const existe = Boolean(dia?.a_pie_bloque_id)
  //  Una fila nueva empieza a las 2 PM, a menos que se cambie.
  const hora = existe ? String(dia.a_pie_hora).slice(0, 5) : HORA_A_PIE
  const sinLimite = existe ? esSinLimite(dia.a_pie_capacidad) : true
  const abreEn = existe && dia.a_pie_abre_en ? dia.a_pie_abre_en.slice(0, 16) : ''

  return {
    hora,
    sinLimite,
    cupo: existe && !sinLimite ? String(dia.a_pie_capacidad) : '100',
    //  "Otra hora" solo si ya se habia guardado una distinta a la recomendada.
    otraHora: Boolean(abreEn && hora) && abreEn !== aperturaRecomendada(dia.fecha, hora),
    abreEn,
  }
}

/**
 * Con que llenar "otra hora" al escogerla: una hora antes de empezar, del
 * dia de la entrega (o de hoy, si todavia no se escoge la fecha).
 */
export function otraHoraInicial(fecha, hora, hoy) {
  if (!hora) return ''
  return aperturaRecomendada(fecha || hoy, hora)
}

/** A que hora se abren los turnos con lo capturado ('' si falta la hora o la fecha). */
export function aperturaDeCampos(fecha, campos) {
  if (campos.otraHora) return campos.abreEn
  return fecha && campos.hora ? aperturaRecomendada(fecha, campos.hora) : ''
}

/** Lo que falta o esta mal en lo capturado, o null si se puede guardar. */
export function problemaFilaAPie(fecha, campos) {
  if (!campos.hora) return 'HORARIO_INVALIDO'
  const cupo = Number(String(campos.cupo).trim() || NaN)
  if (!campos.sinLimite && !(Number.isInteger(cupo) && cupo >= 1)) return 'CAPACIDAD_INVALIDA'
  if (campos.otraHora && !campos.abreEn) return 'APERTURA_REQUERIDA'
  if (revisarApertura({ fecha, hora: campos.hora, abreEn: aperturaDeCampos(fecha, campos) }) === 'DESPUES_DE_INICIO') {
    return 'APERTURA_DESPUES_DE_INICIO'
  }
  return null
}

/** Lo capturado, como lo piden guardarFilaAPie y crearDiaAPie. */
export function filaAPieParaGuardar(fecha, campos) {
  return {
    fecha,
    hora: campos.hora,
    cupo: campos.sinLimite ? null : Number(campos.cupo),
    abreEn: campos.otraHora ? campos.abreEn : null,
  }
}

/** Una fecha SOLO a pie, ya con su fila. Todo o nada: si la fila no se puede armar, no se crea. */
export function crearDiaAPie({ fecha, hora, cupo = null, abreEn = null }) {
  return llamar('crear_dia_a_pie', {
    p_fecha: fecha,
    p_hora: hora,
    p_cupo: cupo,
    p_abre_en: abreEn || null,
  })
}

/** Crea o cambia la fila a pie de un dia. cupo null = sin limite; abreEn null = una hora antes. */
export function guardarFilaAPie({ fecha, hora, cupo = null, abreEn = null }) {
  return llamar('guardar_fila_a_pie', {
    p_fecha: fecha,
    p_hora: hora,
    p_cupo: cupo,
    p_abre_en: abreEn || null,
  })
}

/** La quita, si nadie ha sacado turno. */
export function quitarFilaAPie(fecha) {
  return llamar('quitar_fila_a_pie', { p_fecha: fecha })
}

/** Abre o cierra el registro a pie de ese dia (los que ya tienen turno lo conservan). */
export function cerrarRegistroAPie(bloqueId, cerrado) {
  return llamar('actualizar_bloque', { p_bloque_id: bloqueId, p_capacidad: null, p_cerrado: cerrado })
}
