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
| Entró sin cita | Botón **solo del panel administrativo**, nunca visible al público. Suma "uno más" al conteo del día. No captura nombre ni teléfono. Guarda quién lo autorizó y a qué hora. |

### Alcance por fases

- **Fase 1 (esto es lo que se construye ahora): fila de carros.**
- Fase 2: fila peatonal, con lista de espera y registro en el momento.
- Fase 3: check-in/check-out de voluntarios para horas de servicio comunitario.

### Fuera de alcance de la V1

Cuentas de usuario con login de Google (va en V2), mensajes SMS (costo por
mensaje, se evalúa después), código de acceso anticipado para suscriptores de
Facebook, modo sin conexión (confirmado que no hace falta: el personal usa
datos móviles), donaciones.

---

## Stack

- **Vite + React** (JavaScript, no TypeScript)
- **Tailwind CSS**
- **React Router**
- **react-i18next** (español e inglés)
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

## Convenciones

- **Idioma de la interfaz**: español e inglés. Detección automática desde el
  navegador, con botón visible en el encabezado mostrando **las dos palabras**
  ("Español | English") para que nadie quede atrapado en el idioma equivocado.
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

---

## Rutas

```
/                        Inicio
/calendario              elegir fecha (solo lunes y jueves)
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
- Roles: administrador, coordinador, voluntario, consulta.

---

## Infraestructura

- Dominio de la iglesia: `casadealabanzasd.com`, en GoDaddy, con sitio hecho
  en GoDaddy Website Builder. **No se toca.**
- El sistema vive en el subdominio `citas.casadealabanzasd.com`, apuntando por
  CNAME a `cajitabendicion.pages.dev`.
- **El correo de la iglesia corre por Microsoft 365** y el registro SPF
  termina en `-all`, que rechaza cualquier remitente no autorizado. **No
  modificar el SPF, el MX ni los TXT del dominio principal.** El correo
  transaccional se manda desde el subdominio (`citas@citas.casadealabanzasd.com`)
  con su propio SPF y DKIM, para no tocar el correo del pastor.

---

## Estado actual

Hecho:
- Repo creado con estructura base (Vite + React + Tailwind + Router + i18next)
- Proyecto en Cloudflare Pages conectado a `main`
- Mockups de todas las pantallas aprobados por el Pastor David

Pendiente inmediato:
- `public/_redirects` con `/*  /index.html  200` (sin esto React Router da 404
  al recargar o al abrir un enlace directo)
- Crear proyecto en Supabase y correr `supabase/schema.sql`
- Pruebas de concurrencia de las dos funciones
- CNAME en GoDaddy y dominio personalizado en Cloudflare
