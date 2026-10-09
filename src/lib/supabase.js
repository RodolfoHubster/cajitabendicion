import { createClient } from '@supabase/supabase-js'
import { instalarDemo } from '../datos/demo'
import { crearAlmacenSesion } from '../datos/recordarSesion'
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

//  Con ?demo=1 la parte publica no escribe nada en la base: es para grabar
//  el video de como hacer la cita (datos/demo.js).
export const supabase = instalarDemo(createClient(supabaseUrl, supabaseAnonKey, {
  ...(RETRASO_MS > 0 && { global: { fetch: conRetraso(RETRASO_MS) } }),
  auth: {
    // PKCE: al volver de Google, la sesion llega como un codigo de un solo
    // uso en vez de viajar los tokens en la direccion de la pagina.
    flowType: 'pkce',
    // "Mantener la sesion activa": en el telefono 30 dias, o solo en la
    // pestana (datos/recordarSesion.js). Se renueva sola mientras tanto.
    persistSession: true,
    autoRefreshToken: true,
    storage: crearAlmacenSesion(),
  },
}))
