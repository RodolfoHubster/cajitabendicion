import { describe, expect, it } from 'vitest'
import { PAISES, PRINCIPALES } from './paises'
import { buscarPais, normalizarTelefono, paisPorLada, rangoDigitos } from './telefono'

// La misma regla que revisa la base de datos al guardar.
const FORMATO_BASE = /^\+[1-9]\d{6,14}$/

const valido = (pais, texto) => normalizarTelefono(pais, texto)

describe('lista de paises', () => {
  it('Estados Unidos, Mexico, China, Japon y Vietnam van primero', () => {
    expect(PRINCIPALES).toEqual(['US', 'MX', 'CN', 'JP', 'VN'])
    expect(PAISES.slice(0, 5).map((p) => p.codigo)).toEqual(PRINCIPALES)
  })

  it('no repite paises', () => {
    const codigos = PAISES.map((p) => p.codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it('cada lada son 1 a 3 digitos y cada rango cabe en 15 digitos', () => {
    for (const pais of PAISES) {
      expect(pais.lada, pais.codigo).toMatch(/^[1-9]\d{0,2}$/)
      const { min, max } = rangoDigitos(pais)
      expect(min, pais.codigo).toBeLessThanOrEqual(max)
      expect(pais.lada.length + max, pais.codigo).toBeLessThanOrEqual(15)
    }
  })

  it('ninguna lada es el principio de otra distinta (si no, la deteccion fallaria)', () => {
    for (const a of PAISES) {
      for (const b of PAISES) {
        if (a.lada !== b.lada) expect(b.lada.startsWith(a.lada), `${a.codigo} ${b.codigo}`).toBe(false)
      }
    }
  })

  it('buscarPais', () => {
    expect(buscarPais('MX').lada).toBe('52')
    expect(buscarPais('XX')).toBeNull()
  })
})

describe('paisPorLada', () => {
  it('reconoce la lada al principio', () => {
    expect(paisPorLada('526641234567').codigo).toBe('MX')
    expect(paisPorLada('50255551234').codigo).toBe('GT')
    expect(paisPorLada('819012345678').codigo).toBe('JP')
  })

  it('con lada compartida elige Estados Unidos, salvo que ya estuviera elegido otro de lada 1', () => {
    expect(paisPorLada('16045551234').codigo).toBe('US')
    expect(paisPorLada('16045551234', 'CA').codigo).toBe('CA')
    expect(paisPorLada('16045551234', 'MX').codigo).toBe('US')
  })

  it('una lada que no existe', () => {
    expect(paisPorLada('9991234')).toBeNull()
  })
})

describe('Estados Unidos', () => {
  it.each([
    ['6195551234'],
    ['(619) 555-1234'],
    ['619.555.1234'],
    ['619 555 1234'],
    ['  619-555-1234  '],
    ['1 619 555 1234'],
    ['1-619-555-1234'],
    ['+1 619 555 1234'],
    ['+1 (619) 555-1234'],
    ['001 619 555 1234'],
  ])('acepta %s', (texto) => {
    expect(valido('US', texto)).toMatchObject({ valido: true, pais: 'US', e164: '+16195551234' })
  })

  it('9 digitos: faltan', () => {
    expect(valido('US', '619 555 123')).toMatchObject({ valido: false, error: 'CORTO', llevan: 9, min: 10, max: 10 })
  })

  it('11 digitos que no empiezan con 1: sobran', () => {
    expect(valido('US', '619 555 12345')).toMatchObject({ valido: false, error: 'LARGO', llevan: 11 })
  })

  it('12 digitos: sobran aunque empiece con 1', () => {
    expect(valido('US', '1 619 555 12345')).toMatchObject({ valido: false, error: 'LARGO' })
  })

  it('empieza con 1 y trae 10 digitos: puso la lada y le falta uno', () => {
    expect(valido('US', '1619555123')).toMatchObject({ valido: false, error: 'EMPIEZA_CON_1' })
  })

  it.each([['619-555-12a4'], ['619 555 1234 ext 2'], ['619+5551234'], ['++16195551234'], ['619#5551234']])(
    'letras o simbolos: %s',
    (texto) => {
      expect(valido('US', texto)).toMatchObject({ valido: false, error: 'CARACTERES' })
    },
  )

  it.each([[''], ['   '], [null], [undefined]])('vacio: %s', (texto) => {
    expect(valido('US', texto)).toMatchObject({ valido: false, error: 'VACIO' })
  })
})

describe('Mexico', () => {
  it.each([
    ['6641234567'],
    ['664 123 4567'],
    ['(664) 123-4567'],
    ['52 664 123 4567'],
    ['+52 664 123 4567'],
    ['+52 1 664 123 4567'],
    ['521 664 123 4567'],
    ['0052 664 123 4567'],
    ['044 664 123 4567'],
    ['045 664 123 4567'],
  ])('acepta %s', (texto) => {
    expect(valido('MX', texto)).toMatchObject({ valido: true, pais: 'MX', e164: '+526641234567' })
  })

  it('con +52 cambia a Mexico aunque estuviera elegido Estados Unidos', () => {
    expect(valido('US', '+52 664 123 4567')).toMatchObject({ valido: true, pais: 'MX', e164: '+526641234567' })
    expect(valido('US', '0052 664 123 4567')).toMatchObject({ valido: true, pais: 'MX' })
  })

  it('un numero de Mexico con Estados Unidos elegido y sin lada: sobran o faltan, no se inventa', () => {
    expect(valido('US', '52 664 123 4567')).toMatchObject({ valido: false, error: 'LARGO' })
  })

  it('9 digitos: faltan', () => {
    expect(valido('MX', '664 123 456')).toMatchObject({ valido: false, error: 'CORTO', llevan: 9 })
  })

  it('11 digitos que no empiezan con 1: sobran', () => {
    expect(valido('MX', '664 123 45678')).toMatchObject({ valido: false, error: 'LARGO', llevan: 11 })
  })

  it('empieza con 1 y trae 10 digitos: falta uno', () => {
    expect(valido('MX', '166 412 3456')).toMatchObject({ valido: false, error: 'EMPIEZA_CON_1' })
  })
})

describe('China, Japon y Vietnam', () => {
  it('China: celular de 11 digitos', () => {
    expect(valido('CN', '138 0013 8000')).toMatchObject({ valido: true, e164: '+8613800138000' })
    expect(valido('US', '+86 138 0013 8000')).toMatchObject({ valido: true, pais: 'CN' })
  })

  it('China: faltan o sobran', () => {
    expect(valido('CN', '138001380')).toMatchObject({ error: 'CORTO' })
    expect(valido('CN', '138001380001')).toMatchObject({ error: 'LARGO' })
  })

  it('Japon: quita el 0 de larga distancia', () => {
    expect(valido('JP', '090-1234-5678')).toMatchObject({ valido: true, e164: '+819012345678' })
    expect(valido('JP', '03-1234-5678')).toMatchObject({ valido: true, e164: '+81312345678' })
    expect(valido('US', '+81 90 1234 5678')).toMatchObject({ valido: true, pais: 'JP', e164: '+819012345678' })
  })

  it('Vietnam: quita el 0 de larga distancia', () => {
    expect(valido('VN', '091 234 5678')).toMatchObject({ valido: true, e164: '+84912345678' })
    expect(valido('US', '+84 91 234 5678')).toMatchObject({ valido: true, pais: 'VN' })
  })
})

describe('otros paises y casos raros', () => {
  it('Guatemala: 8 digitos', () => {
    expect(valido('GT', '5555 1234')).toMatchObject({ valido: true, e164: '+50255551234' })
    expect(valido('GT', '5555 123')).toMatchObject({ error: 'CORTO' })
  })

  it('Canada comparte lada con Estados Unidos y se respeta', () => {
    expect(valido('CA', '+1 604 555 1234')).toMatchObject({ valido: true, pais: 'CA' })
  })

  it('Italia conserva el 0 porque ahi si es parte del numero', () => {
    expect(valido('US', '+39 06 1234 5678')).toMatchObject({ valido: true, pais: 'IT', e164: '+390612345678' })
  })

  it('pais sin rango propio usa el general (Austria)', () => {
    expect(valido('AT', '1 234567')).toMatchObject({ valido: true, e164: '+431234567' })
    expect(valido('AT', '12345678901234')).toMatchObject({ error: 'LARGO' })
  })

  it('lada que no existe', () => {
    expect(valido('US', '+999 123 4567')).toMatchObject({ valido: false, error: 'LADA_DESCONOCIDA', pais: 'US' })
  })

  it('un codigo de pais desconocido usa Estados Unidos', () => {
    expect(valido('ZZ', '619 555 1234')).toMatchObject({ valido: true, pais: 'US' })
  })

  it('solo el +: todavia no hay lada', () => {
    expect(valido('US', '+')).toMatchObject({ valido: false, error: 'LADA_DESCONOCIDA' })
  })
})

describe('todo telefono aceptado lo acepta tambien la base de datos', () => {
  const casos = [
    ['US', '(619) 555-1234'],
    ['MX', '+52 1 664 123 4567'],
    ['CN', '138 0013 8000'],
    ['JP', '090-1234-5678'],
    ['VN', '091 234 5678'],
    ['GT', '5555 1234'],
    ['IT', '+39 06 1234 5678'],
    ['AT', '1 234567'],
    ['BR', '11 91234 5678'],
  ]

  it.each(casos)('%s %s', (pais, texto) => {
    const resultado = valido(pais, texto)
    expect(resultado.valido).toBe(true)
    expect(resultado.e164).toMatch(FORMATO_BASE)
  })

  it('en todos los paises, el numero mas largo permitido cabe en la regla de la base', () => {
    for (const pais of PAISES) {
      const { max } = rangoDigitos(pais)
      const resultado = valido(pais.codigo, `+${pais.lada}${'5'.repeat(max)}`)
      expect(resultado.valido, pais.codigo).toBe(true)
      expect(resultado.e164, pais.codigo).toMatch(FORMATO_BASE)
    }
  })
})
