# Base de pruebas

La base de Supabase que usa `citas.casadealabanzasd.com` es la **real**: lo que
se registra, se escanea o se anota "sin cita" ahí cuenta en los reportes al
banco de alimentos. Para probar a mano hace falta **otra** base, de pruebas.

## Qué se puede probar dónde

| Qué | Dónde | Comando |
|---|---|---|
| Las reglas de la base (388 pruebas) | Tu computadora, sin ninguna base | `npm run test:base` |
| Las migraciones nuevas, antes de aplicarlas | Tu computadora | `npm run test:base -- --migraciones` |
| Las funciones de `src/datos/` | Tu computadora | `npm test` |
| Clics en la app: registrar, escanear, panel | **Base de pruebas** | `npm run dev:pruebas` |
| Concurrencia (50 reservas, 10 escaneos a la vez) | **Base de pruebas** | `node scripts/prueba-... --pruebas` |

`supabase/pruebas/reglas.sql` sí se puede correr en la base real: al final
lanza un error a propósito que deshace todo. Lo que no se hace en la real son
las pruebas a mano ni los scripts de concurrencia.

## Armarla (una sola vez)

1. **Crear el proyecto.** En supabase.com, *New project*, con nombre
   `cajita-pruebas`, región **West US (North California)** (`us-west-1`), la
   misma que la real. El plan gratis permite dos proyectos. Si pasa una semana
   sin usarse, Supabase lo pausa; se reactiva desde el panel con *Restore*.
2. **La receta.** En ese proyecto, *SQL Editor*: pega y corre
   `supabase/schema.sql` completo.
3. **Los códigos postales.** Pega y corre
   `supabase/migraciones/2026-09-15-codigos-postales-datos.sql`. Sin esto el
   registro público no puede revisar domicilios.
4. **Tu usuario.** *Authentication > Users > Add user*, con correo y contraseña
   y la casilla *Auto Confirm User*. Luego, en el SQL Editor:
   ```sql
   select definir_personal('tu@correo.com', 'admin');
   ```
5. **Los datos de prueba.** Pega y corre `supabase/pruebas/datos-de-prueba.sql`.
   Crea fechas de hoy en adelante, personas inventadas (CB-9001 a CB-9007) y al
   final muestra una tabla con sus códigos y tokens. Se puede volver a correr
   cuando quieras: rehace lo de prueba. **En la base real se niega sola.**
6. **El archivo `.env.pruebas`.** Copia `.env.pruebas.example` a
   `.env.pruebas` y llénalo con la URL y la *anon key* del proyecto de
   **pruebas** (*Project Settings > API*), y con el correo y la contraseña del
   paso 4. Ese archivo no se sube al repo.

## Usarla

- **La app contra la base de pruebas:** `npm run dev:pruebas` y abre
  <http://localhost:5175>. Arriba sale una franja amarilla y negra que dice
  **"Base de pruebas"**, y la pestaña dice **[PRUEBAS]**. Si no ves la franja,
  estás en la real.
- **Escanear a mano:** entra al panel, *Escanear*, y enséñale a la cámara el
  QR de `/confirmacion/<token>` de una de las personas de prueba, abierto en
  otro teléfono o en otra ventana.
- **Diez escaneos a la vez:**
  `node scripts/prueba-escaneo.mjs --pruebas <token de CB-9001 a CB-9005>`
- **Cincuenta reservas a la vez:**
  `node scripts/prueba-concurrencia.mjs --pruebas <id del horario "CONCURRENCIA">`

- **Ver los esqueletos de carga:** la base de pruebas contesta tan rápido que
  casi no se ven. En `.env.pruebas` agrega `VITE_RETRASO_MS=1000` y cada
  llamada a la base espera un segundo. La franja amarilla dice "modo lento".
  Solo funciona con la base de pruebas; para apagarlo, borra la línea.

Antes de cada tanda de pruebas a mano, vuelve a correr
`datos-de-prueba.sql`: deja los códigos sin usar otra vez.

## Los candados

- `npm run dev:pruebas` **no arranca** si falta `.env.pruebas`, si le falta la
  URL o la clave, si trae la URL de la real o si no dice `VITE_ENTORNO=pruebas`.
  Sin este candado, Vite se regresaba callado a `.env` y abría la real.
- Los scripts de concurrencia **no corren** si no les dices `--pruebas` o
  `--base-real`. Sin nada, explican y se salen.
- Si `.env.pruebas` apunta por error a la misma base que `.env`, se niegan.
- `datos-de-prueba.sql` se niega en una base que ya tiene gente y no está
  marcada como de pruebas.
- La franja amarilla solo sale con `VITE_ENTORNO=pruebas`, que va en
  `.env.pruebas` y nunca en la configuración de Cloudflare.
