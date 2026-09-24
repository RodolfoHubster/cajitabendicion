import { describe, expect, it, vi } from 'vitest'
import {
  LLAVE_TEMA,
  aplicarTema,
  guardarTema,
  leerTemaGuardado,
  sistemaEnOscuro,
  temaContrario,
  temaEfectivo,
} from './tema'

/** Un localStorage de mentiras, o uno que truena como en ventana privada. */
function almacen(inicial = {}) {
  const datos = { ...inicial }
  return {
    getItem: (llave) => (llave in datos ? datos[llave] : null),
    setItem: (llave, valor) => {
      datos[llave] = String(valor)
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
}

describe('qué modo se ve', () => {
  it('la primera vez, el del teléfono', () => {
    expect(temaEfectivo(null, true)).toBe('oscuro')
    expect(temaEfectivo(null, false)).toBe('claro')
  })

  it('lo que la persona escogió le gana al teléfono', () => {
    expect(temaEfectivo('claro', true)).toBe('claro')
    expect(temaEfectivo('oscuro', false)).toBe('oscuro')
  })

  it('un valor raro guardado no rompe nada: se sigue al teléfono', () => {
    expect(temaEfectivo('morado', true)).toBe('oscuro')
    expect(temaEfectivo('', false)).toBe('claro')
  })

  it('el botón cambia al contrario', () => {
    expect(temaContrario('claro')).toBe('oscuro')
    expect(temaContrario('oscuro')).toBe('claro')
  })
})

describe('guardar lo escogido', () => {
  it('se guarda y se vuelve a leer', () => {
    const local = almacen()

    expect(guardarTema('oscuro', local)).toBe(true)
    expect(local.datos[LLAVE_TEMA]).toBe('oscuro')
    expect(leerTemaGuardado(local)).toBe('oscuro')
  })

  it('lo que no es un modo se lee como "nada guardado"', () => {
    expect(leerTemaGuardado(almacen({ [LLAVE_TEMA]: 'morado' }))).toBeNull()
  })

  //  En ventana privada o con datos bloqueados, localStorage truena. La
  //  pagina tiene que seguir funcionando.
  it('si el navegador no deja guardar, no truena', () => {
    expect(leerTemaGuardado(bloqueado)).toBeNull()
    expect(guardarTema('oscuro', bloqueado)).toBe(false)
    expect(leerTemaGuardado(undefined)).toBeNull()
  })
})

describe('el teléfono', () => {
  it('pregunta por prefers-color-scheme', () => {
    const matchMedia = vi.fn(() => ({ matches: true }))

    expect(sistemaEnOscuro({ matchMedia })).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it('un navegador sin matchMedia se toma como claro', () => {
    expect(sistemaEnOscuro({})).toBe(false)
    expect(sistemaEnOscuro(undefined)).toBe(false)
  })
})

describe('ponerlo en la página', () => {
  function documento() {
    const clases = new Set()
    return {
      documentElement: {
        dataset: {},
        classList: { add: (c) => clases.add(c), remove: (c) => clases.delete(c) },
      },
      clases,
    }
  }

  it('marca <html data-tema>', () => {
    const doc = documento()
    aplicarTema('oscuro', { documento: doc })
    expect(doc.documentElement.dataset.tema).toBe('oscuro')
    expect(doc.clases.has('cambiando-tema')).toBe(false)
  })

  it('con suave, el fundido dura un momento y se quita solo', () => {
    vi.useFakeTimers()
    const doc = documento()

    aplicarTema('claro', { documento: doc, suave: true })
    expect(doc.clases.has('cambiando-tema')).toBe(true)

    vi.advanceTimersByTime(400)
    expect(doc.clases.has('cambiando-tema')).toBe(false)
    vi.useRealTimers()
  })
})

//  index.html repite el calculo para poner el modo antes de que cargue
//  React. Si alguien cambia la llave o el color aqui y no alla, la pagina
//  abre en un modo y cambia al otro de golpe.
describe('index.html y tema.js dicen lo mismo', () => {
  it('la misma llave y el mismo color de barra', async () => {
    const { readFileSync } = await import('node:fs')
    const { COLOR_BARRA } = await import('./tema')
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

    expect(html).toContain(`localStorage.getItem('${LLAVE_TEMA}')`)
    expect(html).toContain(`content="${COLOR_BARRA.claro}"`)
    expect(html).toContain(`'${COLOR_BARRA.oscuro}'`)
  })
})

//  El modo oscuro funciona porque los colores salen de variables. Un
//  bg-white o un bg-principal escrito a mano se queda blanco (o se vuelve
//  claro) en oscuro, y se ve roto. Esta prueba lo detecta antes que nadie.
describe('los colores respetan el modo oscuro', () => {
  const RAIZ = new URL('../', import.meta.url)

  async function archivosJsx() {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join, relative, sep } = await import('node:path')
    const { fileURLToPath } = await import('node:url')

    const recorrer = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? recorrer(join(dir, e.name)) : e.name.endsWith('.jsx') ? [join(dir, e.name)] : [],
      )

    const base = fileURLToPath(RAIZ)
    return recorrer(base).map((ruta) => ({
      nombre: relative(base, ruta).split(sep).join('/'),
      texto: readFileSync(ruta, 'utf8'),
    }))
  }

  //  Lo unico que debe seguir blanco de verdad: donde va un QR (lo lee otro
  //  telefono) y el circulo del logo (una foto con fondo blanco).
  const BLANCO_PERMITIDO = {
    'paginas/publico/Confirmacion.jsx': 1,
    'paginas/publico/Pase.jsx': 1,
    'paginas/publico/Inicio.jsx': 1,
  }

  it('bg-white solo donde va un QR o el logo; lo demás es bg-superficie', async () => {
    const encontrados = {}
    for (const { nombre, texto } of await archivosJsx()) {
      const n = (texto.match(/\bbg-white(?![/\w-])/g) || []).length
      if (n) encontrados[nombre] = n
    }
    expect(encontrados).toEqual(BLANCO_PERMITIDO)
  })

  it('el azul como fondo es bg-marca, nunca bg-principal', async () => {
    const malos = (await archivosJsx())
      .filter(({ texto }) => /\bbg-principal(?![/\w-])/.test(texto))
      .map(({ nombre }) => nombre)
    expect(malos).toEqual([])
  })

  it('el rojo con letra blanca es bg-peligro, que no cambia en oscuro', async () => {
    const malos = (await archivosJsx())
      .filter(({ texto }) => /\bbg-ya-recibio(?![/\w-])/.test(texto))
      .map(({ nombre }) => nombre)
    expect(malos).toEqual([])
  })
})
