import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Pases permanentes.
 *
 * El pase es de la persona, no de una cita: su codigo no se quema y sirve
 * los dos dias de entrega, sin horario. Lo que se quema es el dia: una
 * caja por pase por fecha, y eso lo garantiza la base de datos.
 *
 * Darlos, renovarlos y quitarlos es solo de administradores. Mirar un
 * pase con su codigo es publico, igual que el enlace de una cita: quien
 * tiene el codigo es el dueno.
 */

// Errores de negocio que la base lanza como texto.
export const CODIGOS_PASE = [
  'PERSONA_NO_EXISTE',
  'PASE_NO_EXISTE',
  'PASE_YA_REVOCADO',
  //  Seccion 50.
  'NOMBRE_INVALIDO',
  'TELEFONO_INVALIDO',
  'NOTA_MUY_LARGA',
]

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS_PASE.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

const primera = (data) => (Array.isArray(data) ? data[0] : data) ?? null

/**
 * Le da el pase a una persona que ya esta registrada, por su codigo CB.
 * Si ya tenia uno, le actualiza el motivo y lo reactiva.
 */
export async function crearPase(codigo, motivo = null, { vip = false } = {}) {
  const pase = primera(await llamar('crear_pase', { p_codigo: codigo, p_motivo: motivo?.trim() || null }))
  //  VIP es aparte: solo lo puede poner el administrador (seccion 40).
  if (vip) await marcarPaseVip(codigo, true)
  return pase
}

/**
 * Pase PREFERENTE (seccion 50): tercera edad o movilidad reducida. Con solo
 * su nombre, telefono con lada opcional ('+16195550101') y una nota para
 * reconocerla. Devuelve { codigo_corto, nombre, token }.
 */
export async function crearPasePreferente(nombre, { telefono = null, nota = null } = {}) {
  return primera(
    await llamar('crear_pase_preferente', {
      p_nombre: nombre,
      p_telefono: telefono || null,
      p_nota: String(nota ?? '').trim() || null,
    }),
  )
}

/**
 * Volver preferente (o ya no) el pase de alguien. nota: null la deja como
 * estaba; '' la quita.
 */
export function marcarPasePreferente(codigo, preferente, nota = null) {
  return llamar('marcar_pase_preferente', { p_codigo: codigo, p_preferente: Boolean(preferente), p_nota: nota })
}

/** Pase VIP: dorado y pasa directo, sin fila. Solo el administrador. */
export function marcarPaseVip(codigo, vip) {
  return llamar('marcar_pase_vip', { p_codigo: codigo, p_vip: Boolean(vip) })
}

/**
 * Le genera OTRO codigo a la misma persona. El anterior deja de servir al
 * momento: es lo que se usa cuando el pase anda circulando o lo trae
 * alguien mas.
 */
export async function renovarPase(codigo) {
  return primera(await llamar('renovar_pase', { p_codigo: codigo }))
}

/** Lo apaga. No se borra: queda quien lo quito, cuando y por que. */
export function revocarPase(codigo, motivo = null) {
  return llamar('revocar_pase', { p_codigo: codigo, p_motivo: motivo?.trim() || null })
}

/** Todos los pases, activos primero. */
export async function listarPases() {
  return (await llamar('listar_pases', {})) ?? []
}

/** Quienes pasaron ese dia con su pase. */
export async function entregasPaseDelDia(fecha = null) {
  return (await llamar('entregas_pase_del_dia', { p_fecha: fecha })) ?? []
}

/** Lo que ve la persona en la pantalla de su pase. */
export async function paseDeCodigo(token) {
  return primera(await llamar('pase_por_token', { p_token: token }))
}
