# Estado del proyecto

Última revisión: **22 de septiembre de 2026**.

Esto no se carga solo en cada sesión de Claude Code: se abre cuando hace
falta. Ponlo al día con `/estado` cuando cierres un pendiente, y no lo dejes
mentir — un "pendiente" que ya está hecho provoca que se reprograme, y un
"hecho" que no está hace que se dé por resuelto algo que la gente va a
encontrar rota el día de la entrega.

---

## Hecho

**Infraestructura**

- Repo con Vite + React 19 + Tailwind + Router + i18next
- Cloudflare Pages conectado a `main`, `public/_redirects` verificado con
  enlaces directos en producción
- `citas.casadealabanzasd.com` en línea, con certificado. El correo y el sitio
  de la iglesia quedaron intactos: solo se agregó un CNAME
- Proyecto Supabase (`us-west-1`, `America/Los_Angeles`) con
  `supabase/schema.sql` aplicado

**Base de datos**

- 15 tablas con RLS activo y cero policies: todo pasa por funciones
  `security definer` con `search_path` fijo
- 19 migraciones aplicadas, de `2026-09-09` a `2026-09-21`. La lista con qué
  trae cada una está en `supabase/migraciones/LEEME.md`
- **Las dos pruebas de concurrencia pasan.** 50 llamadas simultáneas sobre un
  bloque de capacidad 2 dejan exactamente 2 citas; 10 escaneos simultáneos del
  mismo QR devuelven un solo `VALIDO`

**Aplicación**

- Mockups de todas las pantallas aprobados por el Pastor David
- Pantallas públicas programadas: Inicio, Calendario, Horarios, Registro,
  Confirmación, Cambiar horario
- Panel: Citas de hoy, Personas, Horarios y cupos, Reportes, Equipo y accesos,
  Registrar persona, Login
- Escaneo con lector de QR y búsqueda por código corto, que también acepta
  pases permanentes
- **Pases permanentes** (21 sep 2026): pantalla pública `/pase/:id`, panel
  `/admin/pases` para darlos, renovarlos y revocarlos, y sus cajas contadas
  aparte en el resumen del día y en los reportes
- Capa de datos en `src/datos/` con pruebas de Vitest al lado de cada archivo
- Tres idiomas completos (es / en / vi), con el vietnamita marcado como en
  desarrollo

---

## Pendiente inmediato

- [ ] **Pasar Supabase al plan Pro antes del primer día de entrega.** No es
      por capacidad —el plan gratis sobra por años— sino porque no incluye
      respaldos, y esta base guarda el padrón y el historial de entregas
- [ ] **Amazon SES**: configurar el correo transaccional desde un subdominio
      hermano (`envios.casadealabanzasd.com`), nunca desde `citas.`
- [ ] **Avisos por SMS**: en cotización. Ligado a eso, decidir si "entró sin
      cita" debe pedir también el teléfono
- [ ] **Canal de WhatsApp**: en evaluación
- [ ] Revisión del vietnamita por un hablante nativo, para poder quitar
      `enDesarrollo` de `src/i18n/config.js`

Todos se confirman fuera del repositorio. Claude no puede darlos por hechos:
los cierra Rodolfo.

### Cuidado con los datos de prueba

Queda pendiente borrar las `personas` con `codigo_corto like 'TEST-%'` y sus
citas. Antes de correr ese `delete`, revisa qué va a borrar: si para entonces
la base ya tiene registros de gente real, un `like` a ciegas es justo la
manera de llevarse algo por delante. Y sin respaldo —que es lo que el plan
gratis no da—, no hay vuelta atrás. Primero el plan Pro, después la limpieza.

---

## Decisiones ya aplicadas

- `registrar_entrega` **recibe un solo argumento**: `registrar_entrega(p_token)`.
  El voluntario sale de `auth.uid()`, no de un parámetro, para que la bitácora
  de auditoría no se pueda falsificar. Requiere sesión iniciada
- Las funciones son `security definer` con `search_path` fijo: son la única
  puerta a unas tablas cerradas con RLS
- La base corre en `America/Los_Angeles`. En UTC, todo lo posterior a las 5 PM
  caía en el día siguiente y el escáner habría rechazado citas válidas con
  `OTRA_FECHA` justo en la hora más cargada
- `reservar_cita()` ya no se puede llamar desde el navegador: el público entra
  por `registrar_y_reservar()`, que revisa apertura, código de suscriptor, tope
  por dispositivo, domicilio y consentimiento
- Las fechas de entrega se crean desde **Horarios y cupos**, no con SQL a mano
- El tope por teléfono se cuenta por fecha de entrega, no por semana
  (`2026-09-21-tope-por-dia.sql`). La gente puede ir lunes **y** jueves; el
  índice `una_cita_activa_por_semana` sigue en el esquema pero no frena nada,
  porque el registro público no reconoce a la persona
- El pase permanente no quema su código y no aparta lugar del cupo: una caja
  por pase por fecha, contada aparte para que el total al banco cuadre
  (`2026-09-21-pases-permanentes.sql`)
- Domicilio obligatorio (Pastor David, 15 sep 2026), validado contra el
  catálogo de códigos postales de California y Baja California. Quien se
  registró antes conserva su zona en `ciudad`, su `pais` vacío, y su cita y su
  QR siguen funcionando
