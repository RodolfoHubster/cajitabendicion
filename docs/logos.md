# Logos y favicon

Cajita de Bendición es un ministerio de Iglesia Casa de Alabanza, y la marca
lo refleja: los dos logos comparten el techo naranja.

## Archivos

| Archivo | Qué es | Dónde se usa |
|---|---|---|
| `public/logos/cajita-bendicion.jpg` | Logo circular de Cajita, fondo blanco | Portada y favicon |
| `public/logos/casa-alabanza.webp` | Techo de la iglesia con su nombre en **letras blancas** | Encabezado y pie, ambos azules |

Los originales están en `img/`. Las rutas se cambian en
`src/datos/organizacion.js` si se usan otros nombres.

El logo de la iglesia **solo funciona sobre fondo azul**: sus letras son blancas
y sobre blanco desaparecen, quedando solo el techo. Por eso el encabezado y el
pie son azules.

Si un archivo no carga, la aplicación dibuja el techo naranja en su lugar, así
que nada se ve roto.

**No poner documentos ni archivos privados dentro de `public/`**: todo lo que
hay ahí se publica tal cual en el sitio.

## Favicon (.ico)

Se genera desde el logo circular de Cajita. En PowerShell, desde la carpeta del
proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generar-favicon.ps1
```

Genera:

- `public/favicon.ico` con 16, 32, 48 y 256 px, recortado en círculo con las
  esquinas transparentes.
- `public/apple-touch-icon.png` de 180 px, el ícono que usa el iPhone con
  "Agregar a pantalla de inicio".

Hay que volver a correrlo si cambia el logo. No necesita instalar nada: usa
`System.Drawing`, que ya viene con Windows.

A 16 px el logo circular pierde el detalle; se reconoce por los colores y el
círculo, no por las letras. A 32 px y más se ve bien.
