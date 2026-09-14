import { describe, expect, it } from 'vitest'
import en from './en.json'
import es from './es.json'
import vietnamita from './vi.json'

const aplanar = (objeto, prefijo = '') =>
  Object.entries(objeto).flatMap(([llave, valor]) =>
    typeof valor === 'object' ? aplanar(valor, `${prefijo}${llave}.`) : [[`${prefijo}${llave}`, valor]],
  )

const ES = new Map(aplanar(es))
const EN = new Map(aplanar(en))
const VI = new Map(aplanar(vietnamita))

const variables = (texto) => [...String(texto).matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort()

describe('traducciones', () => {
  it('espanol e ingles tienen exactamente las mismas llaves', () => {
    expect([...EN.keys()].sort()).toEqual([...ES.keys()].sort())
  })

  it('vietnamita tiene las de ingles, sin los singulares _one, mas su aviso de idioma', () => {
    const esperadas = [...EN.keys()].filter((llave) => !llave.endsWith('_one')).sort()
    const reales = [...VI.keys()].filter((llave) => !llave.startsWith('avisoIdioma.')).sort()
    expect(reales).toEqual(esperadas)
  })

  it('ningun texto vacio', () => {
    for (const [idioma, mapa] of [
      ['es', ES],
      ['en', EN],
      ['vi', VI],
    ]) {
      for (const [llave, texto] of mapa) {
        expect(String(texto).trim(), `${idioma} ${llave}`).not.toBe('')
      }
    }
  })

  it('las variables {{...}} son las mismas en los tres idiomas', () => {
    for (const [llave, texto] of ES) {
      expect(variables(EN.get(llave)), `en ${llave}`).toEqual(variables(texto))

      const enVietnamita = VI.get(llave) ?? VI.get(llave.replace(/_one$/, '_other'))
      if (enVietnamita !== undefined) {
        expect(variables(enVietnamita), `vi ${llave}`).toEqual(variables(texto))
      }
    }
  })

  it('cada aviso de los campos del formulario tiene su mensaje en los tres idiomas', () => {
    const avisos = {
      nombres: ['VACIO', 'NUMEROS', 'SIMBOLOS', 'CORTO'],
      apellidos: ['VACIO', 'NUMEROS', 'SIMBOLOS', 'CORTO'],
      correo: [
        'VACIO',
        'ESPACIOS',
        'SIN_ARROBA',
        'VARIAS_ARROBAS',
        'SIN_USUARIO',
        'SIN_DOMINIO',
        'SIN_PUNTO',
        'DOMINIO_INVALIDO',
        'sugerencia',
        'usarSugerencia',
      ],
      telefono: ['VACIO', 'CARACTERES', 'LADA_DESCONOCIDA', 'CORTO', 'LARGO', 'EMPIEZA_CON_1', 'entre'],
    }

    for (const mapa of [ES, EN, VI]) {
      for (const [campo, codigos] of Object.entries(avisos)) {
        for (const codigo of codigos) {
          expect(mapa.has(`validacion.${campo}.${codigo}`), `validacion.${campo}.${codigo}`).toBe(true)
        }
      }
    }
  })
})
