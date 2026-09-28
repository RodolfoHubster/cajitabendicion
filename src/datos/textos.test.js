import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import es from '../i18n/es.json'
import vi from '../i18n/vi.json'

//  Los textos los leen el pastor, los voluntarios y la gente que saca su
//  cita: nada de programacion. "Corre la migracion en supabase/migraciones"
//  es una instruccion para quien mantiene el sistema, no para ellos, y "sin
//  programar" no le dice nada a quien nunca ha programado.
//
//  entornoPruebas solo sale en la base de pruebas, que nada mas usa quien
//  mantiene el sistema.
const SOLO_PARA_QUIEN_MANTIENE = ['entornoPruebas']

const JERGA = {
  es: /\bprogramar\b|\bprogramaci[oó]n\b|\bprogramador|base de datos|migraci[oó]n|supabase|\bsql\b|servidor|\bhttps?\b|c[oó]digo fuente|\bapi\b/i,
  en: /\bprogramming\b|\bprogrammer|\bdatabase\b|\bmigration|supabase|\bsql\b|\bserver\b|\bhttps?\b|source code|\bapi\b/i,
  vi: /lập trình|cơ sở dữ liệu|migration|supabase|\bsql\b|máy chủ|\bhttps?\b|mã nguồn/i,
}

function textosCon(objeto, patron, ruta = '') {
  return Object.entries(objeto).flatMap(([clave, valor]) => {
    const aqui = ruta ? `${ruta}.${clave}` : clave
    if (!ruta && SOLO_PARA_QUIEN_MANTIENE.includes(clave)) return []
    if (valor && typeof valor === 'object') return textosCon(valor, patron, aqui)
    return patron.test(String(valor)) ? [aqui] : []
  })
}

describe('los textos no hablan de programación', () => {
  it.each([
    ['es', es],
    ['en', en],
    ['vi', vi],
  ])('en %s, ningún texto menciona base de datos, migraciones, programar o servidores', (idioma, textos) => {
    expect(textosCon(textos, JERGA[idioma])).toEqual([])
  })

  it('la revisión sí encuentra la jerga (si no, pasaría sin revisar nada)', () => {
    const prueba = {
      a: 'Corre la migración pendiente en supabase/migraciones.',
      b: { c: 'Lo cambias aquí mismo, sin programar.' },
      d: 'Por ahora no hay entregas programadas.',
    }
    expect(textosCon(prueba, JERGA.es)).toEqual(['a', 'b.c'])
  })
})
