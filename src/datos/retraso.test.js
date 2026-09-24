import { afterEach, describe, expect, it, vi } from 'vitest'
import { RETRASO_MAXIMO_MS, conRetraso, retrasoDePrueba } from './retraso'

afterEach(() => {
  vi.useRealTimers()
})

describe('retrasoDePrueba', () => {
  it('en la app real nunca hay retraso, aunque alguien ponga la variable', () => {
    expect(retrasoDePrueba({ VITE_RETRASO_MS: '1000' })).toBe(0)
    expect(retrasoDePrueba({ VITE_ENTORNO: 'produccion', VITE_RETRASO_MS: '1000' })).toBe(0)
    expect(retrasoDePrueba(undefined)).toBe(0)
  })

  it('con la base de pruebas, los milisegundos que se pidieron', () => {
    expect(retrasoDePrueba({ VITE_ENTORNO: 'pruebas', VITE_RETRASO_MS: '1000' })).toBe(1000)
  })

  it('sin la variable, o con algo que no es número, nada', () => {
    for (const valor of [undefined, '', 'uno', '-500', '0']) {
      expect(retrasoDePrueba({ VITE_ENTORNO: 'pruebas', VITE_RETRASO_MS: valor })).toBe(0)
    }
  })

  it('con tope: un cero de más no deja la app inservible', () => {
    expect(retrasoDePrueba({ VITE_ENTORNO: 'pruebas', VITE_RETRASO_MS: '100000' })).toBe(RETRASO_MAXIMO_MS)
  })
})

describe('conRetraso', () => {
  it('espera antes de llamar a la base, y devuelve lo que ella conteste', async () => {
    vi.useFakeTimers()
    const base = vi.fn().mockResolvedValue('respuesta')
    const llamada = conRetraso(1000, base)('https://x.supabase.co/rest/v1/rpc/algo', { method: 'POST' })

    await vi.advanceTimersByTimeAsync(999)
    expect(base).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(base).toHaveBeenCalledWith('https://x.supabase.co/rest/v1/rpc/algo', { method: 'POST' })
    await expect(llamada).resolves.toBe('respuesta')
  })
})
