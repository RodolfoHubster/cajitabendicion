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
| `2026-09-24-telefono-sin-cita.sql` | "Entró sin cita" pide también el teléfono (opcional) y lo enseña en la lista del día; avisa si ese teléfono ya se anotó hoy (`TELEFONO_YA_ANOTADO_HOY`). El envío del comprobante por WhatsApp o mensaje queda para después |
| `2026-09-25-entregas-a-mano.sql` | El admin marca como entregada una cita que no quedó registrada (hoy o días pasados), con quién, cuándo y por qué (`entregas_marcadas`); quien escaneó deshace su propia entrega durante el primer minuto sin la palomita (`FUERA_DE_PLAZO` después). **Aplicarla antes de subir la pantalla nueva del escáner** |
| `2026-09-25-incidencias.sql` | Incidencias del día desde Horarios (solo admin): avisar un retraso, mover la entrega completa a otra fecha (cada cita con su mismo QR y hora) o cancelarla. Tabla `incidencias` con quién, cuándo y a cuántas; avisos públicos y en la página de cada cita; lista de a quién avisar por WhatsApp |
| `2026-09-27-guia-del-panel.sql` | Quién del equipo ya vio la guía paso a paso del panel (`guias_vistas`), por cuenta y con versión para enseñar solo las novedades. Sin ella la guía se recuerda solo en cada teléfono |
| `2026-09-28-fila-a-pie-turnos.sql` | La fila a pie por turnos: cada día una fila con turnos numerados, cupo del día (o sin límite) y hora de apertura del registro, armada desde Horarios; la persona ve su turno en vivo y la voluntaria la fila en vivo ("no se presentó" pasa al siguiente); cada quien elige en el escáner en qué fila está hoy. Quita el interruptor `a_pie_abierto`. **Correrla antes de subir las pantallas nuevas** |
| `2026-09-28-reglas-a-pie.sql` | Las reglas que se leen antes de sacar turno a pie, aparte de las de carros (sección `registro_a_pie` de avisos), editables en **Textos y reglas**. No toca las de carros |
| `2026-09-28-acompanantes.sql` | **Un lugar es un carro.** Quien viene en el carro de alguien que ya tiene cita se registra como acompañante con el código CB de quien maneja: su QR y su caja, sin ocupar otro lugar (tope `acompanantes_por_carro` = 3). Cambia `reservar_cita()` con el mismo candado. **Correrla fuera del horario de entrega**, primero en pruebas |
| `2026-09-28-pases-vip.sql` | **Pases VIP:** el administrador marca como VIP el pase permanente de un suscriptor (`marcar_pase_vip`); su QR sale dorado y el escáner dice que pasa directo, sin fila. No toca citas ni cupos |
| `2026-09-28-acompanantes-desde-el-panel.sql` | "Registrar persona" en el panel también registra acompañantes: con el código CB de quien maneja, la persona queda en su horario y no ocupa otro lugar (mismo tope por carro). Solo cambia `registrar_desde_panel()`; la página publicada sigue funcionando. **Correrla antes de subir la pantalla nueva** |
| `2026-09-30-buscar-personas.sql` | **Personas** en el panel: buscar por nombre, teléfono o código CB en todos los registros, con los de la misma persona (mismo nombre y teléfono) juntos (`buscar_personas`). Y la lista de días de entrega para Citas de hoy y Reportes, en vez del calendario (`fechas_de_entrega`). Solo lectura; se puede correr aunque esté la entrega. **Correrla antes de subir las pantallas nuevas** |
| `2026-09-30-personas-mas-rapido.sql` | La búsqueda de **Personas** más rápida: índice de citas por persona y las cuentas de una vez. Devuelve lo mismo; no cambia datos. Se puede correr aunque esté la entrega |
| `2026-09-30-acompanantes-en-la-lista.sql` | **Citas de hoy** dice quién viene de acompañante (en el carro de quién) y cuántos acompañantes trae cada carro: tres columnas más en `citas_del_dia()`. Solo lectura; se puede correr aunque esté la entrega. **Correrla antes de subir la pantalla nueva** |
| `2026-10-06-turno-a-pie-sin-datos.sql` | **Turno a pie sin datos**: con el QR general (`/turno`) la persona saca su turno sin dar nada (`sacar_turno_a_pie`), uno por teléfono por día, con **código del día** opcional (`codigo_turno_a_pie`, freno de 5 intentos); la voluntaria da turno a quien no tiene teléfono, con una seña opcional (`dar_turno_sin_telefono`). "No se presentó" **pierde** el turno (`TURNO_PERDIDO`, deshacer solo en 2 minutos). Cambio de carro a pie (si es el dueño, también sus acompañantes) contado en Reportes. **Lista del día en el escáner de carros** (`lista_para_escaneo`). **Terminar la fila** (`terminar_fila_a_pie`): quien espera ve que terminó; cerrar los turnos ya no se lo dice. Buscar en el escáner ya no enseña los códigos de los turnos sin datos. Cambia `registrar_entrega()`: **correrla fuera del horario de entrega y antes de subir las pantallas nuevas** |
| `2026-10-09-fila-a-pie-mas-agil.sql` | **La fila a pie, más ágil**: "no se presentó" ya **no** pierde el turno (si llega después, su QR entrega; si vuelve a escanear, le sale el suyo); **entregar sin QR** por número de turno (`entregar_turno`); la búsqueda del escáner dice la fila y el turno. Cambia `registrar_entrega()`, `saltar_turno()`, `sacar_turno_a_pie()` y `buscar_para_escaneo()`. Requiere la del 6 de octubre. **Correrla fuera del horario de entrega y antes de subir las pantallas nuevas** |
| `2026-10-10-codigos-de-5-numeros.sql` | **Códigos de 5 números**: los nuevos son CB-10000 a CB-99999 (con 4 solo cabían 10,000 y ya iban 2,671). Los de 4 siguen valiendo igual. Cambia `normalizar_codigo_corto()`, `registrar_y_reservar()`, `registrar_desde_panel()`, `crear_turno_anonimo()` y `buscar_para_escaneo()`. No toca el candado del cupo. Se puede repetir |
| `2026-10-16-turnos-anulados.sql` | **Turnos anulados**: la voluntaria anula el turno de quien llegó tarde (`anular_turno`); su QR ya no entrega, su página se lo dice y saca uno nuevo al final de la fila, una sola vez (`TURNOS_ANULADOS`), y cuenta en Reportes (`turnos_anulados`). El escáner busca en vivo por turno o código (`turnos_a_pie_de_hoy`) y muestra el QR de un turno (`qr_de_turno`); `consultar_cita` dice a qué hora lo llamaron. Cambio de carro a pie **con su código CB** (`sacar_turno_a_pie`, `p_codigo_carro`). Agrega dos columnas a `citas`. Correrla antes de subir las pantallas |
| `2026-10-19-codigo-del-dia-por-hora.sql` | **El código del día hasta cierta hora**: en Horarios se escoge si se pide todo el día o hasta una hora (`codigo_turno_a_pie_hasta`); pasada esa hora cualquiera saca turno con el QR del cartel. Lo respetan `sacar_turno_a_pie()`, `fila_a_pie_hoy()` y `fila_de_turnos()` (`codigo_del_dia_vigente`). Agrega una columna a `dias_entrega`; los días que ya piden el código lo siguen pidiendo todo el día. Correrla antes de subir las pantallas |
| `2026-10-20-voluntarios.sql` | **Voluntarios: entrada y salida.** Cada voluntario tiene una credencial con QR permanente (nombre y contacto opcional, sin cuenta); el administrador la escanea al llegar y al irse (`marcar_asistencia`), corrige o agrega con motivo, y ve las horas por fechas (`horas_de_voluntarios`). Tablas nuevas `voluntarios` y `asistencias_voluntarios`. No toca citas ni cupos: se puede correr aunque esté la entrega. Correrla antes de subir las pantallas |
| `2026-10-23-voluntarios-envio-y-atiende.sql` | **Voluntarios, segunda parte:** teléfono y correo por separado (los que ya estaban se separan solos), constancia de a quién se le mandó su credencial y por dónde (`marcar_credencial_enviada`), **"atiende voluntarios"** por persona en Equipo y accesos (escanea y registra sin ser administrador), cerrar el día (`cerrar_dia_voluntarios`) y sus horas en su credencial (`historial_de_credencial`). Requiere la del 20 de octubre. No toca citas ni cupos. Correrla antes de subir las pantallas |
| `2026-10-24-credencial-por-sms.sql` | La credencial del voluntario también se manda **por SMS** (quien no tiene WhatsApp) y se anota igual (`marcar_credencial_enviada`, medio `sms`). Requiere la del 23 de octubre. No toca citas ni cupos. Correrla antes de subir la pantalla |
| `2026-10-24-pases-preferentes.sql` | **Pases preferentes** (tercera edad, movilidad reducida): pase permanente con solo nombre, teléfono opcional y una nota para reconocer a la persona (`crear_pase_preferente`, `marcar_pase_preferente`); el escáner la enseña antes de entregar (la nota solo la ve el equipo, `pase_por_token`); Reportes los cuenta aparte (`con_pase_preferente`). No toca citas, cupos ni `registrar_entrega()`. Correrla antes de subir las pantallas |
| `2026-10-26-reglas-a-pie-de-la-fila.sql` | **Las reglas de la fila a pie, al día.** La página de turnos a pie ahora lee las que se editan en Textos y reglas (antes las traía fijas). Las guardadas se cambian por las de la fila de hoy **solo si nadie las había editado**. Solo textos. Correrla antes de subir la pantalla |
| `2026-10-26-fila-en-vivo.sql` | **La fila a pie en vivo, para cualquiera** (`fila_a_pie_en_vivo`): qué turno va, cuántos esperan, cuántos ya recibieron y el último que pasó, sin tener turno (página `/fila`). Solo números. Solo lectura. Correrla antes de subir la pantalla |
| `2026-10-27-voluntarios-solo-entrada.sql` | **Voluntarios: solo la entrada.** De arranque se escanea solo al llegar y la salida se pone sola a la hora de salida de siempre (6:30 PM, se cambia en Voluntarios; el modo de antes se puede volver a escoger). **Pasar lista** (la entrada de hoy de varios a la vez), **anotar un día pasado a varios** (solo admin), **se fue temprano**, **una nota** por voluntario y cuántos días vino. Cambia `registrar_voluntario`, `editar_voluntario` y `marcar_asistencia`. Requiere las del 20, 23 y 24 de octubre. No toca citas ni cupos. Correrla antes de subir las pantallas |
| `2026-10-27-turno-repetido-y-entrega-de-pase.sql` | **Turno repetido:** desde el detalle de un turno en el escáner se cancela el que sobra cuando la misma persona sacó dos (se puede regresar si fue el equivocado); su página le dice que ya tenía otro y ese teléfono ya no saca más ese día. **Entrega de un pase a mano:** el administrador marca la caja de un pase que no se escaneó, escogiendo el día de entrega. Cambia `sacar_turno_a_pie()`, `turno_de_cita()` y `turnos_a_pie_de_hoy()`; no toca `registrar_entrega()` ni los cupos. Mejor fuera del horario de la fila a pie. Correrla antes de subir las pantallas |
| `2026-10-28-correos-y-boletin.sql` | **Correos automáticos y boletín.** Cada cita nueva con correo deja anotada su **confirmación** (con su QR dentro); **cancelar o mover la entrega** de un día anota el aviso de cada cita que toca. La función `enviar-correos` los manda por Amazon SES (pasos en `docs/correos.md`); mientras no esté lista, se quedan pendientes sin estorbar y los de fechas que ya pasaron no salen. **Boletín** solo con la casilla del registro (va sin marcar). `personas.idioma` acepta vietnamita. Cambia `registrar_y_reservar()` (recibe `p_idioma` y `p_boletin`), `cancelar_entrega()` y `mover_entrega()`; no toca `reservar_cita()` ni `registrar_entrega()`. Correrla antes de subir la página de registro |
