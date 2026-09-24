import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Que puede hacer un voluntario.
 *
 * Hasta ahora el rol decidia todo y el voluntario solo escaneaba: abrirle
 * una pantalla era programar. Ahora es una palomita que el administrador
 * prende desde el panel.
 *
 * Esconder un boton NO es la seguridad. El permiso de verdad lo revisa
 * cada funcion de Postgres con exigir_permiso(); esto solo evita mostrar
 * una pantalla que de todos modos fallaria.
 */

/** Las palomitas que existen, en el orden en que se ensenan. */
export const CLAVES_PERMISOS = [
  'ver_citas_del_dia',
  'anotar_sin_cita',
  'anular_entregas',
  'registrar_personas',
  'mover_citas',
  'cancelar_citas',
  'ver_personas',
  'ver_reportes',
  'dar_pases',
  'editar_textos',
]

export const CODIGOS_PERMISOS = ['PERMISO_NO_EXISTE']

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) {
    const deNegocio = CODIGOS_PERMISOS.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

/**
 * Lo que puede hacer quien tiene la sesion abierta, como lista de claves.
 *
 * El administrador las trae todas: la base responde asi, para que el panel
 * no tenga que acordarse de tratarlo aparte.
 */
export async function misPermisos() {
  const filas = (await llamar('mis_permisos', {})) ?? []
  return filas.filter((fila) => fila.activo).map((fila) => fila.clave)
}

/** Todas con su estado, para la pantalla que las administra. Solo admin. */
export async function listarPermisos() {
  return (await llamar('listar_permisos', {})) ?? []
}

/** Prende o apaga una. */
export function guardarPermiso(clave, activo) {
  return llamar('guardar_permiso', { p_clave: clave, p_activo: activo })
}

/**
 * Si con estos permisos se entra a una seccion del panel.
 *
 * Las que nunca se le abren a un voluntario (Equipo y accesos, Horarios y
 * cupos, Permisos) no llevan `permiso` sino `roles`: se deciden por rol a
 * secas y ninguna palomita las alcanza.
 */
export function puedeEntrar(seccion, rol, permisos = []) {
  // Sin rol no hay panel: quien no es del personal no tiene palomitas que
  // valgan, aunque le lleguen de algun lado.
  if (!rol) return false
  if (seccion?.roles) return seccion.roles.includes(rol)
  if (!seccion?.permiso) return false

  return permisos.includes(seccion.permiso)
}
