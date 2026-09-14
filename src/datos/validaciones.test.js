import { describe, expect, it } from 'vitest'
import {
  distanciaEdicion,
  formatearNombre,
  limpiarEspacios,
  sugerirCorreo,
  validarCorreo,
  validarNombre,
} from './validaciones'

// La misma regla que revisa la base de datos al guardar el correo.
const FORMATO_BASE = /^[^@\s]+@[^@\s]+[.][^@\s]+$/

describe('limpiarEspacios', () => {
  it('quita espacios de mas', () => {
    expect(limpiarEspacios('  maría   josé  ')).toBe('maría josé')
    expect(limpiarEspacios(null)).toBe('')
  })
})

describe('validarNombre', () => {
  it.each([
    ['María'],
    ['  maría   josé '],
    ['García-López'],
    ["O'Brien"],
    ['O’Connor'],
    ['Nguyễn Văn An'],
    ['José de la Cruz'],
    ['J. R.'],
    ['李'],
    ['김'],
  ])('acepta %s', (texto) => {
    expect(validarNombre(texto)).toBeNull()
  })

  it.each([[''], ['   '], [null], [undefined]])('vacio: %s', (texto) => {
    expect(validarNombre(texto)).toBe('VACIO')
  })

  it.each([['Mar1a'], ['6641234567'], ['Juan 2']])('con numeros: %s', (texto) => {
    expect(validarNombre(texto)).toBe('NUMEROS')
  })

  it.each([['Ana_'], ['ana@gmail.com'], ['Juan!'], ['---'], ['...']])('con simbolos: %s', (texto) => {
    expect(validarNombre(texto)).toBe('SIMBOLOS')
  })

  it.each([['J'], ['J.']])('una sola letra: %s', (texto) => {
    expect(validarNombre(texto)).toBe('CORTO')
  })
})

describe('formatearNombre', () => {
  it.each([
    ['MARIA DE LA LUZ', 'Maria de la Luz'],
    ['maria de la luz', 'Maria de la Luz'],
    ['  josé   garcía-lópez ', 'José García-López'],
    ["o'brien", "O'Brien"],
    ['de la cruz', 'De la Cruz'],
    ['van der berg', 'Van der Berg'],
    ['nguyễn văn an', 'Nguyễn Văn An'],
    ['ÁLVARO ÑÚÑEZ', 'Álvaro Ñúñez'],
  ])('%s -> %s', (texto, esperado) => {
    expect(formatearNombre(texto)).toBe(esperado)
  })

  it('respeta mayusculas mezcladas a proposito', () => {
    expect(formatearNombre('DeLeon McDonald')).toBe('DeLeon McDonald')
  })

  it('un nombre formateado sigue siendo valido', () => {
    for (const nombre of ['MARIA DE LA LUZ', "o'brien", 'nguyễn văn an']) {
      expect(validarNombre(formatearNombre(nombre))).toBeNull()
    }
  })

  it('vacio', () => {
    expect(formatearNombre('   ')).toBe('')
  })
})

describe('validarCorreo', () => {
  it.each([
    ['juan@gmail.com'],
    [' juan@gmail.com '],
    ['ana.maria+caja@correo.com.mx'],
    ['JUAN@HOTMAIL.COM'],
    ['nguyen@ví-dụ.vn'],
  ])('acepta %s', (texto) => {
    expect(validarCorreo(texto)).toBeNull()
  })

  it.each([
    ['', 'VACIO'],
    ['   ', 'VACIO'],
    ['juan gmail.com', 'ESPACIOS'],
    ['juan@gmail .com', 'ESPACIOS'],
    ['juangmail.com', 'SIN_ARROBA'],
    ['juan@@gmail.com', 'VARIAS_ARROBAS'],
    ['juan@gmail@hotmail.com', 'VARIAS_ARROBAS'],
    ['@gmail.com', 'SIN_USUARIO'],
    ['juan@', 'SIN_DOMINIO'],
    ['juan@gmail', 'SIN_PUNTO'],
    ['juan@gmail.', 'DOMINIO_INVALIDO'],
    ['juan@.com', 'DOMINIO_INVALIDO'],
    ['juan@gmail..com', 'DOMINIO_INVALIDO'],
    ['juan@gmail.c', 'DOMINIO_INVALIDO'],
    ['juan@gmail.c0m', 'DOMINIO_INVALIDO'],
    ['juan@gm_ail.com', 'DOMINIO_INVALIDO'],
  ])('%s -> %s', (texto, codigo) => {
    expect(validarCorreo(texto)).toBe(codigo)
  })

  it('en el panel el correo es opcional', () => {
    expect(validarCorreo('', { requerido: false })).toBeNull()
    expect(validarCorreo('juan@', { requerido: false })).toBe('SIN_DOMINIO')
  })

  it('mientras se escribe, el mensaje va cambiando hasta desaparecer', () => {
    const pasos = ['j', 'juan', 'juan@', 'juan@gmail', 'juan@gmail.', 'juan@gmail.c', 'juan@gmail.com']
    expect(pasos.map((texto) => validarCorreo(texto))).toEqual([
      'SIN_ARROBA',
      'SIN_ARROBA',
      'SIN_DOMINIO',
      'SIN_PUNTO',
      'DOMINIO_INVALIDO',
      'DOMINIO_INVALIDO',
      null,
    ])
  })

  it('todo correo que se acepta aqui lo acepta tambien la base de datos', () => {
    for (const correo of ['juan@gmail.com', 'ana.maria+caja@correo.com.mx', 'nguyen@ví-dụ.vn']) {
      expect(validarCorreo(correo)).toBeNull()
      expect(correo).toMatch(FORMATO_BASE)
    }
  })
})

describe('sugerirCorreo', () => {
  it.each([
    ['juan@gmial.com', 'juan@gmail.com'],
    ['juan@gmai.com', 'juan@gmail.com'],
    ['juan@gmail.con', 'juan@gmail.com'],
    ['juan@hotmial.com', 'juan@hotmail.com'],
    ['juan@yaho.com', 'juan@yahoo.com'],
    ['juan@outlok.com', 'juan@outlook.com'],
    ['juan@gmail', 'juan@gmail.com'],
    ['juan@hotmail', 'juan@hotmail.com'],
  ])('%s -> %s', (texto, esperado) => {
    expect(sugerirCorreo(texto)).toBe(esperado)
  })

  it.each([['juan@gmail.com'], ['juan@mail.com'], ['juan@uabc.edu.mx'], ['juan'], ['juan@'], ['@gmail.com']])(
    'no sugiere nada: %s',
    (texto) => {
      expect(sugerirCorreo(texto)).toBeNull()
    },
  )
})

describe('distanciaEdicion', () => {
  it('cuenta los cambios', () => {
    expect(distanciaEdicion('gmail.com', 'gmail.com')).toBe(0)
    expect(distanciaEdicion('', 'abc')).toBe(3)
    expect(distanciaEdicion('kitten', 'sitting')).toBe(3)
    expect(distanciaEdicion('gmial.com', 'gmail.com')).toBe(2)
  })
})
