import { supabase } from '../lib/supabase'

/**
 * Bloques con lugares libres.
 *
 * Llama a consultar_disponibilidad(), que devuelve solo conteos: nunca
 * quien reservo. Las tablas estan cerradas con RLS y esta funcion es la
 * unica puerta de lectura.
 *
 * Sin argumentos trae todo lo disponible. Con una fecha trae solo ese dia
 * (para /horarios/:fecha).
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
 * Agrupa los bloques por fecha: lugares libres del dia, primer y ultimo
 * horario, y su apertura.
 */
export function agruparPorFecha(bloques) {
  const porFecha = new Map()

  for (const bloque of bloques) {
    const dia = porFecha.get(bloque.fecha) ?? {
      fecha: bloque.fecha,
      libres: 0,
      bloques: 0,
      primeraHora: null,
      ultimaHora: null,
      // Si la base aun no tiene la migracion de apertura, no llega
      // `abierto`: se trata como abierto para no cerrar el calendario.
      abierto: bloque.abierto !== false,
      abreEn: bloque.abre_en ?? null,
      abreAnticipadoEn: bloque.abre_anticipado_en ?? null,
    }
    dia.libres += bloque.libres
    dia.bloques += 1
    // '14:00:00' se compara bien como texto.
    if (bloque.hora && (!dia.primeraHora || bloque.hora < dia.primeraHora)) dia.primeraHora = bloque.hora
    if (bloque.hora && (!dia.ultimaHora || bloque.hora > dia.ultimaHora)) dia.ultimaHora = bloque.hora
    porFecha.set(bloque.fecha, dia)
  }

  return [...porFecha.values()]
}

/**
 * La entrega que se muestra al publico: la mas cercana que todavia tiene
 * lugares. Si todas estan llenas, la mas cercana, para decir que esta llena.
 */
export function elegirProximaEntrega(dias) {
  const ordenados = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha))
  return ordenados.find((dia) => dia.libres > 0) ?? ordenados[0] ?? null
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

/** '2026-09-14' mas n dias, en el mismo formato. n puede ser negativo. */
export function sumarDias(fechaISO, dias) {
  const fecha = aFechaLocal(fechaISO)
  fecha.setDate(fecha.getDate() + dias)
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

/**
 * '14:45:00' -> '2:45 PM', en los tres idiomas.
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

const dos = (n) => String(n).padStart(2, '0')

/** Fecha y hora actuales de San Diego, por partes, sin importar la zona de esta computadora. */
function partesSanDiego() {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((parte) => [parte.type, parte.value]),
  )
}

/** Ahora en San Diego como '2026-09-11T12:00'. */
export function ahoraSanDiego() {
  const p = partesSanDiego()
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/**
 * '2026-09-11T12:00' (o con segundos) como numero, para restar y comparar
 * horas de reloj. Se usa UTC solo como aritmetica: asi el cambio de horario
 * de verano de esta computadora no mueve la hora.
 */
function marcaANumero(marca) {
  const [fecha, hora] = marca.split('T')
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const [h, m, s = 0] = hora.split(':').map(Number)
  return Date.UTC(anio, mes - 1, dia, h, m, s)
}

/** '2026-09-11T12:00' menos n horas, en el mismo formato. */
export function restarHoras(marca, horas) {
  const r = new Date(marcaANumero(marca) - horas * 3600000)
  return `${r.getUTCFullYear()}-${dos(r.getUTCMonth() + 1)}-${dos(r.getUTCDate())}T${dos(r.getUTCHours())}:${dos(r.getUTCMinutes())}`
}

/** Horas entre dos marcas: horasEntre('…T12:00', '…T13:00') === 1. */
export function horasEntre(desde, hasta) {
  return (marcaANumero(hasta) - marcaANumero(desde)) / 3600000
}

/** Segundos que faltan, en San Diego, para una marca. Negativo si ya paso. */
export function segundosHasta(marca) {
  const p = partesSanDiego()
  const ahora = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((marcaANumero(marca) - ahora) / 1000)
}

/** 90061 -> { dias: 1, horas: 1, minutos: 1, segundos: 1 }. Lo que ya paso cuenta como 0. */
export function desglosarSegundos(total) {
  const segundos = Math.max(0, Math.floor(total))
  return {
    dias: Math.floor(segundos / 86400),
    horas: Math.floor((segundos % 86400) / 3600),
    minutos: Math.floor((segundos % 3600) / 60),
    segundos: segundos % 60,
  }
}

/**
 * '2026-09-11T12:00:00' (hora local de San Diego, como la entrega la base)
 * -> 'viernes, 11 de septiembre, 12:00 PM'.
 */
export function formatearFechaHora(marca, idioma) {
  if (!marca) return ''

  const [fecha, hora] = marca.split('T')
  const dia = new Intl.DateTimeFormat(idioma, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(fecha))

  return `${dia}, ${formatearHora(hora)}`
}
