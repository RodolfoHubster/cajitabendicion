import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import {
  borrarCodigoAnticipado,
  guardarCodigoAnticipado,
  leerCodigoAnticipado,
  normalizarCodigo,
  validarCodigoAnticipado,
} from './anticipado'

function crearAlmacen() {
  const datos = new Map()
  return {
    getItem: (llave) => (datos.has(llave) ? datos.get(llave) : null),
    setItem: (llave, valor) => datos.set(llave, String(valor)),
    removeItem: (llave) => datos.delete(llave),
  }
}

const roto = () => {
  throw new Error('almacenamiento bloqueado')
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', crearAlmacen())
  supabase.rpc.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizarCodigo', () => {
  it.each([
    [' k7mp2q ', 'K7MP2Q'],
    ['K7MP2Q', 'K7MP2Q'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('%s -> %s', (texto, esperado) => {
    expect(normalizarCodigo(texto)).toBe(esperado)
  })
})

describe('codigo guardado por fecha', () => {
  it('guarda, lee y borra el de cada fecha por separado', () => {
    guardarCodigoAnticipado('2026-09-14', ' k7mp2q ')
    guardarCodigoAnticipado('2026-09-17', 'abcdef')

    expect(leerCodigoAnticipado('2026-09-14')).toBe('K7MP2Q')
    expect(leerCodigoAnticipado('2026-09-17')).toBe('ABCDEF')
    expect(leerCodigoAnticipado('2026-09-21')).toBeNull()

    borrarCodigoAnticipado('2026-09-14')
    expect(leerCodigoAnticipado('2026-09-14')).toBeNull()
    expect(leerCodigoAnticipado('2026-09-17')).toBe('ABCDEF')
  })

  it('con el almacenamiento bloqueado no truena: solo no recuerda', () => {
    vi.stubGlobal('sessionStorage', { getItem: roto, setItem: roto, removeItem: roto })

    expect(() => guardarCodigoAnticipado('2026-09-14', 'K7MP2Q')).not.toThrow()
    expect(() => borrarCodigoAnticipado('2026-09-14')).not.toThrow()
    expect(leerCodigoAnticipado('2026-09-14')).toBeNull()
  })
})

describe('validarCodigoAnticipado', () => {
  it('manda el codigo normalizado', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })

    await expect(validarCodigoAnticipado('2026-09-14', ' k7mp2q ')).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('validar_codigo_anticipado', {
      p_fecha: '2026-09-14',
      p_codigo: 'K7MP2Q',
    })
  })

  it.each([[false], [null], ['true'], [1]])('solo true de la base cuenta como valido (%s no)', async (respuesta) => {
    supabase.rpc.mockResolvedValue({ data: respuesta, error: null })
    await expect(validarCodigoAnticipado('2026-09-14', 'K7MP2Q')).resolves.toBe(false)
  })

  it('con error, falla con el codigo clasificado', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } })
    await expect(validarCodigoAnticipado('2026-09-14', 'K7MP2Q')).rejects.toThrow('FUNCION_NO_INSTALADA')
  })
})
