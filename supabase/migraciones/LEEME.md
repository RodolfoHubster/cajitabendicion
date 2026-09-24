# Migraciones

Cambios que se aplican a una base **que ya existe**.

## La diferencia con `schema.sql`

`supabase/schema.sql` es la receta completa: construye todo desde cero. Sirve
para recrear el sistema entero o para levantar una base de pruebas aparte.

**No se corre sobre la base de producción**, porque su primera instrucción es
`create table personas` y esa tabla ya existe. Falla con
`relation "personas" already exists` y no aplica nada.

Los archivos de esta carpeta son los pedazos sueltos: solo lo nuevo de cada
cambio, listos para pegar en el SQL Editor de Supabase.

## Cómo usarlos

1. Abrir el archivo del cambio que toca aplicar
2. SQL Editor de Supabase, pestaña nueva
3. Pegar completo y darle **Run**

Se pueden correr dos veces sin romper nada: las funciones usan
`create or replace`, las tablas `create table if not exists` y las columnas
`add column if not exists`.

## Regla al agregar cambios

Cuando algo se agrega al sistema, se hacen **las dos cosas**:

- Se actualiza `schema.sql`, para que la receta completa siga siendo correcta
- Se agrega un archivo aquí, con la fecha por delante, para aplicarlo a la
  base que ya está corriendo

Si solo se hace lo primero, el cambio nunca llega a producción. Si solo se
hace lo segundo, el día que alguien recree la base desde cero le va a faltar.

## Aplicadas

| Archivo | Qué trae |
|---|---|
| `2026-09-09-registro-publico.sql` | `consultar_disponibilidad()`, tabla `configuracion`, columna `citas.dispositivo_id`, `registrar_y_reservar()` y `consultar_cita()` |
| `2026-09-12-dias-de-entrega.sql` | Tabla `dias_entrega` (apertura y código de suscriptores), funciones de Horarios y cupos, y `reservar_cita()` cerrada al navegador |
| `2026-09-12-nombre-y-telefono.sql` | Columnas `personas.nombres` y `personas.apellidos`; `registrar_y_reservar()` y `registrar_desde_panel()` piden apellidos y teléfono internacional (+lada) |
| `2026-09-14-cancelar-sin-cita-excepcion.sql` | Cancelar cita (la persona y el admin), "entró sin cita" con deshacer, y excepción de segunda cita en la semana |
| `2026-09-14-sin-cita-con-nombre.sql` | "Entró sin cita" pide el nombre, da código de comprobante `SC-1234`, lista de quién lo anotó y a qué hora, y se anula en vez de borrar |
| `2026-09-14-personal-con-google.sql` | Tabla `personal_pendiente`: `definir_personal` autoriza un correo antes de que entre con Google, y el rol se aplica solo al crearse su cuenta |
| `2026-09-14-equipo-desde-el-panel.sql` | Equipo y accesos: listar al equipo, dar y quitar accesos, cambiar roles y poner el código de autorización desde el panel |
| `2026-09-15-historial-y-reportes.sql` | Días pasados: "no asistió" automático y canceladas visibles en Citas de hoy; `reporte_por_dias()` para Reportes (cajas por día) |
| `2026-09-15-domicilio-y-privacidad.sql` | Domicilio obligatorio (México o EE. UU.) validado con el catálogo de códigos postales, casilla "sin domicilio fijo" y aviso de privacidad con consentimiento. Cambia los parámetros de `registrar_y_reservar()` y `registrar_desde_panel()`: correrla justo antes de subir el código. Guarda un respaldo de personas y citas y se deshace sola si algún registro anterior no cuadra |
| `2026-09-15-codigos-postales-datos.sql` | Datos del catálogo: códigos postales de California y Baja California (GeoNames, CC BY 4.0). Después de la anterior; se puede repetir |
| `2026-09-21-cambiar-horario.sql` | Cambiar el horario de una cita sin perder el código CB ni el QR: la persona una vez desde su enlace, el panel sin límite, y `movimientos_cita` con el historial de cada cambio |
| `2026-09-21-tope-por-dia.sql` | El tope por teléfono se cuenta por **fecha de entrega** y ya no por semana: con el tope en 1, el mismo celular aparta el lunes y también el jueves, pero no dos veces el mismo día. Solo cambia `registrar_y_reservar()` |
| `2026-09-21-detalle-de-persona.sql` | El botón "Ver" del panel: `detalle_de_persona()` y `citas_de_persona()` con el domicilio exacto, el contacto y las citas anteriores. Solo admin |
| `2026-09-21-pases-permanentes.sql` | Pases permanentes: tablas `pases` y `entregas_pase`, darlos y revocarlos desde el panel, el escaneo los acepta (una caja por día, sin apartar lugar) y sus cajas suman en el resumen y en los reportes |
| `2026-09-23-avisos-editables.sql` | Tabla `avisos`: lo que la gente lee en la portada y las reglas que acepta antes de sacar su QR, editables desde **Textos y reglas** en el panel. Trae las reglas de arranque **Si ya corriste la de preguntas, esta no hace falta** (da el error 42P13 y no cambia nada) |
| `2026-09-23-preguntas-y-quienes-somos.sql` | Dos secciones más de `avisos` con título: **preguntas frecuentes** (`/preguntas`) y **quiénes somos** (`/quienes-somos`), editables desde el panel. Trae el contenido de arranque |
| `2026-09-23-permisos-del-voluntario.sql` | Tabla `permisos` y `exigir_permiso()`: qué puede hacer un voluntario se prende con palomitas desde **Permisos**. Arrancan todas apagadas. Equipo, Horarios y las excepciones siguen siendo solo del admin |
| `2026-09-23-filas-carro-y-a-pie.sql` | Cada horario es de una fila (`carro` o `a_pie`); cada quien del equipo escanea en la suya (`OTRA_FILA` si no); reportes y resumen del día por fila o juntos. La reserva a pie sigue cerrada con `a_pie_abierto = no`. **Aplicar después de una entrega, no antes** |
| `2026-09-24-errores-humanos.sql` | La misma persona el mismo día recibe su cita en vez de una segunda (`ya_existia`, `YA_REGISTRADO_ESE_DIA`); el código corto se acepta como se teclee; la búsqueda del escaneo ignora acentos y sugiere códigos parecidos; `anular_entrega()` deshace una entrega de hoy marcada por error (palomita `anular_entregas`); "entró sin cita" avisa si esa persona ya se anotó hoy (`NOMBRE_YA_ANOTADO_HOY`) |
| `2026-09-24-ver-qr-desde-el-panel.sql` | El administrador ve el QR de una cita en la ficha de la persona (**Ver**), borroso hasta que lo toca: `qr_de_cita()`, solo admin, y la tabla `qr_vistos` con quién lo vio y cuándo |
