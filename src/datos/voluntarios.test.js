import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import esquema from '../../supabase/schema.sql?raw'
import {
  CODIGOS_VOLUNTARIOS,
  agregarAsistencia,
  anularAsistencia,
  buscarVoluntarios,
  cerrarDiaVoluntarios,
  contactoEnTexto,
  contarPorFiltro,
  contarResultados,
  anotarDiaVoluntarios,
  ajustesVoluntarios,
  guardarAjustesVoluntarios,
  horaParaCerrar,
  montonesParaPasarLista,
  nombreRepetido,
  pasarLista,
  resumenDeHoy,
  salidaTemprana,
  voluntariosAlDia,
  corregirAsistencia,
  csvDeHoras,
  editarVoluntario,
  enlaceCorreoCredencial,
  enlaceCredencial,
  enlaceGmailCredencial,
  enlaceOutlookCredencial,
  enlaceSmsCredencial,
  enlaceWhatsAppCredencial,
  esCredencial,
  esQrDeCita,
  horasDecimales,
  filtrarVoluntarios,
  horasDeVoluntarios,
  marcarAsistencia,
  marcarCredencialEnviada,
  mensajeCredencial,
  nombreArchivoHoras,
  ordenarVoluntarios,
  problemaAsistencia,
  rangoDelMes,
  registrarVoluntario,
  separarContacto,
  telefonoBonito,
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
  it('teléfono y correo van por separado, y lo vacío no se manda', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'v1', nombre: 'Juana', token: CREDENCIAL }], error: null })
    await expect(registrarVoluntario('Juana', { telefono: '+16195550101', correo: '  ' })).resolves.toEqual({
      id: 'v1',
      nombre: 'Juana',
      token: CREDENCIAL,
    })
    expect(supabase.rpc).toHaveBeenLastCalledWith('registrar_voluntario', {
      p_nombre: 'Juana',
      p_telefono: '+16195550101',
      p_correo: null,
    })
    await editarVoluntario('v1', 'Juana Pérez', { correo: 'juana@gmail.com' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('editar_voluntario', {
      p_id: 'v1',
      p_nombre: 'Juana Pérez',
      p_telefono: null,
      p_correo: 'juana@gmail.com',
    })
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

describe('teléfono o correo, en un solo campo (sección 49)', () => {
  it('un teléfono de San Diego, como sea que se escriba', () => {
    expect(separarContacto('619 555 0101')).toMatchObject({ telefono: '+16195550101', pais: 'US', correo: null, error: null })
    expect(separarContacto('(619) 555-0101')).toMatchObject({ telefono: '+16195550101' })
    expect(separarContacto('+1 619 555 0101')).toMatchObject({ telefono: '+16195550101' })
  })

  it('uno de Tijuana: con 664 o 665 sin lada, o con +52', () => {
    expect(separarContacto('664 123 4567')).toMatchObject({ telefono: '+526641234567', pais: 'MX' })
    expect(separarContacto('+52 646 123 4567')).toMatchObject({ telefono: '+526461234567', pais: 'MX' })
    expect(separarContacto('52 664 123 4567')).toMatchObject({ telefono: '+526641234567', pais: 'MX' })
    //  646 sin lada tambien es de Nueva York: se queda en Estados Unidos.
    expect(separarContacto('646 123 4567')).toMatchObject({ telefono: '+16461234567', pais: 'US' })
  })

  it('un correo, en minúsculas', () => {
    expect(separarContacto('  Juana.Perez@Gmail.com ')).toEqual({ telefono: null, pais: null, correo: 'juana.perez@gmail.com', error: null })
  })

  it('los dos juntos', () => {
    expect(separarContacto('619 555 0101, juana@gmail.com')).toMatchObject({
      telefono: '+16195550101',
      correo: 'juana@gmail.com',
      error: null,
    })
    expect(separarContacto('juana@gmail.com / 664 123 4567')).toMatchObject({
      telefono: '+526641234567',
      correo: 'juana@gmail.com',
    })
  })

  it('lo que no es ni teléfono ni correo', () => {
    expect(separarContacto('')).toEqual({ telefono: null, pais: null, correo: null, error: null })
    expect(separarContacto('555 01')).toMatchObject({ telefono: null, error: 'TELEFONO_INVALIDO' })
    expect(separarContacto('pregúntale a Juana')).toMatchObject({ error: 'TELEFONO_INVALIDO' })
    expect(separarContacto('juana@gmail')).toMatchObject({ correo: 'juana@gmail', error: 'CORREO_INVALIDO' })
  })

  it('al editar, lo que tiene se junta en el campo', () => {
    expect(contactoEnTexto({ telefono: '+16195550101', correo: 'a@b.com' })).toBe('+16195550101, a@b.com')
    expect(contactoEnTexto({ telefono: null, correo: null, contacto_viejo: 'pregúntale' })).toBe('pregúntale')
    expect(contactoEnTexto({})).toBe('')
  })

  it('el teléfono se ve con espacios', () => {
    expect(telefonoBonito('+16195550101')).toBe('+1 619 555 0101')
    expect(telefonoBonito('+526641234567')).toBe('+52 664 123 4567')
    expect(telefonoBonito('+447700900123')).toBe('+447700900123')
  })
})

describe('mandar la credencial (sección 49)', () => {
  const t = (clave, v) => `${clave}|${v.nombre}|${v.enlace}`

  it('el mensaje lleva su primer nombre y su enlace', () => {
    expect(mensajeCredencial(t, 'Juana María Pérez', 'https://x/voluntario/abc')).toBe(
      'voluntarios.envio.mensaje|Juana|https://x/voluntario/abc',
    )
  })

  it('WhatsApp con el número y el mensaje ya escritos', () => {
    expect(enlaceWhatsAppCredencial('+1 619 555 0101', 'Hola y adiós')).toBe('https://wa.me/16195550101?text=Hola%20y%20adi%C3%B3s')
    expect(enlaceWhatsAppCredencial('', 'Hola')).toBeNull()
  })

  it('el correo también en Gmail u Outlook del navegador, con todo ya escrito', () => {
    const gmail = new URL(enlaceGmailCredencial('a@b.com', 'Tu credencial', 'Hola y adiós'))
    expect(gmail.origin).toBe('https://mail.google.com')
    expect(Object.fromEntries(gmail.searchParams)).toEqual({ view: 'cm', fs: '1', to: 'a@b.com', su: 'Tu credencial', body: 'Hola y adiós' })
    const outlook = new URL(enlaceOutlookCredencial('a@b.com', 'Tu credencial', 'Hola'))
    expect(outlook.origin).toBe('https://outlook.office.com')
    expect(Object.fromEntries(outlook.searchParams)).toEqual({ to: 'a@b.com', subject: 'Tu credencial', body: 'Hola' })
    expect(enlaceGmailCredencial(null, 'x', 'y')).toBeNull()
    expect(enlaceOutlookCredencial('', 'x', 'y')).toBeNull()
  })

  it('SMS con el número y el mensaje ya escritos, para quien no tiene WhatsApp', () => {
    expect(enlaceSmsCredencial('+1 619 555 0101', 'Hola y adiós')).toBe('sms:+16195550101?&body=Hola%20y%20adi%C3%B3s')
    expect(enlaceSmsCredencial(null, 'Hola')).toBeNull()
  })

  it('el correo con asunto y mensaje', () => {
    expect(enlaceCorreoCredencial('a@b.com', 'Tu credencial', 'Hola')).toBe('mailto:a@b.com?subject=Tu%20credencial&body=Hola')
    expect(enlaceCorreoCredencial(null, 'x', 'y')).toBeNull()
  })

  it('se anota por dónde se mandó, y se cierra el día a una hora', async () => {
    supabase.rpc.mockResolvedValue({ data: '2026-10-23T13:05:00', error: null })
    await marcarCredencialEnviada('v1', 'whatsapp')
    expect(supabase.rpc).toHaveBeenLastCalledWith('marcar_credencial_enviada', { p_voluntario: 'v1', p_medio: 'whatsapp' })
    supabase.rpc.mockResolvedValue({ data: 3, error: null })
    await expect(cerrarDiaVoluntarios('13:30')).resolves.toBe(3)
    expect(supabase.rpc).toHaveBeenLastCalledWith('cerrar_dia_voluntarios', { p_hora: '13:30' })
    await cerrarDiaVoluntarios('')
    expect(supabase.rpc).toHaveBeenLastCalledWith('cerrar_dia_voluntarios', { p_hora: null })
  })
})

describe('ordenar y filtrar la lista (sección 49)', () => {
  const lista = [
    { id: 'a', nombre: 'Beto', activo: true, creado_en: '2026-10-01T09:00:00', ultima_entrada: '2026-10-20T09:00:00', telefono: '+1', correo: null, enviada_en: '2026-10-02T10:00:00', dentro_desde: null, sin_salida: 0 },
    { id: 'b', nombre: 'Ana', activo: true, creado_en: '2026-10-15T09:00:00', ultima_entrada: null, telefono: null, correo: 'a@b.com', enviada_en: null, dentro_desde: '2026-10-23T09:00:00', sin_salida: 1 },
    { id: 'c', nombre: 'Carla', activo: false, creado_en: '2026-10-20T09:00:00', ultima_entrada: '2026-10-22T09:00:00', telefono: null, correo: null, enviada_en: null, dentro_desde: null, sin_salida: 0 },
    { id: 'd', nombre: 'Dani', activo: true, creado_en: '2026-10-10T09:00:00', ultima_entrada: '2026-10-21T09:00:00', telefono: null, correo: null, enviada_en: null, dentro_desde: null, sin_salida: 0 },
  ]
  const ids = (l) => l.map((v) => v.id).join('')

  it('por fecha de registro, nombre o última vez; los de baja al final', () => {
    expect(ids(ordenarVoluntarios(lista, 'recientes'))).toBe('bdac')
    expect(ids(ordenarVoluntarios(lista, 'antiguos'))).toBe('adbc')
    expect(ids(ordenarVoluntarios(lista, 'nombre'))).toBe('badc')
    expect(ids(ordenarVoluntarios(lista, 'ultimaVez'))).toBe('dabc')
    //  No cambia la lista de donde vino.
    expect(ids(lista)).toBe('abcd')
  })

  it('cada filtro, y salvo "de baja" solo los activos', () => {
    expect(ids(filtrarVoluntarios(lista, 'activos'))).toBe('abd')
    expect(ids(filtrarVoluntarios(lista, 'pendiente'))).toBe('bd')
    expect(ids(filtrarVoluntarios(lista, 'enviada'))).toBe('a')
    expect(ids(filtrarVoluntarios(lista, 'conTelefono'))).toBe('a')
    expect(ids(filtrarVoluntarios(lista, 'conCorreo'))).toBe('b')
    expect(ids(filtrarVoluntarios(lista, 'sinContacto'))).toBe('d')
    expect(ids(filtrarVoluntarios(lista, 'adentro'))).toBe('b')
    expect(ids(filtrarVoluntarios(lista, 'sinSalida'))).toBe('b')
    expect(ids(filtrarVoluntarios(lista, 'deBaja'))).toBe('c')
    expect(contarPorFiltro(lista)).toMatchObject({ activos: 3, pendiente: 2, deBaja: 1 })
  })
})

describe('solo la entrada, pasar lista y nota (sección 52)', () => {
  it('registrar: la nota solo si trae algo', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'v1', nombre: 'Juana', token: CREDENCIAL }], error: null })
    await registrarVoluntario('Juana', { nota: '  ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('registrar_voluntario', {
      p_nombre: 'Juana',
      p_telefono: null,
      p_correo: null,
    })
    await registrarVoluntario('Juana', { nota: ' Solo los lunes ' })
    expect(supabase.rpc.mock.lastCall[1]).toMatchObject({ p_nota: 'Solo los lunes' })
  })

  it('editar: la nota en blanco se quita; sin pasarla, no se toca', async () => {
    supabase.rpc.mockResolvedValue({ data: 'GUARDADO', error: null })
    await editarVoluntario('v1', 'Juana', { nota: ' Habla inglés ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('editar_voluntario', {
      p_id: 'v1',
      p_nombre: 'Juana',
      p_telefono: null,
      p_correo: null,
      p_nota: 'Habla inglés',
    })
    await editarVoluntario('v1', 'Juana', { nota: '' })
    expect(supabase.rpc.mock.lastCall[1]).toMatchObject({ p_nota: '' })
    await editarVoluntario('v1', 'Juana')
    expect(supabase.rpc.mock.lastCall[1]).not.toHaveProperty('p_nota')
  })

  it('ajustes: el modo y la hora de salida, cortita', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ modo: 'solo_entrada', hora_salida: '18:30:00' }], error: null })
    await expect(ajustesVoluntarios()).resolves.toEqual({ modo: 'solo_entrada', hora_salida: '18:30' })
    supabase.rpc.mockResolvedValue({ data: [{ modo: 'entrada_salida', hora_salida: '19:00:00' }], error: null })
    await expect(guardarAjustesVoluntarios('entrada_salida', '19:00')).resolves.toEqual({ modo: 'entrada_salida', hora_salida: '19:00' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('guardar_ajustes_voluntarios', { p_modo: 'entrada_salida', p_hora_salida: '19:00' })
  })

  it('pasar lista, se fue temprano, al día y un día pasado llaman lo suyo', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ resultado: 'ENTRADA' }], error: null })
    await pasarLista(new Set(['a', 'b']), '14:45')
    expect(supabase.rpc).toHaveBeenLastCalledWith('pasar_lista_voluntarios', { p_voluntarios: ['a', 'b'], p_hora: '14:45' })
    await pasarLista(['a'])
    expect(supabase.rpc).toHaveBeenLastCalledWith('pasar_lista_voluntarios', { p_voluntarios: ['a'], p_hora: null })
    await salidaTemprana(7, '')
    expect(supabase.rpc).toHaveBeenLastCalledWith('salida_temprana_voluntario', { p_asistencia: 7, p_hora: null })
    await voluntariosAlDia()
    expect(supabase.rpc).toHaveBeenLastCalledWith('voluntarios_al_dia', {})
    await anotarDiaVoluntarios(['a'], { fecha: '2026-10-26', entrada: '14:00', salida: '18:30', motivo: ' No escanearon ' })
    expect(supabase.rpc).toHaveBeenLastCalledWith('anotar_dia_voluntarios', {
      p_voluntarios: ['a'],
      p_fecha: '2026-10-26',
      p_entrada: '14:00',
      p_salida: '18:30',
      p_motivo: 'No escanearon',
    })
  })

  it('los errores nuevos llegan con su nombre', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'SIN_ENTRADA_ABIERTA' } })
    await expect(salidaTemprana(1)).rejects.toThrow('SIN_ENTRADA_ABIERTA')
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'HORA_INVALIDA' } })
    await expect(guardarAjustesVoluntarios('solo_entrada', '')).rejects.toThrow('HORA_INVALIDA')
  })

  it('avisa si ya hay alguien con ese nombre, sin contar acentos ni mayúsculas', () => {
    const lista = [{ id: '1', nombre: 'José  Pérez' }, { id: '2', nombre: 'Ana' }]
    expect(nombreRepetido(lista, ' jose perez')?.id).toBe('1')
    expect(nombreRepetido(lista, 'José Pérez', '1')).toBeNull()
    expect(nombreRepetido(lista, 'José')).toBeNull()
    expect(nombreRepetido(lista, 'an')).toBeNull()
  })

  it('"sin venir": activos sin visitas en 30 días', () => {
    const lista = [
      { id: '1', activo: true, visitas_30: 0 },
      { id: '2', activo: true, visitas_30: 3 },
      { id: '3', activo: false, visitas_30: 0 },
      { id: '4', activo: true, visitas_30: 0, dentro_desde: '2026-10-26T14:00:00' },
    ]
    expect(filtrarVoluntarios(lista, 'sinVenir').map((v) => v.id)).toEqual(['1'])
  })

  it('pasar lista: los que ya están, los que suelen venir y los demás, con la búsqueda', () => {
    const voluntarios = [
      { id: '1', nombre: 'Beto', activo: true, visitas_30: 2 },
      { id: '2', nombre: 'Ana', activo: true, visitas_30: 5 },
      { id: '3', nombre: 'Ceci', activo: true, visitas_30: 0 },
      { id: '4', nombre: 'Dani', activo: true, visitas_30: 1 },
      { id: '5', nombre: 'Eva', activo: false, visitas_30: 4 },
    ]
    const hoy = [
      { voluntario_id: '4', entrada: '2026-10-26T13:00:00', estado: 'salio' },
      { voluntario_id: '4', entrada: '2026-10-26T15:00:00', estado: 'dentro' },
    ]
    const m = montonesParaPasarLista(voluntarios, hoy)
    expect(m.yaEstan.map((v) => v.id)).toEqual(['4'])
    expect(m.yaEstan[0].asistencia.estado).toBe('dentro')
    expect(m.suelenVenir.map((v) => v.id)).toEqual(['2', '1'])
    expect(m.demas.map((v) => v.id)).toEqual(['3'])
    expect(montonesParaPasarLista(voluntarios, hoy, 'cec').demas.map((v) => v.id)).toEqual(['3'])
    expect(montonesParaPasarLista(voluntarios, hoy, 'ána').suelenVenir.map((v) => v.id)).toEqual(['2'])
  })

  it('el resumen de hoy: adentro, cuántos vinieron y cuántos de los de siempre faltan', () => {
    const voluntarios = [
      { id: '1', activo: true, visitas_30: 2 },
      { id: '2', activo: true, visitas_30: 1 },
      { id: '3', activo: true, visitas_30: 0 },
      { id: '4', activo: false, visitas_30: 3 },
    ]
    const hoy = [
      { voluntario_id: '1', estado: 'dentro' },
      { voluntario_id: '3', estado: 'salio' },
    ]
    expect(resumenDeHoy(voluntarios, hoy)).toEqual({ adentro: 1, vinieron: 2, faltan: 1 })
  })

  it('cuenta los resultados, con nombres', () => {
    expect(
      contarResultados([
        { resultado: 'ENTRADA', nombre: 'Ana' },
        { resultado: 'ENTRADA', nombre: 'Beto' },
        { resultado: 'YA_VINO', nombre: 'Ceci' },
      ]),
    ).toEqual({ ENTRADA: { cuantos: 2, nombres: ['Ana', 'Beto'] }, YA_VINO: { cuantos: 1, nombres: ['Ceci'] } })
  })

  it('terminar el día: en solo la entrada, la hora de salida si ya pasó; si no, ahora', () => {
    expect(horaParaCerrar({ modo: 'solo_entrada', hora_salida: '18:30' }, '19:10')).toBe('18:30')
    expect(horaParaCerrar({ modo: 'solo_entrada', hora_salida: '18:30' }, '17:05')).toBe('17:05')
    expect(horaParaCerrar({ modo: 'entrada_salida', hora_salida: null }, '19:10')).toBe('19:10')
  })

  it('el mensaje de la credencial, sin "y al irte" cuando solo se escanea la entrada', () => {
    const t = (clave) => clave
    expect(mensajeCredencial(t, 'Ana', 'x', true)).toBe('voluntarios.envio.mensajeSoloEntrada')
  })
})
