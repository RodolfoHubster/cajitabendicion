import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import { CODIGOS, guardarAcceso, guardarMiCodigo, listarEquipo, quitarAcceso } from './equipo'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('equipo', () => {
  it('lista el equipo; sin datos, vacia', async () => {
    const fila = { correo: 'pastor@gmail.com', rol: 'admin', estado: 'activo', es_yo: true }
    supabase.rpc.mockResolvedValueOnce({ data: [fila], error: null })
    await expect(listarEquipo()).resolves.toEqual([fila])
    expect(supabase.rpc).toHaveBeenCalledWith('listar_personal', {})

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(listarEquipo()).resolves.toEqual([])
  })

  it('dar acceso a alguien que no ha entrado queda pendiente', async () => {
    supabase.rpc.mockResolvedValue({ data: 'PENDIENTE: nuevo@gmail.com sera voluntario', error: null })

    await expect(guardarAcceso('  nuevo@gmail.com ', 'voluntario')).resolves.toBe('pendiente')
    expect(supabase.rpc).toHaveBeenCalledWith('guardar_personal', { p_correo: 'nuevo@gmail.com', p_rol: 'voluntario' })
  })

  it('a alguien que ya entro se le aplica al momento', async () => {
    supabase.rpc.mockResolvedValue({ data: 'PERSONAL_LISTO: admin', error: null })
    await expect(guardarAcceso('ya@gmail.com', 'admin')).resolves.toBe('listo')
  })

  it('quitar acceso manda el correo', async () => {
    supabase.rpc.mockResolvedValue({ data: 'ACCESO_QUITADO', error: null })

    await expect(quitarAcceso('otro@gmail.com')).resolves.toBe('ACCESO_QUITADO')
    expect(supabase.rpc).toHaveBeenCalledWith('quitar_acceso_personal', { p_correo: 'otro@gmail.com' })
  })

  it('guardar mi codigo manda el codigo tal cual (puede llevar espacios a proposito)', async () => {
    supabase.rpc.mockResolvedValue({ data: 'AUTORIZADOR_LISTO', error: null })

    await guardarMiCodigo('mi codigo 123')
    expect(supabase.rpc).toHaveBeenCalledWith('definir_mi_codigo_autorizacion', { p_codigo: 'mi codigo 123' })
  })
})

describe('errores', () => {
  it.each([
    ['P0001: NO_PUEDES_QUITARTE_ADMIN', 'NO_PUEDES_QUITARTE_ADMIN'],
    ['P0001: CODIGO_MUY_CORTO: el codigo debe tener al menos 6 caracteres', 'CODIGO_MUY_CORTO'],
    ['P0001: CORREO_INVALIDO: revisa como esta escrito el correo', 'CORREO_INVALIDO'],
    ['P0001: ROL_INVALIDO: usa admin o voluntario', 'ROL_INVALIDO'],
    ['P0001: PERSONAL_NO_EXISTE', 'PERSONAL_NO_EXISTE'],
  ])('%s -> %s', async (mensaje, codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: mensaje } })
    await expect(quitarAcceso('x@gmail.com')).rejects.toThrow(new RegExp(`^${codigo}$`))
  })

  it('un voluntario que entra a esta pantalla recibe SIN_PERMISO', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(listarEquipo()).rejects.toThrow('SIN_PERMISO')
  })

  it.each([...CODIGOS, 'FUNCION_NO_INSTALADA', 'SIN_PERMISO', 'SIN_CONEXION', 'ERROR_DESCONOCIDO'])(
    '%s tiene su mensaje en pantalla',
    (codigo) => {
      expect(es.equipo.errores[codigo]).toBeTruthy()
    },
  )
})
