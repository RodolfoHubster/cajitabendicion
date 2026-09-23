---
paths:
  - "src/**/*.test.js"
  - "supabase/pruebas/*.sql"
---

# Reglas de pruebas

## Las tres capas

| Qué | Cómo se corre | Qué cubre |
|---|---|---|
| `src/**/*.test.js` | `npm test` (Vitest) | Validaciones, fechas y horas, acceso de suscriptores, traducciones y capa de datos con Supabase simulado. **No toca la base real.** |
| `supabase/pruebas/reglas.sql` | Pegado completo en el SQL Editor | Las reglas dentro de la base: registro, apertura, código de suscriptores, cupo, una cita por semana, tope por dispositivo, panel, escaneo y roles. Termina con un error a propósito que trae el resultado y deshace todo. |
| `scripts/prueba-concurrencia.mjs`, `scripts/prueba-escaneo.mjs` | `node scripts/...` | Personas al mismo tiempo contra la base real. |

## Las dos pruebas obligatorias

Ninguna lógica de cupo o de escaneo se da por buena sin esto:

1. Bloque con capacidad 2, **50 llamadas simultáneas** a `reservar_cita()` →
   exactamente 2 citas.
2. Un token válido, **10 llamadas simultáneas** a `registrar_entrega()` →
   `VALIDO` una sola vez.

Pegan a la base real. Avisa antes de correrlas y limpia los datos `TEST-%` al
terminar.

## Qué prueba se escribe

Prueba el caso de la fila, no el feliz. Ejemplos de lo que ya está cubierto y
del nivel que se espera: el bloque que se llena entre que se pinta la pantalla
y se aprieta el botón, el QR que se escanea dos veces, el teléfono que aparta
lunes y jueves, la cita de otra fecha, la cuenta sin rol.

## Al cambiar una regla

Se actualiza la prueba en la misma tanda que el código. Una regla nueva sin
prueba no está terminada. Si la regla vive en la base, la prueba va en
`reglas.sql` además de en Vitest.

## Correr

```bash
npm test              # una vez
npm run test:vigilar  # en modo vigilancia
```

No uses `--run` inventado ni reconfigures Vitest: `npm test` ya es
`vitest run`.
