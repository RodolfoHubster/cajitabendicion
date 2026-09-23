import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  avisoDelResultado,
  avisoLeido,
  olvidarSonido,
  prepararSonido,
  tono,
  vibrar,
} from './sonido'

/** Un AudioContext de mentira que apunta los tonos que se le pidieron. */
function contextoFalso() {
  const tonos = []

  const crearOscilador = () => {
    const oscilador = {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    tonos.push(oscilador)
    return oscilador
  }

  const ganancia = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }

  class Falso {
    constructor() {
      this.currentTime = 0
      this.destination = {}
      this.resume = vi.fn()
      this.createOscillator = crearOscilador
      this.createGain = () => ganancia
    }
  }

  return { Falso, tonos, ganancia }
}

afterEach(() => {
  olvidarSonido()
})

describe('preparar el sonido', () => {
  it('crea el contexto una sola vez y lo despierta', () => {
    const { Falso } = contextoFalso()
    const primero = prepararSonido(Falso)
    const segundo = prepararSonido(Falso)

    expect(primero).toBe(segundo)
    expect(primero.resume).toHaveBeenCalledTimes(1)
  })

  it('sin AudioContext no truena, solo no suena', () => {
    expect(prepararSonido(undefined)).toBeNull()
    expect(tono()).toBe(false)
  })

  it('si el navegador se niega a crearlo, tampoco truena', () => {
    const Explota = function () {
      throw new Error('no se permite')
    }
    expect(prepararSonido(Explota)).toBeNull()
  })
})

describe('los tonos', () => {
  it('el aviso de "ya lo leí" es un bip corto y agudo', () => {
    const { Falso, tonos } = contextoFalso()
    prepararSonido(Falso)

    expect(avisoLeido()).toBe(true)
    expect(tonos).toHaveLength(1)
    expect(tonos[0].frequency.value).toBe(880)
    expect(tonos[0].start).toHaveBeenCalled()
    expect(tonos[0].stop).toHaveBeenCalled()
  })

  it('"puede pasar" son dos tonos que suben', () => {
    const { Falso, tonos } = contextoFalso()
    prepararSonido(Falso)

    avisoDelResultado('VALIDO')
    expect(tonos.map((t) => t.frequency.value)).toEqual([880, 1320])
  })

  it.each(['VALIDO', 'VALIDO_AUTORIZADO', 'VALIDO_PASE'])('%s suena a que puede pasar', (resultado) => {
    const { Falso, tonos } = contextoFalso()
    prepararSonido(Falso)

    avisoDelResultado(resultado)
    expect(tonos).toHaveLength(2)
  })

  it.each(['YA_USADO', 'OTRA_FECHA', 'CANCELADA', 'NO_EXISTE', 'PASE_REVOCADO', 'NO_ES_DIA_DE_ENTREGA'])(
    '%s suena a detente: un solo tono grave',
    (resultado) => {
      const { Falso, tonos } = contextoFalso()
      prepararSonido(Falso)

      avisoDelResultado(resultado)
      expect(tonos).toHaveLength(1)
      expect(tonos[0].frequency.value).toBe(320)
    },
  )

  it('el volumen baja en curva, para que no suene a chasquido', () => {
    const { Falso, ganancia } = contextoFalso()
    prepararSonido(Falso)

    tono({ hz: 440, segundos: 0.2, volumen: 0.3 })
    expect(ganancia.gain.setValueAtTime).toHaveBeenCalledWith(0.3, 0)
    expect(ganancia.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 0.2)
  })
})

describe('vibrar', () => {
  it('usa el patrón que se le pasa', () => {
    const navegador = { vibrate: vi.fn(() => true) }
    expect(vibrar(50, navegador)).toBe(true)
    expect(navegador.vibrate).toHaveBeenCalledWith(50)
  })

  it('donde no se puede vibrar (el iPhone), no truena', () => {
    expect(vibrar(50, {})).toBe(false)
    expect(vibrar(50, undefined)).toBe(false)
    expect(
      vibrar(50, {
        vibrate: () => {
          throw new Error('no')
        },
      }),
    ).toBe(false)
  })
})
