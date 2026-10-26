import { consultarDisponibilidad, formatearHora, horasEntre, restarHoras, segundosHasta, sumarDias } from './disponibilidad'
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

/** La siguiente despues de hoy, para decir cuando volver; o null si no hay. */
export function siguienteFilaAPie(filas, hoy) {
  return proximaFilaAPie((filas ?? []).filter((f) => f.fecha > hoy))
}

/**
 * La fila tal como debe verse ahora: si su hora de apertura llego con la
 * pagina abierta, ya esta abierta, sin esperar a volver a preguntar.
 */
export function filaAlDia(fila) {
  if (!fila || fila.abierto !== false || !fila.abre_en) return fila
  return segundosHasta(fila.abre_en) <= 0 ? { ...fila, abierto: true } : fila
}

/** 'no_hay' | 'por_abrir' | 'llena' | 'abierta'. */
export function estadoFilaAPie(fila) {
  if (!fila) return 'no_hay'
  if (fila.abierto === false) return 'por_abrir'
  if (fila.libres <= 0) return 'llena'
  return 'abierta'
}

/** Su turno en vivo: { turno, estado, saltado, actual, antes, atendidos, en_espera, fecha, hora, cerrada, anulado }, o null. */
/**
 * La fila a pie de hoy, para cualquiera (seccion 51): { hora, abre_en,
 * abierta, cerrada, terminada, actual, ultimo, atendidos, en_espera, total },
 * o null si hoy no hay. Solo numeros.
 */
export async function filaAPieEnVivo() {
  return primeraFila(await llamar('fila_a_pie_en_vivo', {}))
}

/**
 * Los numeros alrededor del que estan llamando, en orden: el ultimo que
 * recibio, el que llaman y el que sigue. En /fila se ven como una fila que
 * avanza y no como un boleto: un numero grande solo, en naranja, mucha gente
 * lo tomaba por el suyo (26 de octubre de 2026).
 */
export function fichasDeLaFila(fila) {
  const fichas = new Map()
  if (fila.ultimo != null) fichas.set(fila.ultimo, 'recibio')
  if (fila.actual != null) {
    fichas.set(fila.actual, 'llamando')
    if (fila.actual + 1 <= fila.total && !fichas.has(fila.actual + 1)) fichas.set(fila.actual + 1, 'sigue')
  }
  return [...fichas].sort(([a], [b]) => a - b).map(([numero, tipo]) => ({ numero, tipo }))
}

export async function turnoDeCita(token) {
  return primeraFila(await llamar('turno_de_cita', { p_token: token }))
}

/**
 * Que decirle a la persona segun su turno:
 *
 *   recibida    ya le entregaron
 *   cancelada   la cancelo
 *   terminada   la fila de hoy ya cerro y no alcanzo a recibir
 *   anulado     llego tarde y la voluntaria anulo su turno (seccion 46)
 *   teLlamaron  la llamaron y no estaba: que se acerque ya
 *   tuTurno     es el turno que va
 *   esperando   faltan `antes` turnos (va en el `actual`)
 */
export function situacionDelTurno(datos) {
  if (!datos) return null
  if (datos.estado === 'entregada') return { tipo: 'recibida' }
  //  La voluntaria lo anulo porque llego tarde (seccion 46): saca otro.
  if (datos.anulado) return { tipo: 'anulado' }
  if (datos.estado === 'cancelada') return { tipo: 'cancelada' }
  if (datos.cerrada) return { tipo: 'terminada' }
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

/**
 * El codigo del dia de la fila a pie de una fecha (seccion 43). Sin
 * `activo`, solo lo lee; true lo prende (4 numeros al azar), false lo
 * apaga; `nuevo` cambia los numeros. Devuelve el codigo, o null si no se pide.
 */
export function codigoTurnoAPie(fecha, { activo = null, nuevo = false } = {}) {
  return llamar('codigo_turno_a_pie', { p_fecha: fecha, p_activo: activo, p_nuevo: Boolean(nuevo) })
}

/**
 * Hasta que hora se pide el codigo del dia de una fecha (seccion 47).
 * Sin `cambiar`, solo la lee; con `cambiar`, guarda `hasta` ('13:00'; vacio
 * o null: todo el dia). Devuelve '13:00:00', o null si se pide todo el dia.
 */
export function codigoHastaAPie(fecha, { cambiar = false, hasta = null } = {}) {
  return llamar('codigo_turno_a_pie_hasta', { p_fecha: fecha, p_cambiar: Boolean(cambiar), p_hasta: hasta || null })
}

/**
 * Al crear la fila a pie: prende el codigo del dia y su hora, si se pidio
 * en los campos (ver camposFilaAPie). La fila ya tiene que existir.
 * Devuelve el codigo, o null si no se pidio.
 */
export async function prenderCodigoDeCampos(fecha, campos) {
  if (!campos?.codigo) return null
  const codigo = await codigoTurnoAPie(fecha, { activo: true })
  if (campos.codigoConHora && campos.codigoHasta) {
    await codigoHastaAPie(fecha, { cambiar: true, hasta: campos.codigoHasta })
  }
  return codigo
}

/**
 * Si el codigo dejaria de pedirse antes de que se abran los turnos (o justo
 * al abrir): entonces nunca se pediria. abreEn: '2026-10-19T13:00'.
 */
export function codigoNuncaSePide(fecha, abreEn, hasta) {
  if (!fecha || !abreEn || !hasta) return false
  const [dia, hora = ''] = abreEn.split('T')
  return dia === fecha && String(hasta).slice(0, 5) <= hora.slice(0, 5)
}

/**
 * Terminar la fila a pie de hoy, al acabar: ya no se dan turnos y quien
 * todavia espera ve "La fila de hoy ya termino". Con false se deshace.
 * No es "Cerrar los turnos" (Horarios): ahi quien ya tiene turno lo conserva.
 */
export function terminarFilaAPie(terminada = true) {
  return llamar('terminar_fila_a_pie', { p_terminada: Boolean(terminada) })
}

/**
 * Entregar el turno N de hoy SIN escanear su QR (seccion 44): la persona
 * perdio su pagina pero sabe su numero. Es la misma entrega que al escanear
 * (el mismo candado). Devuelve { resultado, nombre, codigo_corto, hora,
 * turno }: VALIDO, YA_USADO, CANCELADA o TURNO_NO_EXISTE.
 */
export async function entregarTurno(turno) {
  return primeraFila(await llamar('entregar_turno', { p_turno: Number(turno) }))
}

/** Lo que se escribe como numero de turno: solo numeros, sin ceros de mas. null si no es un turno. */
export function numeroDeTurno(texto) {
  const limpio = String(texto ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return limpio && limpio.length <= 4 ? Number(limpio) : null
}

/** "No se presento" (o, con saltado = false, regresarlo a la fila). */
/**
 * Anula el turno N de hoy (seccion 46): lo llamaron, no estaba y llego
 * tarde. Ya no entrega; la persona lo ve en su telefono y saca otro.
 */
export function anularTurno(turno) {
  return llamar('anular_turno', { p_turno: Number(turno) })
}

/**
 * Los turnos a pie de hoy, para buscar en el escaner mientras se teclea:
 * [{ turno, codigo_corto, nombre, estado, sacado_en, saltado_en,
 * entregado_en, anulado_en, dado_por }].
 */
export async function turnosAPieDeHoy() {
  return (await llamar('turnos_a_pie_de_hoy', {})) ?? []
}

/** El QR del turno N de hoy (para su detalle en el escaner). */
export function qrDeTurno(turno) {
  return llamar('qr_de_turno', { p_turno: Number(turno) })
}

/** "2026-10-15T15:05:00.123" (hora de San Diego, de la base) -> "3:05 PM". */
export function horaDeMarca(marca) {
  return marca ? formatearHora(String(marca).slice(11, 16)) : ''
}

/** Cuantos minutos completos han pasado desde esa hora de San Diego (0 si todavia no llega). */
export function minutosDesde(marca) {
  return marca ? Math.max(0, Math.floor(-segundosHasta(String(marca).slice(0, 19)) / 60)) : 0
}

/** "hace 40 min", "hace 1 h 20 min". `t` es el de i18next; `marca`, hora de San Diego de la base. */
export function haceCuanto(t, marca) {
  const minutos = minutosDesde(marca)
  if (minutos < 1) return t('escaneo.turnos.haceUnMomento')
  if (minutos < 60) return t('escaneo.turnos.haceMin', { n: minutos })
  return t('escaneo.turnos.haceHoras', { h: Math.floor(minutos / 60), m: minutos % 60 })
}

/** Como esta un turno de la lista: 'anulado' | 'recibio' | 'saltado' | 'va' | 'esperando'. */
export function estadoDeTurno(fila, actual = null) {
  if (fila.anulado_en || fila.estado === 'cancelada') return 'anulado'
  if (fila.estado === 'entregada') return 'recibio'
  if (fila.saltado_en) return 'saltado'
  if (actual != null && fila.turno === actual) return 'va'
  return 'esperando'
}

const sinAcentos = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * Buscar en la lista de turnos a pie mientras se teclea (seccion 46):
 *
 *   1 a 3 numeros   el turno: el exacto primero, luego los que empiezan asi
 *   4 o 5 numeros   el codigo CB completo (y el turno, si alguno es tan alto)
 *   con letras      la sena o el nombre ("chamarra roja")
 *
 * El codigo nunca se busca a medias: es lo que prueba de quien es el turno.
 */
export function buscarTurnos(lista, texto, maximo = 8) {
  const limpio = String(texto ?? '').trim().replace(/^c\s*b[-\s]*/i, '')
  const filas = lista ?? []
  if (!limpio) return []

  if (/[a-z]/i.test(sinAcentos(limpio))) {
    const palabras = sinAcentos(limpio).split(/\s+/).filter(Boolean)
    return filas.filter((fila) => palabras.every((palabra) => sinAcentos(fila.nombre).includes(palabra))).slice(0, maximo)
  }

  const numeros = limpio.replace(/\D/g, '')
  if (!numeros) return []
  const turno = String(Number(numeros))

  const porCodigo =
    numeros.length >= 4 ? filas.filter((fila) => String(fila.codigo_corto ?? '').replace(/\D/g, '') === numeros) : []
  const exacto = filas.filter((fila) => String(fila.turno) === turno)
  const empiezan =
    numeros.length <= 3
      ? filas
          .filter((fila) => String(fila.turno).startsWith(turno) && String(fila.turno) !== turno)
          .sort((a, b) => a.turno - b.turno)
      : []

  return [...new Set([...porCodigo, ...exacto, ...empiezan])].slice(0, maximo)
}

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
 *
 * Al crear la fila tambien se escoge si pide el codigo del dia y hasta que
 * hora (codigo, codigoConHora, codigoHasta). Ya creada, eso se cambia en su
 * recuadro (CodigoDelDia), no aqui.
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
    codigo: false,
    codigoConHora: false,
    codigoHasta: '',
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

/**
 * Lo que falta o esta mal en lo capturado, o null si se puede guardar.
 * conCodigo: al crear la fila, cuando tambien se escoge el codigo del dia.
 */
export function problemaFilaAPie(fecha, campos, conCodigo = false) {
  if (!campos.hora) return 'HORARIO_INVALIDO'
  const cupo = Number(String(campos.cupo).trim() || NaN)
  if (!campos.sinLimite && !(Number.isInteger(cupo) && cupo >= 1)) return 'CAPACIDAD_INVALIDA'
  if (campos.otraHora && !campos.abreEn) return 'APERTURA_REQUERIDA'
  if (revisarApertura({ fecha, hora: campos.hora, abreEn: aperturaDeCampos(fecha, campos) }) === 'DESPUES_DE_INICIO') {
    return 'APERTURA_DESPUES_DE_INICIO'
  }
  if (conCodigo && campos.codigo && campos.codigoConHora && !campos.codigoHasta) return 'CODIGO_HASTA_REQUERIDA'
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
