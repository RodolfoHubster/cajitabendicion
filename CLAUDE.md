# Cajita de Bendición — Sistema de Citas

Sistema de citas para el banco de alimentos de la Iglesia Casa de Alabanza
(San Diego, CA). Organización sin fines de lucro. Reemplaza un Google Form
que hoy no funciona correctamente.

Desarrollado por Rodolfo Huitron Leyva como proyecto PVVC (UABC), periodo
aproximado de 3 meses. Contacto en la iglesia: Pastor David Villalobos.

---

## El problema que este sistema resuelve

El formulario actual de Google **muestra un aviso de "lleno" pero no bloquea
el registro**. La gente se sigue anotando aunque ya no haya lugar. El día del
levantamiento había 477 registros más unas 100 tarjetas repartidas aparte,
sin control real de cuántos son.

Todo lo demás del sistema es secundario frente a esto. Si el corte de cupo no
es confiable, el sistema no sirve.

---

## Reglas de negocio (no negociables)

| Regla | Detalle |
|---|---|
| Unidad de registro | La **persona** (18+), no la familia. Tres personas de una casa = tres registros, tres QR, tres cajas. |
| 1 QR = 1 caja | Nunca se entrega más de una caja por código. El total de escaneos debe cuadrar con las cajas reportadas al banco de alimentos. |
| Una cita por semana | Lunes **o** jueves, no ambos. Con excepción manual autorizada por un administrador (enfermedad, etc.), guardando motivo y quién autorizó. |
| Bloques de 15 min | Horario aproximado 2:45 PM – 6:30 PM. Capacidad configurable por bloque (hoy entre 15 y 28). |
| Corte real de cupo | Al llenarse un bloque, se bloquea de verdad. Este es el bug que se está arreglando. |
| QR de un solo uso | Se invalida al escanearse. Sin datos personales dentro del código. |
| Código corto | Cada persona tiene un ID estable tipo matrícula (CB-4871). Es el respaldo cuando el QR no se deja leer. La búsqueda por nombre no basta: se repiten mucho. |
| Entró sin cita | Botón **solo del panel administrativo**, nunca visible al público. Suma "uno más" al conteo del día. Pide solo el nombre (sin teléfono) y da un código de comprobante `SC-1234` para la persona. Guarda quién lo anotó y a qué hora, visible en Citas de hoy. Un error se anula, no se borra. |

### Alcance por fases

- **Fase 1 (esto es lo que se construye ahora): fila de carros.**
- Fase 2: fila peatonal, con lista de espera y registro en el momento.
- Fase 3: check-in/check-out de voluntarios para horas de servicio comunitario.

### Fuera de alcance de la V1

Cuentas con login de Google para el público (va en V2; el personal ya entra
con Google), mensajes SMS (costo por
mensaje, se evalúa después), modo sin conexión (confirmado que no hace falta:
el personal usa datos móviles).

### Fechas de entrega y apertura

Cada fecha se crea desde **Horarios y cupos** en el panel (tabla
`dias_entrega`), ya no con SQL a mano: todo horario necesita su fecha. La
fecha se ve en el calendario con candado hasta `abre_en`. Antes de esa hora
solo reserva quien trae el código de suscriptor de Facebook de esa fecha, y
solo desde `abre_anticipado_en`. La regla vive en `registrar_y_reservar()`,
no en la pantalla, y `reservar_cita()` ya no se puede llamar desde el
navegador.

Las **donaciones sí entran**, como enlaces opcionales (PayPal, GoFundMe y la
suscripción de Facebook). **Nunca condicionan la cita**: cada invitación a
apoyar dice primero que los alimentos son gratuitos y que la cita no depende
de donar.

---

## Stack

- **Vite + React** (JavaScript, no TypeScript)
- **Tailwind CSS**
- **React Router**
- **react-i18next** (español, inglés y vietnamita)
- **Supabase** (PostgreSQL) — base de datos y autenticación
- **Cloudflare Pages** — hosting, despliegue automático desde `main`
- **Amazon SES** — correo transaccional (pendiente de configurar)

### Por qué PostgreSQL y no Firestore ni MySQL

La regla "una cita activa por semana" necesita un **índice único parcial**
(único solo cuando el estado es activo, ignorando las canceladas). Sin eso,
alguien que cancela queda bloqueado para reagendar esa semana.

MySQL no soporta índices únicos parciales. Firestore no tiene el concepto.
Postgres lo resuelve en una línea. Las reglas viven en la base de datos, no
en el código de la aplicación, porque el sistema va a seguir operando después
de que termine el proyecto.

---

## Base de datos

El esquema completo está en `supabase/schema.sql`, con las tablas, las
restricciones y las dos funciones críticas.

**No reescribir estas dos funciones sin entender por qué están así:**

- `reservar_cita()` — usa `SELECT ... FOR UPDATE` sobre la fila del bloque
  para serializar las reservas. Si cinco personas reservan al mismo tiempo
  sobre un bloque con dos lugares, entran dos y las demás reciben
  `BLOQUE_LLENO`.
- `registrar_entrega()` — mismo bloqueo sobre la fila de la cita. Dos
  voluntarios escaneando el mismo QR simultáneamente: uno recibe `VALIDO`,
  el otro `YA_USADO`.

El patrón ingenuo de "consulto cuántos hay, si hay lugar inserto" **reproduce
exactamente el bug del Google Form**. No usarlo.

### Prueba obligatoria antes de dar por buena la lógica

1. Bloque con capacidad 2, 50 llamadas simultáneas a `reservar_cita()`.
   Deben quedar exactamente 2 citas.
2. Un token válido, 10 llamadas simultáneas a `registrar_entrega()`.
   Debe devolver `VALIDO` una sola vez.

---

## Pruebas

- **`npm test`**: pruebas unitarias con Vitest (`src/**/*.test.js`). Revisan
  las validaciones de nombre, correo y teléfono (México, Estados Unidos, China,
  Japón, Vietnam y el resto de países), fechas y horas, el acceso de
  suscriptores, las traducciones y la capa de datos con Supabase simulado. No
  tocan la base real.
- **`supabase/pruebas/reglas.sql`**: las reglas dentro de la base (registro,
  apertura y código de suscriptores, cupo, una cita por semana, límite por
  dispositivo, panel, escaneo y roles). Se pega completo en el SQL Editor;
  termina con un error a propósito que trae el resultado y deshace todo.
- **`scripts/prueba-concurrencia.mjs` y `scripts/prueba-escaneo.mjs`**: personas
  al mismo tiempo contra la base real (la prueba obligatoria de arriba).

Al cambiar una regla se actualiza todo junto: la función en `schema.sql` y su
migración, la validación en pantalla, y sus pruebas.

---

## Convenciones

- **Idioma de la interfaz**: español, inglés y vietnamita. Detección automática
  desde el navegador, con un selector visible en el encabezado que muestra
  **cada idioma escrito en su propio idioma** ("Español · English · Tiếng Việt")
  para que nadie quede atrapado en uno que no entiende.
- **El vietnamita está marcado como en desarrollo.** Muestra un aviso de que
  puede tener errores, porque la traducción la escribió Claude y todavía no la
  revisa un hablante nativo. Quitar el aviso (`enDesarrollo` en
  `src/i18n/config.js`) solo después de esa revisión. Si falta un texto en
  vietnamita se muestra en inglés, no en español.
- **Textos en código**: nombres de variables, tablas y columnas en español,
  para que coincidan con el vocabulario del cliente.
- **Mobile first.** La mayoría entra desde un celular, y hay muchos adultos
  mayores. Botones de al menos 56px de alto, texto mínimo de 15px.
- **Colores** (tomados del logo oficial):
  - Azul `#1B3A6B` — color principal
  - Naranja `#F5A03C` — solo para el botón de acción principal
  - Verde `#2E8B57` — puede pasar
  - Rojo `#C4453D` — ya recibió
  - Fondo blanco
- **Logo**: el logo completo es circular y con mucho detalle, no se lee a
  tamaño pequeño. En encabezados va solo el techo naranja; el logo completo
  va en la pantalla de inicio y en los correos.
- **Datos de la organización** (teléfono, dirección, redes, enlaces de
  donación y rutas de logos) viven en `src/datos/organizacion.js`. Un enlace
  vacío no se muestra.
- **Marca**: Cajita de Bendición es un ministerio de Iglesia Casa de
  Alabanza. Encabezado y pie son azules y llevan el logo de la iglesia, cuyo
  nombre va en letras blancas y no se lee sobre blanco. La portada lleva el
  logo circular de Cajita. Archivos en `public/logos/`; el favicon se genera
  desde el logo de Cajita con `scripts/generar-favicon.ps1`. Ver
  `docs/logos.md`.
- **Botón principal con texto azul sobre naranja**, no blanco: blanco sobre
  `#F5A03C` no alcanza el contraste mínimo legible.

---

## Rutas

```
/                        Inicio
/calendario              próxima entrega: registrarse o entrar con código de suscriptor
/horarios/:fecha         elegir bloque de 15 minutos
/registro                datos de la persona
/confirmacion/:id        muestra el código QR
/escanear                pantalla del voluntario
/admin/*                 panel administrativo, requiere sesión
```

---

## Seguridad y privacidad

- Parte de la comunidad atendida tiene estatus migratorio delicado. Recopilar
  solo lo necesario, dejar campos opcionales donde se pueda, y decir con
  claridad que la información no se comparte con autoridades.
- La `anon key` de Supabase es pública por diseño, va en el frontend sin
  problema. La **`service_role key` nunca** debe estar en el repo ni llegar al
  navegador: se salta todas las reglas de seguridad. Si hace falta una
  operación privilegiada, va en una Edge Function.
- Row Level Security activo en todas las tablas. Un voluntario no debe poder
  leer el padrón completo de personas, solo lo necesario para escanear.
- **Roles** (tabla `personal`; el pastor los asigna desde **Equipo y accesos**
  en el panel. En el SQL Editor sigue funcionando
  `definir_personal(correo, 'admin' | 'voluntario')` para recuperar el acceso):
  - `admin` (el pastor): ve todo el panel y las estadísticas, registra
    personas desde el panel sin límite por dispositivo, y autoriza entregas
    de otra fecha sin código.
  - `voluntario`: solo escanea. Entrega las citas del día; para una de otra
    fecha necesita el código de autorización de un admin.
  - `usuario`: el público. En la V1 no tiene cuenta; se registra desde el
    formulario, con el límite por dispositivo.
  Una cuenta sin rol no puede hacer nada en el panel. Los permisos se
  revisan dentro de las funciones de la base de datos, no solo en pantalla.
- **Personal con Google**: el pastor y los voluntarios pueden entrar al panel
  con su cuenta de Google. Google solo confirma quién es; el rol lo sigue
  dando `personal`. `definir_personal` funciona aunque la persona todavía no
  haya entrado: el rol queda pendiente y se aplica la primera vez que entra
  **con Google** (nunca a una cuenta de correo y contraseña con ese correo).
  Configuración de Google y Supabase en `docs/infraestructura.md`.

---

## Infraestructura

- Dominio de la iglesia: `casadealabanzasd.com`, en GoDaddy, con sitio hecho
  en GoDaddy Website Builder. **No se toca.**
- El sistema vive en el subdominio `citas.casadealabanzasd.com`, apuntando por
  CNAME a `cajitabendicion.pages.dev`.
- **El correo de la iglesia corre por Microsoft 365** y el registro SPF
  termina en `-all`, que rechaza cualquier remitente no autorizado. **No
  modificar el SPF, el MX ni los TXT del dominio principal.** El correo
  transaccional se manda desde un subdominio propio, para no tocar el correo
  del pastor.
- **El remitente no puede ser `citas@citas.casadealabanzasd.com`.** Por regla
  de DNS, un nombre que tiene un CNAME no admite ningún otro registro, y
  `citas` ya apunta al hosting. Ahí no cabe el TXT del SPF. Hay que mandar
  desde un subdominio hermano, por ejemplo `envios.casadealabanzasd.com`.
  El DKIM sí podría convivir, porque vive bajo `_domainkey`; el SPF no.

  Detalle completo de dominio, hosting, DNS y correo en `docs/infraestructura.md`.

---

## Estado actual

Hecho:
- Repo creado con estructura base (Vite + React + Tailwind + Router + i18next)
- Proyecto en Cloudflare Pages conectado a `main`
- Mockups de todas las pantallas aprobados por el Pastor David
- `public/_redirects` en su lugar, verificado con enlaces directos en producción
- `citas.casadealabanzasd.com` en línea, con certificado. El correo y el sitio
  de la iglesia quedaron intactos: solo se agregó un CNAME, no se editó nada
- Proyecto en Supabase (`us-west-1`) con `supabase/schema.sql` aplicado
- **Las dos pruebas de concurrencia pasan.** 50 llamadas simultáneas sobre un
  bloque de capacidad 2 dejan exactamente 2 citas; 10 escaneos simultáneos del
  mismo QR devuelven un solo `VALIDO`. Ver `scripts/prueba-concurrencia.mjs` y
  `scripts/prueba-escaneo.mjs`

Pendiente inmediato:
- Borrar los datos de prueba (`personas` con `codigo_corto like 'TEST-%'` y sus
  citas) antes de que entren familias reales
- Pasar Supabase al plan Pro **antes del primer día de entrega**. No es por
  capacidad —el plan gratis sobra por años— sino porque no incluye respaldos,
  y esta base guarda el padrón y el historial de entregas
- Políticas de RLS para lectura: hoy las tablas están cerradas y solo se entra
  por las dos funciones. `/calendario` y `/horarios/:fecha` necesitan leer
  bloques y disponibilidad
- Programar las pantallas, que hoy son cascarones

Cambios respecto al esquema original, ya aplicados:
- `registrar_entrega` **recibe un solo argumento**: `registrar_entrega(p_token)`.
  El voluntario sale de `auth.uid()`, no de un parámetro, para que la bitácora
  de auditoría no se pueda falsificar. Requiere sesión iniciada
- Las dos funciones son `security definer` con `search_path` fijo: son la única
  puerta a unas tablas cerradas con RLS
- La base corre en `America/Los_Angeles`. En UTC, todo lo posterior a las 5 PM
  caía en el día siguiente y el escáner habría rechazado citas válidas con
  `OTRA_FECHA` justo en la hora más cargada
