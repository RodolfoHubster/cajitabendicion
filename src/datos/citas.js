import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Cancelar citas, "entro sin cita" y la excepcion de segunda cita en la
 * semana.
 *
 * Las reglas y los permisos los revisa la base: cancelar la propia cita solo
 * necesita el token del QR; todo lo demas es solo del administrador.
 */

// Errores de negocio que la base lanza como texto.
export const CODIGOS = [
  'CITA_NO_EXISTE',
  'CITA_YA_CANCELADA',
  'CITA_YA_ENTREGADA',
  'FECHA_PASADA',
  'NOMBRE_REQUERIDO',
  'NOMBRE_INVALIDO',
  'ENTRADA_NO_EXISTE',
  'ENTRADA_YA_ANULADA',
  'SIN_CODIGOS_DISPONIBLES',
  'MOTIVO_REQUERIDO',
  'PERSONA_NO_EXISTE',
  'NO_NECESITA_EXCEPCION',
  'YA_TIENE_EXCEPCION_ESTA_SEMANA',
  'BLOQUE_LLENO',
  'BLOQUE_CERRADO',
  'BLOQUE_NO_EXISTE',
  'DIA_CERRADO',
  'MISMO_HORARIO',
  'YA_CAMBIO_HORARIO',
  'YA_TIENE_CITA_ESTA_SEMANA',
  'AUN_NO_ABRE',
]

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

/** La persona cancela su propia cita con el token de su QR. */
export function cancelarMiCita(token) {
  return llamar('cancelar_mi_cita', { p_token: token })
}

/** Cuantos cambios de horario le quedan a la persona. 0 = ya no puede. */
export async function cambiosRestantes(token) {
  return (await llamar('cambios_restantes', { p_token: token })) ?? 0
}

/**
 * La persona cambia su cita de horario con el token de su QR.
 *
 * Es la misma cita, movida: conserva su codigo CB y su QR. Si el horario
 * nuevo se llena justo antes, la base lo deshace todo y se queda con el
 * que ya tenia; nunca se queda sin cita.
 */
export async function moverMiCita(token, bloqueId) {
  const data = await llamar('mover_mi_cita', { p_token: token, p_bloque_id: bloqueId })
  return (Array.isArray(data) ? data[0] : data) ?? null
}

/** El administrador mueve una cita desde el panel, sin el limite de un cambio. */
export async function moverCitaPanel(citaId, bloqueId) {
  const data = await llamar('mover_cita_panel', { p_cita_id: citaId, p_bloque_id: bloqueId })
  return (Array.isArray(data) ? data[0] : data) ?? null
}

/** El administrador cancela una cita de la lista del dia. */
export function cancelarCitaPanel({ codigo, fecha, hora, motivo }) {
  return llamar('cancelar_cita_panel', {
    p_codigo: codigo,
    p_fecha: fecha,
    p_hora: hora,
    p_motivo: motivo?.trim() || null,
  })
}

/**
 * Anota a una persona que entro sin cita. Devuelve su codigo de
 * comprobante (SC-1234) y cuantas van hoy.
 */
export async function registrarEntradaSinCita(nombre) {
  const data = await llamar('registrar_entrada_sin_cita', { p_nombre: nombre })
  const fila = Array.isArray(data) ? data[0] : data
  return { codigo: fila?.codigo ?? null, total: fila?.total ?? 0 }
}

/** Anula una entrada sin cita (no la borra). Devuelve cuantas cuentan ese dia. */
export async function anularEntradaSinCita(codigo, fecha = null) {
  return (await llamar('anular_entrada_sin_cita', { p_codigo: codigo, p_fecha: fecha })) ?? 0
}

/** Quien entro sin cita ese dia, quien lo anoto y a que hora. */
export async function entradasSinCitaDelDia(fecha) {
  return (await llamar('entradas_sin_cita_del_dia', { p_fecha: fecha ?? null })) ?? []
}

/** Segunda cita en la semana para una persona que ya tiene la suya. */
export async function reservarConExcepcion({ codigo, bloqueId, motivo }) {
  const data = await llamar('reservar_con_excepcion', {
    p_codigo: codigo,
    p_bloque_id: bloqueId,
    p_motivo: motivo,
  })

  return (Array.isArray(data) ? data[0] : data) ?? null
}
