import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
//  jsQR no hace falta aqui: estas pruebas son de las llamadas a la base.
vi.mock('jsqr', () => ({ default: vi.fn() }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import {
  CODIGOS_ANULAR,
  MS_RECIEN_ENTREGADO,
  anularEntrega,
  buscarParaEscaneo,
  clasificarErrorCamara,
  esRecienEntregado,
  zonaVisible,
  previaPorError,
} from './escaneo'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('deshacer una entrega marcada por error', () => {
  it('manda el código y el motivo', async () => {
    supabase.rpc.mockResolvedValue({ data: 'ANULADA', error: null })

    await expect(anularEntrega('CB-4871', 'Era otra persona')).resolves.toBe('ANULADA')
    expect(supabase.rpc).toHaveBeenCalledWith('anular_entrega', { p_codigo: 'CB-4871', p_motivo: 'Era otra persona' })
  })

  it.each(CODIGOS_ANULAR)('%s llega tal cual y tiene su mensaje en los tres idiomas', async (codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
    await expect(anularEntrega('CB-4871', 'x')).rejects.toThrow(codigo)
    expect(es.deshacer.errores[codigo]).toBeTruthy()
  })

  it('sin la palomita, SIN_PERMISO', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(anularEntrega('CB-4871', 'x')).rejects.toThrow('SIN_PERMISO')
  })

  it('en el iPhone sin señal, SIN_CONEXION (no "error desconocido")', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Load failed' } })
    await expect(anularEntrega('CB-4871', 'x')).rejects.toThrow('SIN_CONEXION')
  })
})

describe('buscar', () => {
  it('manda lo que se le da; sin resultados, lista vacía', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(buscarParaEscaneo('CB-4871')).resolves.toEqual([])
    expect(supabase.rpc).toHaveBeenCalledWith('buscar_para_escaneo', { p_texto: 'CB-4871' })
  })
})

describe('por qué no arrancó la cámara', () => {
  it.each([
    ['NotAllowedError', 'SIN_PERMISO'],
    ['PermissionDeniedError', 'SIN_PERMISO'],
    ['NotReadableError', 'CAMARA_OCUPADA'],
    ['TrackStartError', 'CAMARA_OCUPADA'],
    ['NotFoundError', 'SIN_CAMARA'],
    ['OverconstrainedError', 'SIN_CAMARA'],
    ['NotSupportedError', 'SIN_HTTPS'],
    ['CualquierOtro', 'ERROR_CAMARA'],
  ])('%s -> %s, con su mensaje', (nombre, codigo) => {
    expect(clasificarErrorCamara({ name: nombre }, true)).toBe(codigo)
    expect(es.escaneo.camara[codigo]).toBeTruthy()
  })

  it('en un sitio sin https, se dice eso', () => {
    expect(clasificarErrorCamara({ name: 'TypeError' }, false)).toBe('SIN_HTTPS')
  })

  it('los dos casos que se arreglan a mano traen sus pasos', () => {
    expect(es.escaneo.camara.comoArreglar.SIN_PERMISO).toBeTruthy()
    expect(es.escaneo.camara.comoArreglar.CAMARA_OCUPADA).toBeTruthy()
  })
})

describe('la cámara vuelve a leer el QR que se acaba de entregar', () => {
  const ultima = { token: 'abc', nombre: 'María P.', momento: 1_000_000 }

  it('el mismo código al rato: es el que se acaba de entregar, no un intento repetido', () => {
    expect(esRecienEntregado(ultima, 'abc', 1_000_000 + 5_000)).toBe(true)
  })

  it('pasado el minuto, ya se revisa en la base como siempre', () => {
    expect(esRecienEntregado(ultima, 'abc', 1_000_000 + MS_RECIEN_ENTREGADO)).toBe(false)
  })

  it('otro código, o nada entregado todavía: se revisa normal', () => {
    expect(esRecienEntregado(ultima, 'otro', 1_000_000 + 5_000)).toBe(false)
    expect(esRecienEntregado(null, 'abc')).toBe(false)
  })
})

describe('sin señal no es "código no reconocido"', () => {
  it('sin conexión se dice así: el código puede estar bien', () => {
    expect(previaPorError('SIN_CONEXION')).toBe('SIN_CONEXION')
    expect(es.escaneo.resultado.SIN_CONEXION).toBeTruthy()
  })

  it('cualquier otro problema sigue siendo "no reconocido"', () => {
    expect(previaPorError('ERROR_DESCONOCIDO')).toBe('NO_EXISTE')
    expect(previaPorError(undefined)).toBe('NO_EXISTE')
  })
})

describe('zonaVisible (se lee solo lo que se ve en pantalla)', () => {
  it('camara ancha de computadora: el cuadrado del centro, sin los lados', () => {
    expect(zonaVisible(1280, 720)).toEqual({ x: 280, y: 0, lado: 720 })
  })

  it('camara vertical de telefono: el cuadrado del centro, sin arriba ni abajo', () => {
    expect(zonaVisible(720, 1280)).toEqual({ x: 0, y: 280, lado: 720 })
  })

  it('camara cuadrada: todo', () => {
    expect(zonaVisible(640, 640)).toEqual({ x: 0, y: 0, lado: 640 })
  })

  it('la zona nunca se sale de la imagen', () => {
    for (const [ancho, alto] of [[1920, 1080], [1081, 1920], [333, 500]]) {
      const { x, y, lado } = zonaVisible(ancho, alto)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + lado).toBeLessThanOrEqual(ancho)
      expect(y + lado).toBeLessThanOrEqual(alto)
    }
  })
})
