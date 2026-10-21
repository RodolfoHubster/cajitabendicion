import jsQR from 'jsqr'
import { clasificarError } from './errores'
import { esDeOtraFila } from './filas'
import { esCredencial } from './voluntarios'
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

/**
 * La gente de hoy de la fila de carros, para buscarla en el escaner sin
 * esperar: [{ nombre, codigo_corto, fecha, hora, estado, en_carro_de }].
 * Sin telefono ni direccion. Solo para quien escanea en carros (OTRA_FILA
 * si hoy esta en la fila a pie).
 */
export async function listaParaEscaneo() {
  const { data, error } = await supabase.rpc('lista_para_escaneo', {})
  if (error) throw new Error(error.message?.includes('OTRA_FILA') ? 'OTRA_FILA' : clasificarError(error))
  return data ?? []
}

/** Ya recibio su caja hoy. */
export function yaRecibio(persona) {
  return persona?.estado === 'entregada'
}

/** Cuantos hay en la lista y cuantos faltan. */
export function cuentaDeLista(lista) {
  const total = (lista ?? []).length
  const recibieron = (lista ?? []).filter(yaRecibio).length
  return { total, recibieron, faltan: total - recibieron }
}

export const CODIGOS_ANULAR = ['MOTIVO_REQUERIDO', 'ENTREGA_NO_EXISTE', 'FUERA_DE_PLAZO']

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
 * Que mostrar cuando no se pudo revisar un codigo:
 *
 *   SIN_CONEXION        se corto la senal: el codigo puede estar bien
 *   SIN_SESION          se cerro la sesion: hay que volver a entrar
 *   NO_SE_PUDO_REVISAR  cualquier otra falla: volver a intentar
 *
 * Nunca "codigo no reconocido": eso solo lo dice la base cuando de verdad
 * no hay cita ni pase con ese codigo. Hasta el 15 de octubre de 2026 una
 * falla se veia igual que un QR ajeno, y se podia rechazar a alguien con cita.
 */
export function previaPorError(mensaje) {
  if (mensaje === 'SIN_CONEXION') return 'SIN_CONEXION'
  if (mensaje === 'SIN_PERMISO') return 'SIN_SESION'
  return 'NO_SE_PUDO_REVISAR'
}

//  Las direcciones de este sistema: un QR con una de estas no es de otra pagina.
const SITIOS_PROPIOS = ['casadealabanzasd.com', 'cajitabendicion.pages.dev', 'localhost']

/**
 * Que es un QR que no es de ninguna cita ni pase, para decirselo a quien
 * escanea en vez de un "no reconocido" a secas:
 *
 *   CARTEL_TURNO   el cartel de la entrada, para sacar turno a pie
 *   PAGINA_PROPIA  otra pagina de este sistema
 *   OTRA_PAGINA    una pagina de otro sitio ({ dominio })
 *   VOLUNTARIO     la credencial de un voluntario (seccion 48): su entrada
 *                  y salida se marcan en Voluntarios
 *   TEXTO          cualquier otra cosa
 */
export function queEsElQR(texto, aqui = globalThis.location?.hostname ?? '') {
  const limpio = String(texto ?? '').trim()
  if (esCredencial(limpio)) return { tipo: 'VOLUNTARIO' }
  if (!/^(https?:\/\/|www\.)/i.test(limpio)) return { tipo: 'TEXTO' }

  let url
  try {
    url = new URL(/^www\./i.test(limpio) ? `https://${limpio}` : limpio)
  } catch {
    return { tipo: 'TEXTO' }
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const propio = host === aqui || SITIOS_PROPIOS.some((sitio) => host === sitio || host.endsWith(`.${sitio}`))
  if (!propio) return { tipo: 'OTRA_PAGINA', dominio: host }

  const ruta = url.pathname.replace(/\/+$/, '')
  return { tipo: ruta === '/turno' || ruta === '/a-pie' ? 'CARTEL_TURNO' : 'PAGINA_PROPIA' }
}

/**
 * Si al escanear se entrega de una vez, sin tocar "Registrar entrega".
 *
 * El 24 de septiembre de 2026 los voluntarios escaneaban y no tocaban el
 * boton: horas de cajas que no se contaron y QR que seguian sirviendo. Desde
 * entonces el caso de todos los dias entrega al escanear: una cita de HOY de
 * la fila de quien escanea, o un pase vigente. Si esa cita ya se entrego o
 * se cancelo, la base contesta "ya recibio" o "cancelada" (y cuenta el
 * intento, como debe).
 *
 * Lo que necesita que alguien decida se sigue viendo antes: otra fecha (pide
 * autorizacion), otra fila, un codigo que no existe, sin senal, un pase
 * revocado. Y la busqueda a mano nunca entrega sola: ahi es facil tocar a la
 * Maria equivocada (tiene su propio boton de "Registrar entrega").
 *
 * A pie, alguien que llega antes de su turno tambien pasa de una vez (asi se
 * pidio el 28 de septiembre de 2026): la respuesta lo avisa y se puede
 * deshacer en el primer minuto.
 */
export function entregaDirecta(previa, { hoy, fila }) {
  if (!previa || previa.resultado || previa.porCodigo) return false
  if (previa.pase) return Boolean(previa.activo)
  //  A pie (seccion 46): a quien lo llamaron y no estaba, o con el turno
  //  anulado, no se le entrega solo. Quien escanea ve cuanto tardo y decide.
  if (previa.saltado_en || previa.anulado) return false
  return Boolean(previa.fecha) && previa.fecha === hoy && !esDeOtraFila(fila, previa.fila)
}

/**
 * Cuanto tiempo ve "Deshacer" quien acaba de escanear, aunque no tenga la
 * palomita. La base da un minuto; la pantalla lo quita un poco antes para
 * que nadie lo toque justo cuando ya no sirve.
 */
export const MS_DESHACER_PROPIA = 55_000
