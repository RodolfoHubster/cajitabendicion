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

### La misma persona, el mismo día (desde el 24 de septiembre de 2026)

Con mala señal la gente toca "confirmar" dos veces, o regresa y vuelve a
llenar el registro. Eso creaba una segunda persona y una segunda cita (una
segunda caja) o un error que la hacía creer que no tenía lugar.

Ahora `registrar_y_reservar()` reconoce a la misma persona **el mismo día**
(mismo teléfono y mismo nombre, sin fijarse en acentos ni mayúsculas) con
`cita_de_la_misma_persona()`, que va con candado:

- Si fue hace menos de media hora o desde el mismo teléfono: se le devuelve
  **su** cita (`ya_existia = true`).
- Si no: `YA_REGISTRADO_ESE_DIA`, sin revelar su código. Saber el nombre y el
  teléfono de alguien no debe bastar para sacar su QR.
- Otra persona de la familia con el mismo teléfono **sí** saca la suya. Quien
  canceló **sí** puede volver a sacar cita ese día. Lunes y jueves siguen
  siendo dos entregas distintas.

Desde el panel, `registrar_desde_panel()` siempre devuelve la que ya tenía.

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

### Permisos del voluntario

Decisión del Pastor David, 23 de septiembre de 2026. El rol decidía todo y el
voluntario solo escaneaba; abrirle una pantalla era programar. Ahora es una
palomita que el admin prende en **Permisos**: ver las citas del día, anotar sin
cita, registrar, mover, cancelar, ver personas, ver reportes, dar pases, editar
textos. **Arrancan todas apagadas.**

- El candado es `exigir_permiso(clave)` en la base, no el menú. Esconder un
  botón no le impide a nadie escribir la dirección a mano.
- **Tres cosas no se pueden dar nunca, ni con todas las palomitas prendidas**:
  Equipo y accesos (ahí se reparten los roles: un voluntario que entre se hace
  admin solo y la lista deja de valer), Horarios y cupos (mueve el cupo de toda
  la comunidad) y autorizar una segunda caja (la excepción la da el pastor).
  Esas se quedan con `exigir_rol(array['admin'])` a secas.
- Una palomita nueva se agrega en `permisos`, en `CLAVES_PERMISOS` y con sus
  textos en los tres idiomas; una prueba lo vigila.

### Dos filas: carro y a pie

La fila vive en el **horario** (`bloques.fila`), no en la cita: así el candado
de `reservar_cita()` sigue decidiendo el cupo igual en las dos. Cada quien del
equipo escanea en su fila (`personal.fila`); un código de la otra fila
responde `OTRA_FILA` y **no se quema**. En las cuentas, **juntas = carro + a
pie**, siempre: es el número que se reporta al banco. Mientras
`a_pie_abierto` diga `no`, nadie aparta lugar a pie (`A_PIE_CERRADO`).

### Alcance

**Fase 1: fila de carros** (en uso). **Fase 2: fila a pie, empezada**: la base
y el panel ya saben de filas, el público sigue viendo "Próximamente". Plan,
lo hecho y lo que decide el pastor en `docs/fila-a-pie.md`. Fase 3:
check-in/out de voluntarios.

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
npm run test:base   # reglas.sql en un Postgres local (PGlite), sin ninguna base
npm run dev:pruebas # la app contra la BASE DE PRUEBAS (franja amarilla)
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
- Abrirle a un voluntario Equipo y accesos, Horarios y cupos o las excepciones,
  por palomita o por lo que sea. Ver "Permisos del voluntario".
- Probar a mano, o correr los scripts de concurrencia, en la base REAL. Lo
  que se registra o se escanea ahí cuenta en los reportes al banco de
  alimentos. Se usa la base de pruebas: `docs/base-de-pruebas.md`.
- Decir "código no reconocido" cuando lo que pasó es que no hubo señal. El
  código puede estar bien, y así se rechaza a alguien con cita.
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
- `docs/fila-a-pie.md` — la Fase 2: qué quedó hecho y qué falta decidir
- `docs/base-de-pruebas.md` — la base de pruebas: cómo se arma y qué se prueba dónde
- `docs/infraestructura.md` — dominio, DNS, hosting, correo
- `docs/logos.md` — archivos de marca
- `docs/claude-code.md` — cómo está armado este andamiaje

Las convenciones de UI, i18n, SQL, capa de datos y pruebas viven en
`.claude/rules/` y se cargan solas al abrir un archivo de esa área.
