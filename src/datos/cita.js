import QRCode from 'qrcode'
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
 * Nivel de correccion M: aguanta que el codigo salga algo sucio o
 * arrugado, que es exactamente lo que va a pasar con papeles doblados
 * y pantallas rayadas en la fila de carros.
 */
export function dibujarQR(token) {
  return QRCode.toDataURL(token, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: { dark: '#1B3A6B', light: '#FFFFFF' },
  })
}
