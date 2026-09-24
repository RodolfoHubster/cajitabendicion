import { puedeEntrar } from '../datos/permisos'

/**
 * Las secciones del panel.
 *
 * Con `permiso`, la seccion aparece si el administrador puso esa palomita
 * (y al admin la base se las da todas). Con `roles`, es de ese rol y ya:
 * asi se quedan Horarios y cupos, Equipo y accesos, y Permisos, que no se
 * le abren a un voluntario por ningun lado.
 *
 * El orden es el de la pantalla: de lo que se usa el dia de la entrega a
 * lo que se toca una vez al mes.
 */
export const SECCIONES = [
  { a: '/admin', clave: 'citasHoy', exacta: true, permiso: 'ver_citas_del_dia' },
  { a: '/admin/registrar', clave: 'registrar', permiso: 'registrar_personas' },
  { a: '/admin/horarios', clave: 'horarios', roles: ['admin'] },
  { a: '/admin/pases', clave: 'pases', permiso: 'dar_pases' },
  { a: '/admin/personas', clave: 'personas', permiso: 'ver_personas' },
  { a: '/admin/reportes', clave: 'reportes', permiso: 'ver_reportes' },
  { a: '/admin/avisos', clave: 'avisos', permiso: 'editar_textos' },
  { a: '/admin/equipo', clave: 'equipo', roles: ['admin'] },
  { a: '/admin/permisos', clave: 'permisos', roles: ['admin'] },
  { a: '/escanear', clave: 'escanear', roles: ['admin', 'voluntario'] },
]

/** Las que le tocan a quien entro. */
export function seccionesVisibles(rol, permisos) {
  return SECCIONES.filter((seccion) => puedeEntrar(seccion, rol, permisos))
}

/**
 * La seccion en la que se esta parado, para ponerle nombre al boton del
 * menu. Sin coincidencia devuelve undefined y el boton dice "Menú".
 */
export function seccionActual(secciones, ruta) {
  const limpia = String(ruta ?? '')

  return secciones.find((seccion) =>
    seccion.exacta ? limpia === seccion.a : limpia === seccion.a || limpia.startsWith(`${seccion.a}/`),
  )
}
