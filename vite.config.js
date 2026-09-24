import { existsSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { leerArchivoEnv, problemaConLaBaseDePruebas } from './scripts/entorno.mjs'

//  Tailwind lee su configuracion una sola vez, al arrancar. Si alguien
//  cambia los colores del tema con el servidor abierto, las clases nuevas
//  (bg-marca, bg-superficie...) no se generan y la pagina sale blanca
//  sobre blanco hasta reiniciar. Esto lo reinicia solo.
const ARCHIVOS_DEL_TEMA = ['tailwind.config.js', 'postcss.config.js']

function reiniciarConElTema() {
  return {
    name: 'reiniciar-con-el-tema',
    apply: 'serve',
    configureServer(servidor) {
      //  Rutas completas: en Windows el vigilante reporta C:\... y una ruta
      //  relativa nunca coincide.
      const vigilados = ARCHIVOS_DEL_TEMA.map((nombre) => path.resolve(servidor.config.root, nombre))
      servidor.watcher.add(vigilados)

      const alCambiar = (archivo) => {
        if (!vigilados.includes(path.resolve(archivo))) return
        servidor.config.logger.info(`${path.basename(archivo)} cambió: reiniciando para cargar los colores nuevos`, {
          timestamp: true,
        })
        servidor.restart()
      }

      //  Algunos editores guardan borrando y volviendo a crear el archivo.
      servidor.watcher.on('change', alCambiar)
      servidor.watcher.on('add', alCambiar)
    },
  }
}

//  npm run dev:pruebas: si falta .env.pruebas, Vite usaria .env (la base
//  REAL) sin decir nada. Mejor no arrancar.
function revisarBaseDePruebas(modo, raiz) {
  const problema = problemaConLaBaseDePruebas({
    existeArchivo: existsSync(path.join(raiz, '.env.pruebas')),
    final: loadEnv(modo, raiz, ''),
    real: { ...leerArchivoEnv(path.join(raiz, '.env')), ...leerArchivoEnv(path.join(raiz, '.env.local')) },
  })
  if (!problema) return
  const sangria = (texto) => texto.split('\n').map((linea) => `  ${linea}`).join('\n')
  console.error(['', '  NO SE ABRIO LA APP: seguiria conectada a la base REAL.', '', sangria(problema), '', '  Pasos: docs/base-de-pruebas.md', ''].join('\n'))
  process.exit(1)
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === 'pruebas') revisarBaseDePruebas(mode, process.cwd())

  return {
    plugins: [react(), reiniciarConElTema()],
    test: {
      // Pruebas unitarias (npm test): funciones y capa de datos con Supabase
      // simulado. No abren navegador ni tocan la base de datos real.
      include: ['src/**/*.test.js', 'scripts/**/*.test.js'],
      environment: 'node',
    },
  }
})
