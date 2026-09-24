/**
 * Convierte el error crudo de Postgres en un codigo que diga que hacer.
 *
 * Un "revisa tu conexion" generico manda a buscar al lugar equivocado
 * cuando el problema es otro. El dia de la entrega, con la fila afuera,
 * eso cuesta minutos que nadie tiene.
 */

/**
 * Cada navegador dice "no hay red" a su manera. Chrome: "Failed to fetch".
 * Safari, el del iPhone: "Load failed". Firefox: "NetworkError when
 * attempting to fetch resource". Sin reconocer los tres, a quien usa
 * iPhone con mala senal le salia "error desconocido".
 */
const SIN_RED = [/failed to fetch/i, /load failed/i, /networkerror/i, /network request failed/i, /tiempo_agotado/i]

export function esErrorDeConexion(mensaje) {
  const texto = String(mensaje ?? '')
  return SIN_RED.some((patron) => patron.test(texto))
}

export function clasificarError(error) {
  // La funcion no existe en la base: falta aplicar una migracion.
  if (error?.code === 'PGRST202') return 'FUNCION_NO_INSTALADA'

  // Sin permiso: la sesion caduco, o la funcion es solo para personal.
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'SIN_PERMISO'

  if (esErrorDeConexion(error?.message)) return 'SIN_CONEXION'

  return 'ERROR_DESCONOCIDO'
}

/**
 * Espera una llamada, pero no para siempre.
 *
 * Con una sola rayita de senal, una peticion se puede quedar colgada
 * minutos y la persona ve "Enviando..." sin saber si esperar o volver a
 * tocar. Pasado el limite se responde como si no hubiera red, que es lo
 * que esta pasando. La llamada original puede terminar en el servidor
 * igual: por eso la base reconoce el reintento (seccion 33 de schema.sql).
 */
export function conLimiteDeTiempo(promesa, milisegundos = 25000) {
  let reloj
  const limite = new Promise((resolver) => {
    reloj = setTimeout(() => resolver({ data: null, error: { message: 'TIEMPO_AGOTADO' } }), milisegundos)
  })

  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj))
}
