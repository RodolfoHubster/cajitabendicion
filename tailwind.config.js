/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        principal: '#1B3A6B',
        accion: '#F5A03C',
        fondo: '#FFFFFF',
        // Resultados del escaneo (ver CLAUDE.md > Colores).
        'puede-pasar': '#2E8B57',
        'ya-recibio': '#C4453D',
      },
    },
  },
  plugins: [],
}
