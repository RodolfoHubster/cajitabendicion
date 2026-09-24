/** @type {import('tailwindcss').Config} */

//  Los colores salen de variables de CSS (src/index.css) para que el modo
//  oscuro sea cambiar las variables, no reescribir cada pantalla. El
//  `<alpha-value>` deja seguir usando `text-principal/70`, `bg-principal/5`.
const color = (variable) => `rgb(var(${variable}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // `dark:` se activa con <html data-tema="oscuro">, que pone el boton del
  // pie o, la primera vez, la preferencia del telefono.
  darkMode: ['selector', '[data-tema="oscuro"]'],
  theme: {
    extend: {
      colors: {
        // Letra, bordes y matices. En oscuro se vuelve un azul muy claro.
        principal: color('--c-principal'),
        // El azul del logo como FONDO: encabezado, pie, botones fuertes.
        // Se queda azul en los dos modos, con letra blanca encima.
        marca: color('--c-marca'),
        accion: color('--c-accion'),
        // La letra sobre el naranja: siempre azul oscuro. Blanco sobre
        // naranja no se lee (ver componentes/Boton.jsx).
        'sobre-accion': color('--c-sobre-accion'),
        fondo: color('--c-fondo'),
        // Tarjetas, campos y menus.
        superficie: color('--c-superficie'),
        // Resultados del escaneo (ver CLAUDE.md > Colores). En oscuro se
        // aclaran para leerse sobre azul noche.
        'puede-pasar': color('--c-puede-pasar'),
        'ya-recibio': color('--c-ya-recibio'),
        // Botones de "si, eliminar": el rojo de siempre en los dos modos,
        // porque lleva letra blanca encima.
        peligro: color('--c-peligro'),
      },
      fontSize: {
        //  El minimo de letra del proyecto (15px con la letra normal). En rem
        //  y no en px: asi tambien crece con "letra grande".
        chica: ['0.9375rem', { lineHeight: '1.4rem' }],
      },
      boxShadow: {
        tarjeta: 'var(--sombra-tarjeta)',
        elevada: 'var(--sombra-elevada)',
      },
      fontFamily: {
        // Serif con remate, cercana a la letra del logo. Incluye los acentos
        // del vietnamita. Se usa en titulos; el texto corrido queda con la
        // letra del sistema, que carga al instante con datos moviles.
        titulo: ['"Roboto Slab Variable"', 'Georgia', 'serif'],
      },
      keyframes: {
        aparecer: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        brillo: {
          '0%, 100%': { opacity: '0.55', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.08)' },
        },
      },
      animation: {
        aparecer: 'aparecer 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        brillo: 'brillo 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
