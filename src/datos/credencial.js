import { dibujarTarjetaCita } from './imagenCita'
import { ORGANIZACION } from './organizacion'

/**
 * La tarjeta de la credencial de un voluntario (seccion 48), para guardarla
 * en el telefono o imprimirla: la misma de las citas, con "Voluntario", su
 * nombre y su QR verde. No lleva codigo CB: no es una persona del padron.
 * qr: la imagen de dibujarQRVoluntario().
 */
export function dibujarTarjetaCredencial({ qr, nombre, t, documento }) {
  return dibujarTarjetaCita({
    qr,
    codigo: '',
    nombre: '',
    documento,
    textos: {
      programa: ORGANIZACION.programa,
      iglesia: ORGANIZACION.iglesia,
      lista: t('credencial.etiqueta'),
      fecha: t('credencial.titulo'),
      hora: nombre,
      siNoSeLee: t('credencial.enseniala'),
      aNombreDe: '',
    },
  })
}

/** "Juana López" -> "cajita-credencial-juana-lopez.png". */
export function nombreArchivoCredencial(nombre) {
  const limpio = String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `cajita-credencial-${limpio || 'voluntario'}.png`
}
