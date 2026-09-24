import { PAISES } from './paises'

/** La norma internacional (E.164) permite hasta 15 digitos contando la lada. */
const E164_MAX = 15

export function buscarPais(codigo) {
  return PAISES.find((pais) => pais.codigo === codigo) ?? null
}

/** Cuantos digitos acepta el numero nacional de un pais. */
export function rangoDigitos(pais) {
  return { min: pais.min ?? 6, max: pais.max ?? E164_MAX - pais.lada.length }
}

/**
 * El pais cuya lada coincide con el inicio de los digitos. Las ladas no se
 * enciman entre si (no existe una "5" y una "52"), asi que la que coincide
 * es la correcta. Si varias comparten lada ("1" es Estados Unidos, Canada,
 * Puerto Rico...), se respeta el pais que ya estaba elegido.
 */
export function paisPorLada(digitos, preferido = null) {
  const candidatos = PAISES.filter((pais) => digitos.startsWith(pais.lada))
  if (candidatos.length === 0) return null

  const largo = Math.max(...candidatos.map((pais) => pais.lada.length))
  const mejores = candidatos.filter((pais) => pais.lada.length === largo)

  return mejores.find((pais) => pais.codigo === preferido) ?? mejores[0]
}

/**
 * Convierte lo que la persona escribio en un telefono internacional
 * ("+526641234567") o explica que esta mal.
 *
 * Acepta como la gente lo escribe de verdad:
 *   * con espacios, guiones, puntos o parentesis: (619) 555-1234
 *   * con la lada y "+" o "00": +52 664 123 4567, 0052 664 123 4567
 *     (y el pais cambia al que corresponde esa lada)
 *   * con la lada sin "+": 1 619 555 1234, 52 664 123 4567
 *   * Mexico con el "1" de celular de antes o 044/045: +52 1 664..., 044 664...
 *   * con el 0 de larga distancia: 090-1234-5678 en Japon
 *
 * Devuelve { valido: true, pais, lada, nacional, e164 } o
 * { valido: false, error, pais, min, max, llevan }.
 */
export function normalizarTelefono(codigoPais, texto) {
  let pais = buscarPais(codigoPais) ?? buscarPais('US')
  const crudo = (texto ?? '').trim()

  const fallo = (error, nacional = '') => {
    const { min, max } = rangoDigitos(pais)
    return { valido: false, error, pais: pais.codigo, min, max, llevan: nacional.length }
  }

  if (!crudo) return fallo('VACIO')

  // Solo numeros y separadores comunes; el "+" solo al principio y una vez.
  // El guion largo (– —) llega al copiar un numero de las notas o de
  // WhatsApp: es un separador mas, no un error.
  if (/[^\d\s()+.\-–—]/.test(crudo) || crudo.lastIndexOf('+') > 0) return fallo('CARACTERES')

  let digitos = crudo.replace(/\D/g, '')
  let conLada = crudo.startsWith('+')

  if (!conLada && digitos.startsWith('00')) {
    conLada = true
    digitos = digitos.slice(2)
  }

  if (conLada) {
    const detectado = paisPorLada(digitos, pais.codigo)
    if (!detectado) return fallo('LADA_DESCONOCIDA')
    pais = detectado
    digitos = digitos.slice(pais.lada.length)
  }

  const { min, max } = rangoDigitos(pais)
  let nacional = digitos

  // Mexico: 044 y 045 eran los prefijos para marcar a celular.
  if (pais.codigo === 'MX' && /^04[45]\d{10}$/.test(nacional)) nacional = nacional.slice(3)

  // El 0 de larga distancia no forma parte del numero internacional.
  // Italia es la excepcion: ahi el 0 si es parte del numero.
  if (pais.codigo !== 'IT') nacional = nacional.replace(/^0+/, '')

  // Escribio la lada sin "+": 1 619 555 1234 o 52 664 123 4567.
  if (!conLada && nacional.length > max && nacional.startsWith(pais.lada)) {
    nacional = nacional.slice(pais.lada.length)
  }

  // Mexico: el "1" que antes se ponia despues del +52 para celulares.
  if (pais.codigo === 'MX' && nacional.length === max + 1 && nacional.startsWith('1')) {
    nacional = nacional.slice(1)
  }

  if (nacional.length < min) return fallo('CORTO', nacional)
  if (nacional.length > max) return fallo('LARGO', nacional)

  // En Estados Unidos, Canada y Mexico ningun numero empieza con 1: si
  // empieza asi, se escribio la lada y falta un digito.
  if ((pais.lada === '1' || pais.codigo === 'MX') && nacional.startsWith('1')) {
    return fallo('EMPIEZA_CON_1', nacional)
  }

  return {
    valido: true,
    pais: pais.codigo,
    lada: pais.lada,
    nacional,
    e164: `+${pais.lada}${nacional}`,
  }
}
