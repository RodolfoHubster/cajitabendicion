import { describe, expect, it } from 'vitest'
import es from '../i18n/es.json'
import en from '../i18n/en.json'
import vi from '../i18n/vi.json'
import { CASOS, PALABRAS, PARTES_VIDEO, PASOS_DEL_DIA, inicioDe, parteEn, reloj } from './ayudaFilaAPie'

const textoEn = (json, clave) => clave.split('.').reduce((nodo, parte) => nodo?.[parte], json)

//  Todas las claves que la ayuda arma con variables (los pasos de cada caso,
//  las partes del video): la prueba general de textos no las ve.
function clavesDeLaAyuda() {
  const claves = []
  for (const parte of PARTES_VIDEO) claves.push(`ayudaAPie.partes.${parte.clave}`)
  for (const paso of PASOS_DEL_DIA) claves.push(`ayudaAPie.pasos.lista.${paso.clave}.titulo`, `ayudaAPie.pasos.lista.${paso.clave}.texto`)
  for (const caso of CASOS) {
    const base = `ayudaAPie.casos.lista.${caso.clave}`
    claves.push(`${base}.pregunta`)
    if (caso.ves) claves.push(`${base}.ves`)
    if (caso.dile) claves.push(`${base}.dile`)
    for (let n = 1; n <= caso.haz; n++) claves.push(`${base}.haz${n}`)
  }
  for (const palabra of PALABRAS) claves.push(`ayudaAPie.palabras.lista.${palabra}.palabra`, `ayudaAPie.palabras.lista.${palabra}.significa`)
  return claves
}

describe('la ayuda de la fila a pie', () => {
  it('cada texto que arma existe en los tres idiomas', () => {
    for (const [nombre, json] of [['es', es], ['en', en], ['vi', vi]]) {
      const faltan = clavesDeLaAyuda().filter((clave) => typeof textoEn(json, clave) !== 'string' || !textoEn(json, clave).trim())
      expect(faltan, nombre).toEqual([])
    }
  })

  it('no le sobran pasos a ningun caso: el siguiente no existe', () => {
    for (const caso of CASOS) {
      expect(textoEn(es, `ayudaAPie.casos.lista.${caso.clave}.haz${caso.haz + 1}`), caso.clave).toBeUndefined()
      if (!caso.ves) expect(textoEn(es, `ayudaAPie.casos.lista.${caso.clave}.ves`), caso.clave).toBeUndefined()
      if (!caso.dile) expect(textoEn(es, `ayudaAPie.casos.lista.${caso.clave}.dile`), caso.clave).toBeUndefined()
    }
  })

  it('las partes del video van en orden, desde el segundo 0', () => {
    expect(PARTES_VIDEO[0].inicio).toBe(0)
    for (let i = 1; i < PARTES_VIDEO.length; i++) expect(PARTES_VIDEO[i].inicio).toBeGreaterThan(PARTES_VIDEO[i - 1].inicio)
  })

  it('cada paso y cada caso lleva a una parte que existe (o a ninguna)', () => {
    for (const { parte } of [...PASOS_DEL_DIA, ...CASOS]) {
      if (parte !== null) expect(inicioDe(parte), parte).not.toBeNull()
    }
  })

  it('reloj: minutos y segundos', () => {
    expect(reloj(0)).toBe('0:00')
    expect(reloj(98)).toBe('1:38')
    expect(reloj(605.9)).toBe('10:05')
    expect(reloj(-3)).toBe('0:00')
  })

  it('parteEn: la ultima parte que ya empezo', () => {
    const partes = [
      { clave: 'a', inicio: 0 },
      { clave: 'b', inicio: 10 },
      { clave: 'c', inicio: 20 },
    ]
    expect(parteEn(0, partes)).toBe('a')
    expect(parteEn(9.9, partes)).toBe('a')
    expect(parteEn(10, partes)).toBe('b')
    expect(parteEn(500, partes)).toBe('c')
  })

  it('inicioDe: null si la parte no existe', () => {
    expect(inicioDe('noExiste')).toBeNull()
    expect(inicioDe('bienvenida')).toBe(0)
  })
})
