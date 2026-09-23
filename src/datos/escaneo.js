import jsQR from 'jsqr'
import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * Lee un codigo QR de los pixeles de una imagen.
 *
 * Recibe el ImageData de un lienzo, que es lo que devuelve tanto una
 * imagen fija como un cuadro de video de la camara. Devuelve el texto
 * del codigo, o null si en ese cuadro no se ve ninguno -- lo normal
 * mientras el voluntario esta apuntando.
 */
export function leerQR(imageData) {
  const resultado = jsQR(imageData.data, imageData.width, imageData.height)
  return resultado?.data ?? null
}

/** Atajo para leer un QR de una imagen ya cargada. */
export async function leerQRDeImagen(src) {
  const img = new Image()
  img.src = src
  await img.decode()

  const lienzo = document.createElement('canvas')
  lienzo.width = img.width
  lienzo.height = img.height

  const contexto = lienzo.getContext('2d')
  contexto.drawImage(img, 0, 0)

  return leerQR(contexto.getImageData(0, 0, lienzo.width, lienzo.height))
}

const primeraFila = (data) => (Array.isArray(data) ? data[0] : data) ?? null

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros)

  if (error) throw new Error(clasificarError(error))

  return data
}

/**
 * Mira la cita SIN consumirla.
 *
 * El voluntario ve primero quien es y en que estado esta, y solo
 * despues confirma la entrega. Asi no se quema un codigo por apuntar la
 * camara sin querer, y ahi es donde entrara despues la lista de
 * panales y toallitas.
 */
export async function verCita(token) {
  return primeraFila(await llamar('consultar_cita', { p_token: token }))
}

/**
 * Mira un pase permanente SIN consumirlo, igual que verCita con una cita.
 * Devuelve null si ese codigo no es de un pase.
 */
export async function verPase(token) {
  return primeraFila(await llamar('pase_por_token', { p_token: token }))
}

/** Consuma el codigo. Devuelve VALIDO, YA_USADO, OTRA_FECHA, CANCELADA o NO_EXISTE. */
export async function registrarEntrega(token) {
  return primeraFila(await llamar('registrar_entrega', { p_token: token }))
}

/** Lo mismo, pero con el codigo corto tecleado a mano (solo citas de hoy). */
export async function registrarEntregaPorCodigo(codigo) {
  return primeraFila(await llamar('registrar_entrega_por_codigo', { p_codigo: codigo }))
}

/**
 * Consuma un codigo de OTRA fecha, con el codigo personal de quien autoriza.
 *
 * Ademas de los resultados normales puede devolver VALIDO_AUTORIZADO,
 * CODIGO_INVALIDO o BLOQUEADO (demasiados intentos fallidos seguidos).
 */
export async function registrarEntregaAutorizada(token, codigoAutorizacion) {
  return primeraFila(
    await llamar('registrar_entrega_autorizada', {
      p_token: token,
      p_codigo: codigoAutorizacion,
    }),
  )
}

/** Lo mismo que registrarEntregaAutorizada, pero desde la busqueda manual. */
export async function registrarEntregaAutorizadaPorCodigo(codigo, fecha, codigoAutorizacion) {
  return primeraFila(
    await llamar('registrar_entrega_autorizada_por_codigo', {
      p_codigo: codigo,
      p_fecha: fecha,
      p_codigo_autorizacion: codigoAutorizacion,
    }),
  )
}

/**
 * Busca citas. Por nombre, solo las de hoy; con el codigo corto exacto,
 * tambien sus citas cercanas de otros dias.
 */
export async function buscarParaEscaneo(texto) {
  return (await llamar('buscar_para_escaneo', { p_texto: texto })) ?? []
}
