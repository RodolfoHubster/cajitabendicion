import { clasificarError } from './errores'
import { supabase } from '../lib/supabase'

/**
 * "Personas" en el panel: buscar a alguien en todos los registros.
 *
 * Cada registro publico crea un codigo CB nuevo, asi que la misma persona
 * sale varias veces. La base marca con el mismo `grupo` los registros con
 * el mismo nombre (sin acentos ni mayusculas) y el mismo telefono; aqui se
 * juntan para mostrarlos como una sola persona. El mismo nombre con otro
 * telefono queda aparte: puede ser otra persona.
 */

/** Lo minimo para buscar: con una letra saldria medio padron. */
export const MINIMO_BUSQUEDA = 2

export function sePuedeBuscar(texto) {
  return String(texto ?? '').trim().length >= MINIMO_BUSQUEDA
}

/** Por nombre, telefono o codigo CB. */
export async function buscarPersonas(texto) {
  if (!sePuedeBuscar(texto)) return []

  const { data, error } = await supabase.rpc('buscar_personas', { p_texto: String(texto).trim() })

  if (error) {
    throw new Error(clasificarError(error))
  }

  return data ?? []
}

const masReciente = (a, b) => (a > b ? a : b)

/**
 * Junta los registros de la misma persona, en el orden en que llegaron (la
 * base los manda por nombre y del mas reciente al mas viejo).
 */
export function agruparPersonas(filas) {
  const grupos = new Map()

  for (const fila of filas ?? []) {
    const grupo = grupos.get(fila.grupo) ?? {
      grupo: fila.grupo,
      nombre: fila.nombre,
      nombreClave: fila.nombre_clave,
      telefonoFinal: fila.telefono_final,
      ciudad: fila.ciudad,
      registros: [],
      citas: 0,
      cajas: 0,
      ultimaFecha: null,
      paseActivo: false,
      vip: false,
      mismoNombre: false,
    }

    grupo.registros.push(fila)
    grupo.citas += fila.citas ?? 0
    grupo.cajas += fila.cajas ?? 0
    if (fila.ultima_fecha) grupo.ultimaFecha = masReciente(grupo.ultimaFecha ?? '', fila.ultima_fecha)
    grupo.paseActivo ||= Boolean(fila.pase_activo)
    grupo.vip ||= Boolean(fila.vip)
    grupo.ciudad ??= fila.ciudad
    grupos.set(fila.grupo, grupo)
  }

  const lista = [...grupos.values()]

  //  Mismo nombre en otro grupo: es otro telefono, puede ser otra persona.
  const porNombre = new Map()
  for (const grupo of lista) porNombre.set(grupo.nombreClave, (porNombre.get(grupo.nombreClave) ?? 0) + 1)
  for (const grupo of lista) grupo.mismoNombre = porNombre.get(grupo.nombreClave) > 1

  return lista
}

/** Cuantas personas desplegadas a la vez: mas satura la pantalla. */
export const MAXIMO_ABIERTOS = 3

/**
 * Abre o cierra una persona. Al abrir la cuarta se cierra la que se abrio
 * primero. `abiertos` va en el orden en que se abrieron.
 */
export function alternarAbierto(abiertos, grupo, maximo = MAXIMO_ABIERTOS) {
  if (abiertos.includes(grupo)) return abiertos.filter((otro) => otro !== grupo)
  return [...abiertos, grupo].slice(-maximo)
}

/**
 * El codigo CB al que va el pase: el que ya lo tiene, para no dar dos; si
 * no, el registro mas reciente, que es el que la persona trae a la mano.
 */
export function codigoParaPase(grupo) {
  const registros = grupo?.registros ?? []
  const conPase = registros.find((registro) => registro.pase_activo)
  if (conPase) return conPase.codigo_corto

  const reciente = [...registros].sort((a, b) => String(b.registrada_en).localeCompare(String(a.registrada_en)))[0]
  return reciente?.codigo_corto ?? null
}
