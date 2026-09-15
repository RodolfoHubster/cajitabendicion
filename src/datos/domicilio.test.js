import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vi_ from '../i18n/vi.json'
import { supabase } from '../lib/supabase'
import {
  CODIGOS_DOMICILIO,
  DOMICILIO_VACIO,
  buscarCodigoPostal,
  coloniasDe,
  normalizarCodigoPostal,
  normalizarInterior,
  normalizarNumero,
  olvidarBusquedas,
  parametrosDomicilio,
  validarCalle,
  validarCodigoPostal,
  validarDomicilio,
  validarInterior,
  validarNumero,
} from './domicilio'

beforeEach(() => {
  supabase.rpc.mockReset()
  olvidarBusquedas()
})

const LISTO_US = { estado: 'listo', filas: [{ ciudad: 'San Diego', colonia: null, municipio: 'San Diego', estado: 'California' }] }
const LISTO_MX = {
  estado: 'listo',
  filas: [
    { ciudad: 'Tijuana', colonia: 'Zona Norte', municipio: 'Tijuana', estado: 'Baja California' },
    { ciudad: 'Tijuana', colonia: 'Zona Centro', municipio: 'Tijuana', estado: 'Baja California' },
    { ciudad: 'Tijuana', colonia: 'Zona Centro', municipio: 'Tijuana', estado: 'Baja California' },
  ],
}

const US = { ...DOMICILIO_VACIO, pais: 'US', codigoPostal: '92105', calle: 'El Cajon Blvd', numero: '4250' }
const MX = { ...DOMICILIO_VACIO, pais: 'MX', codigoPostal: '22000', colonia: 'Zona Centro', calle: 'Av. Revolución', numero: '1234' }

describe('codigo postal', () => {
  it.each([
    ['92105', '92105'],
    [' 92105 ', '92105'],
    ['92105-1234', '92105'],
    ['2200', '2200'],
    [null, ''],
  ])('normaliza %j -> %j', (entrada, salida) => {
    expect(normalizarCodigoPostal(entrada)).toBe(salida)
  })

  it.each([
    ['92105', null],
    ['22000', null],
    ['92105-1234', null],
    ['', 'VACIO'],
    ['   ', 'VACIO'],
    ['9210', 'FORMATO'],
    ['921055', 'FORMATO'],
    ['92A05', 'FORMATO'],
    ['.', 'FORMATO'],
  ])('%j -> %j', (codigo, esperado) => {
    expect(validarCodigoPostal(codigo)).toBe(esperado)
  })
})

describe('calle', () => {
  it.each([
    ['Av. Revolución', null],
    ['El Cajon Blvd', null],
    ['Calle 5 de Mayo', null],
    ['Oak', null],
    ['', 'VACIO'],
    ['   ', 'VACIO'],
    ['.', 'SIN_LETRAS'],
    ['123', 'SIN_LETRAS'],
    ['aaaa', 'SIN_LETRAS'],
    ['AAaa a', 'SIN_LETRAS'],
    ['x'.repeat(121), 'LARGO'],
  ])('%j -> %j', (calle, esperado) => {
    expect(validarCalle(calle)).toBe(esperado)
  })
})

describe('numero', () => {
  it.each([
    ['4250', 'US', null],
    ['12-B', 'US', null],
    ['12b', 'US', null],
    ['12 34', 'US', null],
    ['1234-5', 'MX', null],
    ['s/n', 'MX', null],
    ['SN', 'MX', null],
    ['S/N', 'US', 'FORMATO'],
    ['', 'MX', 'VACIO'],
    ['abc', 'MX', 'FORMATO_MX'],
    ['abc', 'US', 'FORMATO'],
    ['.', 'US', 'FORMATO'],
    ['1234567', 'US', 'FORMATO'],
  ])('%j en %s -> %j', (numero, pais, esperado) => {
    expect(validarNumero(numero, pais)).toBe(esperado)
  })

  it.each([
    [' 12 b ', 'US', '12B'],
    ['s.n.', 'MX', 'S/N'],
    ['sn', 'US', 'SN'],
  ])('normaliza %j en %s -> %j', (numero, pais, esperado) => {
    expect(normalizarNumero(numero, pais)).toBe(esperado)
  })
})

describe('interior', () => {
  it.each([
    ['', null],
    ['5', null],
    ['b-2', null],
    ['Apt 3', null],
    ['#4', null],
    ['5;drop', 'FORMATO'],
    ['12345678901', 'FORMATO'],
  ])('%j -> %j', (interior, esperado) => {
    expect(validarInterior(interior)).toBe(esperado)
  })

  it('normaliza espacios y mayusculas', () => {
    expect(normalizarInterior(' apt  3 ')).toBe('APT 3')
  })
})

describe('validarDomicilio', () => {
  it('un domicilio completo de cada pais no tiene errores', () => {
    expect(validarDomicilio(US, LISTO_US)).toEqual({})
    expect(validarDomicilio(MX, LISTO_MX)).toEqual({})
  })

  it('vacio: faltan codigo postal, calle y numero', () => {
    expect(validarDomicilio(DOMICILIO_VACIO, { estado: 'vacio', filas: [] })).toEqual({
      codigoPostal: 'VACIO',
      calle: 'VACIO',
      numero: 'VACIO',
    })
  })

  it('mientras busca el codigo, no deja enviar', () => {
    expect(validarDomicilio(US, { estado: 'buscando', filas: [] })).toEqual({ codigoPostal: 'BUSCANDO' })
  })

  it('un codigo que no esta en el catalogo', () => {
    expect(validarDomicilio(US, { estado: 'listo', filas: [] })).toEqual({ codigoPostal: 'NO_EXISTE' })
  })

  it('si la busqueda fallo (sin internet), no bloquea: decide la base', () => {
    expect(validarDomicilio(US, { estado: 'fallo', filas: [] })).toEqual({})
  })

  it('en Mexico la colonia es obligatoria y tiene que ser de ese codigo', () => {
    expect(validarDomicilio({ ...MX, colonia: '' }, LISTO_MX)).toEqual({ colonia: 'VACIO' })
    expect(validarDomicilio({ ...MX, colonia: 'zona  centro ' }, LISTO_MX)).toEqual({})
    expect(validarDomicilio({ ...MX, colonia: 'Colonia Inventada' }, LISTO_MX)).toEqual({ colonia: 'NO_COINCIDE' })
  })

  it('en Estados Unidos no se pide colonia', () => {
    expect(validarDomicilio({ ...US, colonia: '' }, LISTO_US)).toEqual({})
  })

  it('sin domicilio fijo basta el codigo postal (la calle no se revisa)', () => {
    expect(validarDomicilio({ ...DOMICILIO_VACIO, codigoPostal: '92105', calle: '.', sinDomicilio: true }, LISTO_US)).toEqual({})
    expect(validarDomicilio({ ...MX, colonia: '', calle: '', numero: '', sinDomicilio: true }, LISTO_MX)).toEqual({})
    expect(validarDomicilio({ ...MX, colonia: 'Inventada', sinDomicilio: true }, LISTO_MX)).toEqual({ colonia: 'NO_COINCIDE' })
    expect(validarDomicilio({ ...DOMICILIO_VACIO, sinDomicilio: true }, { estado: 'vacio', filas: [] })).toEqual({
      codigoPostal: 'VACIO',
    })
  })

  it('los errores de cada campo se combinan', () => {
    expect(validarDomicilio({ ...US, calle: '.', numero: 'abc', interior: '5;x' }, LISTO_US)).toEqual({
      calle: 'SIN_LETRAS',
      numero: 'FORMATO',
      interior: 'FORMATO',
    })
  })

  it('coloniasDe: sin repetir y en orden', () => {
    expect(coloniasDe(LISTO_MX)).toEqual(['Zona Centro', 'Zona Norte'])
    expect(coloniasDe(LISTO_US)).toEqual([])
    expect(coloniasDe(undefined)).toEqual([])
  })
})

describe('parametrosDomicilio', () => {
  it('Mexico: todo limpio y normalizado', () => {
    expect(
      parametrosDomicilio({
        pais: 'MX',
        codigoPostal: ' 22000 ',
        colonia: ' Zona  Centro ',
        calle: ' Av.  Revolución ',
        numero: '1234-b',
        interior: ' 5 ',
        sinDomicilio: false,
      }),
    ).toEqual({
      p_pais: 'MX',
      p_codigo_postal: '22000',
      p_colonia: 'Zona Centro',
      p_calle: 'Av. Revolución',
      p_numero: '1234-B',
      p_numero_interior: '5',
      p_sin_domicilio: false,
    })
  })

  it('Estados Unidos: sin colonia; interior vacio va como null', () => {
    expect(parametrosDomicilio({ ...US, colonia: 'algo', codigoPostal: '92105-1234' })).toMatchObject({
      p_pais: 'US',
      p_codigo_postal: '92105',
      p_colonia: null,
      p_numero_interior: null,
    })
  })

  it('sin domicilio fijo: calle, numero e interior van como null', () => {
    expect(parametrosDomicilio({ ...US, sinDomicilio: true })).toMatchObject({
      p_calle: null,
      p_numero: null,
      p_numero_interior: null,
      p_sin_domicilio: true,
    })
  })
})

describe('buscarCodigoPostal', () => {
  it('pide el codigo a la base y no lo vuelve a pedir en la misma visita', async () => {
    supabase.rpc.mockResolvedValue({ data: LISTO_MX.filas, error: null })

    await expect(buscarCodigoPostal('MX', '22000')).resolves.toEqual(LISTO_MX.filas)
    await expect(buscarCodigoPostal('MX', '22000')).resolves.toEqual(LISTO_MX.filas)

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('buscar_codigo_postal', { p_pais: 'MX', p_codigo: '22000' })
  })

  it('otro pais con el mismo numero es otra busqueda; sin datos, lista vacia', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    await expect(buscarCodigoPostal('US', '22000')).resolves.toEqual([])
    await buscarCodigoPostal('MX', '22000')

    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('sin la migracion, avisa que falta instalarla', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(buscarCodigoPostal('US', '92105')).rejects.toThrow('FUNCION_NO_INSTALADA')
  })
})

describe('textos en pantalla', () => {
  const AVISOS = {
    codigoPostal: ['VACIO', 'FORMATO', 'NO_EXISTE', 'BUSCANDO'],
    colonia: ['VACIO', 'NO_COINCIDE'],
    calle: ['VACIO', 'SIN_LETRAS', 'LARGO'],
    numero: ['VACIO', 'FORMATO', 'FORMATO_MX'],
    interior: ['FORMATO'],
  }

  it.each([
    ['es', es],
    ['en', en],
    ['vi', vi_],
  ])('cada aviso de los campos tiene su mensaje (%s)', (_, textos) => {
    for (const [campo, codigos] of Object.entries(AVISOS)) {
      for (const codigo of codigos) expect(textos.domicilio.errores[campo][codigo], `${campo}.${codigo}`).toBeTruthy()
    }
    for (const pais of ['MX', 'US']) {
      expect(textos.domicilio.codigoPostal[pais]).toBeTruthy()
      expect(textos.domicilio.paises[pais]).toBeTruthy()
    }
  })

  it.each(CODIGOS_DOMICILIO)('el error %s de la base tiene su mensaje', (codigo) => {
    expect(es.registro.errores[codigo]).toBeTruthy()
  })
})
