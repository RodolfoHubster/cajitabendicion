/**
 * Validaciones del formulario. Devuelven un codigo seco ('SIN_ARROBA') o
 * null si todo esta bien; la pantalla lo traduce a un mensaje que diga que
 * falta. La base de datos vuelve a revisar lo esencial al guardar: esto es
 * para avisar a tiempo, no para proteger.
 */

export function limpiarEspacios(texto) {
  return (texto ?? '').replace(/\s+/g, ' ').trim()
}

// Escrituras donde un nombre de una sola letra es normal (李, 金).
const ESCRITURAS_SIN_MINIMO = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** Para nombres y para apellidos. */
export function validarNombre(texto) {
  const limpio = limpiarEspacios(texto)

  if (!limpio) return 'VACIO'
  if (/\d/.test(limpio)) return 'NUMEROS'
  // Letras de cualquier idioma (con acentos), espacios, guion, punto y apostrofo.
  if (!/^[\p{L}\p{M}' ’.-]+$/u.test(limpio)) return 'SIMBOLOS'

  const letras = (limpio.match(/\p{L}/gu) ?? []).length
  if (letras === 0) return 'SIMBOLOS'
  if (letras < 2 && !ESCRITURAS_SIN_MINIMO.test(limpio)) return 'CORTO'

  return null
}

const PARTICULAS = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'y',
  'e',
  'da',
  'das',
  'do',
  'dos',
  'di',
  'van',
  'von',
  'der',
  'den',
])

/**
 * "MARIA DE LA LUZ" o "maria de la luz" -> "Maria de la Luz". Asi las
 * listas quedan parejas aunque cada quien escriba distinto. Si una palabra
 * ya trae mayusculas y minusculas mezcladas (McDonald, DeLeon) se respeta.
 */
export function formatearNombre(texto) {
  return limpiarEspacios(texto)
    .split(' ')
    .filter(Boolean)
    .map((palabra, i) => {
      const minusculas = palabra.toLocaleLowerCase('es')
      const mayusculas = palabra.toLocaleUpperCase('es')
      const mezclada = palabra !== minusculas && palabra !== mayusculas

      if (mezclada) return palabra
      if (i > 0 && PARTICULAS.has(minusculas)) return minusculas

      // Mayuscula al inicio y despues de guion o apostrofo: Garcia-Lopez, O'Brien.
      return minusculas.replace(
        /(^|[-'’])(\p{L})/gu,
        (_, separador, letra) => separador + letra.toLocaleUpperCase('es'),
      )
    })
    .join(' ')
}

/**
 * Revisa el correo por partes para decir exactamente que falta.
 * Con requerido: false, un correo vacio es valido (registro desde el panel).
 */
export function validarCorreo(texto, { requerido = true } = {}) {
  const valor = (texto ?? '').trim()

  if (!valor) return requerido ? 'VACIO' : null
  if (/\s/.test(valor)) return 'ESPACIOS'

  const arrobas = (valor.match(/@/g) ?? []).length
  if (arrobas === 0) return 'SIN_ARROBA'
  if (arrobas > 1) return 'VARIAS_ARROBAS'

  const [usuario, dominio] = valor.split('@')
  if (!usuario) return 'SIN_USUARIO'
  if (!dominio) return 'SIN_DOMINIO'
  if (!dominio.includes('.')) return 'SIN_PUNTO'

  const terminacion = dominio.split('.').pop()
  if (
    dominio.startsWith('.') ||
    dominio.includes('..') ||
    /[^\p{L}\p{N}.-]/u.test(dominio) ||
    !/^\p{L}{2,}$/u.test(terminacion)
  ) {
    return 'DOMINIO_INVALIDO'
  }

  return null
}

const DOMINIOS_COMUNES = [
  'gmail.com',
  'hotmail.com',
  'yahoo.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'aol.com',
  'msn.com',
  'me.com',
  'mail.com',
  'gmx.com',
  'ymail.com',
  'protonmail.com',
  'yahoo.com.mx',
  'hotmail.es',
  'outlook.es',
  'prodigy.net.mx',
]

/** Cuantas letras hay que cambiar, quitar o poner para ir de a a b. */
export function distanciaEdicion(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j)

  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0]
    fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = arriba
    }
  }

  return fila[b.length]
}

/**
 * Dedazos comunes: "juan@gmial.com" -> "juan@gmail.com", "juan@hotmail" ->
 * "juan@hotmail.com". Solo sugiere; no bloquea el registro, porque un
 * dominio poco comun puede ser correcto.
 */
export function sugerirCorreo(texto) {
  const valor = (texto ?? '').trim()
  const partes = valor.split('@')
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null

  const dominio = partes[1].toLowerCase()
  if (DOMINIOS_COMUNES.includes(dominio)) return null

  // Sin terminacion: "gmail" -> "gmail.com".
  if (!dominio.includes('.')) {
    const completo = DOMINIOS_COMUNES.find((comun) => comun.startsWith(`${dominio}.`))
    return completo ? `${partes[0]}@${completo}` : null
  }

  let mejor = null
  let menor = 3
  for (const comun of DOMINIOS_COMUNES) {
    const distancia = distanciaEdicion(dominio, comun)
    if (distancia < menor) {
      mejor = comun
      menor = distancia
    }
  }

  return mejor ? `${partes[0]}@${mejor}` : null
}
