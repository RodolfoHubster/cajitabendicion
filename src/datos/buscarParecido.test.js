import { describe, expect, it } from 'vitest'
import { buscarParecidos, comoSuena, distancia, normalizar, puntaje } from './buscarParecido'

const p = (nombre, codigo_corto = 'CB-0000') => ({ nombre, codigo_corto })
const LISTA = [
  p('Xavier López Ruiz', 'CB-1001'),
  p('Javier Gómez', 'CB-1002'),
  p('María Fernanda Pérez', 'CB-2003'),
  p('Mario Hernández', 'CB-2004'),
  p('Jessica Valenzuela', 'CB-3005'),
  p('Ana Beltrán', 'CB-4871'),
  p('Pedro Ramírez', 'CB-5006'),
]
const nombres = (lista) => lista.map((x) => x.nombre)

describe('cómo suena', () => {
  it('Javier y Xavier suenan igual', () => {
    expect(comoSuena('xavier')).toBe(comoSuena('javier'))
  })

  it('b y v, s y z, c suave, ll y y, h muda, letras dobles', () => {
    expect(comoSuena('valenzuela')).toBe(comoSuena('balensuela'))
    expect(comoSuena('cecilia')).toBe(comoSuena('sesilia'))
    expect(comoSuena('guillermo')).toBe(comoSuena('guiyermo'))
    expect(comoSuena('hernandez')).toBe(comoSuena('ernandes'))
    expect(comoSuena('maaria')).toBe(comoSuena('maria'))
    expect(distancia(comoSuena('jessica'), comoSuena('yesica'))).toBe(1)
  })

  it('la ch no pierde la h', () => {
    expect(comoSuena('chavez')).toBe('chabes')
  })

  it('sin acentos ni mayúsculas', () => {
    expect(normalizar('  María   LÓPEZ ')).toBe('maria lopez')
  })

  it('cuántas letras hay que cambiar', () => {
    expect(distancia('maria', 'mario')).toBe(1)
    expect(distancia('ana', 'ana')).toBe(0)
  })
})

describe('buscar en la lista del día', () => {
  it('"Javier" encuentra a Javier y a Xavier, el escrito igual primero', () => {
    expect(nombres(buscarParecidos(LISTA, 'Javier'))).toEqual(['Javier Gómez', 'Xavier López Ruiz'])
    expect(nombres(buscarParecidos(LISTA, 'xavier'))[0]).toBe('Xavier López Ruiz')
  })

  it('"María" trae primero a María y después a Mario', () => {
    expect(nombres(buscarParecidos(LISTA, 'maria'))).toEqual(['María Fernanda Pérez', 'Mario Hernández'])
  })

  it('con letras de más o acentos de menos: "Maaria", "hernandes", "balenzuela"', () => {
    expect(nombres(buscarParecidos(LISTA, 'Maaria'))[0]).toBe('María Fernanda Pérez')
    expect(nombres(buscarParecidos(LISTA, 'ernandes'))).toEqual(['Mario Hernández'])
    expect(nombres(buscarParecidos(LISTA, 'balenzuela'))).toEqual(['Jessica Valenzuela'])
  })

  it('"Yesica" encuentra a Jessica (una letra de diferencia)', () => {
    expect(nombres(buscarParecidos(LISTA, 'yesica'))).toEqual(['Jessica Valenzuela'])
  })

  it('el principio del nombre basta: "ped" encuentra a Pedro', () => {
    expect(nombres(buscarParecidos(LISTA, 'ped'))).toEqual(['Pedro Ramírez'])
  })

  it('nombre y apellido juntos, en cualquier orden', () => {
    expect(nombres(buscarParecidos(LISTA, 'lopez xavier'))[0]).toBe('Xavier López Ruiz')
    expect(nombres(buscarParecidos(LISTA, 'xavier ruiz'))).toEqual(['Xavier López Ruiz'])
  })

  it('por código: "4871" o "CB-4871"', () => {
    expect(nombres(buscarParecidos(LISTA, '4871'))).toEqual(['Ana Beltrán'])
    expect(nombres(buscarParecidos(LISTA, 'cb 4871'))).toEqual(['Ana Beltrán'])
  })

  it('lo que no se parece no sale', () => {
    expect(buscarParecidos(LISTA, 'roberto')).toEqual([])
    expect(puntaje('roberto', LISTA[0])).toBe(Infinity)
  })

  it('sin texto, la lista completa en su orden', () => {
    expect(buscarParecidos(LISTA, '  ')).toHaveLength(LISTA.length)
    expect(buscarParecidos(null, 'x')).toEqual([])
  })
})
