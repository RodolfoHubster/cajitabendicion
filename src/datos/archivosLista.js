import { aCsv } from './reportes'
import { columnasDe, cuentas, fechaLarga, nombreDeHoja, porLugar } from './listaPersonas'

/**
 * Los archivos de la lista de quienes recibieron (ver listaPersonas.js):
 * Excel con formato, PDF para imprimir y CSV sencillo. Con la paleta de
 * Iglesia Casa de Alabanza (azul marino y dorado) y su logo.
 *
 * Las librerias de Excel y PDF pesan: se cargan solo al tocar el boton.
 */

//  La paleta de Casa de Alabanza (la de su pagina nueva).
const OSCURO = '0F2342'
const DORADO = 'D6A84F'
const CREMA = 'F5F2EA'
const TINTA = '14213A'
const SUAVE = '4C586C'
const rgb = (hex) => [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
const argb = (hex) => `FF${hex}`

/** Baja un archivo (Blob) con ese nombre. */
export function descargarArchivo(nombre, blob, { documento = globalThis.document, urls = globalThis.URL } = {}) {
  const url = urls.createObjectURL(blob)
  const enlace = documento.createElement('a')
  enlace.href = url
  enlace.download = nombre
  documento.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => urls.revokeObjectURL(url), 1000)
}

/** El logo de la iglesia como PNG (Excel y PDF no leen webp). null si no se pudo. */
export async function logoIglesia() {
  try {
    const respuesta = await fetch('/logos/casa-alabanza.webp')
    const imagen = await createImageBitmap(await respuesta.blob())
    const lienzo = document.createElement('canvas')
    lienzo.width = imagen.width
    lienzo.height = imagen.height
    lienzo.getContext('2d').drawImage(imagen, 0, 0)
    return { datos: lienzo.toDataURL('image/png'), ancho: imagen.width, alto: imagen.height }
  } catch {
    return null
  }
}

function generadoEl(idioma) {
  return new Intl.DateTimeFormat(idioma, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Los_Angeles',
  }).format(new Date())
}

function textosComunes({ t, idioma, version, desde, hasta }) {
  return {
    iglesia: t('listaPersonas.archivo.iglesia'),
    titulo: t('listaPersonas.archivo.titulo'),
    rango:
      desde === hasta
        ? fechaLarga(desde, idioma)
        : t('listaPersonas.archivo.rango', { desde: fechaLarga(desde, idioma, { mayuscula: false }), hasta: fechaLarga(hasta, idioma, { mayuscula: false }) }),
    generado: t('listaPersonas.archivo.generado', { cuando: generadoEl(idioma) }),
    nota: version === 'compartir' ? t('listaPersonas.archivo.notaCompartir') : t('listaPersonas.archivo.notaCompleta'),
  }
}

// ------------------------------------------------------------
//  CSV: una sola tabla con la fecha en cada renglon
// ------------------------------------------------------------
export function armarCsv({ dias, t, version, aPie, noVinieron }) {
  const columnas = [{ clave: 'fechaTexto' }, ...columnasDe(dias, { version, aPie, noVinieron })]
  const encabezados = columnas.map((c) => ({ clave: c.clave, titulo: t(`listaPersonas.columnas.${c.clave}`) }))
  const renglones = dias.flatMap((d) => d.renglones.map((r) => ({ ...r, fechaTexto: d.fecha })))
  return new Blob(['﻿', aCsv(renglones, encabezados)], { type: 'text/csv;charset=utf-8' })
}

// ------------------------------------------------------------
//  Excel
// ------------------------------------------------------------
const BORDE = { style: 'thin', color: { argb: 'FFE4DCC8' } }

function encabezadoDeHoja(hoja, { ancho, textos, subtitulo, logo, idLogo, columnaTitulo = 3 }) {
  //  Tres renglones azul marino, una raya dorada y la nota de privacidad.
  for (const n of [1, 2, 3]) hoja.getRow(n).height = n === 1 ? 30 : 22
  hoja.getRow(4).height = 5
  hoja.getRow(5).height = 18
  for (let c = 1; c <= ancho; c++) {
    for (const n of [1, 2, 3]) hoja.getCell(n, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(OSCURO) } }
    hoja.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(DORADO) } }
  }
  const desde = Math.min(columnaTitulo, ancho)
  const poner = (fila, texto, fuente) => {
    if (ancho > desde) hoja.mergeCells(fila, desde, fila, ancho)
    const celda = hoja.getCell(fila, desde)
    celda.value = texto
    celda.font = { name: 'Calibri', ...fuente }
    celda.alignment = { vertical: 'middle', horizontal: 'left' }
  }
  poner(1, textos.iglesia, { size: 16, bold: true, color: { argb: 'FFFFFFFF' } })
  poner(2, subtitulo, { size: 13, bold: true, color: { argb: argb(DORADO) } })
  poner(3, textos.generado, { size: 10, color: { argb: 'FFE6E9F0' } })
  hoja.mergeCells(5, 1, 5, ancho)
  const nota = hoja.getCell(5, 1)
  nota.value = textos.nota
  nota.font = { name: 'Calibri', size: 9, italic: true, color: { argb: argb(SUAVE) } }
  if (logo && idLogo !== undefined) {
    const alto = 74
    hoja.addImage(idLogo, { tl: { col: 0.15, row: 0.12 }, ext: { width: Math.round((alto * logo.ancho) / logo.alto), height: alto }, editAs: 'absolute' })
  }
}

function estiloTitulos(fila) {
  fila.height = 30
  fila.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(OSCURO) } }
    celda.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    celda.border = { bottom: { style: 'medium', color: { argb: argb(DORADO) } } }
  })
}

//  Franjas: con formato condicional, asi siguen bien aunque se ordene o filtre.
function franjas(hoja, desdeFila, hastaFila, columnas) {
  if (hastaFila < desdeFila) return
  hoja.addConditionalFormatting({
    ref: `A${desdeFila}:${letra(columnas)}${hastaFila}`,
    rules: [
      {
        type: 'expression',
        formulae: ['MOD(ROW(),2)=0'],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(CREMA) } } },
      },
    ],
  })
}

function letra(n) {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function valorDe(renglon, clave) {
  if (clave === 'horaCita') return renglon._horaCita ?? null
  if (clave === 'recibio') return renglon._recibio ?? null
  if (clave === 'fechaValor') return renglon.fechaValor
  return renglon[clave] === '' ? null : renglon[clave]
}

function tablaDePersonas(hoja, { nombre, columnas, renglones, t, filaTitulos }) {
  hoja.addTable({
    name: nombre,
    ref: `A${filaTitulos}`,
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleLight1', showRowStripes: false },
    columns: columnas.map((c) => ({ name: t(`listaPersonas.columnas.${c.clave}`), filterButton: true })),
    rows: renglones.map((r) => columnas.map((c) => valorDe(r, c.clave))),
  })
  estiloTitulos(hoja.getRow(filaTitulos))
  columnas.forEach((c, i) => {
    const columna = hoja.getColumn(i + 1)
    columna.width = c.ancho
    const formato =
      c.clave === 'horaCita' || c.clave === 'recibio' ? 'h:mm AM/PM' : c.clave === 'fechaValor' ? 'ddd d mmm yyyy' : c.clave === 'numero' ? '0' : null
    for (let f = filaTitulos + 1; f <= filaTitulos + renglones.length; f++) {
      const celda = hoja.getCell(f, i + 1)
      celda.font = { name: 'Calibri', size: 10, color: { argb: argb(TINTA) }, bold: c.clave === 'apellidos' }
      celda.alignment = { vertical: 'middle', horizontal: ['numero', 'codigo', 'horaCita', 'recibio', 'codigoPostal'].includes(c.clave) ? 'center' : 'left', wrapText: false }
      celda.border = { bottom: BORDE }
      if (formato) celda.numFmt = formato
    }
  })
  franjas(hoja, filaTitulos + 1, filaTitulos + renglones.length, columnas.length)
}

function preparar(hoja, filaTitulos, textos) {
  hoja.views = filaTitulos
    ? [{ state: 'frozen', ySplit: filaTitulos, xSplit: 0, topLeftCell: `A${filaTitulos + 1}`, showGridLines: false }]
    : [{ showGridLines: false }]
  hoja.pageSetup = {
    orientation: 'landscape',
    paperSize: 1,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 },
    ...(filaTitulos ? { printTitlesRow: `${filaTitulos}:${filaTitulos}` } : {}),
  }
  hoja.headerFooter = { oddFooter: `&L&8${textos.iglesia} · ${textos.titulo}&R&8&P / &N` }
}

export async function armarExcel({ dias, t, idioma, version, desde, hasta, aPie, noVinieron, logo }) {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Cajita de Bendición'
  libro.created = new Date()
  const textos = textosComunes({ t, idioma, version, desde, hasta })
  const idLogo = logo ? libro.addImage({ base64: logo.datos, extension: 'png' }) : undefined
  const columnas = columnasDe(dias, { version, aPie, noVinieron })
  const totales = cuentas(dias)

  // ---------- Resumen ----------
  const resumen = libro.addWorksheet(t('listaPersonas.archivo.resumen'), { properties: { tabColor: { argb: argb(DORADO) } } })
  const colsResumen = [
    { clave: 'fecha', ancho: 30 },
    { clave: 'carro', ancho: 16 },
    ...(aPie ? [{ clave: 'aPie', ancho: 16 }] : []),
    { clave: 'recibieron', ancho: 18 },
    ...(noVinieron ? [{ clave: 'noVinieron', ancho: 16 }] : []),
  ]
  const lugares = porLugar(dias, t('listaPersonas.archivo.sinDato'))
  const anchoResumen = Math.max(colsResumen.length, 3 + dias.length)
  encabezadoDeHoja(resumen, { ancho: anchoResumen, textos, subtitulo: `${textos.titulo} · ${textos.rango}`, logo, idLogo, columnaTitulo: 2 })

  let f = 7
  const subtitulo = (texto) => {
    const celda = resumen.getCell(f, 1)
    celda.value = texto
    celda.font = { name: 'Calibri', size: 13, bold: true, color: { argb: argb(OSCURO) } }
    f++
  }
  subtitulo(t('listaPersonas.archivo.porDia'))
  const titulosDia = resumen.getRow(f)
  colsResumen.forEach((c, i) => (titulosDia.getCell(i + 1).value = t(`listaPersonas.archivo.totales.${c.clave}`)))
  estiloTitulos(titulosDia)
  const inicioDias = f + 1
  for (const cuenta of totales) {
    f++
    colsResumen.forEach((c, i) => {
      const celda = resumen.getCell(f, i + 1)
      celda.value = c.clave === 'fecha' ? fechaLarga(cuenta.fecha, idioma) : cuenta[c.clave]
      celda.font = { name: 'Calibri', size: 11, color: { argb: argb(TINTA) }, bold: c.clave === 'recibieron' }
      celda.alignment = { horizontal: c.clave === 'fecha' ? 'left' : 'center' }
      celda.border = { bottom: BORDE }
    })
  }
  franjas(resumen, inicioDias, f, colsResumen.length)
  f++
  colsResumen.forEach((c, i) => {
    const celda = resumen.getCell(f, i + 1)
    celda.value = c.clave === 'fecha' ? t('listaPersonas.archivo.total') : totales.reduce((s, x) => s + x[c.clave], 0)
    celda.font = { name: 'Calibri', size: 11, bold: true, color: { argb: argb(OSCURO) } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2E3C2' } }
    celda.alignment = { horizontal: c.clave === 'fecha' ? 'left' : 'center' }
    celda.border = { top: { style: 'medium', color: { argb: argb(DORADO) } } }
  })

  f += 3
  subtitulo(t('listaPersonas.archivo.porLugar'))
  const titulosLugar = resumen.getRow(f)
  const encabezadosLugar = [
    t('listaPersonas.columnas.codigoPostal'),
    t('listaPersonas.columnas.ciudad'),
    ...dias.map((d) => nombreDeHoja(d.fecha, idioma)),
    t('listaPersonas.archivo.total'),
  ]
  encabezadosLugar.forEach((texto, i) => (titulosLugar.getCell(i + 1).value = texto))
  estiloTitulos(titulosLugar)
  const inicioLugar = f + 1
  for (const lugar of lugares) {
    f++
    const valores = [lugar.codigoPostal, lugar.ciudad, ...dias.map((d) => lugar.dias[d.fecha] ?? 0), lugar.total]
    valores.forEach((v, i) => {
      const celda = resumen.getCell(f, i + 1)
      celda.value = v
      celda.font = { name: 'Calibri', size: 11, color: { argb: argb(TINTA) }, bold: i === valores.length - 1 }
      celda.alignment = { horizontal: i < 2 ? 'left' : 'center' }
      celda.border = { bottom: BORDE }
    })
  }
  franjas(resumen, inicioLugar, f, encabezadosLugar.length)

  f += 3
  resumen.mergeCells(f, 1, f + 1, anchoResumen)
  const ayuda = resumen.getCell(f, 1)
  ayuda.value = t('listaPersonas.archivo.ayudaExcel')
  ayuda.font = { name: 'Calibri', size: 10, italic: true, color: { argb: argb(SUAVE) } }
  ayuda.alignment = { wrapText: true, vertical: 'top' }
  resumen.getRow(f).height = 22
  resumen.getRow(f + 1).height = 22
  ;[30, 16, ...dias.map(() => 12), 12].forEach((ancho, i) => {
    resumen.getColumn(i + 1).width = Math.max(resumen.getColumn(i + 1).width ?? 0, i === 0 ? 30 : ancho)
  })
  resumen.getColumn(2).width = Math.max(resumen.getColumn(2).width, 18)
  preparar(resumen, 0, textos)

  // ---------- Una hoja por dia ----------
  const usados = new Set()
  for (const dia of dias) {
    let nombre = nombreDeHoja(dia.fecha, idioma)
    while (usados.has(nombre)) nombre = `${nombre.slice(0, 28)} ${usados.size}`
    usados.add(nombre)
    const hoja = libro.addWorksheet(nombre)
    const subtituloDia = `${fechaLarga(dia.fecha, idioma)} · ${t('listaPersonas.archivo.personas', { count: dia.renglones.length })}`
    encabezadoDeHoja(hoja, { ancho: columnas.length, textos, subtitulo: subtituloDia, logo, idLogo })
    tablaDePersonas(hoja, { nombre: `Dia_${dia.fecha.replace(/-/g, '')}`, columnas, renglones: dia.renglones, t, filaTitulos: 7 })
    preparar(hoja, 7, textos)
  }

  // ---------- Todas las fechas juntas: para filtrar u ordenar todo, o una tabla dinamica ----------
  if (dias.length > 1) {
    const hoja = libro.addWorksheet(t('listaPersonas.archivo.todas'))
    const conFecha = [{ clave: 'fechaValor', ancho: 16 }, ...columnas]
    const renglones = dias.flatMap((d) => d.renglones.map((r) => ({ ...r, fechaValor: new Date(`${d.fecha}T12:00:00Z`) })))
    const total = renglones.length
    encabezadoDeHoja(hoja, {
      ancho: conFecha.length,
      textos,
      subtitulo: `${textos.rango} · ${t('listaPersonas.archivo.personas', { count: total })}`,
      logo,
      idLogo,
    })
    tablaDePersonas(hoja, { nombre: 'Todas_las_fechas', columnas: conFecha, renglones, t, filaTitulos: 7 })
    preparar(hoja, 7, textos)
  }

  const buffer = await libro.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ------------------------------------------------------------
//  PDF
// ------------------------------------------------------------
//  En el PDF el domicilio va en una sola columna, para que quepa en la hoja.
const COLUMNAS_PDF_DOMICILIO = ['calle', 'numeroExterior', 'numeroInterior', 'colonia', 'direccion']

function domicilio(r, t) {
  const partes = [
    [r.calle, r.numeroExterior].filter(Boolean).join(' '),
    r.numeroInterior ? t('listaPersonas.archivo.interior', { numero: r.numeroInterior }) : '',
    r.colonia,
    r.direccion,
  ].filter(Boolean)
  return partes.join(', ')
}

export async function armarPdf({ dias, t, idioma, version, desde, hasta, aPie, noVinieron, logo }) {
  const [{ jsPDF }, tablas] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = tablas.autoTable ?? tablas.default
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })
  const textos = textosComunes({ t, idioma, version, desde, hasta })
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()
  const margen = 28

  let subtituloPagina = ''
  let derechaPagina = ''
  const encabezado = () => {
    doc.setFillColor(...rgb(OSCURO))
    doc.rect(0, 0, ancho, 66, 'F')
    doc.setFillColor(...rgb(DORADO))
    doc.rect(0, 66, ancho, 3, 'F')
    let x = margen
    if (logo) {
      const h = 50
      const w = (h * logo.ancho) / logo.alto
      doc.addImage(logo.datos, 'PNG', margen, 8, w, h)
      x = margen + w + 14
    }
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(textos.iglesia, x, 28)
    doc.setTextColor(...rgb(DORADO))
    doc.setFontSize(11)
    doc.text(subtituloPagina, x, 46)
    if (derechaPagina) {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(11)
      doc.text(derechaPagina, ancho - margen, 46, { align: 'right' })
    }
  }
  const pie = () => {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...rgb(SUAVE))
    doc.text(`${textos.nota}  ·  ${textos.generado}`, margen, alto - 14)
  }

  const estilo = {
    theme: 'grid',
    margin: { top: 82, left: margen, right: margen, bottom: 30 },
    styles: { font: 'helvetica', fontSize: 7.2, cellPadding: 2.6, textColor: rgb(TINTA), lineColor: [228, 220, 200], lineWidth: 0.4, overflow: 'linebreak' },
    headStyles: { fillColor: rgb(OSCURO), textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', valign: 'middle' },
    alternateRowStyles: { fillColor: rgb(CREMA) },
    didDrawPage: () => {
      encabezado()
      pie()
    },
  }

  // ---------- Resumen ----------
  const totales = cuentas(dias)
  subtituloPagina = `${textos.titulo} · ${textos.rango}`
  derechaPagina = ''
  const colsResumen = ['fecha', 'carro', ...(aPie ? ['aPie'] : []), 'recibieron', ...(noVinieron ? ['noVinieron'] : [])]
  autoTable(doc, {
    ...estilo,
    styles: { ...estilo.styles, fontSize: 10, cellPadding: 5 },
    headStyles: { ...estilo.headStyles, fontSize: 10 },
    head: [colsResumen.map((c) => t(`listaPersonas.archivo.totales.${c}`))],
    body: totales.map((x) => colsResumen.map((c) => (c === 'fecha' ? fechaLarga(x.fecha, idioma) : String(x[c])))),
    foot: [colsResumen.map((c) => (c === 'fecha' ? t('listaPersonas.archivo.total') : String(totales.reduce((s, x) => s + x[c], 0))))],
    footStyles: { fillColor: [242, 227, 194], textColor: rgb(OSCURO), fontStyle: 'bold', fontSize: 10, halign: 'center' },
    didParseCell: (celda) => {
      if (celda.section === 'foot' && celda.column.index === 0) celda.cell.styles.halign = 'left'
    },
    columnStyles: Object.fromEntries(colsResumen.map((c, i) => [i, { halign: c === 'fecha' ? 'left' : 'center' }])),
    startY: 100,
  })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...rgb(OSCURO))
  const yLugar = (doc.lastAutoTable?.finalY ?? 200) + 28
  doc.text(t('listaPersonas.archivo.porLugar'), margen, yLugar)
  const lugares = porLugar(dias, t('listaPersonas.archivo.sinDato'))
  autoTable(doc, {
    ...estilo,
    styles: { ...estilo.styles, fontSize: 9, cellPadding: 4 },
    head: [[t('listaPersonas.columnas.codigoPostal'), t('listaPersonas.columnas.ciudad'), ...dias.map((d) => nombreDeHoja(d.fecha, idioma)), t('listaPersonas.archivo.total')]],
    body: lugares.map((l) => [l.codigoPostal, l.ciudad, ...dias.map((d) => String(l.dias[d.fecha] ?? 0)), String(l.total)]),
    columnStyles: Object.fromEntries([...dias.map((_, i) => [i + 2, { halign: 'center' }]), [dias.length + 2, { halign: 'center', fontStyle: 'bold' }]]),
    startY: yLugar + 8,
  })

  // ---------- Una seccion por dia, cada una desde una hoja nueva ----------
  //  El pais casi siempre es el mismo: en el PDF no cabe; en el Excel si va.
  const columnas = columnasDe(dias, { version, aPie, noVinieron }).filter((c) => c.clave !== 'pais')
  const conDomicilio = columnas.some((c) => COLUMNAS_PDF_DOMICILIO.includes(c.clave))
  const columnasPdf = [
    ...columnas.filter((c) => !COLUMNAS_PDF_DOMICILIO.includes(c.clave)).slice(0, 4),
    ...columnas.filter((c) => ['telefono', 'correo'].includes(c.clave)),
    ...(conDomicilio ? [{ clave: 'domicilio' }] : []),
    ...columnas.filter((c) => !COLUMNAS_PDF_DOMICILIO.includes(c.clave)).slice(4).filter((c) => !['telefono', 'correo'].includes(c.clave)),
  ]
  for (const dia of dias) {
    doc.addPage()
    subtituloPagina = `${textos.titulo} · ${fechaLarga(dia.fecha, idioma)}`
    derechaPagina = t('listaPersonas.archivo.personas', { count: dia.renglones.length })
    autoTable(doc, {
      ...estilo,
      head: [columnasPdf.map((c) => t(`listaPersonas.columnas.${c.clave}`))],
      body: dia.renglones.map((r) => columnasPdf.map((c) => (c.clave === 'domicilio' ? domicilio(r, t) : String(r[c.clave] ?? '')))),
      columnStyles: Object.fromEntries(
        columnasPdf.map((c, i) => [
          i,
          {
            halign: ['numero', 'codigo', 'horaCita', 'recibio', 'codigoPostal'].includes(c.clave) ? 'center' : 'left',
            fontStyle: c.clave === 'apellidos' ? 'bold' : 'normal',
            //  Lo corto, sin partirse en dos renglones; el domicilio, ancho fijo.
            cellWidth: ['numero', 'codigo', 'telefono', 'estado', 'codigoPostal', 'horaCita', 'recibio', 'situacion'].includes(c.clave)
              ? 'wrap'
              : c.clave === 'domicilio'
                ? 125
                : 'auto',
          },
        ]),
      ),
      startY: 82,
    })
  }

  //  "Pagina 3 de 9", ya que se sabe cuantas son.
  const paginas = doc.getNumberOfPages()
  for (let n = 1; n <= paginas; n++) {
    doc.setPage(n)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...rgb(SUAVE))
    doc.text(t('listaPersonas.archivo.pagina', { n, total: paginas }), ancho - margen, alto - 14, { align: 'right' })
  }
  return doc.output('blob')
}
