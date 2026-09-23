import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
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

  //  Las de arriba comparan los tres idiomas entre si. Esta compara el
  //  codigo contra los textos: caza la clave que se escribio mal y la que
  //  dejo de ser texto porque alguien le colgo otras claves adentro.
  it('cada t(\'clave\') del código existe como texto, no como grupo', () => {
    const archivosDeCodigo = (dir, encontrados = []) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name)

        if (entrada.isDirectory()) archivosDeCodigo(ruta, encontrados)
        else if (/\.(jsx|js)$/.test(entrada.name) && !entrada.name.endsWith('.test.js')) encontrados.push(ruta)
      }

      return encontrados
    }

    //  Basta con que exista en uno: la prueba de arriba ya exige que los
    //  tres esten parejos. Asi pasa 'avisoIdioma.*', que solo esta en
    //  vietnamita a proposito.
    const esTexto = (clave) =>
      [ES, EN, VI].some(
        (mapa) =>
          typeof mapa.get(clave) === 'string' ||
          typeof mapa.get(`${clave}_one`) === 'string' ||
          typeof mapa.get(`${clave}_other`) === 'string',
      )

    const rotas = []

    for (const archivo of archivosDeCodigo('src')) {
      const codigo = readFileSync(archivo, 'utf8')

      //  Solo las claves escritas tal cual. Las armadas con variables
      //  --t(\`panel.estado.\${x}\`)-- no se pueden revisar asi, y esas ya
      //  llevan su defaultValue.
      for (const encontrado of codigo.matchAll(/\bt\(\s*'([^'${}]+)'/g)) {
        if (!esTexto(encontrado[1])) {
          rotas.push(`${encontrado[1]} (en ${relative('src', archivo).split(sep).join('/')})`)
        }
      }
    }

    expect(rotas).toEqual([])
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
