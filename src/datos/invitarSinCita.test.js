import { describe, expect, it } from 'vitest'
import {
  claveTelefono,
  enlaceInvitacion,
  envioDe,
  juntarNombres,
  leerInvitadas,
  marcarInvitada,
  prepararInvitaciones,
  primerNombre,
  siguienteEnvio,
  telefonoValido,
  textoInvitacion,
} from './invitarSinCita'

function almacen() {
  const datos = new Map()
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
  }
}

const FILAS = [
  { nombre: 'María López', telefono: '+16195550101', codigo: 'SC-0001', anulada: false },
  { nombre: 'José López', telefono: '+1 (619) 555-0101', codigo: 'SC-0002', anulada: false },
  { nombre: 'Ana Ruiz', telefono: '+526641234567', codigo: 'SC-0003', anulada: false },
  { nombre: 'Luis Sin Teléfono', telefono: null, codigo: 'SC-0004', anulada: false },
  { nombre: 'Pedro Corto', telefono: '555-0101', codigo: 'SC-0005', anulada: false },
  { nombre: 'Rosa Anulada', telefono: '+16195550199', codigo: 'SC-0006', anulada: true },
]

describe('a quiénes se les manda', () => {
  it('fuera las anuladas y las que no tienen teléfono; un mensaje por teléfono', () => {
    const { envios, sinTelefono, repetidos } = prepararInvitaciones(FILAS)
    expect(envios.map((e) => e.nombres)).toEqual([['María', 'José'], ['Ana']])
    expect(envios[0].codigos).toEqual(['SC-0001', 'SC-0002'])
    expect(sinTelefono).toBe(2)
    expect(repetidos).toBe(1)
  })

  it('el teléfono necesita su lada', () => {
    expect(telefonoValido('+16195550101')).toBe(true)
    expect(telefonoValido('+526641234567')).toBe(true)
    expect(telefonoValido('555-0101')).toBe(false)
    expect(telefonoValido(null)).toBe(false)
  })

  it('sin lista, nada', () => {
    expect(prepararInvitaciones(null)).toEqual({ envios: [], sinTelefono: 0, repetidos: 0 })
  })
})

describe('el mensaje', () => {
  it('nombres juntos como se dicen', () => {
    expect(primerNombre('María de la Luz Pérez')).toBe('María')
    expect(juntarNombres(['María'])).toBe('María')
    expect(juntarNombres(['María', 'José', 'Ana'])).toBe('María, José y Ana')
    expect(juntarNombres(['María', 'José'], 'and')).toBe('María and José')
    expect(juntarNombres([])).toBe('')
  })

  it('en español y en inglés, con su nombre, de dónde viene, el enlace y cómo dejar de recibirlos', () => {
    const texto = textoInvitacion({ nombres: ['María', 'José'], fecha: '2026-10-01', enlace: 'https://citas.casadealabanzasd.com/' })
    expect(texto).toContain('Hola María y José, te saluda Cajita de Bendición, de la Iglesia Casa de Alabanza')
    expect(texto).toContain('jueves, 1 de octubre')
    expect(texto).toContain('Hi María and José')
    expect(texto).toContain('Thursday, October 1')
    expect(texto.match(/https:\/\/citas\.casadealabanzasd\.com\//g)).toHaveLength(2)
    expect(texto).toContain('contéstanos "NO"')
    expect(texto).toContain('reply "NO"')
  })

  it('sin nombre, saluda igual', () => {
    expect(textoInvitacion({ nombres: [], fecha: '2026-10-01', enlace: 'x' }).startsWith('Hola, te saluda')).toBe(true)
  })

  it('el enlace abre WhatsApp con ese número y el mensaje ya escrito', () => {
    const [envio] = prepararInvitaciones(FILAS).envios
    const enlace = enlaceInvitacion(envio, '2026-10-01', 'https://citas.casadealabanzasd.com')
    expect(enlace.startsWith('https://wa.me/16195550101?text=')).toBe(true)
    expect(decodeURIComponent(enlace.split('text=')[1])).toContain('Hola María y José')
  })
})

describe('una sola persona (el comprobante o un renglón de la tabla)', () => {
  it('su envío, con su nombre; sin teléfono, nada', () => {
    expect(envioDe({ nombre: 'Catalina Prueba Paredes', telefono: '+1 619 555 0123' })).toEqual({
      telefono: '+1 619 555 0123',
      clave: '16195550123',
      nombres: ['Catalina'],
      codigos: [],
    })
    expect(envioDe({ nombre: 'Luis', telefono: null })).toBeNull()
    expect(envioDe({ nombre: 'Luis', telefono: '555-0101' })).toBeNull()
  })

  it('el mismo teléfono escrito distinto es la misma persona: no se le manda dos veces', () => {
    expect(claveTelefono('+1 (619) 555-0101')).toBe(claveTelefono('+16195550101'))
    const [familia] = prepararInvitaciones(FILAS).envios
    expect(envioDe(FILAS[0]).clave).toBe(familia.clave)
  })
})

describe('pausar y seguir después', () => {
  it('recuerda a quién ya se le mandó, por día', () => {
    const a = almacen()
    marcarInvitada('2026-10-01', '16195550101', true, a)
    expect(leerInvitadas('2026-10-01', a)).toEqual(new Set(['16195550101']))
    expect(leerInvitadas('2026-10-05', a)).toEqual(new Set())
    marcarInvitada('2026-10-01', '16195550101', false, a)
    expect(leerInvitadas('2026-10-01', a)).toEqual(new Set())
  })

  it('el siguiente es el primero que falta, sin los que se saltaron', () => {
    const envios = [{ clave: 'a' }, { clave: 'b' }, { clave: 'c' }]
    expect(siguienteEnvio(envios, new Set(['a']))).toEqual({ clave: 'b' })
    expect(siguienteEnvio(envios, new Set(['a']), new Set(['b']))).toEqual({ clave: 'c' })
    expect(siguienteEnvio(envios, new Set(['a', 'b', 'c']))).toBeNull()
  })

  it('solo guarda los últimos 10 días', () => {
    const a = almacen()
    for (let dia = 1; dia <= 12; dia++) marcarInvitada(`2026-10-${String(dia).padStart(2, '0')}`, 'x', true, a)
    expect(leerInvitadas('2026-10-01', a).size).toBe(0)
    expect(leerInvitadas('2026-10-12', a).size).toBe(1)
  })
})
