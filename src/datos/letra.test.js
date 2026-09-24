import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vi from '../i18n/vi.json'
import { LLAVE_LETRA, PIXELES_LETRA, TAMANOS_LETRA, aplicarLetra, guardarLetra, leerLetra } from './letra'

function almacen(inicial = {}) {
  const datos = { ...inicial }
  return {
    getItem: (llave) => (llave in datos ? datos[llave] : null),
    setItem: (llave, valor) => {
      datos[llave] = String(valor)
    },
    removeItem: (llave) => {
      delete datos[llave]
    },
    datos,
  }
}

const bloqueado = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

function documento() {
  return { documentElement: { dataset: {}, style: { fontSize: '' } } }
}

describe('el tamaño de la letra', () => {
  it('sin nada guardado, normal', () => {
    expect(leerLetra(almacen())).toBe('normal')
  })

  it('se guarda y se vuelve a leer', () => {
    const local = almacen()
    expect(guardarLetra('muy_grande', local)).toBe(true)
    expect(local.datos[LLAVE_LETRA]).toBe('muy_grande')
    expect(leerLetra(local)).toBe('muy_grande')
  })

  it('volver a normal borra lo guardado: manda el tamaño del teléfono', () => {
    const local = almacen({ [LLAVE_LETRA]: 'grande' })
    guardarLetra('normal', local)
    expect(LLAVE_LETRA in local.datos).toBe(false)
  })

  it('un tamaño inventado no se guarda ni se lee', () => {
    const local = almacen({ [LLAVE_LETRA]: 'gigante' })
    expect(leerLetra(local)).toBe('normal')
    expect(guardarLetra('gigante', local)).toBe(false)
  })

  it('si el navegador no deja guardar, no truena', () => {
    expect(leerLetra(bloqueado)).toBe('normal')
    expect(guardarLetra('grande', bloqueado)).toBe(false)
  })

  it('grande y muy grande agrandan TODO (la letra de <html>); normal lo deja al navegador', () => {
    const doc = documento()
    aplicarLetra('muy_grande', doc)
    expect(doc.documentElement.style.fontSize).toBe('20px')
    expect(doc.documentElement.dataset.letra).toBe('muy_grande')

    aplicarLetra('normal', doc)
    expect(doc.documentElement.style.fontSize).toBe('')
  })

  it('cada tamaño es más grande que el anterior', () => {
    const pixeles = TAMANOS_LETRA.map((tamano) => PIXELES_LETRA[tamano])
    expect([...pixeles].sort((a, b) => a - b)).toEqual(pixeles)
    expect(pixeles[0]).toBe(16)
  })

  it('cada tamaño tiene su nombre en los tres idiomas', () => {
    for (const textos of [es, en, vi]) {
      expect(textos.letra.titulo).toBeTruthy()
      for (const tamano of TAMANOS_LETRA) expect(textos.letra[tamano]).toBeTruthy()
    }
  })
})

//  index.html pone la letra antes de que cargue React. Si la llave o los
//  tamaños cambian aquí y no allá, la página abre chica y luego brinca.
describe('index.html y letra.js dicen lo mismo', () => {
  it('la misma llave y los mismos pixeles', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    expect(html).toContain(`localStorage.getItem('${LLAVE_LETRA}')`)
    expect(html).toContain(`grande: '${PIXELES_LETRA.grande}px'`)
    expect(html).toContain(`muy_grande: '${PIXELES_LETRA.muy_grande}px'`)
  })
})
