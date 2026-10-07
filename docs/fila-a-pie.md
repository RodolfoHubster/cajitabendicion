# Fila a pie (Fase 2)

Estado al 6 de octubre de 2026: **turno a pie SIN DATOS, con un QR general.**
En la fila a pie la gente no quiere dar ni su nombre (el ambiente con
migración). Decidido con el pastor: un solo QR impreso en la entrada lleva a
`/turno`; la persona toca **"Sacar mi turno"** y recibe su número y su QR sin
dar ningún dato. Los datos se irán pidiendo poco a poco, cuando la gente ya
conozca el sistema. Se abre el día con "Fila a pie" en Horarios (sin límite,
el registro abre a la hora que diga el pastor, por lo general 9:00 AM).

| Qué | Cómo |
|---|---|
| El QR general | Siempre el mismo: `citas.casadealabanzasd.com/turno`. Antes de la hora dice a qué hora abre. |
| Un turno por teléfono | Un turno vivo por teléfono por día (el identificador al azar del registro, nada personal). Si vuelve a tocar, le sale el suyo. Prueba: `scripts/prueba-qr-general.mjs` (50 teléfonos al mismo tiempo, y uno que toca 10 veces). |
| La persona del turno | Anónima (`personas.anonima`): se llama "Turno 23" y tiene su código CB, que es el que dice si el QR no se lee. No sale al buscar por nombre en Personas. |
| En vivo | Su página dice qué turno va y cuántos faltan; **suena y vibra** (vibrar solo en Android) cuando faltan 3 y cuando le toca, con la pantalla completa en verde, y la pantalla no se apaga sola mientras espera. Con el teléfono bloqueado no suena: eso pide notificaciones (pendiente). |
| "No se presentó" | **Pierde el turno**: su QR ya no entrega (`TURNO_PERDIDO`) y su teléfono queda libre para volver a escanear el QR general y formarse hasta atrás. Se deshace solo en los 2 minutos siguientes (el administrador, siempre). |
| Sin teléfono | La voluntaria de a pie toca "Dar turno a alguien sin teléfono" en el escáner y le dice su número y su código. Puede anotar su nombre o una seña ("chamarra roja"), opcional. Queda quién lo dio. |
| Código del día | Opcional, por fecha: casilla "Pedir código del día" en la Fila a pie de Horarios. Son 4 números al azar que se ponen en la entrada; sin ellos `/turno` no da turno (así nadie lo saca desde su casa). 5 intentos mal frenan ese teléfono 5 minutos, con cuenta regresiva. Los turnos que da la voluntaria no lo piden. La voluntaria lo ve en su panel. |
| El cartel | "Descargar cartel" en la Fila a pie: el QR de `/turno` con el logo, listo para imprimir, con un recuadro para escribir el código del día. |
| "Yo soy el 50" | El código del turno es lo único que prueba de quién es. El panel de la voluntaria no muestra los códigos de los turnos sin datos, y buscando solo salen con el código exacto. Se pide el código y se toca "Comprobar el código de un turno". |
| Terminar la fila | Al acabar, la voluntaria toca "Terminar la fila de hoy": ya no se dan turnos y quien todavía espera ve "La fila de hoy ya terminó". Se puede deshacer. **"Cerrar los turnos"** (Horarios) es otra cosa: solo deja de dar turnos nuevos y quien ya tiene turno lo conserva. |
| De carro a pie | Si ese teléfono tiene cita de carro hoy, se le advierte; si acepta, su cita de carro se cancela (su QR ya no entrega) y no hay regreso. Si ya recibió en carro, no saca turno a pie. Si es el **dueño del carro**, se le avisa que también se cancelan las citas de sus N acompañantes (de cualquier teléfono) y se le pregunta si está seguro; él recibe solo su turno y cada acompañante saca el suyo. Un acompañante que se cambia solo no afecta al dueño. Reportes cuenta "Se cambiaron a pie" (personas). Solo se detecta si usa el mismo teléfono. |

Sin datos no se puede impedir del todo que alguien saque dos turnos (con dos
teléfonos, o borrando el navegador). La regla de fondo sigue: un QR, una caja.

---

## Antes (28 de septiembre): fila a pie con registro

Lo de abajo sigue funcionando por dentro (`/registro?fila=a_pie`), pero ya no
se ofrece al público: "A pie" en el inicio lleva a `/turno`.

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
| ¿Y si alguien no llega? | "No se presentó" (`saltar_turno`): la fila avanza y, desde el 6 de octubre, **pierde el turno** (ver arriba). |
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
- Base, turno sin datos: secciones 42 y 43 (`sacar_turno_a_pie`,
  `dar_turno_sin_telefono`, `codigo_turno_a_pie`, `fila_a_pie_hoy`,
  `terminar_fila_a_pie`, `lista_para_escaneo`). Migración
  `2026-10-06-turno-a-pie-sin-datos.sql`.
- Pantallas: `/turno` (`publico/Turno.jsx`; `/a-pie` lleva ahí), el registro
  con `?fila=a_pie`, el turno en vivo (`TurnoEnVivo`), la fila y la voz en el
  escáner (`PanelTurnos`, `ElegirFila`), y la fila del día en Horarios
  (`FilaAPieDelDia`, `CamposFilaAPie`, `CodigoDelDia` con el cartel).
- Datos: `src/datos/filaAPie.js`, `src/datos/turnoAPie.js` y
  `src/datos/voz.js`, con sus pruebas.
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
