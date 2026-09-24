import { createClient } from '@supabase/supabase-js'
import { conRetraso, retrasoDePrueba } from '../datos/retraso'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const faltantes = [
  ['VITE_SUPABASE_URL', supabaseUrl],
  ['VITE_SUPABASE_ANON_KEY', supabaseAnonKey],
]
  .filter(([, valor]) => !valor)
  .map(([nombre]) => nombre)

if (faltantes.length > 0) {
  throw new Error(
    `Faltan variables de entorno de Supabase: ${faltantes.join(', ')}.\n` +
      'Copia .env.example a .env y llena los valores del proyecto ' +
      '(Supabase > Project Settings > API), luego reinicia el servidor ' +
      'de desarrollo para que Vite las lea.\n' +
      'Usa la anon key, que es publica por diseño. La service_role key ' +
      'nunca debe llegar al navegador ni al repositorio.',
  )
}

//  Solo con la base de pruebas y VITE_RETRASO_MS: para ver los esqueletos
//  de carga (src/datos/retraso.js). En la app real vale 0.
export const RETRASO_MS = retrasoDePrueba(import.meta.env)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  ...(RETRASO_MS > 0 && { global: { fetch: conRetraso(RETRASO_MS) } }),
  auth: {
    // PKCE: al volver de Google, la sesion llega como un codigo de un solo
    // uso en vez de viajar los tokens en la direccion de la pagina.
    flowType: 'pkce',
  },
})
