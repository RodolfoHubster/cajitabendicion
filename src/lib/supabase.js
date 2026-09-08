import { createClient } from '@supabase/supabase-js'

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
