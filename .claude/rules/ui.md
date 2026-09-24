---
paths:
  - "src/**/*.jsx"
  - "src/index.css"
  - "tailwind.config.js"
---

# Reglas de interfaz

## Mobile first, y de verdad

Casi todos entran desde un celular y hay muchos adultos mayores. Botones de
**56px de alto mínimo**, texto de **15px mínimo**. Se diseña para la pantalla
chica y se ensancha después, no al revés.

## Colores (del logo oficial)

| Uso | Color |
|---|---|
| Principal | Azul `#1B3A6B` |
| Acción principal | Naranja `#F5A03C` |
| Puede pasar | Verde `#2E8B57` |
| Ya recibió | Rojo `#C4453D` |
| Fondo | Blanco |

El botón principal lleva **texto azul sobre naranja**, nunca blanco: blanco
sobre `#F5A03C` no alcanza el contraste mínimo legible.

## Que se lea: contraste y tamaño de letra

- Letra contra su fondo: **4.5 a 1** como mínimo, en modo claro y en oscuro.
  `src/datos/contraste.test.js` lo calcula con los colores de `index.css` y
  falla si algo baja. Por eso el verde de "puede pasar" como letra es
  `#247A4C`, un tono más oscuro que el `#2E8B57` del logo (daba 4.25).
- La letra secundaria es `text-principal/70`. **/40, /50 y /60 no llegan**:
  solo en cosas apagadas a propósito (un horario lleno, un botón
  deshabilitado). La prueba lo revisa.
- Todo se mide en **rem**, nunca en px: el botón "Tamaño de letra" del pie
  agranda la letra de `<html>` y todo crece parejo. El mínimo de 15px es
  `text-chica`, no `text-[15px]`.
- Lo que va lado a lado en el celular tiene que caber a **360 px con la letra
  muy grande**; si no, se acomoda uno debajo del otro
  (`grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]`). Con dos columnas fijas,
  "Próximamente" se cortaba en los Android más comunes.

## Modo oscuro: los colores salen de variables

Los colores del tema son variables de CSS (`src/index.css`) y el modo oscuro
las cambia. Por eso **no se escriben colores a mano**:

| Para | Se usa | No se usa |
|---|---|---|
| Tarjetas, campos, menús | `bg-superficie` | `bg-white` |
| Encabezado, pie, botones azules | `bg-marca` + `text-white` | `bg-principal` sólido |
| Letra sobre naranja | `text-sobre-accion` | `text-principal` |
| Botón rojo de "sí, eliminar" | `bg-peligro` | `bg-ya-recibio` sólido |
| Letra, bordes y matices | `text-principal`, `border-principal/20`, `bg-principal/5` | — |

`bg-white` de verdad solo donde va un QR (lo lee otro teléfono) o el círculo
del logo. `src/datos/tema.test.js` revisa todo esto y falla si se cuela uno.
Para un color que no está en el tema, `dark:` con `[data-tema="oscuro"]`.

## Mientras carga: esqueleto

Con mala señal, un "Cargando…" suelto parece trabado y la gente toca otra vez
o se sale. Mientras llegan los datos se enseña la forma de lo que viene, con
las piezas de `src/componentes/Esqueleto.jsx` (`EsqueletoQR`,
`EsqueletoHorarios`, `EsqueletoLista`…, o `Hueso` para armar una nueva).
Llevan el texto de "cargando" para el lector de pantalla y se quedan quietas
para quien pidió menos movimiento. `Esqueleto.test.js` falla si vuelve a
aparecer un `<p>{t('…cargando')}</p>`.

Tampoco se deja en blanco lo que carga (`return null`) para que luego
aparezca de golpe y empuje lo de abajo, ni se hace entrar la página bloque
por bloque con retrasos: a Rodolfo le pareció "una carga en cascada
horrible". La página aparece junta; lo que espera datos, con su esqueleto.
Antes de que llegue la app, `index.html` ya pinta la forma de la página.

## Marca

Cajita de Bendición es un ministerio de Iglesia Casa de Alabanza. Encabezado y
pie son azules y llevan el logo de la iglesia, cuyo nombre va en letras blancas
y no se lee sobre fondo blanco.

El logo circular completo tiene demasiado detalle para tamaño chico: en
encabezados va solo el techo naranja; el círculo completo va en la portada y en
los correos. Archivos en `public/logos/`, detalle en `docs/logos.md`.

## Antes de crear un componente

Revisa `src/componentes/` — ya existen `Boton`, `Campo`, `CampoTelefono`,
`Selector`, `Tarjeta`, `Pasos`, `CodigoCopiable`, `EnlaceVolver`, `Paginacion`.
Reutiliza antes de escribir uno nuevo.

## Textos

Ningún texto visible se escribe directo en el JSX: va por `t('clave')` de
react-i18next. Ver la regla de i18n.

## Datos de la organización

Teléfono, dirección, redes, enlaces de donación y rutas de logos viven en
`src/datos/organizacion.js`. Un enlace vacío no se muestra. No los repitas en
las pantallas.

## Donaciones

Toda invitación a donar dice **primero** que los alimentos son gratuitos y que
la cita no depende de donar.

## Privacidad en formularios

La casilla "comparto esta información por mi voluntad" es obligatoria, también
desde el panel, y se guarda `acepto_privacidad_en`. El aviso dice con claridad
que la información no se comparte con autoridades.
