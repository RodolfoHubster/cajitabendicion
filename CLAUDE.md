# Cajita de Bendición — Sistema de Citas

Sistema de citas del banco de alimentos de la Iglesia Casa de Alabanza
(San Diego, CA). Sin fines de lucro. Reemplaza un Google Form que **avisa
"lleno" pero no bloquea el registro**: 477 registros más ~100 tarjetas
sueltas, sin control de cuántos son.

Si el corte de cupo no es confiable, el sistema no sirve. Todo lo demás es
secundario.

Proyecto PVVC (UABC) de Rodolfo Huitron Leyva, ~3 meses. Contacto en la
iglesia: Pastor David Villalobos.

---

## Reglas no negociables

| Regla | Detalle |
|---|---|
| Unidad de registro | La **persona** (18+), no la familia. Tres personas de una casa = tres registros, tres QR, tres cajas. |
| 1 QR = 1 caja | Una cita se entrega una sola vez. Los escaneos deben cuadrar con las cajas reportadas al banco de alimentos. Única excepción: el pase permanente, abajo. |
| Bloques de 15 min | ~2:45 PM – 6:30 PM. Capacidad por bloque configurable (hoy 15–28). |
| Corte real de cupo | Al llenarse un bloque se bloquea de verdad. Este es el bug que se está arreglando. |
| QR de un solo uso | La cita se invalida al escanearse. Sin datos personales dentro del código. |
| Código corto | ID estable tipo matrícula (`CB-4871`), respaldo cuando el QR no se deja leer. Buscar por nombre no basta: se repiten. |
| Entró sin cita | Solo panel, nunca público. Pide nombre, da comprobante `SC-1234`, guarda quién y a qué hora. Un error se **anula**, no se borra. |
| Donaciones | Enlaces opcionales (PayPal, GoFundMe, suscripción de Facebook). **Nunca condicionan la cita**: cada invitación dice primero que los alimentos son gratuitos. |

### Lunes y jueves: se puede ir a los dos

El esquema tiene un índice `una_cita_activa_por_semana` sobre
`citas (persona_id, semana)`, pero **en la práctica no frena nada**: el
registro público no reconoce a la persona, así que cada registro es una
persona nueva. Está decidido que la gente pueda ir los dos días.

El único tope real es el del teléfono, y desde el 21 de septiembre de 2026
cuenta **por fecha de entrega, no por semana**: con el tope en 1, el mismo
celular aparta el lunes y también el jueves, pero no dos veces el mismo día.
Es un tope, no un muro: una ventana privada cuenta como dispositivo nuevo.

No "arregles" esto poniendo de vuelta la regla semanal. Volver a una cita por
semana se decide reconociendo a la persona, no apretando el teléfono.

### Pase permanente — la excepción a "1 QR = 1 caja"

Decisión del Pastor David, 21 de septiembre de 2026. Reemplaza las tarjetas de
papel: el pastor le da a ciertas personas un pase que no vence.

- **Su código no se quema.** Sirve los dos días de entrega, indefinidamente.
- **Una caja por pase por fecha.** Lo garantiza el índice
  `unique (pase_id, fecha)` de `entregas_pase`, no un "consulto y luego
  inserto". Una copia del código no consigue otra caja.
- **No aparta lugar del cupo.** Quien lo trae llega y pasa; su caja se cuenta
  aparte, igual que "entró sin cita", para que el total al banco cuadre.
- Solo un admin da y quita pases. Revocar **no borra**: queda quién lo quitó,
  cuándo y por qué. Deja de servir al momento.

### Alcance

**Fase 1 (lo que se construye ahora): fila de carros.** Fase 2: fila peatonal
con lista de espera. Fase 3: check-in/out de voluntarios.

**Fuera de la V1**: login de Google para el público (V2; el personal ya entra
con Google), modo sin conexión (el personal usa datos móviles).

**En evaluación, ya no descartado**: avisos por SMS (se están cotizando) y un
canal de WhatsApp. Ligado a eso, se está viendo si "entró sin cita" debería
pedir también el teléfono para poder mandar el mensaje. Ninguna de las tres
está decidida: no las programes como si lo estuvieran.

---

## Las dos funciones que sostienen todo

En `supabase/schema.sql`. **No reescribirlas sin entender por qué están así:**

- `reservar_cita()` — `SELECT ... FOR UPDATE` sobre la fila del bloque para
  serializar las reservas. Cinco reservas simultáneas sobre dos lugares: entran
  dos, las demás reciben `BLOQUE_LLENO`.
- `registrar_entrega(p_token)` — mismo bloqueo sobre la fila de la cita. Dos
  voluntarios escaneando el mismo QR: uno `VALIDO`, el otro `YA_USADO`. El
  voluntario sale de `auth.uid()`, nunca de un parámetro, para que la bitácora
  no se pueda falsificar. También reconoce los pases permanentes, donde lo que
  se quema es la fecha y no el código.

El patrón "consulto cuántos hay, si hay lugar inserto" **reproduce exactamente
el bug del Google Form**. No usarlo.

Ambas son `security definer` con `search_path` fijo: son la única puerta a unas
tablas cerradas con RLS (15 tablas con RLS activo, **cero policies**).

---

## Stack y comandos

Vite + React 19 (JavaScript, no TypeScript) · Tailwind · React Router ·
react-i18next (es/en/vi) · Supabase (PostgreSQL, `us-west-1`,
`America/Los_Angeles`) · Cloudflare Pages desde `main` · Amazon SES (pendiente).

```bash
npm run dev     # Vite
npm test        # Vitest, sin tocar la base real
npm run lint    # oxlint
npm run build   # producción
```

**Postgres y no Firestore ni MySQL**: "una cita activa por semana" necesita un
índice único parcial (único solo cuando el estado es activo, ignorando las
canceladas). Sin eso, quien cancela queda bloqueado para reagendar esa semana.
MySQL no los soporta; Firestore no tiene el concepto. Las reglas viven en la
base porque el sistema sigue operando después de que termine el proyecto.

---

## Mapa del repositorio

```
src/paginas/publico/   Inicio, Calendario, Horarios, Registro, Confirmacion, CambiarHorario, Pase
src/paginas/admin/     CitasDeHoy, Personas, Horarios, Pases, Reportes, Equipo, RegistrarPersona, Login
src/paginas/escaneo/   Escanear
src/componentes/       UI compartida (Boton, Campo, LectorQR, ListaCitas, ...)
src/datos/             capa de datos: una función por RPC de Supabase, con su .test.js al lado
src/i18n/              config.js + es.json / en.json / vi.json
src/rutas/             AppRouter, RutasPublicas, RutasAdmin, RutaProtegida, SoloRol
supabase/schema.sql    receta completa (3900+ líneas) — ver docs/mapa-base-de-datos.md
supabase/migraciones/  cambios sobre la base que ya existe — ver su LEEME.md
supabase/pruebas/      reglas.sql, se pega completo en el SQL Editor
scripts/               prueba-concurrencia.mjs, prueba-escaneo.mjs (contra la base real)
```

Rutas públicas: `/` · `/calendario` · `/horarios/:fecha` · `/registro` ·
`/confirmacion/:id` · `/cambiar/:id` · `/pase/:id`.
Personal: `/escanear` · `/admin/*` (citas-hoy, registrar, horarios, pases,
personas, reportes, equipo). Requieren sesión.

---

## Lo que nunca se hace

- Subir la `service_role key` al repo o al navegador: se salta todas las reglas
  de seguridad. La `anon key` sí es pública por diseño. Operación privilegiada
  → Edge Function.
- Tocar el SPF, el MX o los TXT de `casadealabanzasd.com`: el correo de la
  iglesia corre por Microsoft 365 con `-all`. Ver `docs/infraestructura.md`.
- Commitear o hacer push sin que Rodolfo lo pida. El repo es suyo y él decide
  qué entra; `.claude/settings.json` deja ambos en `ask`, así que cada uno se
  aprueba a mano.
- Validar una regla de negocio solo en pantalla: se revisa dentro de la función
  de la base.
- Recopilar datos de más. Parte de la comunidad tiene estatus migratorio
  delicado; el aviso de privacidad dice que la información no se comparte con
  autoridades.

---

## Al cambiar una regla, se actualizan los cuatro lugares

1. La función en `supabase/schema.sql`
2. Una migración nueva en `supabase/migraciones/` (fecha por delante) y su fila
   en el `LEEME.md`
3. La validación en pantalla y en `src/datos/`
4. Las pruebas: `src/**/*.test.js` y, si toca reglas de base,
   `supabase/pruebas/reglas.sql`

Atajo: `/regla`.

---

## Nada se da por terminado sin sus pruebas

Esto **no depende** de si el cambio es "una regla" o "nada más una pantalla".
Cada cambio lleva sus pruebas en la misma tanda:

| Lo que se tocó | Dónde va su prueba |
|---|---|
| Una función de Postgres | `supabase/pruebas/reglas.sql`, incluidas las de permisos (`SIN_PERMISO`, `SIN_SESION`) |
| Algo de `src/datos/` | su `.test.js` al lado |
| Textos o traducciones | `src/i18n/i18n.test.js` |
| Una pantalla | se comprueba en el navegador y se dice qué se vio |

Y al terminar **se reporta**: cuántas pruebas corren, cuáles se agregaron y qué
se comprobó en el navegador. Un cambio sin eso está a medias, aunque funcione.

**Una prueba que no falla cuando se rompe lo que vigila no sirve.** Si el
arreglo nace de un error real, primero se comprueba que la prueba nueva falla
con el error puesto, y luego que pasa con el arreglo.

Por qué está escrito esto: las pruebas de traducción comparaban los tres
idiomas entre sí, así que una clave rota **en los tres** pasaba limpia. Se
coló una y tumbó el título de una pantalla del panel. Hoy hay una prueba que
revisa el código contra los textos.

---

## Más contexto, solo cuando haga falta

Estos archivos **no** se cargan solos. Ábrelos cuando el trabajo los toque:

- `docs/mapa-base-de-datos.md` — qué hace cada función y en qué línea está,
  para no leer `schema.sql` entero
- `docs/estado.md` — qué está hecho y qué falta
- `docs/infraestructura.md` — dominio, DNS, hosting, correo
- `docs/logos.md` — archivos de marca
- `docs/claude-code.md` — cómo está armado este andamiaje

Las convenciones de UI, i18n, SQL, capa de datos y pruebas viven en
`.claude/rules/` y se cargan solas al abrir un archivo de esa área.
