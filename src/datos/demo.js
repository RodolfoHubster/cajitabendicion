/**
 * Modo de ejemplo: la pagina oficial, para grabar el video de como hacer
 * la cita, sin que nada se guarde.
 *
 * Se prende abriendo la pagina con ?demo=1 y se apaga con ?demo=0 (o al
 * cerrar la pestana: vive en sessionStorage). Mientras esta prendido:
 *
 *   * Ninguna llamada que escriba llega a la base. Solo pasan las de leer
 *     que no dependen del dia (los textos y reglas, los codigos postales).
 *     Lo demas lo contesta esta pagina con datos de ejemplo: fechas y
 *     horarios abiertos, la fila a pie abierta, y una cita de mentira al
 *     confirmar. Lo que no se conoce responde con error: nunca sale.
 *   * El panel (/admin, /escanear) sigue igual que siempre.
 *   * No se guarda "tu cita" en el telefono ni se muestran las guardadas.
 *
 * Quien no tenga el enlace nunca lo ve, y la base no cambia: no hace
 * falta abrir fechas de verdad ni cuidar que nadie se registre.
 */

export const LLAVE_DEMO = 'cajita-demo'
const LLAVE_CITAS = 'cajita-demo-citas'

//  Solo leen y no dependen de las fechas: se piden a la base de verdad.
export const PASAN_A_LA_BASE = ['avisos_publicos', 'buscar_codigo_postal']

//  El codigo de ejemplo: se ve que es de mentira.
export const CODIGO_DEMO = 'CB-1234'

let prendido = null

function sesion() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

/** Lee ?demo=1 / ?demo=0 de la direccion y lo recuerda en la pestana. */
export function leerDemoDeUrl(busqueda, almacen = sesion()) {
  const valor = new URLSearchParams(busqueda ?? '').get('demo')
  try {
    if (valor === '1') almacen?.setItem(LLAVE_DEMO, 'si')
    if (valor === '0') {
      almacen?.removeItem(LLAVE_DEMO)
      almacen?.removeItem(LLAVE_CITAS)
    }
    return almacen?.getItem(LLAVE_DEMO) === 'si'
  } catch {
    return valor === '1'
  }
}

/** Si esta pestana esta en modo de ejemplo. */
export function enDemo() {
  if (prendido === null) prendido = leerDemoDeUrl(globalThis.location?.search)
  return prendido
}

/** El panel y el escaner nunca entran al modo de ejemplo. */
export function esDelPersonal(ruta) {
  return /^\/(admin|escanear)(\/|$)/.test(String(ruta ?? ''))
}

// ------------------------------------------------------------
//  Fechas de ejemplo
// ------------------------------------------------------------

/** Hoy en San Diego, AAAA-MM-DD. */
export function hoySanDiego(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Los dos proximos lunes o jueves, contando hoy. */
export function fechasDeEjemplo(hoy) {
  const fechas = []
  for (let i = 0; fechas.length < 2 && i < 8; i++) {
    const fecha = sumarDias(hoy, i)
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay()
    if (dia === 1 || dia === 4) fechas.push(fecha)
  }
  return fechas
}

const HORAS = Array.from({ length: 16 }, (_, i) => {
  const minutos = 14 * 60 + 45 + i * 15
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}:00`
})

//  Se ve en la direccion de la pagina (y en el video): corto y legible.
//  'demo-carro-2026-10-05-1500', 'demo-pie-2026-10-05-1400'.
const idBloque = (fecha, hora, fila) =>
  `demo-${fila === 'a_pie' ? 'pie' : 'carro'}-${fecha}-${hora.slice(0, 2)}${hora.slice(3, 5)}`

export function leerIdBloque(id) {
  const partes = /^demo-(carro|pie)-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(String(id ?? ''))
  if (!partes) return null
  const [, fila, fecha, hh, mm] = partes
  return { fila: fila === 'pie' ? 'a_pie' : 'carro', fecha, hora: `${hh}:${mm}:00` }
}

/** Lo que devolveria consultar_disponibilidad(): todo abierto y con lugares. */
export function disponibilidadDeEjemplo({ p_desde, p_hasta, p_fila } = {}, hoy) {
  const abreEn = `${sumarDias(hoy, -1)}T09:00:00`

  const fechas = p_fila === 'a_pie' ? [...new Set([hoy, ...fechasDeEjemplo(hoy)])] : fechasDeEjemplo(hoy)

  return fechas
    .filter((fecha) => (!p_desde || fecha >= p_desde) && (!p_hasta || fecha <= p_hasta))
    .flatMap((fecha) => {
      if (p_fila === 'a_pie') {
        //  La fila a pie de ejemplo tambien abre hoy: para grabar el turno.
        return [
          {
            bloque_id: idBloque(fecha, '14:00:00', 'a_pie'),
            fecha,
            hora: '14:00:00',
            capacidad: 80,
            ocupados: 12,
            libres: 68,
            abierto: true,
            abre_en: abreEn,
            abre_anticipado_en: null,
          },
        ]
      }

      return HORAS.map((hora, i) => {
        //  Unos mas llenos que otros, siempre igual: se ve como un dia normal.
        const ocupados = (i * 7 + 3) % 17
        return {
          bloque_id: idBloque(fecha, hora, 'carro'),
          fecha,
          hora,
          capacidad: 20,
          ocupados,
          libres: 20 - ocupados,
          abierto: true,
          abre_en: abreEn,
          abre_anticipado_en: null,
        }
      })
    })
}

// ------------------------------------------------------------
//  Las citas de ejemplo (solo en esta pestana)
// ------------------------------------------------------------

function leerCitas(almacen) {
  try {
    return JSON.parse(almacen?.getItem(LLAVE_CITAS) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

function guardarCitas(almacen, citas) {
  try {
    almacen?.setItem(LLAVE_CITAS, JSON.stringify(citas))
  } catch {
    //  Sin almacen la cita de ejemplo vive solo hasta recargar.
  }
}

const ok = (data) => ({ data, error: null })
const falla = (mensaje) => ({ data: null, error: { message: mensaje } })

/**
 * La respuesta de ejemplo a una llamada a la base. Nunca escribe nada: lo
 * que se "registra" queda en esta pestana nada mas.
 */
export function respuestaDemo(
  nombre,
  parametros = {},
  { hoy = hoySanDiego(), almacen = sesion(), azar = Math.random, ahora = Date.now() } = {},
) {
  const citas = leerCitas(almacen)

  switch (nombre) {
    case 'consultar_disponibilidad':
      return ok(disponibilidadDeEjemplo(parametros, hoy))

    case 'registrar_y_reservar': {
      const bloque = leerIdBloque(parametros.p_bloque_id)
      //  De acompanante va a la hora de quien maneja: en el ejemplo, 3:00 PM.
      const fecha = bloque?.fecha ?? parametros.p_fecha ?? fechasDeEjemplo(hoy)[0]
      const hora = parametros.p_codigo_acompanante ? '15:00:00' : (bloque?.hora ?? '15:00:00')
      const fila = bloque?.fila === 'a_pie' ? 'a_pie' : 'carro'
      const token = `demo-${Math.floor(azar() * 1e12).toString(36)}`
      const cita = {
        codigo_corto: CODIGO_DEMO,
        nombre: `${parametros.p_nombre ?? ''} ${parametros.p_apellidos ?? ''}`.trim(),
        fecha,
        hora,
        estado: 'reservada',
        fila,
        turno: fila === 'a_pie' ? 13 : null,
      }
      guardarCitas(almacen, { ...citas, [token]: cita })
      return ok([{ codigo_corto: CODIGO_DEMO, token_qr: token, fecha, hora, ya_existia: false }])
    }

    //  El turno a pie sin datos (/turno): el 13, y la fila avanza sola.
    case 'sacar_turno_a_pie': {
      const token = `demo-${Math.floor(azar() * 1e12).toString(36)}`
      const cita = {
        codigo_corto: CODIGO_DEMO,
        nombre: 'Turno 13',
        fecha: hoy,
        hora: '14:00:00',
        estado: 'reservada',
        fila: 'a_pie',
        turno: 13,
        creada: ahora,
      }
      guardarCitas(almacen, { ...citas, [token]: cita })
      return ok([
        { resultado: 'NUEVO', token_qr: token, codigo: CODIGO_DEMO, turno: 13, fecha: hoy, hora: '14:00:00', abre_en: null, citas_carro: 0, hora_carro: null },
      ])
    }

    //  Hoy hay fila a pie, ya abierta y sin codigo del dia.
    case 'fila_a_pie_hoy':
      return ok([{ hora: '14:00:00', abre_en: null, abierta: true, cerrada: false, pide_codigo: false }])

    case 'consultar_cita': {
      const cita = citas[parametros.p_token]
      return ok(cita ? [cita] : [])
    }

    case 'turno_de_cita': {
      const cita = citas[parametros.p_token]
      if (!cita?.turno) return ok([])
      //  Para el video: la fila avanza un turno cada 15 segundos, asi se ven
      //  "faltan 3" y "¡es tu turno!".
      const avance = cita.creada ? Math.max(0, Math.floor((ahora - cita.creada) / 15000)) : 0
      const actual = Math.min(cita.turno, cita.turno - 4 + avance)
      return ok([
        {
          turno: cita.turno,
          estado: cita.estado,
          saltado: false,
          actual,
          antes: cita.turno - actual,
          atendidos: actual - 1,
          en_espera: 9,
          fecha: cita.fecha,
          hora: cita.hora,
          cerrada: false,
        },
      ])
    }

    case 'cambios_restantes':
      return ok(1)

    case 'mover_mi_cita': {
      const cita = citas[parametros.p_token]
      const bloque = leerIdBloque(parametros.p_bloque_id)
      if (!cita || !bloque) return falla('CITA_NO_EXISTE')
      guardarCitas(almacen, { ...citas, [parametros.p_token]: { ...cita, fecha: bloque.fecha, hora: bloque.hora } })
      return ok([{ fecha: bloque.fecha, hora: bloque.hora, codigo_corto: cita.codigo_corto, cambios_restantes: 0 }])
    }

    case 'cancelar_mi_cita': {
      const cita = citas[parametros.p_token]
      if (!cita) return falla('CITA_NO_EXISTE')
      guardarCitas(almacen, { ...citas, [parametros.p_token]: { ...cita, estado: 'cancelada' } })
      return ok('cancelada')
    }

    case 'incidencias_publicas':
    case 'incidencia_de_cita':
      return ok([])

    case 'validar_codigo_anticipado':
      return ok(false)

    default:
      //  Lo que no se conoce no sale de aqui: en el ejemplo nada llega a la base.
      return falla(`MODO_DEMO: ${nombre}`)
  }
}

/**
 * Pone el modo de ejemplo delante de las llamadas a la base. Se instala una
 * sola vez, al crear el cliente (lib/supabase.js).
 */
export function instalarDemo(cliente, { ruta = () => globalThis.location?.pathname, activo = enDemo, espera = 250 } = {}) {
  const real = cliente.rpc.bind(cliente)

  cliente.rpc = (nombre, parametros, opciones) => {
    if (!activo() || esDelPersonal(ruta()) || PASAN_A_LA_BASE.includes(nombre)) {
      return real(nombre, parametros, opciones)
    }
    //  Un poquito de espera, como la red: se ven los "Cargando...".
    return new Promise((resolver) => setTimeout(() => resolver(respuestaDemo(nombre, parametros ?? {})), espera))
  }

  return cliente
}
