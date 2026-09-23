---
description: Programar o rehacer una pantalla respetando marca, i18n y accesibilidad
argument-hint: [ruta o nombre de la pantalla, y qué debe hacer]
model: sonnet
---

Pantalla: **$ARGUMENTS**

Antes de escribir nada:

1. Mira cómo está resuelta una pantalla parecida en `src/paginas/` y qué
   componentes de `src/componentes/` puedes reutilizar. No inventes un `Boton`
   nuevo.
2. Mira qué función de `src/datos/` te da los datos. Si no existe, créala ahí,
   nunca llames a `supabase` desde la pantalla.

Al programarla:

- Mobile first de verdad: botones de 56px de alto mínimo, texto de 15px
  mínimo. Muchos usuarios son adultos mayores en un celular.
- Ningún texto suelto en el JSX: todo por `t('clave')`, y la clave entra en
  `es.json`, `en.json` y `vi.json` en la misma tanda.
- Botón principal: texto azul `#1B3A6B` sobre naranja `#F5A03C`, nunca blanco.
- Estados de error: traduce el código que viene de `src/datos/errores.js` a un
  mensaje que diga **qué hacer**, no qué falló.
- Estados vacíos y de carga incluidos. El día de la entrega hay fila afuera y
  una pantalla en blanco parece congelada.
- Si la pantalla es del panel, envuélvela en la protección de rol que ya usan
  las demás (`RutaProtegida`, `SoloRol`).

Al terminar corre `npm run lint` y `npm test`, y dime qué pantallas o rutas
tocaste. No hagas commit.
