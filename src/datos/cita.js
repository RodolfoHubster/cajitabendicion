import QRCode from 'qrcode'
import { dibujarQRConSello } from './qrPase'
import { supabase } from '../lib/supabase'

/**
 * Busca una cita por su token.
 *
 * Permite recargar /confirmacion/:token o volver al enlace despues, sin
 * depender de lo que traiga el navegador en memoria. Devuelve solo lo
 * que muestra la pantalla: ni telefono, ni correo, ni direccion.
 */
export async function consultarCita(token) {
  const { data, error } = await supabase.rpc('consultar_cita', { p_token: token })

  if (error) {
    throw new Error(error.message)
  }

  const fila = Array.isArray(data) ? data[0] : data

  if (!fila) {
    throw new Error('CITA_NO_ENCONTRADA')
  }

  return fila
}

/**
 * Dibuja el token como QR y lo devuelve en PNG.
 *
 * Se genera PNG y no SVG para que en el celular funcione el gesto de
 * siempre: mantener apretado sobre la imagen y "Guardar imagen". Un SVG
 * no se guarda asi en la galeria.
 *
 * Con la fila ('carro' o 'a_pie') lleva su sello en medio: un carrito o
 * una persona caminando, para que se distinga antes de escanear (ver
 * datos/qrPase.js, con correccion alta para aguantar el sello).
 *
 * Sin fila (el QR de adorno del panel), nivel de correccion M: aguanta que
 * el codigo salga algo sucio o arrugado.
 */
export function dibujarQR(token, fila = null) {
  if (fila === 'carro' || fila === 'a_pie') return dibujarQRConSello(token, { sello: fila })

  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: { dark: '#1B3A6B', light: '#FFFFFF' },
  })
}
