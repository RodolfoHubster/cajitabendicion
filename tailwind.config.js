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
      fontFamily: {
        // Serif con remate, cercana a la letra del logo. Incluye los acentos
        // del vietnamita. Se usa en titulos; el texto corrido queda con la
        // letra del sistema, que carga al instante con datos moviles.
        titulo: ['"Roboto Slab Variable"', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
