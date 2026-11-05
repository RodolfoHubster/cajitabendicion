import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './en.json'
import es from './es.json'
import frances from './fr.json'
import criollo from './ht.json'
import coreano from './ko.json'
import ruso from './ru.json'
import somali from './so.json'
import tagalo from './tl.json'
import vietnamita from './vi.json'
import chino from './zh.json'

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

  //  Los siete idiomas nuevos (noviembre de 2026) solo traen lo que ve el
  //  publico: lo demas les sale en ingles (RESPALDO en idiomas.js). Aqui se
  //  revisa que lo que si traen este bien armado.
  describe.each([
    ['zh', chino, ['other']],
    ['tl', tagalo, ['one', 'other']],
    ['ko', coreano, ['other']],
    ['ht', criollo, ['one', 'other']],
    ['ru', ruso, ['one', 'few', 'many', 'other']],
    ['so', somali, ['one', 'other']],
    ['fr', frances, ['one', 'many', 'other']],
  ])('%s', (codigo, textos, formas) => {
    const PLURAL = /_(zero|one|two|few|many|other)$/
    const base = (llave) => llave.replace(PLURAL, '')
    const MAPA = new Map(aplanar(textos))
    const propias = [...MAPA.keys()].filter((llave) => !llave.startsWith('avisoIdioma.'))
    const BASES_EN = new Set([...EN.keys()].map(base))
    const PLURALES_EN = new Set([...EN.keys()].filter((llave) => PLURAL.test(llave)).map(base))

    it('no trae claves que el ingles no tenga, y si trae su aviso de idioma', () => {
      expect(propias.filter((llave) => !BASES_EN.has(base(llave)))).toEqual([])
      expect([...MAPA.keys()].filter((llave) => llave.startsWith('avisoIdioma.')).sort()).toEqual([
        'avisoIdioma.detalle',
        'avisoIdioma.ingles',
        'avisoIdioma.titulo',
      ])
    })

    it('cada plural con las formas de su idioma, ni una de mas ni de menos', () => {
      const porBase = new Map()

      for (const llave of propias.filter((llave) => PLURALES_EN.has(base(llave)))) {
        porBase.set(base(llave), [...(porBase.get(base(llave)) ?? []), llave.match(PLURAL)?.[1]])
      }

      expect(porBase.size).toBeGreaterThan(0)
      for (const [llave, halladas] of porBase) {
        expect(halladas.sort(), `${codigo} ${llave}`).toEqual([...formas].sort())
      }
    })

    //  El navegador escoge la forma con Intl.PluralRules. El criollo no
    //  viene ahi: usaria las reglas del idioma del telefono, y con "una" y
    //  "otra" alcanza para los numeros de esta app.
    it.skipIf(codigo === 'ht')('esas formas son las que pide el navegador para su idioma', () => {
      expect(new Intl.PluralRules(codigo).resolvedOptions().pluralCategories.sort()).toEqual([...formas].sort())
    })

    it('las mismas variables que el espanol (en los plurales, {{count}} puede no ir)', () => {
      for (const llave of propias) {
        const plural = PLURAL.test(llave)
        const original = plural ? ES.get(`${base(llave)}_other`) : ES.get(llave)
        const sinCount = (lista) => (plural ? lista.filter((v) => v !== 'count') : lista)

        expect(sinCount(variables(MAPA.get(llave))), `${codigo} ${llave}`).toEqual(sinCount(variables(original)))
      }
    })

    it('ningun texto vacio', () => {
      for (const [llave, texto] of MAPA) {
        expect(String(texto).trim(), `${codigo} ${llave}`).not.toBe('')
      }
    })
  })

  it('los siete idiomas nuevos traen las mismas claves', () => {
    const bases = (textos) =>
      [...new Set(aplanar(textos).map(([llave]) => llave.replace(/_(zero|one|two|few|many|other)$/, '')))].sort()

    for (const textos of [tagalo, coreano, criollo, ruso, somali, frances]) {
      expect(bases(textos)).toEqual(bases(chino))
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
