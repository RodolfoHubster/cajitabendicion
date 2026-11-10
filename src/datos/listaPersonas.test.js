import { describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../lib/supabase'
import { armarCsv, armarExcel } from './archivosLista'
import {
  columnasDe,
  cuentas,
  fraccionDelDia,
  nombreArchivoLista,
  nombreDeHoja,
  pedirLista,
  porDia,
  porLugar,
} from './listaPersonas'

//  Un t() de mentira: la clave y sus variables, para ver que se pidio cada texto.
const t = (clave, vars = {}) => {
  const extra = Object.entries(vars)
    .filter(([k]) => k !== 'defaultValue')
    .map(([k, v]) => `${k}=${v}`)
    .join(',')
  return extra ? `${clave}(${extra})` : clave
}

const base = {
  fila: 'carro',
  situacion: 'recibio',
  tipo: 'cita',
  telefono: '+16195550101',
  email: 'ana@ejemplo.com',
  calle: 'Calle Uno',
  numero_exterior: '12',
  numero_interior: null,
  colonia: null,
  direccion: null,
  ciudad: 'San Diego',
  municipio: null,
  estado_domicilio: 'CA',
  codigo_postal: '92113',
  pais: 'Estados Unidos',
  hora_cita: '15:00:00',
  recibio_en: '2026-11-02T15:05:00',
  turno: null,
  en_carro_de: null,
}
const fila = (extra) => ({ ...base, ...extra })

const FILAS = [
  fila({ fecha: '2026-11-05', codigo_corto: 'CB-10001', nombres: 'Rosa', apellidos: 'Zamora', nombre: 'Rosa Zamora' }),
  fila({ fecha: '2026-11-02', codigo_corto: 'CB-10002', nombres: 'Ana', apellidos: 'Ávila', nombre: 'Ana Ávila' }),
  fila({ fecha: '2026-11-02', codigo_corto: 'CB-10003', nombres: 'Luis', apellidos: 'Zepeda', nombre: 'Luis Zepeda', tipo: 'acompanante', en_carro_de: 'CB-10002' }),
  fila({ fecha: '2026-11-02', codigo_corto: 'CB-10004', nombres: 'Beto', apellidos: 'Alba', nombre: 'Beto Alba', situacion: 'no_vino', recibio_en: null }),
  fila({ fecha: '2026-11-02', codigo_corto: 'CB-10005', nombres: 'Carmen', apellidos: 'Barrios', nombre: 'Carmen Barrios', tipo: 'pase', hora_cita: null, codigo_postal: '91910', ciudad: 'Chula Vista' }),
  fila({
    fecha: '2026-11-02',
    codigo_corto: 'CB-10006',
    nombres: null,
    apellidos: null,
    nombre: 'Turno 7',
    fila: 'a_pie',
    turno: 7,
    telefono: null,
    email: null,
    calle: null,
    numero_exterior: null,
    ciudad: null,
    estado_domicilio: null,
    codigo_postal: null,
    pais: null,
  }),
]

describe('la lista de quienes recibieron', () => {
  it('pide a la base lo palomeado y la versión', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await pedirLista({ desde: '2026-11-01', hasta: '2026-11-30', noVinieron: true, version: 'compartir' })
    expect(supabase.rpc).toHaveBeenCalledWith('lista_de_personas', {
      p_desde: '2026-11-01',
      p_hasta: '2026-11-30',
      p_recibieron: true,
      p_no_vinieron: true,
      p_a_pie: false,
      p_version: 'compartir',
    })
  })

  it('si la base dice que no es administrador, lo dice así', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'SIN_PERMISO', code: '42501' } })
    await expect(pedirLista({ desde: '2026-11-01', hasta: '2026-11-30' })).rejects.toThrow('SIN_PERMISO')
  })

  it('junta por día, en orden de fecha', () => {
    const dias = porDia(FILAS, t)
    expect(dias.map((d) => d.fecha)).toEqual(['2026-11-02', '2026-11-05'])
  })

  it('por apellido de la A a la Z (Ávila con la A), los que no vinieron al final y los turnos a pie sin nombre después', () => {
    const [dia] = porDia(FILAS, t)
    expect(dia.renglones.map((r) => r.codigo)).toEqual(['CB-10002', 'CB-10005', 'CB-10003', 'CB-10006', 'CB-10004'])
    expect(dia.renglones.map((r) => r.numero)).toEqual([1, 2, 3, 4, 5])
  })

  it('cada renglón dice cómo recibió: cita, acompañante de quién, pase o turno a pie', () => {
    const [dia] = porDia(FILAS, t)
    const tipo = (codigo) => dia.renglones.find((r) => r.codigo === codigo).tipo
    expect(tipo('CB-10002')).toBe('listaPersonas.tipo.cita')
    expect(tipo('CB-10003')).toBe('listaPersonas.tipo.acompanante(codigo=CB-10002)')
    expect(tipo('CB-10005')).toBe('listaPersonas.tipo.pase')
    expect(tipo('CB-10006')).toBe('listaPersonas.tipo.turno(turno=7)')
  })

  it('las horas: en texto para leer y como fracción del día para que Excel las ordene', () => {
    const [dia] = porDia(FILAS, t)
    const ana = dia.renglones.find((r) => r.codigo === 'CB-10002')
    expect(ana.horaCita).toBe('3:00 PM')
    expect(ana.recibio).toBe('3:05 PM')
    expect(ana._recibio).toBeCloseTo((15 * 60 + 5) / 1440)
    expect(fraccionDelDia(null)).toBeNull()
    expect(fraccionDelDia('10:00')).toBeCloseTo(10 / 24)
  })

  it('las columnas: las que traen algo; en la de compartir nunca las privadas', () => {
    const dias = porDia(FILAS, t)
    const claves = (opciones) => columnasDe(dias, opciones).map((c) => c.clave)
    const completa = claves({ version: 'completa' })
    expect(completa).toEqual(expect.arrayContaining(['apellidos', 'telefono', 'correo', 'calle', 'numeroExterior', 'codigoPostal']))
    expect(completa).not.toContain('colonia')
    expect(completa).not.toContain('fila')
    expect(completa).not.toContain('situacion')
    const compartir = claves({ version: 'compartir' })
    for (const privada of ['telefono', 'correo', 'calle', 'numeroExterior', 'numeroInterior', 'colonia', 'direccion']) {
      expect(compartir).not.toContain(privada)
    }
    expect(compartir).toEqual(expect.arrayContaining(['apellidos', 'nombres', 'ciudad', 'codigoPostal', 'recibio']))
    expect(claves({ aPie: true, noVinieron: true })).toEqual(expect.arrayContaining(['fila', 'situacion']))
  })

  it('las cuentas por día y por lugar solo cuentan a quienes recibieron', () => {
    const dias = porDia(FILAS, t)
    expect(cuentas(dias)).toEqual([
      { fecha: '2026-11-02', carro: 3, aPie: 1, recibieron: 4, noVinieron: 1 },
      { fecha: '2026-11-05', carro: 1, aPie: 0, recibieron: 1, noVinieron: 0 },
    ])
    const lugares = porLugar(dias, '(sin dato)')
    expect(lugares[0]).toEqual({ codigoPostal: '92113', ciudad: 'San Diego', dias: { '2026-11-02': 2, '2026-11-05': 1 }, total: 3 })
    expect(lugares.find((l) => l.codigoPostal === '(sin dato)').total).toBe(1)
  })

  it('el nombre del archivo dice las fechas y si es para compartir', () => {
    expect(nombreArchivoLista('2026-11-01', '2026-11-30', 'completa', 'xlsx')).toBe('cajita-lista-recibieron_2026-11-01_a_2026-11-30.xlsx')
    expect(nombreArchivoLista('2026-11-01', '2026-11-30', 'compartir', 'pdf')).toBe(
      'cajita-lista-recibieron_2026-11-01_a_2026-11-30_para-compartir.pdf',
    )
  })

  it('el nombre de cada hoja es corto y sin signos que Excel no acepta', () => {
    const nombre = nombreDeHoja('2026-11-02', 'es')
    expect(nombre).toMatch(/^Lun 2 nov$/i)
    expect(nombre.length).toBeLessThanOrEqual(31)
    expect(nombre).not.toMatch(/[\\/?*[\]:]/)
  })

  it('el CSV trae la fecha en cada renglón, y en la de compartir no trae teléfonos', async () => {
    const dias = porDia(FILAS, t)
    const completo = await armarCsv({ dias, t, version: 'completa' }).text()
    expect(completo).toContain('+16195550101')
    expect(completo.split('\r\n')[1]).toMatch(/^2026-11-02,1,/)
    const compartir = await armarCsv({ dias, t, version: 'compartir' }).text()
    expect(compartir).not.toContain('+16195550101')
    expect(compartir).not.toContain('ana@ejemplo.com')
  })

  it('el Excel: resumen, una hoja por día y «todas las fechas», con tablas que se filtran', async () => {
    const dias = porDia(FILAS, t)
    const blob = await armarExcel({ dias, t, idioma: 'es', version: 'completa', desde: '2026-11-01', hasta: '2026-11-30', logo: null })
    const libro = new ExcelJS.Workbook()
    await libro.xlsx.load(await blob.arrayBuffer())
    const nombres = libro.worksheets.map((h) => h.name)
    expect(nombres).toEqual(['listaPersonas.archivo.resumen', nombreDeHoja('2026-11-02', 'es'), nombreDeHoja('2026-11-05', 'es'), 'listaPersonas.archivo.todas'])
    const dia = libro.worksheets[1]
    //  Los titulos de la tabla en el renglon 7 y la primera persona en el 8.
    expect(dia.getCell('B7').value).toBe('listaPersonas.columnas.apellidos')
    expect(dia.getCell('B8').value).toBe('Ávila')
    expect(dia.getCell('A8').value).toBe(1)
    const todas = libro.worksheets[3]
    expect(todas.getCell('A8').value).toBeInstanceOf(Date)
  })
})
