import { describe, expect, it } from 'vitest'
import { desplazamiento, indiceDestino, moverEnLista, pasosParaMover } from './ordenar'

//  Cuatro renglones de 50 px, uno debajo del otro.
const CENTROS = [25, 75, 125, 175]

describe('ordenar arrastrando', () => {
  it('cae donde queda su centro', () => {
    expect(indiceDestino(CENTROS, 0, 25)).toBe(0)
    expect(indiceDestino(CENTROS, 0, 80)).toBe(1)
    expect(indiceDestino(CENTROS, 0, 200)).toBe(3)
    expect(indiceDestino(CENTROS, 3, 10)).toBe(0)
    expect(indiceDestino(CENTROS, 2, 100)).toBe(2)
    expect(indiceDestino(CENTROS, 2, 60)).toBe(1)
  })

  it('mueve uno sin tocar la lista original', () => {
    const lista = ['a', 'b', 'c', 'd']
    expect(moverEnLista(lista, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moverEnLista(lista, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moverEnLista(lista, 1, 1)).toEqual(lista)
    expect(lista).toEqual(['a', 'b', 'c', 'd'])
  })

  it('se guarda subiendo o bajando de uno en uno', () => {
    expect(pasosParaMover(0, 2)).toEqual({ hacia: 'abajo', veces: 2 })
    expect(pasosParaMover(3, 0)).toEqual({ hacia: 'arriba', veces: 3 })
    expect(pasosParaMover(1, 1).veces).toBe(0)
  })

  it('mientras se arrastra, los de en medio se hacen a un lado', () => {
    const bajando = { desde: 0, sobre: 2, dy: 110, alto: 58 }
    expect([0, 1, 2, 3].map((i) => desplazamiento(i, bajando))).toEqual([110, -58, -58, 0])
    const subiendo = { desde: 3, sobre: 1, dy: -100, alto: 58 }
    expect([0, 1, 2, 3].map((i) => desplazamiento(i, subiendo))).toEqual([0, 58, 58, -100])
    expect(desplazamiento(1, null)).toBe(0)
  })
})
