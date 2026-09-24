import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vi_ from '../i18n/vi.json'
import { supabase } from '../lib/supabase'
import {
  CLAVES_PERMISOS,
  CODIGOS_PERMISOS,
  guardarPermiso,
  listarPermisos,
  misPermisos,
  puedeEntrar,
} from './permisos'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('lo que puede quien entró', () => {
  it('solo llegan las palomitas prendidas, como lista de claves', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { clave: 'ver_citas_del_dia', activo: true },
        { clave: 'dar_pases', activo: false },
        { clave: 'anotar_sin_cita', activo: true },
      ],
      error: null,
    })

    await expect(misPermisos()).resolves.toEqual(['ver_citas_del_dia', 'anotar_sin_cita'])
    expect(supabase.rpc).toHaveBeenCalledWith('mis_permisos', {})
  })

  it('sin datos no truena: lista vacía', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(misPermisos()).resolves.toEqual([])
  })
})

describe('administrar la lista', () => {
  it('la lista del panel llega completa, apagadas incluidas', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ clave: 'dar_pases', activo: false }], error: null })
    await expect(listarPermisos()).resolves.toEqual([{ clave: 'dar_pases', activo: false }])
  })

  it('prender y apagar mandan la clave y el valor', async () => {
    supabase.rpc.mockResolvedValue({ data: 'dar_pases', error: null })

    await guardarPermiso('dar_pases', true)
    expect(supabase.rpc).toHaveBeenCalledWith('guardar_permiso', { p_clave: 'dar_pases', p_activo: true })

    await guardarPermiso('dar_pases', false)
    expect(supabase.rpc).toHaveBeenLastCalledWith('guardar_permiso', { p_clave: 'dar_pases', p_activo: false })
  })
})

describe('quién entra a una sección', () => {
  const conPermiso = { a: '/admin/pases', permiso: 'dar_pases' }
  const soloAdmin = { a: '/admin/equipo', roles: ['admin'] }

  it('con la palomita puesta, el voluntario entra', () => {
    expect(puedeEntrar(conPermiso, 'voluntario', ['dar_pases'])).toBe(true)
  })

  it('sin ella, no', () => {
    expect(puedeEntrar(conPermiso, 'voluntario', ['ver_reportes'])).toBe(false)
    expect(puedeEntrar(conPermiso, 'voluntario', [])).toBe(false)
    expect(puedeEntrar(conPermiso, 'voluntario')).toBe(false)
  })

  it('el administrador entra porque la base le devuelve todas', () => {
    expect(puedeEntrar(conPermiso, 'admin', CLAVES_PERMISOS)).toBe(true)
  })

  //  Esta es la regla que pidió el pastor: Equipo y accesos no se abre
  //  ni aunque alguien invente la palomita, porque ahí se dan los roles.
  it('Equipo y accesos NO se abre con ninguna palomita', () => {
    expect(puedeEntrar(soloAdmin, 'voluntario', CLAVES_PERMISOS)).toBe(false)
    expect(puedeEntrar(soloAdmin, 'voluntario', ['equipo', 'admin', 'todo'])).toBe(false)
    expect(puedeEntrar(soloAdmin, 'admin', [])).toBe(true)
  })

  it('una sección sin permiso ni roles no se abre para nadie', () => {
    expect(puedeEntrar({ a: '/admin/nueva' }, 'admin', CLAVES_PERMISOS)).toBe(false)
    expect(puedeEntrar(null, 'admin', CLAVES_PERMISOS)).toBe(false)
  })
})

describe('las palomitas y el panel', () => {
  it('cada una tiene su nombre y su explicación en los tres idiomas', () => {
    for (const clave of CLAVES_PERMISOS) {
      for (const [idioma, textos] of [
        ['es', es],
        ['en', en],
        ['vi', vi_],
      ]) {
        expect(textos.permisos.claves[clave]?.nombre, `${clave} (${idioma})`).toBeTruthy()
        expect(textos.permisos.claves[clave]?.ayuda, `${clave} (${idioma})`).toBeTruthy()
      }
    }
  })

  it('no sobra ninguna explicación de una palomita que ya no existe', () => {
    expect(Object.keys(es.permisos.claves).sort()).toEqual([...CLAVES_PERMISOS].sort())
  })
})

describe('errores', () => {
  it.each(CODIGOS_PERMISOS)('%s llega tal cual y tiene su mensaje', async (codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
    await expect(listarPermisos()).rejects.toThrow(codigo)
    expect(es.permisos.errores[codigo]).toBeTruthy()
  })

  it('lo que no es de negocio se clasifica', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(listarPermisos()).rejects.toThrow('SIN_PERMISO')
  })
})
