/**
 * Lo que la persona lleva escrito en el registro, por si la pagina se
 * recarga sola.
 *
 * El caso: en Android, si la persona sale a otra app a buscar su codigo
 * postal o a copiar su correo, el navegador a veces recarga la pestana al
 * volver, y todo lo escrito se borraba. Para un adulto mayor que tardo
 * diez minutos en llenarlo, ahi se acababa el intento.
 *
 * Se guarda en sessionStorage, no en localStorage: vive solo en ESA
 * pestana y se borra al cerrarla. Ademas caduca a la hora. En un telefono
 * prestado, la siguiente persona no se encuentra los datos de la anterior.
 * No se guardan las casillas de aceptar: esas se marcan cada vez.
 */

export const LLAVE_BORRADOR = 'cajita-borrador-registro'
export const MINUTOS_BORRADOR = 60

const CAMPOS = ['nombres', 'apellidos', 'pais', 'telefono', 'email']

function tieneAlgo(datos) {
  const texto = CAMPOS.filter((campo) => campo !== 'pais').some((campo) => String(datos?.[campo] ?? '').trim())
  const domicilio = Object.entries(datos?.domicilio ?? {}).some(
    ([campo, valor]) => campo !== 'pais' && valor !== false && String(valor ?? '').trim(),
  )
  return texto || domicilio
}

export function guardarBorrador(datos, almacen = globalThis.sessionStorage, ahora = Date.now()) {
  try {
    if (!tieneAlgo(datos)) {
      almacen?.removeItem(LLAVE_BORRADOR)
      return false
    }

    const limpio = Object.fromEntries(CAMPOS.map((campo) => [campo, datos[campo] ?? '']))
    limpio.domicilio = datos.domicilio ?? null
    almacen?.setItem(LLAVE_BORRADOR, JSON.stringify({ ...limpio, guardadoEn: ahora }))
    return true
  } catch {
    return false
  }
}

/** El borrador si existe, es de hace menos de una hora y se entiende; si no, null. */
export function leerBorrador(almacen = globalThis.sessionStorage, ahora = Date.now()) {
  try {
    const crudo = almacen?.getItem(LLAVE_BORRADOR)
    if (!crudo) return null

    const datos = JSON.parse(crudo)
    const vigente = typeof datos?.guardadoEn === 'number' && ahora - datos.guardadoEn < MINUTOS_BORRADOR * 60000

    if (!vigente || !tieneAlgo(datos)) {
      almacen.removeItem(LLAVE_BORRADOR)
      return null
    }

    return datos
  } catch {
    return null
  }
}

export function borrarBorrador(almacen = globalThis.sessionStorage) {
  try {
    almacen?.removeItem(LLAVE_BORRADOR)
  } catch {
    //  Sin almacenamiento no hay nada que borrar.
  }
}
