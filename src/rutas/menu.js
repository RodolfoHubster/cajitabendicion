import { puedeEntrar } from '../datos/permisos'

/**
 * Las secciones del panel.
 *
 * Con `permiso`, la seccion aparece si el administrador puso esa palomita
 * (y al admin la base se las da todas). Con `roles`, es de ese rol y ya:
 * asi se quedan Horarios y cupos, Equipo y accesos, y Permisos, que no se
 * le abren a un voluntario por ningun lado.
 *
 * El orden es el de la pantalla, agrupado: arriba lo del dia de la
 * entrega (Escanear primero), abajo lo que se toca una vez al mes.
 */
export const GRUPOS = ['dia', 'personas', 'preparar', 'numeros', 'administracion']

export const SECCIONES = [
  { a: '/escanear', clave: 'escanear', grupo: 'dia', roles: ['admin', 'voluntario'] },
  { a: '/admin', clave: 'citasHoy', grupo: 'dia', exacta: true, permiso: 'ver_citas_del_dia' },
  { a: '/admin/registrar', clave: 'registrar', grupo: 'dia', permiso: 'registrar_personas' },
  //  Entrada y salida de los voluntarios (seccion 48): el administrador y
  //  quien "atiende voluntarios" (seccion 49, por persona).
  { a: '/admin/voluntarios', clave: 'voluntarios', grupo: 'dia', permiso: 'atender_voluntarios' },
  { a: '/admin/personas', clave: 'personas', grupo: 'personas', permiso: 'ver_personas' },
  { a: '/admin/pases', clave: 'pases', grupo: 'personas', permiso: 'dar_pases' },
  { a: '/admin/horarios', clave: 'horarios', grupo: 'preparar', roles: ['admin'] },
  { a: '/admin/avisos', clave: 'avisos', grupo: 'preparar', permiso: 'editar_textos' },
  { a: '/admin/qr', clave: 'codigosQr', grupo: 'preparar', roles: ['admin'] },
  { a: '/admin/reportes', clave: 'reportes', grupo: 'numeros', permiso: 'ver_reportes' },
  { a: '/admin/equipo', clave: 'equipo', grupo: 'administracion', roles: ['admin'] },
  { a: '/admin/permisos', clave: 'permisos', grupo: 'administracion', roles: ['admin'] },
]

/** Las que le tocan a quien entro. */
export function seccionesVisibles(rol, permisos) {
  return SECCIONES.filter((seccion) => puedeEntrar(seccion, rol, permisos))
}

/** Las secciones por grupo, en el orden del menu. Un grupo sin secciones no sale. */
export function menuPorGrupos(secciones) {
  return GRUPOS.map((grupo) => ({ grupo, secciones: secciones.filter((s) => s.grupo === grupo) })).filter(
    (g) => g.secciones.length > 0,
  )
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
