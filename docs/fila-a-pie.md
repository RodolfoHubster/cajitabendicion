# Fila a pie (Fase 2)

Estado al 23 de septiembre de 2026: **paso 1 hecho** (la base y el panel ya
saben de filas). Para el público sigue diciendo "Próximamente".

---

## La idea

La entrega tiene dos filas, cada una con su cupo, sus horarios y su gente
escaneando. La fila **no** vive en la cita sino en el **horario**: una cita es
de la fila de su bloque. Así el candado de `reservar_cita()` sobre el bloque
sigue siendo el único que decide el cupo, igual en las dos filas.

| Pregunta | Respuesta |
|---|---|
| ¿El QR de a pie es distinto? | Es el mismo tipo de código (aleatorio, sin datos personales). La base sabe de qué fila es por su horario. En pantalla se distingue: etiqueta "Fila a pie" y **marco naranja** alrededor del QR. |
| ¿Un voluntario de carros puede entregar uno a pie? | No. La base responde `OTRA_FILA` y **el código no se quema**: en su fila sí pasa. La pantalla lo avisa antes de tocar "Entregar". |
| ¿Quién escanea dónde? | Se asigna en **Equipo y accesos**: fila de carros, fila a pie o las dos. El administrador escanea en las dos siempre. |
| ¿Cómo se ven las cuentas? | En Citas de hoy y en Reportes hay un selector: **Juntas · En carro · A pie**. Juntas es la suma de las dos y es lo que se reporta al banco de alimentos. Hay una prueba que lo vigila. |
| ¿Los pases permanentes? | Sirven en cualquier fila, y siguen dando **una caja por fecha** aunque los escaneen en las dos. Se cuentan en la fila de quien los escanea. |
| ¿"Entró sin cita"? | Se anota en la fila de quien lo anota. |

---

## Paso 1 — hecho

- Migración `2026-09-23-filas-carro-y-a-pie.sql`: `bloques.fila`,
  `personal.fila`, la fila en "sin cita" y en las entregas de pases; el
  interruptor `a_pie_abierto` (hoy en `no`).
- Escaneo: `OTRA_FILA` en `registrar_entrega()` y `registrar_entrega_autorizada()`.
- `mover_cita()` no pasa una cita de una fila a otra.
- Con a pie cerrado, sus horarios no salen al público y nadie aparta lugar ahí
  (`A_PIE_CERRADO`), ni desde el panel.
- Panel: selector de fila en Citas de hoy y Reportes (el CSV dice la fila),
  fila de cada quien en Equipo, "Escaneas en: …" en Escanear.
- 37 comprobaciones nuevas en `reglas.sql`; se corrieron completas en un
  Postgres local (PGlite): 344 de 344, por la receta limpia y por el camino
  real de migraciones.

**Aplicarla después de una entrega, no antes**: toca la función del escaneo.
Después de aplicarla, correr `scripts/prueba-escaneo.mjs` (diez escaneos
simultáneos del mismo QR: uno `VALIDO`, los demás `YA_USADO`).

---

## Lo que falta para abrir la fila a pie

1. **Horarios a pie en el panel.** Hoy los bloques a pie solo se crean por SQL.
   Falta que "Horarios y cupos" deje escoger la fila al crear una fecha o un
   horario.
2. **El registro público a pie.** El botón "A pie" del inicio lleva al
   calendario de a pie (`consultar_disponibilidad(..., p_fila => 'a_pie')`).
   La imagen que se descarga también tiene que decir la fila.
3. **Quien escanea en las dos filas elige en cuál está.** Hoy sus pases y sus
   "sin cita" se cuentan en carros, que es la única fila abierta.
4. **Lista de espera y registro en el momento**, como dice el alcance de la
   Fase 2. Diseño pendiente.
5. **El interruptor** para abrir a pie desde el panel, en vez de SQL.

## Lo que tiene que decidir el pastor

- **Horario y cupo a pie.** ¿Bloques de 15 minutos como en carro, o un solo
  bloque por tarde con su cupo?
- **Carro y a pie el mismo día.** El tope por teléfono cuenta las dos filas
  juntas por fecha. ¿Se permite apartar en las dos?
- **La lista de espera.** Cuando alguien cancela, ¿entra el siguiente solo?
  ¿Se le avisa?
- **Quién escanea a pie**, para asignarlo en Equipo.
