import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { repetirCadaRato } from './cadaRato'

function documentoDePrueba() {
  const oyentes = new Set()
  return {
    visibilityState: 'visible',
    addEventListener: (_, f) => oyentes.add(f),
    removeEventListener: (_, f) => oyentes.delete(f),
    cambiar(estado) {
      this.visibilityState = estado
      for (const f of oyentes) f()
    },
    oyentes,
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('volver a preguntar cada rato', () => {
  it('pregunta ahora y luego cada tanto', async () => {
    const fn = vi.fn().mockResolvedValue()
    const detener = repetirCadaRato(fn, 3000, { documento: documentoDePrueba() })

    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(fn).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(9000)
    expect(fn).toHaveBeenCalledTimes(5)
    detener()
  })

  it('no se encima: con una respuesta lenta, espera a que termine', async () => {
    let terminar
    const fn = vi.fn(() => new Promise((r) => (terminar = r)))
    const detener = repetirCadaRato(fn, 1000, { documento: documentoDePrueba() })

    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(1)
    terminar()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fn).toHaveBeenCalledTimes(2)
    detener()
  })

  it('con la pantalla oculta no pregunta; al volver, de inmediato', async () => {
    const documento = documentoDePrueba()
    const fn = vi.fn().mockResolvedValue()
    const detener = repetirCadaRato(fn, 3000, { documento })
    await vi.advanceTimersByTimeAsync(0)

    documento.cambiar('hidden')
    await vi.advanceTimersByTimeAsync(9000)
    expect(fn).toHaveBeenCalledTimes(1)

    documento.cambiar('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(fn).toHaveBeenCalledTimes(2)
    detener()
  })

  it('un error no lo detiene', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('SIN_CONEXION')).mockResolvedValue()
    const detener = repetirCadaRato(fn, 1000, { documento: documentoDePrueba() })
    await vi.advanceTimersByTimeAsync(2000)
    expect(fn).toHaveBeenCalledTimes(3)
    detener()
  })

  it('al detenerlo ya no pregunta ni escucha la pantalla', async () => {
    const documento = documentoDePrueba()
    const fn = vi.fn().mockResolvedValue()
    const detener = repetirCadaRato(fn, 1000, { documento })
    await vi.advanceTimersByTimeAsync(0)
    detener()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(documento.oyentes.size).toBe(0)
  })
})
