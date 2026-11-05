import { describe, expect, it } from 'vitest'
import { IDIOMAS, RESPALDO, idiomaCorto, idiomaDeFechas } from './idiomas'

describe('los idiomas de la interfaz', () => {
  it('cada uno una sola vez y con su nombre', () => {
    const codigos = IDIOMAS.map(({ codigo }) => codigo)
    expect(new Set(codigos).size).toBe(codigos.length)
    expect(IDIOMAS.every(({ nombre }) => nombre.trim() !== '')).toBe(true)
  })

  it('un texto que falta: los idiomas nuevos y el vietnamita caen a ingles; lo demas, a espanol', () => {
    for (const codigo of ['vi', 'zh', 'tl', 'ko', 'ht', 'ru', 'so', 'fr']) {
      expect(RESPALDO[codigo], codigo).toEqual(['en'])
    }
    expect(RESPALDO.es).toBeUndefined()
    expect(RESPALDO.en).toBeUndefined()
    expect(RESPALDO.default).toEqual(['es'])
  })

  it('idiomaCorto se queda con el idioma, sin el pais', () => {
    expect(idiomaCorto('ko-KR')).toBe('ko')
    expect(idiomaCorto('ZH')).toBe('zh')
    expect(idiomaCorto(null)).toBe('es')
  })

  it('las fechas en criollo haitiano salen en frances; las demas, en su idioma', () => {
    const lunes = new Date(2026, 10, 9)
    const dia = (idioma) => new Intl.DateTimeFormat(idiomaDeFechas(idioma), { weekday: 'long' }).format(lunes)

    expect(dia('ht')).toBe('lundi')
    expect(dia('ko')).toBe('월요일')
    expect(dia('es-MX')).toBe('lunes')
    expect(idiomaDeFechas('es-MX')).toBe('es-MX')
  })
})
