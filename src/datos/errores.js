/**
 * Convierte el error crudo de Postgres en un codigo que diga que hacer.
 *
 * Un "revisa tu conexion" generico manda a buscar al lugar equivocado
 * cuando el problema es otro. El dia de la entrega, con la fila afuera,
 * eso cuesta minutos que nadie tiene.
 */
export function clasificarError(error) {
  // La funcion no existe en la base: falta aplicar una migracion.
  if (error?.code === 'PGRST202') return 'FUNCION_NO_INSTALADA'

  // Sin permiso: la sesion caduco, o la funcion es solo para personal.
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'SIN_PERMISO'

  if (error?.message?.toLowerCase().includes('failed to fetch')) return 'SIN_CONEXION'

  return 'ERROR_DESCONOCIDO'
}
