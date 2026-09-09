import { supabase } from '../lib/supabase'

/**
 * Bloques con lugares libres.
 *
 * Llama a consultar_disponibilidad(), que devuelve solo conteos: nunca
 * quien reservo. Las tablas estan cerradas con RLS y esta funcion es la
 * unica puerta de lectura.
 *
 * Sin argumentos trae todo lo disponible (para el calendario). Con una
 * fecha trae solo ese dia (para /horarios/:fecha).
 */
export async function consultarDisponibilidad({ desde = null, hasta = null } = {}) {
  const { data, error } = await supabase.rpc('consultar_disponibilidad', {
    p_desde: desde,
    p_hasta: hasta,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

/** Todos los bloques de una sola fecha, en orden. */
export function consultarBloquesDeFecha(fecha) {
  return consultarDisponibilidad({ desde: fecha, hasta: fecha })
}

/**
 * Agrupa los bloques por fecha y suma los lugares libres de cada dia.
 * El calendario solo necesita saber que fechas tienen lugar; los bloques
 * individuales se eligen en /horarios/:fecha.
 */
export function agruparPorFecha(bloques) {
  const porFecha = new Map()

  for (const bloque of bloques) {
    const dia = porFecha.get(bloque.fecha) ?? { fecha: bloque.fecha, libres: 0, bloques: 0 }
    dia.libres += bloque.libres
    dia.bloques += 1
    porFecha.set(bloque.fecha, dia)
  }

  return [...porFecha.values()]
}

/**
 * Convierte '2026-09-10' en una fecha local.
 *
 * new Date('2026-09-10') la interpretaria como medianoche UTC, que en
 * San Diego cae el dia anterior: el calendario mostraria "9 de septiembre"
 * para un bloque del 10. Es el mismo error de zona horaria que se corrigio
 * en la base de datos; no hay que reintroducirlo en la interfaz.
 */
export function aFechaLocal(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/**
 * '14:45:00' -> '2:45 PM', en los dos idiomas.
 *
 * Se arma a mano en vez de usar Intl porque el formato automatico del
 * espanol es de 24 horas ("14:45") y los mockups aprobados usan "2:45 PM".
 * La operacion es de San Diego y la gente lee la hora en 12 horas, sea
 * cual sea el idioma de su telefono.
 */
export function formatearHora(hora) {
  const [h, m] = hora.split(':').map(Number)
  const sufijo = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12

  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`
}
