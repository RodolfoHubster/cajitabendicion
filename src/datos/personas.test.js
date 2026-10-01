import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import { MAXIMO_ABIERTOS, agruparPersonas, alternarAbierto, buscarPersonas, codigoParaPase, sePuedeBuscar } from './personas'

const fila = (cambios) => ({
  codigo_corto: 'CB-0001',
  nombre: 'Óscar Chávez',
  nombre_clave: 'oscar chavez',
  grupo: 'g1',
  telefono_final: '8801',
  ciudad: 'San Diego',
  registrada_en: '2026-09-01T10:00:00Z',
  citas: 1,
  cajas: 1,
  ultima_fecha: '2026-09-01',
  pase_activo: false,
  vip: false,
  ...cambios,
})

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('buscarPersonas', () => {
  it('con menos de dos letras no pregunta a la base', async () => {
    await expect(buscarPersonas(' o ')).resolves.toEqual([])
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(sePuedeBuscar('os')).toBe(true)
    expect(sePuedeBuscar('')).toBe(false)
  })

  it('manda el texto sin espacios de más', async () => {
    supabase.rpc.mockResolvedValue({ data: [fila()], error: null })
    await expect(buscarPersonas('  oscar  ')).resolves.toHaveLength(1)
    expect(supabase.rpc).toHaveBeenCalledWith('buscar_personas', { p_texto: 'oscar' })
  })

  it('sin la palomita dice SIN_PERMISO; sin la actualización de la base, FUNCION_NO_INSTALADA', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(buscarPersonas('oscar')).rejects.toThrow('SIN_PERMISO')

    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no existe' } })
    await expect(buscarPersonas('oscar')).rejects.toThrow('FUNCION_NO_INSTALADA')
  })
})

describe('agruparPersonas', () => {
  const filas = [
    fila({ codigo_corto: 'CB-0003', registrada_en: '2026-09-28T10:00:00Z', ultima_fecha: '2026-09-29', cajas: 0 }),
    fila({ codigo_corto: 'CB-0001', registrada_en: '2026-09-01T10:00:00Z', pase_activo: true, vip: true, cajas: 2 }),
    fila({ codigo_corto: 'CB-0002', grupo: 'g2', telefono_final: '8802', ciudad: 'Chula Vista' }),
    fila({ codigo_corto: 'CB-0009', grupo: 'g3', nombre: 'Ana Ruiz', nombre_clave: 'ana ruiz' }),
  ]

  it('junta los registros de la misma persona (mismo nombre y teléfono)', () => {
    const grupos = agruparPersonas(filas)
    expect(grupos.map((g) => g.registros.map((r) => r.codigo_corto))).toEqual([
      ['CB-0003', 'CB-0001'],
      ['CB-0002'],
      ['CB-0009'],
    ])
  })

  it('suma las cajas, toma la última visita y dice si alguno tiene pase o es VIP', () => {
    const [oscar] = agruparPersonas(filas)
    expect(oscar).toMatchObject({ cajas: 2, citas: 2, ultimaFecha: '2026-09-29', paseActivo: true, vip: true })
  })

  it('el mismo nombre con otro teléfono se marca: puede ser otra persona', () => {
    const grupos = agruparPersonas(filas)
    expect(grupos.map((g) => g.mismoNombre)).toEqual([true, true, false])
    expect(grupos[1]).toMatchObject({ telefonoFinal: '8802', ciudad: 'Chula Vista' })
  })

  it('sin resultados, lista vacía', () => {
    expect(agruparPersonas(null)).toEqual([])
  })
})

describe('alternarAbierto (tres abiertas a lo mucho)', () => {
  it('abre y cierra', () => {
    expect(alternarAbierto([], 'a')).toEqual(['a'])
    expect(alternarAbierto(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('al abrir la cuarta se cierra la que se abrió primero', () => {
    expect(MAXIMO_ABIERTOS).toBe(3)
    expect(alternarAbierto(['a', 'b', 'c'], 'd')).toEqual(['b', 'c', 'd'])
    expect(alternarAbierto(['b', 'c', 'd'], 'e')).toEqual(['c', 'd', 'e'])
  })

  it('cerrar una no cierra las demás', () => {
    expect(alternarAbierto(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})

describe('codigoParaPase', () => {
  it('si un registro ya tiene pase, va a ese (no se dan dos)', () => {
    const [oscar] = agruparPersonas([
      fila({ codigo_corto: 'CB-0003', registrada_en: '2026-09-28T10:00:00Z' }),
      fila({ codigo_corto: 'CB-0001', pase_activo: true }),
    ])
    expect(codigoParaPase(oscar)).toBe('CB-0001')
  })

  it('si no, al registro más reciente', () => {
    const [oscar] = agruparPersonas([
      fila({ codigo_corto: 'CB-0001', registrada_en: '2026-09-01T10:00:00Z' }),
      fila({ codigo_corto: 'CB-0003', registrada_en: '2026-09-28T10:00:00Z' }),
    ])
    expect(codigoParaPase(oscar)).toBe('CB-0003')
  })

  it('sin registros, nada', () => {
    expect(codigoParaPase(null)).toBeNull()
  })
})
