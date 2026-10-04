import { describe, expect, it, vi } from 'vitest'
import {
  CODIGO_DEMO,
  LLAVE_DEMO,
  PASAN_A_LA_BASE,
  disponibilidadDeEjemplo,
  esDelPersonal,
  fechasDeEjemplo,
  instalarDemo,
  leerDemoDeUrl,
  leerIdBloque,
  respuestaDemo,
} from './demo'

function almacen() {
  const datos = new Map()
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  }
}

//  Sabado 3 de octubre de 2026: los que siguen son lunes 5 y jueves 8.
const HOY = '2026-10-03'

describe('prender y apagar el modo de ejemplo', () => {
  it('?demo=1 lo prende y se queda en la pestaña; ?demo=0 lo apaga', () => {
    const sesion = almacen()
    expect(leerDemoDeUrl('', sesion)).toBe(false)
    expect(leerDemoDeUrl('?demo=1', sesion)).toBe(true)
    expect(leerDemoDeUrl('?otra=cosa', sesion)).toBe(true)
    expect(sesion.getItem(LLAVE_DEMO)).toBe('si')
    expect(leerDemoDeUrl('?demo=0', sesion)).toBe(false)
  })

  it('el panel y el escáner nunca entran', () => {
    expect(esDelPersonal('/admin')).toBe(true)
    expect(esDelPersonal('/admin/pases')).toBe(true)
    expect(esDelPersonal('/escanear')).toBe(true)
    expect(esDelPersonal('/registro')).toBe(false)
    expect(esDelPersonal('/administracion')).toBe(false)
  })
})

describe('fechas y horarios de ejemplo', () => {
  it('los dos próximos lunes o jueves, contando hoy', () => {
    expect(fechasDeEjemplo(HOY)).toEqual(['2026-10-05', '2026-10-08'])
    expect(fechasDeEjemplo('2026-10-05')).toEqual(['2026-10-05', '2026-10-08'])
  })

  it('carro: horarios de 2:45 a 6:30, abiertos y con lugares', () => {
    const bloques = disponibilidadDeEjemplo({}, HOY)
    const lunes = bloques.filter((b) => b.fecha === '2026-10-05')
    expect(lunes).toHaveLength(16)
    expect(lunes[0].hora).toBe('14:45:00')
    expect(lunes.at(-1).hora).toBe('18:30:00')
    expect(bloques.every((b) => b.abierto && b.libres > 0 && b.libres + b.ocupados === b.capacidad)).toBe(true)
    expect(leerIdBloque(lunes[0].bloque_id)).toEqual({ fila: 'carro', fecha: '2026-10-05', hora: '14:45:00' })
  })

  it('a pie: una fila abierta por día', () => {
    const filas = disponibilidadDeEjemplo({ p_fila: 'a_pie' }, HOY)
    expect(filas.map((f) => f.fecha)).toEqual(['2026-10-05', '2026-10-08'])
    expect(filas.every((f) => f.abierto && f.libres > 0)).toBe(true)
  })

  it('respeta desde y hasta', () => {
    const bloques = disponibilidadDeEjemplo({ p_desde: '2026-10-08', p_hasta: '2026-10-08' }, HOY)
    expect(new Set(bloques.map((b) => b.fecha))).toEqual(new Set(['2026-10-08']))
  })
})

describe('una cita de ejemplo, de principio a fin', () => {
  it('en carro: registrar, verla, cambiarla y cancelarla, sin salir de la pestaña', () => {
    const sesion = almacen()
    const opciones = { hoy: HOY, almacen: sesion, azar: () => 0.5 }
    const [bloque] = disponibilidadDeEjemplo({}, HOY)

    const { data } = respuestaDemo('registrar_y_reservar', { p_bloque_id: bloque.bloque_id, p_nombre: 'María', p_apellidos: 'Ejemplo' }, opciones)
    const [registro] = data
    expect(registro).toMatchObject({ codigo_corto: CODIGO_DEMO, fecha: '2026-10-05', hora: '14:45:00', ya_existia: false })
    expect(registro.token_qr.startsWith('demo-')).toBe(true)

    expect(respuestaDemo('consultar_cita', { p_token: registro.token_qr }, opciones).data[0]).toMatchObject({
      nombre: 'María Ejemplo',
      estado: 'reservada',
      fila: 'carro',
    })

    const otro = disponibilidadDeEjemplo({}, HOY)[5]
    expect(respuestaDemo('mover_mi_cita', { p_token: registro.token_qr, p_bloque_id: otro.bloque_id }, opciones).data[0].hora).toBe(otro.hora)
    respuestaDemo('cancelar_mi_cita', { p_token: registro.token_qr }, opciones)
    expect(respuestaDemo('consultar_cita', { p_token: registro.token_qr }, opciones).data[0].estado).toBe('cancelada')
  })

  it('de acompañante, a la hora de quien maneja', () => {
    const opciones = { hoy: HOY, almacen: almacen() }
    const { data } = respuestaDemo('registrar_y_reservar', { p_bloque_id: null, p_fecha: '2026-10-08', p_codigo_acompanante: 'CB-4871' }, opciones)
    expect(data[0]).toMatchObject({ fecha: '2026-10-08', hora: '15:00:00' })
  })

  it('a pie: tiene su turno y la fila va avanzando', () => {
    const opciones = { hoy: HOY, almacen: almacen() }
    const [fila] = disponibilidadDeEjemplo({ p_fila: 'a_pie' }, HOY)
    const token = respuestaDemo('registrar_y_reservar', { p_bloque_id: fila.bloque_id, p_nombre: 'Ana', p_apellidos: 'Ejemplo' }, opciones).data[0].token_qr
    expect(respuestaDemo('consultar_cita', { p_token: token }, opciones).data[0]).toMatchObject({ fila: 'a_pie', turno: 13 })
    expect(respuestaDemo('turno_de_cita', { p_token: token }, opciones).data[0]).toMatchObject({ turno: 13, actual: 9, antes: 4 })
  })

  it('un código que no es de ejemplo no se encuentra', () => {
    expect(respuestaDemo('consultar_cita', { p_token: 'token-de-verdad' }, { almacen: almacen() }).data).toEqual([])
  })

  it('lo que no se conoce no se contesta (nunca llega a la base)', () => {
    expect(respuestaDemo('registrar_entrega', {}, { almacen: almacen() }).error.message).toMatch(/MODO_DEMO/)
  })
})

describe('instalarDemo', () => {
  const cliente = () => ({ rpc: vi.fn().mockResolvedValue({ data: 'de-la-base', error: null }) })

  it('en el ejemplo, registrar NO llega a la base', async () => {
    const real = cliente()
    const rpcReal = real.rpc
    instalarDemo(real, { activo: () => true, ruta: () => '/registro', espera: 0 })
    const { data } = await real.rpc('registrar_y_reservar', { p_bloque_id: null, p_fecha: '2026-10-05', p_codigo_acompanante: 'CB-1' })
    expect(data[0].codigo_corto).toBe(CODIGO_DEMO)
    expect(rpcReal).not.toHaveBeenCalled()
  })

  it('los textos y los códigos postales sí se leen de la base', async () => {
    const real = cliente()
    const rpcReal = real.rpc
    instalarDemo(real, { activo: () => true, ruta: () => '/registro', espera: 0 })
    for (const nombre of PASAN_A_LA_BASE) await real.rpc(nombre, {})
    expect(rpcReal).toHaveBeenCalledTimes(PASAN_A_LA_BASE.length)
  })

  it('el panel no se entera del ejemplo', async () => {
    const real = cliente()
    const rpcReal = real.rpc
    instalarDemo(real, { activo: () => true, ruta: () => '/admin/pases', espera: 0 })
    await expect(real.rpc('listar_pases', {})).resolves.toEqual({ data: 'de-la-base', error: null })
    expect(rpcReal).toHaveBeenCalledOnce()
  })

  it('sin ?demo=1 todo va a la base, como siempre', async () => {
    const real = cliente()
    const rpcReal = real.rpc
    instalarDemo(real, { activo: () => false, ruta: () => '/registro', espera: 0 })
    await real.rpc('registrar_y_reservar', {})
    expect(rpcReal).toHaveBeenCalledOnce()
  })
})
