import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import fr from '../i18n/fr.json'
import ht from '../i18n/ht.json'
import ko from '../i18n/ko.json'
import ru from '../i18n/ru.json'
import so from '../i18n/so.json'
import tl from '../i18n/tl.json'
import vi from '../i18n/vi.json'
import zh from '../i18n/zh.json'
import { PANTALLAS, pantallaDeRuta, pasosDePantalla } from './ayudaPantalla'

const IDIOMAS = { es, en, vi, zh, tl, ko, ht, ru, so, fr }
const texto = (textos, clave) => clave.split('.').reduce((nivel, parte) => nivel?.[parte], textos)

describe('pantallaDeRuta', () => {
  it.each([
    ['/', 'inicio'],
    ['/calendario', 'calendario'],
    ['/horarios/2026-11-19', 'horarios'],
    ['/registro', 'registro'],
    ['/registro?fecha=2026-11-19&acompanante=1', 'registro'],
    ['/confirmacion/abc123', 'confirmacion'],
    ['/cambiar/abc123', 'cambiar'],
    ['/turno', 'turno'],
    ['/a-pie', 'turno'],
    ['/fila', 'fila'],
    ['/pase/xyz', 'pase'],
  ])('%s -> %s', (ruta, pantalla) => {
    expect(pantallaDeRuta(ruta)).toBe(pantalla)
  })

  it('lo que no tiene su propia ayuda cae en la general', () => {
    expect(pantallaDeRuta('/preguntas')).toBe('general')
    expect(pantallaDeRuta('/quienes-somos')).toBe('general')
    expect(pantallaDeRuta('/horarios')).toBe('general')
    expect(pantallaDeRuta(undefined)).toBe('general')
  })
})

describe('pasosDePantalla', () => {
  it('da las claves en orden, y la general si la pantalla no existe', () => {
    expect(pasosDePantalla('cambiar')).toEqual(['ayudaPantalla.pasos.cambiar.1', 'ayudaPantalla.pasos.cambiar.2'])
    expect(pasosDePantalla('no-existe')).toEqual(pasosDePantalla('general'))
  })

  //  Es lo que ve el publico: va en los diez idiomas, no en ingles de respaldo.
  it.each(Object.entries(IDIOMAS))('%s trae todos los pasos y los botones', (_codigo, textos) => {
    const claves = [
      ...Object.keys(PANTALLAS).flatMap(pasosDePantalla),
      'ayudaPantalla.boton',
      'ayudaPantalla.titulo',
      'ayudaPantalla.dudas',
      'ayudaPantalla.llamar',
      'ayudaPantalla.todas',
      'ayudaPantalla.cerrar',
      'ayuda.entendido',
    ]
    for (const clave of claves) {
      expect(typeof texto(textos, clave), clave).toBe('string')
      expect(texto(textos, clave).trim(), clave).not.toBe('')
    }
    expect(texto(textos, 'ayudaPantalla.llamar')).toContain('{{telefono}}')
  })
})
