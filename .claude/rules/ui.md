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
