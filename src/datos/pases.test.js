import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import {
  buscarPases,
  contarPases,
  diasParaMarcar,
  filtrarPases,
  marcarEntregaPase,
  CODIGOS_PASE,
  crearPase,
  crearPasePreferente,
  entregasPaseDelDia,
  listarPases,
  marcarPasePreferente,
  marcarPaseVip,
  paseDeCodigo,
  renovarPase,
  revocarPase,
} from './pases'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('dar el pase', () => {
  it('un pase preferente se da con su nombre, teléfono opcional y su nota (sección 50)', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo_corto: 'CB-50123', nombre: 'Doña Lupe', token: 'abc' }], error: null })
    await expect(crearPasePreferente('Doña Lupe', { telefono: '+16195550177', nota: '  Andadera azul ' })).resolves.toEqual({
      codigo_corto: 'CB-50123',
      nombre: 'Doña Lupe',
      token: 'abc',
    })
    expect(supabase.rpc).toHaveBeenLastCalledWith('crear_pase_preferente', {
      p_nombre: 'Doña Lupe',
      p_telefono: '+16195550177',
      p_nota: 'Andadera azul',
    })
    await crearPasePreferente('Doña Lupe')
    expect(supabase.rpc).toHaveBeenLastCalledWith('crear_pase_preferente', { p_nombre: 'Doña Lupe', p_telefono: null, p_nota: null })
  })

  it('volver preferente un pase, con o sin cambiar su nota', async () => {
    supabase.rpc.mockResolvedValue({ data: true, error: null })
    await marcarPasePreferente('CB-4871', true, 'Silla de ruedas')
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_pase_preferente', {
      p_codigo: 'CB-4871',
      p_preferente: true,
      p_nota: 'Silla de ruedas',
    })
    await marcarPasePreferente('CB-4871', false)
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_pase_preferente', { p_codigo: 'CB-4871', p_preferente: false, p_nota: null })
  })

  it('un pase VIP: se da el pase y luego se marca VIP', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo_corto: 'CB-6280', nombre: 'Óscar', token: 't' }], error: null })
    await crearPase('CB-6280', 'Suscriptor VIP', { vip: true })
    expect(supabase.rpc.mock.calls.map((llamada) => llamada[0])).toEqual(['crear_pase', 'marcar_pase_vip'])
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_pase_vip', { p_codigo: 'CB-6280', p_vip: true })
  })

  it('sin VIP no se toca lo VIP', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo_corto: 'CB-6280', nombre: 'Óscar', token: 't' }], error: null })
    await crearPase('CB-6280')
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('quitarle lo VIP', async () => {
    supabase.rpc.mockResolvedValue({ data: false, error: null })
    await marcarPaseVip('CB-6280', false)
    expect(supabase.rpc).toHaveBeenCalledWith('marcar_pase_vip', { p_codigo: 'CB-6280', p_vip: false })
  })

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

describe('filtros y entrega a mano (sección 53)', () => {
  const LISTA = [
    { codigo_corto: 'CB-1', nombre: 'José Pérez', telefono: '+16195550101', activo: true, vip: false, preferente: false },
    { codigo_corto: 'CB-2', nombre: 'Ana', activo: true, vip: true, preferente: false },
    { codigo_corto: 'CB-3', nombre: 'Luz', activo: true, vip: false, preferente: true },
    { codigo_corto: 'CB-4', nombre: 'Leo', activo: false, vip: true, preferente: false },
  ]

  it('cada filtro y cuántos hay', () => {
    expect(filtrarPases(LISTA, 'comunes').map((p) => p.codigo_corto)).toEqual(['CB-1'])
    expect(filtrarPases(LISTA, 'vip').map((p) => p.codigo_corto)).toEqual(['CB-2'])
    expect(filtrarPases(LISTA, 'preferentes').map((p) => p.codigo_corto)).toEqual(['CB-3'])
    expect(filtrarPases(LISTA, 'quitados').map((p) => p.codigo_corto)).toEqual(['CB-4'])
    expect(contarPases(LISTA)).toEqual({ todos: 4, comunes: 1, vip: 1, preferentes: 1, quitados: 1 })
  })

  it('busca sin acentos, por código o por teléfono', () => {
    expect(buscarPases(LISTA, 'jose').map((p) => p.codigo_corto)).toEqual(['CB-1'])
    expect(buscarPases(LISTA, 'cb-3').map((p) => p.codigo_corto)).toEqual(['CB-3'])
    expect(buscarPases(LISTA, '555 0101').map((p) => p.codigo_corto)).toEqual(['CB-1'])
    expect(buscarPases(LISTA, '')).toHaveLength(4)
  })

  it('los días para marcar: hasta hoy, sin los cancelados, el más nuevo primero', () => {
    const fechas = [
      { fecha: '2026-10-29', cerrado: false },
      { fecha: '2026-10-22', cerrado: true },
      { fecha: '2026-10-19', cerrado: false },
      { fecha: '2026-10-26', cerrado: false },
    ]
    expect(diasParaMarcar(fechas, '2026-10-27')).toEqual(['2026-10-26', '2026-10-19'])
  })

  it('marcar la entrega manda el día, la fila y el motivo', async () => {
    supabase.rpc.mockResolvedValue({ data: 'MARCADA', error: null })
    await marcarEntregaPase('CB-1', { fecha: '2026-10-26', fila: 'a_pie', motivo: '  ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_entrega_pase', {
      p_codigo: 'CB-1',
      p_fecha: '2026-10-26',
      p_fila: 'a_pie',
      p_motivo: null,
    })
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'PASE_YA_ENTREGADO' } })
    await expect(marcarEntregaPase('CB-1', { fecha: '2026-10-26' })).rejects.toThrow('PASE_YA_ENTREGADO')
  })
})
