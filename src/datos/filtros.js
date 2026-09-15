/**
 * Buscador, filtros y paginas de las listas del panel.
 *
 * Se filtra en el navegador a proposito: cada lista es de un solo dia y el
 * cupo la limita (unos 15 horarios de hasta 28 personas, ~420 filas). Traer
 * el dia completo y filtrar aqui responde al instante, sin pedirle nada a la
 * base por cada tecla.
 */

export const TAMANOS_PAGINA = [25, 50, 100]

/** Valor de filtro para "las que no tienen ese dato" (sin ciudad, etc.). */
export const SIN_VALOR = '__sin__'

export const FILTROS_CITAS = Object.freeze({ texto: '', hora: '', estado: '', ciudad: '', desde: '', hasta: '' })

export const FILTROS_SIN_CITA = Object.freeze({ texto: '', desde: '', hasta: '', anotadoPor: '', estado: '' })

/** 'María  LÓPEZ ' -> 'maria lopez'. Sin acentos: se encuentra como se escriba. */
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const compactar = (texto) => normalizarTexto(texto).replace(/[^a-z0-9]/g, '')

/**
 * Cada palabra de la busqueda aparece en alguno de los campos, en cualquier
 * orden. 'lopez maria' encuentra a 'María López'; '4871' y 'cb4871'
 * encuentran 'CB-4871'. Una busqueda vacia deja pasar todo.
 */
export function coincideTexto(campos, busqueda) {
  const palabras = normalizarTexto(busqueda).split(' ').filter(Boolean)
  if (palabras.length === 0) return true

  const textos = campos.map(normalizarTexto)
  const compactos = campos.map(compactar)

  return palabras.every((palabra) => {
    const compacta = compactar(palabra)

    return (
      textos.some((texto) => texto.includes(palabra)) ||
      (compacta !== '' && compactos.some((texto) => texto.includes(compacta)))
    )
  })
}

/** '14:45:00' o '14:45' -> 885 minutos del dia. Vacia o invalida -> null. */
export function minutosDeHora(hora) {
  const partes = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ''))
  if (!partes) return null

  const horas = Number(partes[1])
  const minutos = Number(partes[2])
  if (horas > 23 || minutos > 59) return null

  return horas * 60 + minutos
}

/** Hora de San Diego de una marca de tiempo, en 24 horas: '14:05'. */
export function horaLocal(marca) {
  if (!marca) return null

  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(marca))
      .map(({ type, value }) => [type, value]),
  )

  return `${partes.hour}:${partes.minute}`
}

/**
 * La hora cae entre desde y hasta, las dos incluidas. Un extremo vacio no
 * limita; si vienen al reves, se voltean. Sin ningun extremo pasa todo,
 * incluso las filas sin hora.
 */
export function enRango(hora, desde, hasta) {
  let inicio = minutosDeHora(desde)
  let fin = minutosDeHora(hasta)
  if (inicio === null && fin === null) return true

  const minutos = minutosDeHora(hora)
  if (minutos === null) return false

  if (inicio !== null && fin !== null && inicio > fin) [inicio, fin] = [fin, inicio]

  return (inicio === null || minutos >= inicio) && (fin === null || minutos <= fin)
}

/** Filtro por un campo de texto: vacio pasa todo; SIN_VALOR, las que no lo tienen. */
function coincideValor(valor, filtro) {
  if (!filtro) return true
  if (filtro === SIN_VALOR) return !valor
  return valor === filtro
}

/** Las citas del dia: nombre o codigo, horario, estado, ciudad y a que hora pasaron. */
export function filtrarCitas(citas, filtros = FILTROS_CITAS) {
  const { texto = '', hora = '', estado = '', ciudad = '', desde = '', hasta = '' } = filtros

  return (citas ?? []).filter(
    (cita) =>
      coincideTexto([cita.nombre, cita.codigo_corto], texto) &&
      (!hora || minutosDeHora(cita.hora) === minutosDeHora(hora)) &&
      coincideValor(cita.estado, estado) &&
      coincideValor(cita.ciudad, ciudad) &&
      enRango(horaLocal(cita.usado_en), desde, hasta),
  )
}

/** Las entradas sin cita: nombre o codigo, hora en que se anoto, quien la anoto y si cuenta. */
export function filtrarSinCita(filas, filtros = FILTROS_SIN_CITA) {
  const { texto = '', desde = '', hasta = '', anotadoPor = '', estado = '' } = filtros

  return (filas ?? []).filter(
    (fila) =>
      coincideTexto([fila.nombre, fila.codigo], texto) &&
      enRango(horaLocal(fila.registrado_en), desde, hasta) &&
      coincideValor(fila.anotado_por, anotadoPor) &&
      (!estado || (estado === 'anuladas' ? fila.anulada : !fila.anulada)),
  )
}

/** Valores distintos de un campo, ordenados y sin vacios: las opciones de un filtro. */
export function valoresUnicos(filas, campo) {
  const valores = new Set((filas ?? []).map((fila) => fila[campo]).filter(Boolean))
  return [...valores].sort((a, b) => String(a).localeCompare(String(b), 'es'))
}

/** Alguna fila no tiene ese dato (para ofrecer "sin ciudad", etc.). */
export function hayVacios(filas, campo) {
  return (filas ?? []).some((fila) => !fila[campo])
}

/** Cuantas filas hay por cada valor de un campo: { entregada: 12, reservada: 30 }. */
export function contarPor(filas, campo) {
  const cuentas = {}

  for (const fila of filas ?? []) {
    const valor = fila[campo]
    if (valor) cuentas[valor] = (cuentas[valor] ?? 0) + 1
  }

  return cuentas
}

const activo = (valor) => String(valor ?? '').trim() !== ''

/** Hay algun filtro puesto. */
export function hayFiltros(filtros) {
  return Object.values(filtros).some(activo)
}

/** Cuantos filtros hay puestos, sin contar los de "excluir" (el buscador, que siempre se ve). */
export function cuantosFiltros(filtros, excluir = []) {
  return Object.entries(filtros).filter(([campo, valor]) => !excluir.includes(campo) && activo(valor)).length
}

/**
 * Una pagina de la lista. La pagina se acomoda sola si ya no existe (por
 * ejemplo, al filtrar quedan menos filas): nunca se muestra una pagina vacia.
 */
export function paginar(filas, pagina = 1, porPagina = TAMANOS_PAGINA[0]) {
  const lista = filas ?? []
  const tamano = Math.floor(porPagina) > 0 ? Math.floor(porPagina) : TAMANOS_PAGINA[0]
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamano))
  const actual = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas)
  const inicio = (actual - 1) * tamano
  const visibles = lista.slice(inicio, inicio + tamano)

  return {
    filas: visibles,
    pagina: actual,
    totalPaginas,
    total: lista.length,
    desde: visibles.length > 0 ? inicio + 1 : 0,
    hasta: inicio + visibles.length,
  }
}

/**
 * Numeros de pagina para los botones: la primera, la ultima y las vecinas
 * de la actual. 20 paginas, en la 7 -> [1, '…', 6, 7, 8, '…', 20]. Si el
 * hueco es de una sola pagina se muestra el numero, no '…'.
 */
export function paginasVisibles(pagina, totalPaginas, vecinas = 1) {
  const numeros = new Set([1, Math.max(1, totalPaginas)])

  for (let numero = pagina - vecinas; numero <= pagina + vecinas; numero++) {
    if (numero >= 1 && numero <= totalPaginas) numeros.add(numero)
  }

  const ordenados = [...numeros].sort((a, b) => a - b)
  const resultado = []

  ordenados.forEach((numero, i) => {
    const salto = i > 0 ? numero - ordenados[i - 1] : 1
    if (salto === 2) resultado.push(numero - 1)
    if (salto > 2) resultado.push('…')
    resultado.push(numero)
  })

  return resultado
}
