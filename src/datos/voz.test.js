import { describe, expect, it, vi } from 'vitest'
import {
  callar,
  deletrear,
  guardarAnuncio,
  hablar,
  leerAnuncio,
  puedeHablar,
  turnoParaAnunciar,
  vocesDelIdioma,
} from './voz'

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

  it('con una voz escogida, habla con esa', () => {
    const voces = [
      { voiceURI: 'mx', name: 'Paulina', lang: 'es-MX' },
      { voiceURI: 'us', name: 'Samantha', lang: 'en-US' },
    ]
    const ventana = ventanaConVoz()
    ventana.speechSynthesis.getVoices = () => voces
    hablar('Turno 12', 'es', ventana, { voz: 'mx' })
    expect(ventana.dichas[0].voice).toBe(voces[0])
    expect(vocesDelIdioma('es', ventana)).toEqual([{ id: 'mx', nombre: 'Paulina' }])
    expect(vocesDelIdioma('en', ventana)).toEqual([{ id: 'us', nombre: 'Samantha' }])
  })

  it('una voz que el teléfono ya no tiene: habla con la del idioma, sin tronar', () => {
    const ventana = ventanaConVoz()
    ventana.speechSynthesis.getVoices = () => []
    expect(hablar('Turno 12', 'es', ventana, { voz: 'ya-no-existe' })).toBe(true)
    expect(ventana.dichas[0].voice).toBeUndefined()
  })

  it('un teléfono sin voz: no truena y el botón no se ofrece', () => {
    expect(puedeHablar({})).toBe(false)
    expect(puedeHablar(undefined)).toBe(false)
    expect(hablar('Hola', 'es', {})).toBe(false)
    expect(() => callar({})).not.toThrow()
  })
})

describe('anunciar los turnos', () => {
  it('se anuncia cuando cambia el turno que va, una sola vez', () => {
    expect(turnoParaAnunciar(null, 1)).toBe(1)
    expect(turnoParaAnunciar(1, 1)).toBeNull()
    expect(turnoParaAnunciar(1, 2)).toBe(2)
    //  Si alguien regresa a la fila con un turno menor, tambien se anuncia.
    expect(turnoParaAnunciar(5, 3)).toBe(3)
    //  Sin nadie esperando, nada.
    expect(turnoParaAnunciar(4, null)).toBeNull()
  })

  it('se recuerda en este teléfono, con su voz', () => {
    const datos = new Map()
    const almacen = {
      getItem: (k) => datos.get(k) ?? null,
      setItem: (k, v) => datos.set(k, v),
      removeItem: (k) => datos.delete(k),
    }
    expect(leerAnuncio(almacen)).toEqual({ activo: false, voz: null })
    guardarAnuncio({ activo: true, voz: 'mx' }, almacen)
    expect(leerAnuncio(almacen)).toEqual({ activo: true, voz: 'mx' })
    guardarAnuncio({ activo: false, voz: null }, almacen)
    expect(leerAnuncio(almacen)).toEqual({ activo: false, voz: null })
  })

  it('si el navegador no deja guardar, no truena', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(leerAnuncio(roto)).toEqual({ activo: false, voz: null })
    expect(() => guardarAnuncio({ activo: true }, roto)).not.toThrow()
  })
})
