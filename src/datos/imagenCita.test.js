import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vietnamita from '../i18n/vi.json'
import { guardarImagen, nombreArchivoCita } from './imagenCita'

afterEach(() => {
  vi.useRealTimers()
})

const imagen = () => new Blob(['png'], { type: 'image/png' })

/** Un documento de mentira que registra la descarga. */
function documentoFalso() {
  const enlace = { click: vi.fn(), remove: vi.fn() }
  return {
    enlace,
    documento: { createElement: vi.fn(() => enlace), body: { appendChild: vi.fn() } },
    urls: { createObjectURL: vi.fn(() => 'blob:imagen'), revokeObjectURL: vi.fn() },
  }
}

describe('nombreArchivoCita', () => {
  it.each([
    ['CB-1234', 'cajita-cita-CB-1234.png'],
    ['CB 12/34', 'cajita-cita-CB1234.png'],
    ['', 'cajita-cita-codigo.png'],
    [undefined, 'cajita-cita-codigo.png'],
  ])('%j -> %s', (codigo, esperado) => {
    expect(nombreArchivoCita(codigo)).toBe(esperado)
  })
})

describe('guardarImagen', () => {
  it('en el celular abre el menu de compartir con solo el archivo', async () => {
    const navegador = { canShare: vi.fn(() => true), share: vi.fn(async () => {}) }
    const { documento, urls } = documentoFalso()

    await expect(guardarImagen(imagen(), 'cajita-cita-CB-1.png', { navegador, documento, urls })).resolves.toBe('compartida')

    const [datos] = navegador.share.mock.calls[0]
    expect(Object.keys(datos)).toEqual(['files'])
    expect(datos.files[0].name).toBe('cajita-cita-CB-1.png')
    expect(datos.files[0].type).toBe('image/png')
    expect(documento.createElement).not.toHaveBeenCalled()
  })

  it('si cierra el menu sin elegir, no descarga nada', async () => {
    const navegador = {
      canShare: () => true,
      share: vi.fn(async () => {
        throw Object.assign(new Error('cancelado'), { name: 'AbortError' })
      }),
    }
    const { documento, urls } = documentoFalso()

    await expect(guardarImagen(imagen(), 'a.png', { navegador, documento, urls })).resolves.toBe('cancelada')
    expect(urls.createObjectURL).not.toHaveBeenCalled()
  })

  it('si compartir falla por otra razon, se descarga', async () => {
    vi.useFakeTimers()
    const navegador = {
      canShare: () => true,
      share: vi.fn(async () => {
        throw Object.assign(new Error('sin permiso'), { name: 'NotAllowedError' })
      }),
    }
    const { documento, urls, enlace } = documentoFalso()

    await expect(guardarImagen(imagen(), 'a.png', { navegador, documento, urls })).resolves.toBe('descargada')
    expect(enlace.click).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sin menu de compartir', {}],
    ['el navegador no comparte archivos', { canShare: () => false, share: vi.fn() }],
    [
      'canShare truena',
      {
        canShare: () => {
          throw new Error('no')
        },
        share: vi.fn(),
      },
    ],
  ])('%s: se descarga el archivo', async (_, navegador) => {
    vi.useFakeTimers()
    const { documento, urls, enlace } = documentoFalso()

    await expect(guardarImagen(imagen(), 'cajita-cita-CB-9.png', { navegador, documento, urls })).resolves.toBe('descargada')

    expect(enlace.href).toBe('blob:imagen')
    expect(enlace.download).toBe('cajita-cita-CB-9.png')
    expect(enlace.click).toHaveBeenCalledTimes(1)
    expect(enlace.remove).toHaveBeenCalledTimes(1)
    expect(navegador.share ?? vi.fn()).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:imagen')
  })

  it.each([
    ['es', es],
    ['en', en],
    ['vi', vietnamita],
  ])('el aviso de descarga tiene su texto (%s)', (_, textos) => {
    expect(textos.confirmacion.descargada).toBeTruthy()
  })
})
