import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Avisos y reglas que el pastor edita desde el panel.
 *
 * Lo que la gente lee en la portada y antes de confirmar su cita. Vive en
 * la base porque cambia: la regla de "una cita por semana" ya cambio una
 * vez, y corregir un texto no deberia necesitar publicar el sitio.
 *
 * Estos textos EXPLICAN las reglas; no las aplican. Lo que el sistema
 * hace de verdad esta en las funciones de Postgres.
 */

export const CODIGOS_AVISOS = [
  'TEXTO_REQUERIDO',
  'TEXTO_LARGO',
  'TITULO_REQUERIDO',
  'SECCION_INVALIDA',
  'AVISO_NO_EXISTE',
]

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS_AVISOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

/**
 * El texto en el idioma de la pantalla.
 *
 * Sigue la misma cadena que el resto de la app: el vietnamita cae a
 * ingles y todo lo demas al espanol, que es el unico obligatorio. Antes
 * un hueco que una traduccion a medias.
 */
export function textoDeAviso(aviso, idioma) {
  if (!aviso) return ''

  const corto = String(idioma ?? 'es').split('-')[0]

  if (corto === 'vi') return aviso.texto_vi || aviso.texto_en || aviso.texto_es || ''
  if (corto === 'en') return aviso.texto_en || aviso.texto_es || ''

  return aviso.texto_es || ''
}

/**
 * El titulo en el idioma de la pantalla: la pregunta, en las preguntas
 * frecuentes, y el encabezado del parrafo en "quienes somos". Vacio en
 * las secciones que no lo usan.
 */
export function tituloDeAviso(aviso, idioma) {
  if (!aviso) return ''

  const corto = String(idioma ?? 'es').split('-')[0]

  if (corto === 'vi') return aviso.titulo_vi || aviso.titulo_en || aviso.titulo_es || ''
  if (corto === 'en') return aviso.titulo_en || aviso.titulo_es || ''

  return aviso.titulo_es || ''
}

/** Los de una seccion, ya en orden y solo los activos. */
export async function avisosPublicos(seccion) {
  return (await llamar('avisos_publicos', { p_seccion: seccion })) ?? []
}

/** Todos, incluidos los apagados. Solo admin. */
export async function listarAvisos() {
  return (await llamar('listar_avisos', {})) ?? []
}

/** Crea uno si no se manda id; si se manda, lo modifica. */
export function guardarAviso({
  id = null,
  seccion,
  textoEs,
  textoEn = '',
  textoVi = '',
  tituloEs = '',
  tituloEn = '',
  tituloVi = '',
  activo = true,
}) {
  return llamar('guardar_aviso', {
    p_id: id,
    p_seccion: seccion,
    p_texto_es: textoEs,
    p_texto_en: textoEn?.trim() || null,
    p_texto_vi: textoVi?.trim() || null,
    p_activo: activo,
    p_titulo_es: tituloEs?.trim() || null,
    p_titulo_en: tituloEn?.trim() || null,
    p_titulo_vi: tituloVi?.trim() || null,
  })
}

/** Lo sube o lo baja dentro de su seccion. */
export function moverAviso(id, hacia) {
  return llamar('mover_aviso', { p_id: id, p_hacia: hacia })
}

export function eliminarAviso(id) {
  return llamar('eliminar_aviso', { p_id: id })
}
