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

/**
 * El pedazo del cuadro de la camara que de verdad se ve en pantalla.
 *
 * El video se muestra cuadrado y recortado al centro (object-cover). Una
 * camara de computadora es ancha: a los lados queda imagen que el
 * voluntario no ve, y ahi puede estar el telefono del carro de junto. Se
 * lee solo el centro, lo mismo que esta viendo.
 */
export function zonaVisible(ancho, alto) {
  const lado = Math.min(ancho, alto)
  return {
    x: Math.round((ancho - lado) / 2),
    y: Math.round((alto - lado) / 2),
    lado,
  }
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

export const CODIGOS_ANULAR = ['MOTIVO_REQUERIDO', 'ENTREGA_NO_EXISTE']

/**
 * Deshace una entrega de HOY marcada por error (la Maria equivocada). El
 * codigo vuelve a servir. Queda quien, cuando y por que.
 */
export async function anularEntrega(codigo, motivo) {
  const { data, error } = await supabase.rpc('anular_entrega', { p_codigo: codigo, p_motivo: motivo })

  if (error) {
    const deNegocio = CODIGOS_ANULAR.find((codigo) => error.message?.includes(codigo))
    throw new Error(deNegocio ?? clasificarError(error))
  }

  return data
}

/**
 * Por que no arranco la camara, en una palabra que la pantalla sabe
 * explicar. Cada caso tiene su arreglo distinto:
 *
 *   SIN_PERMISO     alguien toco "no permitir": se dice como activarla
 *   CAMARA_OCUPADA  otra app la tiene (una videollamada, WhatsApp)
 *   SIN_CAMARA      el aparato no tiene camara trasera ni delantera
 *   SIN_HTTPS       el navegador solo da camara en sitios seguros
 */
export function clasificarErrorCamara(error, sitioSeguro = globalThis.isSecureContext ?? true) {
  const nombre = error?.name ?? ''

  if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError') return 'SIN_PERMISO'
  if (nombre === 'NotReadableError' || nombre === 'TrackStartError' || nombre === 'AbortError') return 'CAMARA_OCUPADA'
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError' || nombre === 'OverconstrainedError') {
    return 'SIN_CAMARA'
  }
  //  Los navegadores solo dan camara en HTTPS (localhost es la excepcion).
  if (nombre === 'NotSupportedError' || !sitioSeguro) return 'SIN_HTTPS'

  return 'ERROR_CAMARA'
}

/**
 * Cuanto tiempo se reconoce "el mismo QR que acabo de entregar". La persona
 * tarda en bajar su telefono y la camara lo vuelve a leer.
 */
export const MS_RECIEN_ENTREGADO = 60_000

/**
 * Si lo que leyo la camara es el QR que se acaba de entregar. Asi no sale
 * en rojo "ya recibio" (y no cuenta como intento repetido) solo porque la
 * persona no ha bajado su telefono.
 */
export function esRecienEntregado(ultima, token, ahora = Date.now()) {
  return Boolean(ultima && token && ultima.token === token && ahora - ultima.momento < MS_RECIEN_ENTREGADO)
}

/**
 * Que mostrar cuando no se pudo revisar un codigo. Sin senal NO es "codigo
 * no reconocido": el codigo puede estar bien, y decir "no existe" hacia que
 * se rechazara a alguien con cita.
 */
export function previaPorError(mensaje) {
  return mensaje === 'SIN_CONEXION' ? 'SIN_CONEXION' : 'NO_EXISTE'
}
