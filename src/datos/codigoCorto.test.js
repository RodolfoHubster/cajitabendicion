import { describe, expect, it } from 'vitest'
import { normalizarCodigoCorto, pareceCodigoCorto, textoParaBuscar } from './codigoCorto'

//  Los mismos ejemplos que prueba reglas.sql contra normalizar_codigo_corto():
//  la pantalla y la base leen el código igual.
describe('el código como lo teclea la gente', () => {
  it.each([
    ['cb 4871', 'CB-4871'],
    ['CB4871', 'CB-4871'],
    ['4871', 'CB-4871'],
    ['cb-487l', 'CB-4871'],
    ['CBO871', 'CB-0871'],
    ['CBO87l', 'CB-0871'],
    ['C8 4871', 'CB-4871'],
    ['  CB - 4871  ', 'CB-4871'],
    ['cb.4871', 'CB-4871'],
  ])('"%s" -> %s', (tecleado, esperado) => {
    expect(normalizarCodigoCorto(tecleado)).toBe(esperado)
  })

  it.each([
    ['Lili', 'LILI'],
    [' cb-prb2 ', 'CB-PRB2'],
    ['SC-1234', 'SC-1234'],
    ['12345', '12345'],
    ['CBOOII', 'CBOOII'],
    ['', ''],
  ])('"%s" no es un código corto: se queda como está (%s)', (tecleado, esperado) => {
    expect(normalizarCodigoCorto(tecleado)).toBe(esperado)
  })

  it('sin texto no truena', () => {
    expect(normalizarCodigoCorto(null)).toBe('')
    expect(normalizarCodigoCorto(undefined)).toBe('')
  })
})

describe('qué se manda a buscar', () => {
  it('un código se manda limpio', () => {
    expect(pareceCodigoCorto('cb 4871')).toBe(true)
    expect(textoParaBuscar('cb 4871')).toBe('CB-4871')
    expect(textoParaBuscar('4871')).toBe('CB-4871')
  })

  it('un nombre se manda tal cual, sin mayúsculas forzadas', () => {
    expect(pareceCodigoCorto('María García')).toBe(false)
    expect(textoParaBuscar('  María García ')).toBe('María García')
    expect(textoParaBuscar('Lili')).toBe('Lili')
  })

  it('un pedazo del código se busca como pedazo', () => {
    expect(textoParaBuscar('487')).toBe('487')
  })
})
