import jsQR from 'jsqr'
import QRCode from 'qrcode'
import { describe, expect, it } from 'vitest'
import { AZUL_QR, ICONOS_FILA, ORO_QR, lugarDelIcono, medidasDelSello } from './qrPase'

//  Un generador con semilla: la misma "mancha" cada vez que corre la prueba.
function azar(semilla) {
  let s = semilla >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

//  Un token como los de las citas: 24 bytes al azar en hexadecimal.
function tokenDePrueba(n) {
  const siguiente = azar(1000 + n)
  return Array.from({ length: 48 }, () => '0123456789abcdef'[Math.floor(siguiente() * 16)]).join('')
}

/**
 * El QR como lo dibuja la pantalla (correccion H, margen 2, azul sobre
 * blanco), pero en pixeles a mano: en las pruebas no hay lienzo.
 *
 * El sello se reemplaza por lo PEOR que un dibujo puede hacer: el circulo
 * blanco y, adentro, cuadritos del tamano de un modulo pintados al azar.
 * Un icono de verdad estorba menos que esto.
 */
function qrConCentroSucio(texto, { porcentaje = 0.32, semilla = 7, pixelesPorModulo = 8 } = {}) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'H' })
  const tamano = qr.modules.size
  const lado = (tamano + 4) * pixelesPorModulo
  const datos = new Uint8ClampedArray(lado * lado * 4)

  const pintar = (x, y, oscuro) => {
    const i = (y * lado + x) * 4
    datos[i] = oscuro ? 27 : 255
    datos[i + 1] = oscuro ? 58 : 255
    datos[i + 2] = oscuro ? 107 : 255
    datos[i + 3] = 255
  }

  for (let y = 0; y < lado; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      const mx = Math.floor(x / pixelesPorModulo) - 2
      const my = Math.floor(y / pixelesPorModulo) - 2
      const dentro = mx >= 0 && my >= 0 && mx < tamano && my < tamano
      pintar(x, y, dentro && qr.modules.get(mx, my))
    }
  }

  const caja = Math.round(lado * porcentaje)
  const centro = Math.round(lado / 2)
  const radio = Math.round(caja / 2)
  const radioSucio = Math.round(radio * 0.92)
  const siguiente = azar(semilla)
  const ruido = new Map()

  for (let y = centro - radio; y <= centro + radio; y += 1) {
    for (let x = centro - radio; x <= centro + radio; x += 1) {
      const d = Math.hypot(x - centro, y - centro)
      if (d > radio) continue
      if (d > radioSucio) {
        pintar(x, y, false)
        continue
      }
      const clave = `${Math.floor(x / pixelesPorModulo)},${Math.floor(y / pixelesPorModulo)}`
      if (!ruido.has(clave)) ruido.set(clave, siguiente() < 0.5)
      pintar(x, y, ruido.get(clave))
    }
  }

  return { datos, lado }
}

const leer = ({ datos, lado }) => jsQR(datos, lado, lado)?.data ?? null

describe('el sello en medio del QR', () => {
  it('con el sello del 32%, el codigo se sigue leyendo aunque el centro este lleno de manchas', () => {
    expect(medidasDelSello(1000).caja).toBe(320)

    for (let n = 0; n < 12; n += 1) {
      const token = tokenDePrueba(n)
      expect(leer(qrConCentroSucio(token, { semilla: n + 1 }))).toBe(token)
    }
  })

  it('la prueba si nota un sello demasiado grande (si no, no estaria revisando nada)', () => {
    const leidos = Array.from({ length: 12 }, (_, n) => {
      const token = tokenDePrueba(n)
      return leer(qrConCentroSucio(token, { porcentaje: 0.5, semilla: n + 1 })) === token
    })
    expect(leidos.filter(Boolean).length).toBeLessThan(12)
  })

  it.each(Object.keys(ICONOS_FILA))('el icono de %s cabe dentro del circulo blanco', (fila) => {
    const medidas = medidasDelSello(512)
    const lugar = lugarDelIcono(medidas, ICONOS_FILA[fila])
    const esquina = Math.hypot(lugar.ancho / 2, lugar.alto / 2)

    expect(esquina).toBeLessThan(medidas.radioLogo * 0.9)
    expect(lugar.x + lugar.ancho / 2).toBeCloseTo(medidas.centro, 5)
    expect(lugar.y + lugar.alto / 2).toBeCloseTo(medidas.centro, 5)
  })

  it('cada fila tiene su color: carro azul, a pie naranja, VIP dorado', () => {
    expect(ICONOS_FILA.carro.color).toBe('#1B3A6B')
    expect(ICONOS_FILA.a_pie.color).toBe('#F5A03C')
    expect(ICONOS_FILA.vip.color).toBe('#B8860B')
  })

  it('el dorado de los cuadritos contrasta con el blanco tanto como hace falta para leerse', () => {
    //  Contraste de luminancia (WCAG): el lector necesita cuadritos bien oscuros.
    const lineal = (c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    }
    const luminancia = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b)
    }
    const contraste = (hex) => 1.05 / (luminancia(hex) + 0.05)
    expect(contraste(ORO_QR)).toBeGreaterThan(5)
    expect(contraste(AZUL_QR)).toBeGreaterThan(5)
  })
})
