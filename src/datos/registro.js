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
 */
export async function registrarYReservar({ nombre, telefono, email, ciudad, bloqueId }) {
  const { data, error } = await supabase.rpc('registrar_y_reservar', {
    p_nombre: nombre,
    p_telefono: telefono,
    p_bloque_id: bloqueId,
    p_email: email || null,
    p_ciudad: ciudad || null,
    p_dispositivo: obtenerDispositivo(),
  })

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
const CODIGOS = [
  'BLOQUE_LLENO',
  'BLOQUE_CERRADO',
  'BLOQUE_NO_EXISTE',
  'FECHA_PASADA',
  'YA_TIENE_CITA_ESTA_SEMANA',
  'LIMITE_DISPOSITIVO',
  'NOMBRE_REQUERIDO',
  'TELEFONO_REQUERIDO',
  'EMAIL_REQUERIDO',
  'EMAIL_INVALIDO',
  'SIN_CODIGOS_DISPONIBLES',
]

function traducirError(mensaje) {
  return CODIGOS.find((codigo) => mensaje?.includes(codigo)) ?? 'ERROR_DESCONOCIDO'
}
