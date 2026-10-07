/**
 * Buscar nombres "como suenan", para la lista del escaner.
 *
 * El voluntario escribe lo que oye: "Javier" y la persona se llama
 * "Xavier"; "Maria" y es "Mario"; "Yesica" y es "Jessica". Se compara como
 * suena en espanol (sin acentos, b = v, s = z = c suave, j = g suave = x al
 * inicio, ll = y, h muda, letras dobles como una) y se perdona una o dos
 * letras de diferencia. Primero las coincidencias exactas; abajo, las que
 * se parecen menos.
 */

/** 'María  LÓPEZ' -> 'maria lopez'. Sin acentos ni signos. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Como suena una palabra (ya normalizada). */
export function comoSuena(palabra) {
  let p = String(palabra ?? '')
  if (!p) return ''
  p = p
    .replace(/^x/, 'j') // Xavier, Ximena
    .replace(/ch/g, '%') // la ch se queda (la h de "ch" no es muda)
    .replace(/ph/g, 'f')
    .replace(/qu/g, 'k')
    .replace(/q/g, 'k')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/g([ei])/g, 'j$1')
    .replace(/gu([ei])/g, 'g$1')
    .replace(/x/g, 'ks')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/w/g, 'u')
    .replace(/ll/g, 'y')
    .replace(/h/g, '')
    .replace(/y$/, 'i') // Nery = Neri
    .replace(/y(?=[^aeiou]|$)/g, 'i')
    .replace(/(.)\1+/g, '$1') // Maaria, Jessica, Carro
  return p.replace(/%/g, 'ch')
}

/** Cuantas letras hay que cambiar para pasar de una palabra a otra. */
export function distancia(a, b) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    anterior = actual
  }
  return anterior[b.length]
}

const SIN_COINCIDENCIA = 3

/** Que tanto se parece una palabra buscada a una palabra del nombre: 0 es identica. */
function costoPalabra(buscada, delNombre) {
  if (buscada === delNombre) return 0
  if (delNombre.startsWith(buscada)) return 0.1
  const a = comoSuena(buscada)
  const b = comoSuena(delNombre)
  if (a === b) return 0.2
  if (b.startsWith(a) && a.length >= 2) return 0.3
  //  Se perdona una letra en palabras cortas y dos en las largas.
  const permitidas = a.length <= 4 ? 1 : 2
  const d = distancia(a, b.slice(0, Math.max(a.length, b.length)))
  if (d <= permitidas) return 0.5 + d * 0.2
  return SIN_COINCIDENCIA
}

/**
 * Que tanto se parece lo buscado a una persona (nombre y codigo). Infinity
 * si no se parece. Cada palabra buscada toma la palabra del nombre que mas
 * se le parezca.
 */
export function puntaje(texto, persona) {
  const palabras = normalizar(texto).split(' ').filter(Boolean)
  if (palabras.length === 0) return 0

  const nombre = normalizar(persona?.nombre).split(' ').filter(Boolean)
  const digitosCodigo = String(persona?.codigo_corto ?? '').replace(/\D/g, '')
  let total = 0
  let encontradas = 0

  for (const palabra of palabras) {
    //  Numeros: se buscan en el codigo CB.
    if (/^\d+$/.test(palabra)) {
      if (digitosCodigo.includes(palabra)) {
        total += digitosCodigo === palabra ? 0 : 0.1
        encontradas += 1
      } else {
        total += SIN_COINCIDENCIA
      }
      continue
    }
    if (palabra === 'cb') continue
    const mejor = Math.min(SIN_COINCIDENCIA, ...nombre.map((parte) => costoPalabra(palabra, parte)))
    if (mejor < SIN_COINCIDENCIA) encontradas += 1
    total += mejor
  }

  //  Todas las palabras tienen que parecerse a algo; si no, no es esa persona.
  const contadas = palabras.filter((p) => p !== 'cb').length
  if (contadas === 0 || encontradas < contadas) return Infinity
  return total / contadas
}

/** La lista ordenada: primero lo mas parecido. Sin texto, la lista como viene. */
export function buscarParecidos(lista, texto) {
  if (!normalizar(texto)) return [...(lista ?? [])]
  return (lista ?? [])
    .map((persona, posicion) => ({ persona, costo: puntaje(texto, persona), posicion }))
    .filter((r) => Number.isFinite(r.costo))
    .sort((a, b) => a.costo - b.costo || a.posicion - b.posicion)
    .map((r) => r.persona)
}
