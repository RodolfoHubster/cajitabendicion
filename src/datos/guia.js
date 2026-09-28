import { supabase } from '../lib/supabase'

/**
 * La guia del panel: un paso a paso que se abre solo la primera vez que
 * alguien del equipo entra, y que se puede volver a ver desde el menu.
 *
 * Cada paso ensena una pantalla y solo le sale a quien la puede usar: un
 * voluntario que solo escanea ve lo del escaner; el administrador, todo.
 *
 * `desde` es la version en que se agrego o cambio el paso. Cuando cambie como
 * se trabaja (como el 24 de septiembre de 2026, cuando escanear paso a
 * entregar de una vez), se agrega o se cambia el paso con `desde` = la version
 * siguiente, y a quien ya vio la guia se le ensenan solo esas novedades.
 */
export const PASOS_GUIA = [
  { clave: 'bienvenida', desde: 1 },
  { clave: 'menu', desde: 1, conMenu: true },
  { clave: 'escanear', desde: 1, seccion: 'escanear' },
  { clave: 'colores', desde: 1, seccion: 'escanear' },
  { clave: 'deshacer', desde: 1, seccion: 'escanear' },
  { clave: 'buscar', desde: 1, seccion: 'escanear' },
  { clave: 'sinCita', desde: 1, seccion: 'escanear', permiso: 'anotar_sin_cita' },
  { clave: 'citasHoy', desde: 1, seccion: 'citasHoy' },
  { clave: 'registrar', desde: 1, seccion: 'registrar' },
  { clave: 'horarios', desde: 1, seccion: 'horarios' },
  { clave: 'reportes', desde: 1, seccion: 'reportes' },
  { clave: 'avisos', desde: 1, seccion: 'avisos' },
  { clave: 'equipo', desde: 1, seccion: 'equipo' },
  { clave: 'listo', desde: 1 },
]

/** La version de la guia: la del paso mas nuevo. */
export const VERSION_GUIA = Math.max(...PASOS_GUIA.map((paso) => paso.desde))

/** Cada rol tiene su guia: si un voluntario pasa a administrador, ve la suya. */
export function guiaDeRol(rol) {
  return rol === 'admin' ? 'admin' : 'voluntario'
}

/**
 * Los pasos que le tocan a quien entro. `secciones`: las claves del menu que
 * puede ver (seccionesVisibles en rutas/menu.js).
 */
export function pasosDeGuia({ rol, permisos = [], secciones = [] }) {
  return PASOS_GUIA.filter((paso) => {
    //  Con una sola pantalla no hay menu que explicar.
    if (paso.conMenu && secciones.length < 2) return false
    if (paso.seccion && !secciones.includes(paso.seccion)) return false
    if (paso.permiso && rol !== 'admin' && !permisos.includes(paso.permiso)) return false
    return true
  })
}

/** Lo que falta por ver: todo la primera vez; despues, solo las novedades. */
export function pasosPendientes(pasos, versionVista = 0) {
  if (!versionVista) return pasos
  return pasos.filter((paso) => paso.desde > versionVista)
}

//  En este telefono, por cuenta: un telefono compartido no le esconde la
//  guia al segundo voluntario.
const llave = (guia, cuenta) => `cajita-guia-${guia}-${String(cuenta ?? '').toLowerCase()}`

export function versionVistaLocal(guia, cuenta) {
  try {
    return Number(localStorage.getItem(llave(guia, cuenta))) || 0
  } catch {
    return 0
  }
}

export function guardarVistaLocal(guia, cuenta, version) {
  try {
    localStorage.setItem(llave(guia, cuenta), String(version))
  } catch {
    // Sin almacenamiento del navegador: queda en la base, si ya tiene la migracion.
  }
}

/** Hasta que version la vio, segun la base. null si no se pudo saber. */
export async function versionVistaEnLaBase(guia) {
  try {
    const { data, error } = await supabase.rpc('mis_guias_vistas')
    if (error) return null
    return (data ?? []).find((g) => g.guia === guia)?.version ?? 0
  } catch {
    return null
  }
}

/**
 * Hasta que version vio la guia esta cuenta: lo mas alto entre este telefono
 * y la base. Si en este telefono ya vio la ultima, ni se pregunta.
 */
export async function versionVista(guia, cuenta) {
  const local = versionVistaLocal(guia, cuenta)
  if (local >= VERSION_GUIA) return local

  const vista = Math.max(local, (await versionVistaEnLaBase(guia)) ?? 0)
  if (vista > local) guardarVistaLocal(guia, cuenta, vista)
  return vista
}

/** Ya la vio (o la salto): en este telefono y en la base. Nunca truena. */
export async function marcarGuiaVista(guia, cuenta, version = VERSION_GUIA) {
  guardarVistaLocal(guia, cuenta, version)

  try {
    const { error } = await supabase.rpc('marcar_guia_vista', { p_guia: guia, p_version: version })
    return !error
  } catch {
    return false
  }
}
