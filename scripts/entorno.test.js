import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { leerArchivoEnv, problemaConLaBaseDePruebas } from './entorno.mjs'

const REAL = { VITE_SUPABASE_URL: 'https://real.supabase.co', VITE_SUPABASE_ANON_KEY: 'clave-real' }
const PRUEBAS = {
  VITE_SUPABASE_URL: 'https://pruebas.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'clave-pruebas',
  VITE_ENTORNO: 'pruebas',
}

describe('problemaConLaBaseDePruebas (npm run dev:pruebas)', () => {
  it('deja arrancar con un .env.pruebas bien hecho', () => {
    expect(problemaConLaBaseDePruebas({ existeArchivo: true, final: PRUEBAS, real: REAL })).toBeNull()
  })

  it('sin .env.pruebas no arranca: Vite usaria la base real', () => {
    //  Lo que paso de verdad: sin el archivo, Vite le da a la app lo de .env.
    const problema = problemaConLaBaseDePruebas({ existeArchivo: false, final: REAL, real: REAL })
    expect(problema).toMatch(/No existe \.env\.pruebas/)
  })

  it('con la URL o la clave vacias no arranca', () => {
    expect(problemaConLaBaseDePruebas({
      existeArchivo: true, final: { ...PRUEBAS, VITE_SUPABASE_URL: '' }, real: REAL,
    })).toMatch(/no tiene VITE_SUPABASE_URL/)
    expect(problemaConLaBaseDePruebas({
      existeArchivo: true, final: { ...PRUEBAS, VITE_SUPABASE_ANON_KEY: '' }, real: REAL,
    })).toMatch(/VITE_SUPABASE_ANON_KEY/)
  })

  it('si .env.pruebas trae la URL de la real no arranca, aunque cambie una diagonal o mayusculas', () => {
    for (const url of ['https://real.supabase.co', 'https://real.supabase.co/', 'HTTPS://REAL.supabase.co ']) {
      const problema = problemaConLaBaseDePruebas({
        existeArchivo: true, final: { ...PRUEBAS, VITE_SUPABASE_URL: url }, real: REAL,
      })
      expect(problema).toMatch(/MISMA base/)
    }
  })

  it('sin VITE_ENTORNO=pruebas no arranca: no saldria la franja amarilla', () => {
    const { VITE_ENTORNO: _, ...sinEntorno } = PRUEBAS
    expect(problemaConLaBaseDePruebas({ existeArchivo: true, final: sinEntorno, real: REAL })).toMatch(/VITE_ENTORNO/)
    expect(problemaConLaBaseDePruebas({
      existeArchivo: true, final: { ...PRUEBAS, VITE_ENTORNO: 'produccion' }, real: REAL,
    })).toMatch(/VITE_ENTORNO/)
  })
})

describe('las plantillas .env*.example se suben al repo: nunca con datos', () => {
  //  Se llena .env o .env.pruebas; la plantilla solo trae los nombres. La
  //  contraseña de prueba se coló una vez en .env.pruebas.example.
  const PERMITIDOS = { VITE_ENTORNO: 'pruebas' }

  for (const nombre of ['.env.example', '.env.pruebas.example']) {
    it(`${nombre} no trae URL, claves, correo ni contraseña`, () => {
      const valores = leerArchivoEnv(fileURLToPath(new URL(`../${nombre}`, import.meta.url)))
      const conDatos = Object.entries(valores)
        .filter(([clave, valor]) => valor !== '' && PERMITIDOS[clave] !== valor)
        .map(([clave]) => clave)
      expect(conDatos).toEqual([])
    })
  }

  it('la prueba sí lee la plantilla (si no, pasaría sin revisar nada)', () => {
    const texto = readFileSync(fileURLToPath(new URL('../.env.pruebas.example', import.meta.url)), 'utf8')
    expect(texto).toMatch(/^PRUEBA_PASSWORD=/m)
  })
})
