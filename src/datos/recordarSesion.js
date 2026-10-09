/**
 * "Mantener la sesion activa" (pedido del 9 de octubre de 2026): el personal
 * entraba, se le apagaba el telefono y tenia que volver a entrar.
 *
 * Con la casilla marcada (lo de fabrica), la sesion se guarda en el
 * telefono y dura 30 dias desde que se entro, con correo o con Google. Sin
 * marcar, se guarda solo mientras la pestana este abierta: para un telefono
 * o una computadora que no es de uno.
 *
 * Supabase guarda la sesion donde le diga crearAlmacenSesion(); aqui se
 * decide si es el telefono (localStorage) o la pestana (sessionStorage).
 */

export const LLAVE_RECORDAR = 'cajita-recordar-sesion'
export const LLAVE_DESDE = 'cajita-sesion-desde'
export const DIAS_SESION = 30
const MS_DIA = 86_400_000

//  En una ventana privada el almacen puede fallar: nada de esto debe tumbar la pagina.
function seguro(fn, respaldo = null) {
  try {
    return fn()
  } catch {
    return respaldo
  }
}

/** Si esta cuenta quiere seguir con la sesion abierta. De fabrica, si. */
export function quiereRecordar(local = globalThis.localStorage) {
  return seguro(() => local?.getItem(LLAVE_RECORDAR), null) !== '0'
}

/** Al entrar (correo o Google): si se recuerda, y desde cuando cuentan los 30 dias. */
export function marcarInicio(recordar, { local = globalThis.localStorage, ahora = Date.now() } = {}) {
  seguro(() => {
    local?.setItem(LLAVE_RECORDAR, recordar ? '1' : '0')
    local?.setItem(LLAVE_DESDE, String(ahora))
  })
}

/** Al salir. La preferencia de la casilla se queda para la proxima vez. */
export function olvidarInicio(local = globalThis.localStorage) {
  seguro(() => local?.removeItem(LLAVE_DESDE))
}

/** Ya pasaron los 30 dias desde que entro. Sin fecha (una sesion de antes), no. */
export function sesionVencida({ local = globalThis.localStorage, ahora = Date.now() } = {}) {
  const desde = Number(seguro(() => local?.getItem(LLAVE_DESDE)))
  if (!desde) return false
  return ahora - desde > DIAS_SESION * MS_DIA
}

/**
 * Donde guarda Supabase la sesion: en el telefono si se recuerda, o solo
 * en la pestana si no. Al guardar en uno se borra del otro, para que nunca
 * quede una sesion vieja escondida.
 */
export function crearAlmacenSesion({ local = globalThis.localStorage, pestana = globalThis.sessionStorage } = {}) {
  const elegido = () => (quiereRecordar(local) ? local : pestana)
  const otro = () => (quiereRecordar(local) ? pestana : local)

  return {
    getItem: (llave) => seguro(() => elegido()?.getItem(llave) ?? null),
    setItem: (llave, valor) =>
      seguro(() => {
        elegido()?.setItem(llave, valor)
        otro()?.removeItem(llave)
      }),
    removeItem: (llave) =>
      seguro(() => {
        local?.removeItem(llave)
        pestana?.removeItem(llave)
      }),
  }
}
