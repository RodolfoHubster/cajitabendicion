import { describe, expect, it, vi } from 'vitest'
import { callar, deletrear, hablar, puedeHablar } from './voz'

function ventanaConVoz() {
  const dichas = []
  class Frase {
    constructor(texto) {
      this.texto = texto
    }
  }
  return {
    SpeechSynthesisUtterance: Frase,
    speechSynthesis: {
      cancel: vi.fn(),
      speak: (frase) => dichas.push(frase),
    },
    dichas,
  }
}

describe('el código, letra por letra', () => {
  it.each([
    ['CB-4871', 'C. B. 4. 8. 7. 1.'],
    ['cb-0056', 'C. B. 0. 0. 5. 6.'],
    ['', ''],
    [null, ''],
  ])('%s -> "%s"', (codigo, esperado) => {
    expect(deletrear(codigo)).toBe(esperado)
  })
})

describe('hablar', () => {
  it('dice el texto con la voz del idioma de la pantalla, un poco despacio', () => {
    const ventana = ventanaConVoz()
    expect(hablar('Tu cita es el jueves', 'es', ventana)).toBe(true)

    const [frase] = ventana.dichas
    expect(frase.texto).toBe('Tu cita es el jueves')
    expect(frase.lang).toBe('es-MX')
    expect(frase.rate).toBeLessThan(1)
  })

  it('inglés con voz de Estados Unidos y vietnamita con la suya', () => {
    const ventana = ventanaConVoz()
    hablar('Hi', 'en-US', ventana)
    hablar('Xin chào', 'vi', ventana)
    expect(ventana.dichas.map((f) => f.lang)).toEqual(['en-US', 'vi-VN'])
  })

  it('tocar dos veces no encima dos voces: corta la anterior', () => {
    const ventana = ventanaConVoz()
    hablar('Uno', 'es', ventana)
    hablar('Dos', 'es', ventana)
    expect(ventana.speechSynthesis.cancel).toHaveBeenCalledTimes(2)
  })

  it('un teléfono sin voz: no truena y el botón no se ofrece', () => {
    expect(puedeHablar({})).toBe(false)
    expect(puedeHablar(undefined)).toBe(false)
    expect(hablar('Hola', 'es', {})).toBe(false)
    expect(() => callar({})).not.toThrow()
  })
})
