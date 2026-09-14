import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Pruebas unitarias (npm test): funciones y capa de datos con Supabase
    // simulado. No abren navegador ni tocan la base de datos real.
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
})
