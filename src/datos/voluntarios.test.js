import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import esquema from '../../supabase/schema.sql?raw'
import {
  CODIGOS_VOLUNTARIOS,
  agregarAsistencia,
  anularAsistencia,
  buscarVoluntarios,
  corregirAsistencia,
  csvDeHoras,
  enlaceCredencial,
  esCredencial,
  esQrDeCita,
  horasDecimales,
  horasDeVoluntarios,
  marcarAsistencia,
  nombreArchivoHoras,
  problemaAsistencia,
  rangoDelMes,
  registrarVoluntario,
  textoDuracion,
} from './voluntarios'

beforeEach(() => {
  supabase.rpc.mockReset()
})

const CREDENCIAL = `vol${'a1'.repeat(24)}`
const DE_CITA = 'b2'.repeat(24)

describe('la credencial del voluntario', () => {
  it('se distingue de una cita o un pase por el "vol" del principio', () => {
    expect(esCredencial(CREDENCIAL)).toBe(true)
    expect(esCredencial(` ${CREDENCIAL.toUpperCase()} `)).toBe(true)
    expect(esCredencial(DE_CITA)).toBe(false)
    expect(esCredencial('vol123')).toBe(false)
    expect(esQrDeCita(DE_CITA)).toBe(true)
    expect(esQrDeCita(CREDENCIAL)).toBe(false)
  })

  it('su enlace es /voluntario/ y su código', () => {
    expect(enlaceCredencial(CREDENCIAL, 'https://citas.casadealabanzasd.com')).toBe(
      `https://citas.casadealabanzasd.com/voluntario/${CREDENCIAL}`,
    )
  })

  it('la base genera las credenciales con el mismo "vol" que reconoce la pantalla', () => {
    expect(esquema).toContain("'vol' || encode(gen_random_bytes(24), 'hex')")
  })
})

describe('registrar y marcar', () => {
  it('el contacto vacío no se manda', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'v1', nombre: 'Juana', token: CREDENCIAL }], error: null })
    await expect(registrarVoluntario('Juana', '   ')).resolves.toEqual({ id: 'v1', nombre: 'Juana', token: CREDENCIAL })
    expect(supabase.rpc).toHaveBeenLastCalledWith('registrar_voluntario', { p_nombre: 'Juana', p_contacto: null })
  })

  it('marca con la credencial o, si no la trae, por quién es', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'ENTRADA' }], error: null })
    await expect(marcarAsistencia({ token: ` ${CREDENCIAL} ` })).resolves.toEqual({ resultado: 'ENTRADA' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_asistencia', { p_token: CREDENCIAL })
    await marcarAsistencia({ voluntario: 'v1' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_asistencia', { p_voluntario: 'v1' })
  })

  it('los errores de la base llegan con su nombre', async () => {
    for (const codigo of CODIGOS_VOLUNTARIOS) {
      supabase.rpc.mockResolvedValue({ data: null, error: { message: codigo } })
      await expect(anularAsistencia(1, 'x')).rejects.toThrow(codigo)
    }
    //  Y cada uno tiene su texto en la base: si no, la pantalla diria otra cosa.
    for (const codigo of CODIGOS_VOLUNTARIOS) expect(esquema, codigo).toContain(`'${codigo}'`)
  })

  it('corregir y agregar mandan las horas como se escribieron y el motivo limpio', async () => {
    supabase.rpc.mockResolvedValue({ data: 'CORREGIDA', error: null })
    await corregirAsistencia(7, { entrada: '2026-10-20T09:00', salida: '2026-10-20T13:30', motivo: ' Se fue ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('corregir_asistencia', {
      p_id: 7,
      p_entrada: '2026-10-20T09:00',
      p_salida: '2026-10-20T13:30',
      p_motivo: 'Se fue',
    })
    await agregarAsistencia('v1', { entrada: '2026-10-19T10:00', salida: '2026-10-19T12:00', motivo: 'Olvidó' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('agregar_asistencia', {
      p_voluntario: 'v1',
      p_entrada: '2026-10-19T10:00',
      p_salida: '2026-10-19T12:00',
      p_motivo: 'Olvidó',
    })
  })

  it('qué falta antes de corregir', () => {
    const bien = { entrada: '2026-10-20T09:00', salida: '2026-10-20T13:30', motivo: 'Se fue sin marcar' }
    expect(problemaAsistencia(bien)).toBeNull()
    expect(problemaAsistencia({ ...bien, salida: '' })).toBe('HORAS_INVALIDAS')
    expect(problemaAsistencia({ ...bien, salida: '2026-10-20T08:00' })).toBe('HORAS_INVALIDAS')
    expect(problemaAsistencia({ ...bien, motivo: '  ' })).toBe('MOTIVO_REQUERIDO')
  })
})

describe('las horas', () => {
  const t = (clave, v) => ({ 'voluntarios.duracion.min': `${v.m} min`, 'voluntarios.duracion.h': `${v.h} h`, 'voluntarios.duracion.hMin': `${v.h} h ${v.m} min` })[clave]

  it('se dicen en horas y minutos', () => {
    expect(textoDuracion(t, 255)).toBe('4 h 15 min')
    expect(textoDuracion(t, 45)).toBe('45 min')
    expect(textoDuracion(t, 120)).toBe('2 h')
    expect(textoDuracion(t, null)).toBe('0 min')
  })

  it('para Excel van con decimales', () => {
    expect(horasDecimales(255)).toBe(4.25)
    expect(horasDecimales(100)).toBe(1.67)
    expect(horasDecimales(0)).toBe(0)
  })

  it('el rango de arranque es el mes de hoy', () => {
    expect(rangoDelMes('2026-10-20')).toEqual({ desde: '2026-10-01', hasta: '2026-10-20' })
  })

  it('el archivo trae nombre, días, horas y sin salida', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ voluntario_id: 'v1', nombre: 'Pérez, Juana', activo: true, dias: 2, minutos: 465, sin_salida: 1 }],
      error: null,
    })
    const filas = await horasDeVoluntarios('2026-10-01', '2026-10-20')
    expect(supabase.rpc).toHaveBeenLastCalledWith('horas_de_voluntarios', { p_desde: '2026-10-01', p_hasta: '2026-10-20' })
    const csv = csvDeHoras(filas, { nombre: 'Nombre', dias: 'Días', horas: 'Horas', sinSalida: 'Sin salida' })
    expect(csv).toBe('Nombre,Días,Horas,Sin salida\r\n"Pérez, Juana",2,7.75,1\r\n')
    expect(nombreArchivoHoras('2026-10-01', '2026-10-20')).toBe('cajita-horas-voluntarios-2026-10-01_a_2026-10-20.csv')
  })
})

describe('buscar a quien no trae su credencial', () => {
  const lista = [
    { id: '1', nombre: 'José Pérez' },
    { id: '2', nombre: 'María López' },
    { id: '3', nombre: 'Josefina Ruiz' },
  ]

  it('por nombre, sin acentos ni mayúsculas', () => {
    expect(buscarVoluntarios(lista, 'jose').map((v) => v.id)).toEqual(['1', '3'])
    expect(buscarVoluntarios(lista, 'LÓPEZ').map((v) => v.id)).toEqual(['2'])
    expect(buscarVoluntarios(lista, '  ')).toEqual([])
    expect(buscarVoluntarios(lista, 'jos', 1)).toHaveLength(1)
  })
})
