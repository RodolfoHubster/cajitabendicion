import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import {
  CODIGOS_PASE,
  crearPase,
  entregasPaseDelDia,
  listarPases,
  paseDeCodigo,
  renovarPase,
  revocarPase,
} from './pases'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('dar el pase', () => {
  it('manda el código de la persona y el motivo sin espacios de más', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ codigo_corto: 'CB-4871', nombre: 'María', token: 'abc123' }],
      error: null,
    })

    await expect(crearPase('CB-4871', '  Adulto mayor  ')).resolves.toEqual({
      codigo_corto: 'CB-4871',
      nombre: 'María',
      token: 'abc123',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('crear_pase', {
      p_codigo: 'CB-4871',
      p_motivo: 'Adulto mayor',
    })
  })

  it('un motivo vacío va como null', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ token: 'abc' }], error: null })
    await crearPase('CB-4871', '   ')
    expect(supabase.rpc.mock.calls[0][1].p_motivo).toBeNull()
  })

  it('un código que no existe llega tal cual, para poder avisarlo', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: PERSONA_NO_EXISTE' } })
    await expect(crearPase('CB-0000')).rejects.toThrow('PERSONA_NO_EXISTE')
  })
})

describe('renovar y quitar', () => {
  it('renovar pide otro código para la misma persona', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ codigo_corto: 'CB-4871', nombre: 'María', token: 'nuevo' }],
      error: null,
    })

    await expect(renovarPase('CB-4871')).resolves.toMatchObject({ token: 'nuevo' })
    expect(supabase.rpc).toHaveBeenCalledWith('renovar_pase', { p_codigo: 'CB-4871' })
  })

  it('renovar uno ya retirado llega como PASE_YA_REVOCADO', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: PASE_YA_REVOCADO' } })
    await expect(renovarPase('CB-4871')).rejects.toThrow('PASE_YA_REVOCADO')
  })

  it('quitar manda el motivo; vacío va como null', async () => {
    supabase.rpc.mockResolvedValue({ data: 'PASE_REVOCADO', error: null })

    await expect(revocarPase('CB-4871', ' Lo compartió ')).resolves.toBe('PASE_REVOCADO')
    expect(supabase.rpc).toHaveBeenCalledWith('revocar_pase', {
      p_codigo: 'CB-4871',
      p_motivo: 'Lo compartió',
    })

    await revocarPase('CB-4871', '')
    expect(supabase.rpc.mock.calls[1][1].p_motivo).toBeNull()
  })
})

describe('consultar', () => {
  it('la lista llega como arreglo; sin datos, vacía', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [{ codigo_corto: 'CB-1' }], error: null })
    await expect(listarPases()).resolves.toHaveLength(1)

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(listarPases()).resolves.toEqual([])
  })

  it('los pases del día se piden por fecha', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await entregasPaseDelDia('2026-09-24')
    expect(supabase.rpc).toHaveBeenCalledWith('entregas_pase_del_dia', { p_fecha: '2026-09-24' })
  })

  it('la pantalla de la persona pide su pase por el código del QR', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ nombre: 'María', codigo_corto: 'CB-4871', activo: true }],
      error: null,
    })

    await expect(paseDeCodigo('abc123')).resolves.toEqual({
      nombre: 'María',
      codigo_corto: 'CB-4871',
      activo: true,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('pase_por_token', { p_token: 'abc123' })
  })

  it('un pase que no existe devuelve null, no truena', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(paseDeCodigo('no-existe')).resolves.toBeNull()
  })
})

describe('errores', () => {
  it.each(CODIGOS_PASE)('%s tiene su mensaje en pantalla', (codigo) => {
    expect(es.citas.errores[codigo]).toBeTruthy()
  })

  it.each([
    [{ code: 'PGRST202', message: 'no existe' }, 'FUNCION_NO_INSTALADA'],
    [{ code: '42501', message: 'permission denied' }, 'SIN_PERMISO'],
    [{ message: 'Failed to fetch' }, 'SIN_CONEXION'],
  ])('lo que no es de negocio se clasifica: %o', async (error, esperado) => {
    supabase.rpc.mockResolvedValue({ data: null, error })
    await expect(listarPases()).rejects.toThrow(esperado)
  })
})
