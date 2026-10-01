# Fila a pie (Fase 2)

Estado al 28 de septiembre de 2026: **lista y publicada, pero sin abrir.**
La base y las pantallas ya tienen la fila a pie por turnos, pero ninguna
fecha tiene fila a pie creada. Quien toca "A pie" en el inicio ve "Por ahora
no hay fila a pie" y nadie puede sacar turno.

**No se abre hasta que el pastor decida el cupo** (abajo). Mientras tanto, en
Horarios no se crean fechas "Solo a pie" ni "Carros y a pie".

---

## Cómo funciona

La fila a pie **no va por horarios de 15 minutos**: es una fila con turnos
numerados, como en Costco (decidido el 27 de septiembre de 2026). Un cartel
con el QR de la página lleva al registro de siempre (los mismos datos que en
carro); al terminar, la persona recibe su QR y su número de turno.

| Pregunta | Respuesta |
|---|---|
| ¿Cómo se abre un día? | En **Horarios**: al crear una fecha se escoge *Solo carros*, *Solo a pie* o *Carros y a pie*; en una fecha que ya existe, "Fila a pie". Se pone la hora en que empieza la entrega (2:00 PM de fábrica), el cupo del día o **sin límite**, y la hora en que abre el registro (una hora antes, de fábrica). |
| ¿Cuántas filas a pie hay por día? | Una. En la base es un solo horario con `fila = 'a_pie'`; su cupo es el de todo el día. "Sin límite" guarda `cupo_sin_limite()` (10000) para que `reservar_cita()` cuente igual. |
| ¿Quién da el turno? | El disparador `dar_turno`, al guardar la cita, bajo **el mismo candado** de `reservar_cita()` sobre el horario. Cincuenta registros al mismo tiempo reciben los turnos 1 a 50, sin repetir ni saltarse ninguno (`scripts/prueba-turnos.mjs`). `reservar_cita()` no se tocó. |
| ¿Qué turno va? | El menor que sigue esperando. La persona lo ve en vivo en su página; la voluntaria ve la fila en el escáner y puede **anunciar los turnos en voz alta** (con la voz que escoja). |
| ¿Y si alguien no llega? | "No se presentó" (`saltar_turno`): la fila avanza. Si la persona llega después, su QR sigue sirviendo. |
| ¿Si llega antes de su turno? | Se le entrega igual; la pantalla avisa que llegó antes de su turno. |
| ¿Las reglas son las mismas que en carro? | No. Antes de sacar turno se aceptan las reglas **a pie** (sección `registro_a_pie` de avisos), editables aparte en **Textos y reglas**. |
| ¿El QR se distingue? | Sí: el de a pie lleva una **persona caminando** en el centro; el de carro, un carro. Es el mismo tipo de código (aleatorio, sin datos personales). |
| ¿Quién escanea dónde? | Cada quien del equipo **escoge al abrir el escáner en qué fila está hoy** ("¿En qué fila estás hoy?", `elegir_fila`). Eso manda sobre la fila de Equipo. Un código de la otra fila responde `OTRA_FILA` y **no se quema**. |
| ¿Cómo se ven las cuentas? | En Citas de hoy y en Reportes: **Juntas · En carro · A pie**. Juntas = carro + a pie, siempre: es lo que se reporta al banco de alimentos. Con cupo sin límite, Citas de hoy dice "N turnos dados". |
| ¿Pases y "entró sin cita"? | Se cuentan en la fila que escogió quien los escanea o los anota. El pase sigue dando una caja por fecha aunque lo escaneen en las dos. |

Sin hora de apertura, la fila a pie está cerrada (`A_PIE_CERRADO`); antes de
esa hora, `AUN_NO_ABRE`. El código de suscriptores de Facebook **no adelanta
a nadie** a pie: el turno es por orden de llegada. El panel sí registra a pie
antes de la hora, igual que en carro.

Ya **no existe** el interruptor `a_pie_abierto`: lo quitó
`2026-09-28-fila-a-pie-turnos.sql`. Cada día se arma su fila.

---

## Lo que está en el código

- Base: sección 38 de `supabase/schema.sql` (`guardar_fila_a_pie`,
  `quitar_fila_a_pie`, `crear_dia_a_pie`, `turno_de_cita`, `fila_de_turnos`,
  `saltar_turno`, `elegir_fila`, `mi_fila_de_hoy`). Migraciones
  `2026-09-28-fila-a-pie-turnos.sql` y `2026-09-28-reglas-a-pie.sql`.
- Pantallas: `/a-pie` (`publico/APie.jsx`), el registro con `?fila=a_pie`,
  el turno en vivo en la confirmación (`TurnoEnVivo`), la fila y la voz en el
  escáner (`PanelTurnos`, `ElegirFila`), y la fila del día en Horarios
  (`FilaAPieDelDia`, `CamposFilaAPie`).
- Datos: `src/datos/filaAPie.js` y `src/datos/voz.js`, con sus pruebas.
- Pruebas contra la base de pruebas: `scripts/prueba-turnos.mjs` (50 al
  mismo tiempo → turnos 1 a 50) y `scripts/prueba-general.mjs` (escanear en
  la fila equivocada, entregar, deshacer, "no se presentó", 10 escaneos
  simultáneos del mismo QR).

---

## Lo que tiene que decidir el pastor antes de abrirla

- **El cupo a pie.** ¿Un número por día (cuántas cajas hay para la fila a
  pie) o sin límite? Con sin límite, la fila se corta sola cuando se acaban
  las cajas y hay que avisarle a la gente que queda.
- **La hora.** De fábrica, la entrega a pie empieza a las 2:00 PM y el
  registro abre una hora antes. ¿Así?
- **Carro y a pie el mismo día.** Hoy no se puede: si la misma persona (mismo
  nombre y teléfono) ya tiene cita en carro esa fecha, al sacar turno a pie
  se le devuelve la que ya tiene. ¿Se queda así?
- **Las reglas a pie.** Están las de arranque en Textos y reglas; que las lea
  y las ajuste.
- **Quién escanea a pie** el primer día, para que escoja "Fila a pie" al abrir
  el escáner.
