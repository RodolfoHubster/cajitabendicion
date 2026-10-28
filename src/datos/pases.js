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
  //  Seccion 53: marcar la entrega a mano.
  'FECHA_FUTURA',
  'FILA_INVALIDA',
  'NO_ES_DIA_DE_ENTREGA',
  'PASE_REVOCADO',
  'PASE_YA_ENTREGADO',
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

// ------------------------------------------------------------
//  Seccion 53: filtros y la entrega a mano
// ------------------------------------------------------------

/**
 * La caja de un pase que no se escaneo (solo el administrador), en un dia
 * de entrega: fecha '2026-10-26', fila 'carro' o 'a_pie', motivo opcional.
 */
export function marcarEntregaPase(codigo, { fecha, fila = 'carro', motivo = null } = {}) {
  return llamar('marcar_entrega_pase', {
    p_codigo: codigo,
    p_fecha: fecha,
    p_fila: fila,
    p_motivo: String(motivo ?? '').trim() || null,
  })
}

export const FILTROS_PASES = ['todos', 'comunes', 'vip', 'preferentes', 'quitados']

/** Los pases de un filtro. comunes: activos, ni VIP ni preferentes. */
export function filtrarPases(lista, filtro = 'todos') {
  const prueba =
    {
      comunes: (p) => p.activo && !p.vip && !p.preferente,
      vip: (p) => p.activo && p.vip,
      preferentes: (p) => p.activo && p.preferente,
      quitados: (p) => !p.activo,
    }[filtro] ?? (() => true)
  return (lista ?? []).filter(prueba)
}

/** Cuantos hay en cada filtro. */
export function contarPases(lista) {
  return Object.fromEntries(FILTROS_PASES.map((filtro) => [filtro, filtrarPases(lista, filtro).length]))
}

/** Buscar por nombre (sin acentos), codigo o telefono. */
export function buscarPases(lista, texto) {
  const limpiar = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const buscado = limpiar(texto)
  if (!buscado) return lista ?? []
  const digitos = buscado.replace(/\D/g, '')
  return (lista ?? []).filter(
    (p) =>
      limpiar(p.nombre).includes(buscado) ||
      limpiar(p.codigo_corto).includes(buscado) ||
      (digitos.length >= 3 && String(p.telefono ?? '').includes(digitos)),
  )
}

/** Los dias en que se puede marcar una entrega: hasta hoy y sin los cancelados, el mas nuevo primero. */
export function diasParaMarcar(fechas, hoy) {
  return (fechas ?? [])
    .filter((f) => f.fecha <= hoy && !f.cerrado)
    .map((f) => f.fecha)
    .sort((a, b) => b.localeCompare(a))
}
