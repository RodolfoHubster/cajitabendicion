import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import { normalizarTelefono } from '../datos/telefono'
import { validarCorreo, validarNombre } from '../datos/validaciones'
import { mensajeCorreo, mensajeNombre, mensajeTelefono, nombrePais } from './mensajesValidacion'

// Con las traducciones reales: asi se prueba el mensaje exacto que ve la persona.
let tEs
let tEn

beforeAll(async () => {
  const espanol = i18next.createInstance()
  await espanol.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
  tEs = espanol.t.bind(espanol)

  const ingles = i18next.createInstance()
  await ingles.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } })
  tEn = ingles.t.bind(ingles)
})

describe('nombrePais', () => {
  it('en el idioma de la pagina', () => {
    expect(nombrePais('MX', 'es')).toBe('México')
    expect(nombrePais('JP', 'en')).toBe('Japan')
  })
})

describe('mensajeTelefono', () => {
  it('telefono correcto: sin mensaje', () => {
    expect(mensajeTelefono(tEs, normalizarTelefono('MX', '664 123 4567'), 'es')).toBeUndefined()
  })

  it('faltan digitos: dice el pais, cuantos lleva y cuantos escribio', () => {
    expect(mensajeTelefono(tEs, normalizarTelefono('MX', '664 123 456'), 'es')).toBe(
      'Faltan dígitos: un teléfono de México lleva 10 dígitos y escribiste 9.',
    )
    expect(mensajeTelefono(tEn, normalizarTelefono('MX', '664 123 456'), 'en')).toBe(
      'Digits are missing: a phone number from Mexico has 10 digits and you wrote 9.',
    )
  })

  it('pais con rango: "entre 10 y 11"', () => {
    const mensaje = mensajeTelefono(tEs, normalizarTelefono('CN', '138001380001'), 'es')
    expect(mensaje).toContain('China')
    expect(mensaje).toContain('entre 10 y 11')
    expect(mensaje).toContain('12')
  })

  it('empieza con 1', () => {
    const mensaje = mensajeTelefono(tEs, normalizarTelefono('US', '1619555123'), 'es')
    expect(mensaje).toContain('Estados Unidos')
    expect(mensaje).toContain('10')
  })

  it('cada error del telefono produce un mensaje real, no la llave', () => {
    const casos = [
      ['US', ''],
      ['US', '619-555-12a4'],
      ['US', '+999 123'],
      ['US', '619 555 123'],
      ['US', '619 555 12345'],
      ['US', '1619555123'],
    ]
    for (const [pais, texto] of casos) {
      const mensaje = mensajeTelefono(tEs, normalizarTelefono(pais, texto), 'es')
      expect(mensaje, texto).toBeTruthy()
      expect(mensaje, texto).not.toContain('validacion.')
      expect(mensaje, texto).not.toContain('{{')
    }
  })
})

describe('mensajes de nombre y correo', () => {
  it('nombre y apellidos tienen su propio mensaje', () => {
    expect(mensajeNombre(tEs, validarNombre(''), 'nombres')).toBe('Falta tu nombre.')
    expect(mensajeNombre(tEs, validarNombre(''), 'apellidos')).toBe('Faltan tus apellidos.')
    expect(mensajeNombre(tEs, validarNombre('María'), 'nombres')).toBeUndefined()
  })

  it('al correo le falta la arroba', () => {
    expect(mensajeCorreo(tEs, validarCorreo('juangmail.com'))).toContain('@')
    expect(mensajeCorreo(tEs, validarCorreo('juan@gmail.com'))).toBeUndefined()
  })
})
