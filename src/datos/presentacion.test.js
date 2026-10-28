import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ESCENAS, MS_ESCENA, avanzar } from './presentacion'
import es from '../i18n/es.json'

describe('el video de Cajita de Bendición', () => {
  it('avanza poco a poco y pasa a la siguiente escena al cumplir su tiempo', () => {
    expect(avanzar({ escena: 0, transcurrido: 0 }, 100)).toEqual({ escena: 0, transcurrido: 100 })
    expect(avanzar({ escena: 0, transcurrido: MS_ESCENA - 100 }, 100)).toEqual({ escena: 1, transcurrido: 0 })
  })

  it('al final se queda en "Haz tu cita"', () => {
    const ultima = ESCENAS.length - 1
    expect(avanzar({ escena: ultima, transcurrido: MS_ESCENA - 50 }, 100)).toEqual({ escena: ESCENAS.length, transcurrido: 0 })
    expect(avanzar({ escena: ESCENAS.length, transcurrido: 0 }, 100)).toEqual({ escena: ESCENAS.length, transcurrido: 0 })
  })

  it('cada escena tiene su título y su texto', () => {
    for (const escena of ESCENAS) {
      expect(es.video[escena]?.titulo, escena).toBeTruthy()
      expect(es.video[escena]?.texto, escena).toBeTruthy()
    }
  })

  it('el código para GoDaddy no tiene dependencias, cookies ni rastreo, y se carga una sola vez', () => {
    const codigo = readFileSync(new URL('../../public/cajita-video.js', import.meta.url), 'utf8')
    expect(codigo).not.toMatch(/document\.cookie|localStorage|gtag|fbq|import\s/)
    expect(codigo).toContain('window.__cajitaVideo')
    expect(codigo).toContain("'/video?lng='")
  })
})
