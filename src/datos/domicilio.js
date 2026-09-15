import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Domicilio en Mexico o Estados Unidos, revisado contra el catalogo de
 * codigos postales de California y Baja California (tabla codigos_postales,
 * datos de GeoNames). Sin API de mapas: las direcciones no salen de la base.
 *
 * En Estados Unidos se escribe como se acostumbra, en un solo renglon
 * ("7855 Lansing Dr"); aqui se separa en numero y calle para la base. En
 * Mexico calle y numero van en casillas separadas (el numero puede ser S/N).
 *
 * Estas reglas avisan a tiempo en la pantalla. Las mismas viven en
 * validar_domicilio() de la base, que es la que decide.
 */

export const PAISES_DOMICILIO = ['MX', 'US']

export const DOMICILIO_VACIO = Object.freeze({
  pais: 'US',
  codigoPostal: '',
  colonia: '',
  calle: '',
  numero: '',
  interior: '',
  sinDomicilio: false,
})

// Errores que la base lanza al registrar.
export const CODIGOS_DOMICILIO = [
  'PAIS_INVALIDO',
  'CODIGO_POSTAL_REQUERIDO',
  'CODIGO_POSTAL_INVALIDO',
  'CODIGO_POSTAL_NO_EXISTE',
  'COLONIA_REQUERIDA',
  'COLONIA_INVALIDA',
  'CALLE_REQUERIDA',
  'CALLE_INVALIDA',
  'NUMERO_REQUERIDO',
  'NUMERO_INVALIDO',
  'NUMERO_INTERIOR_INVALIDO',
  'CONSENTIMIENTO_REQUERIDO',
]

const limpiar = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim()

/** "92105-1234" (ZIP+4) -> "92105". */
export function normalizarCodigoPostal(texto) {
  const codigo = String(texto ?? '').trim()
  const zip4 = /^(\d{5})-\d{4}$/.exec(codigo)
  return zip4 ? zip4[1] : codigo
}

export function validarCodigoPostal(texto) {
  const codigo = normalizarCodigoPostal(texto)
  if (!codigo) return 'VACIO'
  if (!/^\d{5}$/.test(codigo)) return 'FORMATO'
  return null
}

/** Una calle tiene nombre: al menos 3 letras y no la misma repetida. */
export function validarCalle(texto) {
  const calle = limpiar(texto)
  if (!calle) return 'VACIO'
  if (calle.length > 120) return 'LARGO'

  const letras = calle.toLocaleLowerCase('es').match(/\p{L}/gu) ?? []
  if (letras.length < 3 || new Set(letras).size < 2) return 'SIN_LETRAS'

  return null
}

// El numero con el que empieza una direccion de Estados Unidos: 7855, 12B, 1234-5.
const DIRECCION_US = /^(\d{1,6}[A-Za-z]?(?:-[0-9A-Za-z]{1,4})?)\s+(.+)$/

/** "7855 Lansing Dr" -> { numero: '7855', calle: 'Lansing Dr' }. Sin numero al inicio, null. */
export function separarDireccionUS(texto) {
  const partes = DIRECCION_US.exec(limpiar(texto))
  return partes ? { numero: partes[1].toUpperCase(), calle: partes[2] } : null
}

/** Direccion de Estados Unidos en un renglon: numero de la casa y nombre de la calle. */
export function validarDireccionUS(texto) {
  const direccion = limpiar(texto)
  if (!direccion) return 'VACIO'
  if (direccion.length > 120) return 'LARGO'

  const partes = separarDireccionUS(direccion)
  // Solo el numero ("7855"): falta la calle. Sin numero al inicio: falta el numero.
  if (!partes) return /^\d/.test(direccion) ? 'SIN_LETRAS' : 'SIN_NUMERO'

  return validarCalle(partes.calle) ? 'SIN_LETRAS' : null
}

const SIN_NUMERO = new Set(['SN', 'S/N', 'S.N.', 'S-N'])

/** " 12 b " -> "12B". En Mexico, "sn" o "s.n." -> "S/N". */
export function normalizarNumero(texto, pais) {
  const numero = String(texto ?? '').replace(/\s+/g, '').toUpperCase()
  return pais === 'MX' && SIN_NUMERO.has(numero) ? 'S/N' : numero
}

export function validarNumero(texto, pais) {
  const numero = normalizarNumero(texto, pais)
  if (!numero) return 'VACIO'
  if (pais === 'MX' && numero === 'S/N') return null
  if (!/^\d{1,6}[A-Z]?(-[0-9A-Z]{1,4})?$/.test(numero)) return pais === 'MX' ? 'FORMATO_MX' : 'FORMATO'
  return null
}

export function normalizarInterior(texto) {
  return limpiar(texto).toUpperCase()
}

/** Opcional: "5", "B-2", "APT 3". */
export function validarInterior(texto) {
  const interior = normalizarInterior(texto)
  if (!interior) return null
  return /^[0-9A-Z #-]{1,10}$/.test(interior) ? null : 'FORMATO'
}

/** Las colonias de la busqueda, sin repetir y en orden. */
export function coloniasDe(busqueda) {
  const colonias = new Set((busqueda?.filas ?? []).map((fila) => fila.colonia).filter(Boolean))
  return [...colonias].sort((a, b) => a.localeCompare(b, 'es'))
}

const mismaColonia = (a, b) => a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es')

/**
 * Los errores de cada campo del domicilio: { codigoPostal: 'NO_EXISTE', ... }.
 * "busqueda" es lo que devuelve useCodigoPostal(). Si la busqueda fallo (sin
 * internet), el codigo postal no se bloquea aqui: la base lo revisa al guardar.
 */
export function validarDomicilio(domicilio, busqueda) {
  const { pais, codigoPostal, colonia, calle, numero, interior, sinDomicilio } = domicilio
  const errores = {}

  const errorCodigo = validarCodigoPostal(codigoPostal)
  if (errorCodigo) errores.codigoPostal = errorCodigo
  else if (busqueda?.estado === 'buscando') errores.codigoPostal = 'BUSCANDO'
  else if (busqueda?.estado === 'listo' && busqueda.filas.length === 0) errores.codigoPostal = 'NO_EXISTE'

  if (pais === 'MX' && !errores.codigoPostal && busqueda?.estado === 'listo') {
    const elegida = limpiar(colonia)

    if (!elegida) {
      if (!sinDomicilio) errores.colonia = 'VACIO'
    } else if (!coloniasDe(busqueda).some((nombre) => mismaColonia(nombre, elegida))) {
      errores.colonia = 'NO_COINCIDE'
    }
  }

  if (!sinDomicilio) {
    // En Estados Unidos el numero va dentro del domicilio; en Mexico, en su casilla.
    const errorCalle = pais === 'US' ? validarDireccionUS(calle) : validarCalle(calle)
    const errorNumero = pais === 'US' ? null : validarNumero(numero, pais)
    const errorInterior = validarInterior(interior)

    if (errorCalle) errores.calle = errorCalle
    if (errorNumero) errores.numero = errorNumero
    if (errorInterior) errores.interior = errorInterior
  }

  return errores
}

/** Lo que se manda a registrar_y_reservar() y registrar_desde_panel(). */
export function parametrosDomicilio(domicilio) {
  const { pais, codigoPostal, colonia, calle, numero, interior, sinDomicilio } = domicilio
  const us = pais === 'US' ? separarDireccionUS(calle) : null

  return {
    p_pais: pais,
    p_codigo_postal: normalizarCodigoPostal(codigoPostal),
    p_colonia: pais === 'MX' ? limpiar(colonia) || null : null,
    p_calle: sinDomicilio ? null : limpiar(us ? us.calle : calle),
    p_numero: sinDomicilio ? null : us ? us.numero : normalizarNumero(pais === 'US' ? '' : numero, pais),
    p_numero_interior: sinDomicilio ? null : normalizarInterior(interior) || null,
    p_sin_domicilio: Boolean(sinDomicilio),
  }
}

// Un mismo codigo postal no se vuelve a pedir en la misma visita.
const busquedas = new Map()

/** Ciudad, estado y (en Mexico) colonias de un codigo postal. [] si no existe. */
export async function buscarCodigoPostal(pais, codigo) {
  const clave = `${pais}-${codigo}`
  if (busquedas.has(clave)) return busquedas.get(clave)

  const { data, error } = await supabase.rpc('buscar_codigo_postal', { p_pais: pais, p_codigo: codigo })

  if (error) {
    throw new Error(clasificarError(error))
  }

  const filas = data ?? []
  busquedas.set(clave, filas)
  return filas
}

/** Para las pruebas. */
export function olvidarBusquedas() {
  busquedas.clear()
}
