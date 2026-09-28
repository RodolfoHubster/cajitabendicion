import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vi_ from '../i18n/vi.json'
import { supabase } from '../lib/supabase'
import {
  PASOS_GUIA,
  VERSION_GUIA,
  guiaDeRol,
  marcarGuiaVista,
  pasosDeGuia,
  pasosPendientes,
  versionVista,
  versionVistaLocal,
} from './guia'

//  Un localStorage de mentiras: en las pruebas no hay navegador.
function almacenFalso() {
  const datos = new Map()
  return {
    getItem: (llave) => (datos.has(llave) ? datos.get(llave) : null),
    setItem: (llave, valor) => datos.set(llave, String(valor)),
    removeItem: (llave) => datos.delete(llave),
  }
}

beforeEach(() => {
  supabase.rpc.mockReset()
  vi.stubGlobal('localStorage', almacenFalso())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const claves = (pasos) => pasos.map((paso) => paso.clave)
const TODAS = ['citasHoy', 'registrar', 'horarios', 'pases', 'personas', 'reportes', 'avisos', 'equipo', 'permisos', 'escanear']

describe('pasosDeGuia (cada quien ve solo lo que puede usar)', () => {
  it('un voluntario que solo escanea: lo del escáner, sin menú que explicar', () => {
    expect(claves(pasosDeGuia({ rol: 'voluntario', permisos: [], secciones: ['escanear'] }))).toEqual([
      'bienvenida',
      'escanear',
      'colores',
      'deshacer',
      'buscar',
      'elegirFila',
      'dosQr',
      'turnos',
      'listo',
    ])
  })

  it('quien ya vio la primera guía solo ve lo nuevo de la fila a pie', () => {
    const voluntario = pasosDeGuia({ rol: 'voluntario', permisos: [], secciones: ['escanear'] })
    expect(claves(pasosPendientes(voluntario, 1))).toEqual(['elegirFila', 'dosQr', 'turnos'])

    const admin = pasosDeGuia({ rol: 'admin', permisos: [], secciones: ['escanear', 'horarios'] })
    expect(claves(pasosPendientes(admin, 1))).toEqual(['elegirFila', 'dosQr', 'turnos', 'filaAPie'])
    expect(VERSION_GUIA).toBe(2)
  })

  it('con sus palomitas: el menú, anotar sin cita y citas de hoy', () => {
    const pasos = claves(
      pasosDeGuia({
        rol: 'voluntario',
        permisos: ['ver_citas_del_dia', 'anotar_sin_cita'],
        secciones: ['citasHoy', 'escanear'],
      }),
    )
    expect(pasos).toContain('menu')
    expect(pasos).toContain('sinCita')
    expect(pasos).toContain('citasHoy')
    expect(pasos).not.toContain('horarios')
    expect(pasos).not.toContain('equipo')
  })

  it('el administrador ve la guía completa, en orden', () => {
    expect(claves(pasosDeGuia({ rol: 'admin', permisos: [], secciones: TODAS }))).toEqual(claves(PASOS_GUIA))
  })

  it('empieza con la bienvenida y termina con "listo"', () => {
    const pasos = claves(pasosDeGuia({ rol: 'voluntario', permisos: [], secciones: ['escanear'] }))
    expect(pasos[0]).toBe('bienvenida')
    expect(pasos.at(-1)).toBe('listo')
  })

  it('cada rol tiene su guía', () => {
    expect(guiaDeRol('admin')).toBe('admin')
    expect(guiaDeRol('voluntario')).toBe('voluntario')
  })
})

describe('pasosPendientes (la primera vez todo; después, solo las novedades)', () => {
  const pasos = [
    { clave: 'a', desde: 1 },
    { clave: 'b', desde: 2 },
    { clave: 'c', desde: 3 },
  ]

  it('quien nunca la vio, la ve completa', () => {
    expect(claves(pasosPendientes(pasos, 0))).toEqual(['a', 'b', 'c'])
  })

  it('quien vio la versión 1, solo lo que cambió después', () => {
    expect(claves(pasosPendientes(pasos, 1))).toEqual(['b', 'c'])
  })

  it('quien vio la última, nada', () => {
    expect(pasosPendientes(pasos, 3)).toEqual([])
  })

  it('la versión de la guía es la del paso más nuevo', () => {
    expect(VERSION_GUIA).toBe(Math.max(...PASOS_GUIA.map((paso) => paso.desde)))
  })
})

describe('versionVista (se guarda por cuenta, en el teléfono y en la base)', () => {
  it('si en este teléfono ya vio la última, ni le pregunta a la base', async () => {
    localStorage.setItem('cajita-guia-voluntario-ana@gmail.com', String(VERSION_GUIA))
    await expect(versionVista('voluntario', 'Ana@gmail.com')).resolves.toBe(VERSION_GUIA)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('un teléfono compartido no le esconde la guía al segundo voluntario', async () => {
    localStorage.setItem('cajita-guia-voluntario-ana@gmail.com', String(VERSION_GUIA))
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(versionVista('voluntario', 'luis@gmail.com')).resolves.toBe(0)
  })

  it('si la vio en otro teléfono, lo sabe por la base y lo recuerda aquí', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ guia: 'voluntario', version: VERSION_GUIA }], error: null })
    await expect(versionVista('voluntario', 'ana@gmail.com')).resolves.toBe(VERSION_GUIA)
    expect(versionVistaLocal('voluntario', 'ana@gmail.com')).toBe(VERSION_GUIA)
  })

  it('sin la migración o sin señal: se queda con lo de este teléfono', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(versionVista('admin', 'pastor@gmail.com')).resolves.toBe(0)
  })

  it('sin localStorage (navegador privado): no truena', async () => {
    vi.stubGlobal('localStorage', undefined)
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(versionVista('admin', 'pastor@gmail.com')).resolves.toBe(0)
  })
})

describe('marcarGuiaVista', () => {
  it('se guarda en el teléfono y en la base', async () => {
    supabase.rpc.mockResolvedValue({ data: VERSION_GUIA, error: null })
    await expect(marcarGuiaVista('admin', 'pastor@gmail.com')).resolves.toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('marcar_guia_vista', { p_guia: 'admin', p_version: VERSION_GUIA })
    expect(versionVistaLocal('admin', 'pastor@gmail.com')).toBe(VERSION_GUIA)
  })

  it('si la base falla, al menos queda en el teléfono (y no truena)', async () => {
    supabase.rpc.mockRejectedValue(new Error('sin señal'))
    await expect(marcarGuiaVista('admin', 'pastor@gmail.com')).resolves.toBe(false)
    expect(versionVistaLocal('admin', 'pastor@gmail.com')).toBe(VERSION_GUIA)
  })
})

describe('cada paso tiene su texto y su escena', () => {
  const idiomas = { es, en, vi: vi_ }

  it.each(Object.keys(idiomas))('en %s: título y texto de cada paso, y los botones', (idioma) => {
    const guia = idiomas[idioma].guia
    for (const { clave } of PASOS_GUIA) {
      expect(guia?.pasos?.[clave]?.titulo, `${clave}.titulo (${idioma})`).toBeTruthy()
      expect(guia?.pasos?.[clave]?.texto, `${clave}.texto (${idioma})`).toBeTruthy()
    }
    for (const boton of ['abrir', 'paso', 'anterior', 'siguiente', 'empezar', 'saltar', 'cerrar', 'irAlPaso', 'novedades']) {
      expect(guia?.[boton], `${boton} (${idioma})`).toBeTruthy()
    }
  })

  it('cada paso tiene su dibujo animado', () => {
    const escenas = readFileSync(new URL('../componentes/guia/Escenas.jsx', import.meta.url), 'utf8')
    const lista = escenas.slice(escenas.indexOf('const ESCENAS = {'))
    for (const { clave } of PASOS_GUIA) {
      expect(lista, clave).toMatch(new RegExp(`\\b${clave}: `))
    }
  })
})
