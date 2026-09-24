import { leerCodigoAnticipado } from './anticipado'
import { CODIGOS_DOMICILIO, parametrosDomicilio } from './domicilio'
import { conLimiteDeTiempo, esErrorDeConexion } from './errores'
import { supabase } from '../lib/supabase'

const LLAVE_DISPOSITIVO = 'cb_dispositivo'

/**
 * Identificador del navegador, guardado localmente.
 *
 * Es un tope contra el abuso obvio -- tres pestanas del mismo telefono
 * registrando a tres personas distintas -- no una identidad real. Una
 * ventana privada, otro navegador o borrar los datos del sitio generan
 * uno nuevo. La identidad de verdad llega con las cuentas de Google.
 *
 * Si el navegador bloquea el almacenamiento, se manda null y el registro
 * procede sin tope: es preferible dejar pasar a alguien de mas que
 * dejar fuera a quien navega en modo restringido.
 */
export function obtenerDispositivo() {
  try {
    let id = localStorage.getItem(LLAVE_DISPOSITIVO)

    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(LLAVE_DISPOSITIVO, id)
    }

    return id
  } catch {
    return null
  }
}

/**
 * Crea la persona y aparta su lugar en una sola llamada.
 * Devuelve el codigo corto y el token del QR para /confirmacion.
 *
 * telefono llega ya en formato internacional (+526641234567): lo convierte
 * normalizarTelefono() en la pantalla. Si la persona entro a la fecha con
 * codigo de suscriptor, se manda: la base decide si todavia sirve. El
 * domicilio va limpio (parametrosDomicilio) y la base lo vuelve a revisar.
 */
export async function registrarYReservar({
  nombres,
  apellidos,
  telefono,
  email,
  domicilio,
  aceptoPrivacidad,
  bloqueId,
  fecha,
}) {
  //  Con mala senal no se espera para siempre: a los 25 segundos se dice
  //  "no hay conexion" y la persona puede volver a tocar Confirmar. Si la
  //  primera si llego, la base le devuelve la misma cita (seccion 33).
  const { data, error } = await conLimiteDeTiempo(supabase.rpc('registrar_y_reservar', {
    p_nombre: nombres,
    p_apellidos: apellidos,
    p_telefono: telefono,
    p_bloque_id: bloqueId,
    p_email: email || null,
    ...parametrosDomicilio(domicilio),
    p_acepto_privacidad: Boolean(aceptoPrivacidad),
    p_dispositivo: obtenerDispositivo(),
    p_codigo_anticipado: (fecha && leerCodigoAnticipado(fecha)) || null,
  }))

  if (error) {
    throw new Error(traducirError(error.message))
  }

  const fila = Array.isArray(data) ? data[0] : data

  if (!fila) {
    throw new Error('ERROR_DESCONOCIDO')
  }

  return fila
}

/**
 * La base lanza codigos secos (BLOQUE_LLENO). Se extraen del mensaje de
 * Postgres para que la pantalla los traduzca a algo que una persona
 * entienda, sin mostrar jerga de base de datos.
 */
export const CODIGOS = [
  'BLOQUE_LLENO',
  'BLOQUE_CERRADO',
  'BLOQUE_NO_EXISTE',
  'FECHA_PASADA',
  'YA_TIENE_CITA_ESTA_SEMANA',
  'LIMITE_DISPOSITIVO',
  'NOMBRE_REQUERIDO',
  'APELLIDOS_REQUERIDOS',
  'NOMBRE_INVALIDO',
  'TELEFONO_REQUERIDO',
  'TELEFONO_INVALIDO',
  'EMAIL_REQUERIDO',
  'EMAIL_INVALIDO',
  'SIN_CODIGOS_DISPONIBLES',
  'CODIGO_ANTICIPADO_INVALIDO',
  'AUN_NO_ABRE',
  'DIA_CERRADO',
  'YA_REGISTRADO_ESE_DIA',
  'A_PIE_CERRADO',
  ...CODIGOS_DOMICILIO,
]

export function traducirError(mensaje) {
  const deNegocio = CODIGOS.find((codigo) => mensaje?.includes(codigo))
  if (deNegocio) return deNegocio

  //  Sin senal: se dice que es eso, no "error desconocido". Con "no hay
  //  conexion" la persona sabe que puede volver a intentar.
  return esErrorDeConexion(mensaje) ? 'SIN_CONEXION' : 'ERROR_DESCONOCIDO'
}
