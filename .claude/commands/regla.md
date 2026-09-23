---
description: Cambiar una regla de negocio en los cuatro lugares donde vive
argument-hint: [qué regla cambia y cómo queda]
model: opus
---

Cambio de regla: **$ARGUMENTS**

Una regla de este sistema vive en cuatro lugares. Cambiarla en tres la deja
rota en producción o en la siguiente persona que recree la base.

Trabaja en este orden y no brinques pasos:

1. **Entender qué hay hoy.** Ubica la función en `docs/mapa-base-de-datos.md`
   y lee **solo ese rango** de `supabase/schema.sql` con `sed -n`. No leas el
   archivo completo. Dime en una o dos frases cómo está la regla ahora.

2. **La función en `supabase/schema.sql`.** Si consume cupo o marca algo como
   usado, conserva el `select ... for update`. Si necesita permiso, usa
   `exigir_rol(...)` dentro de la función. Códigos de retorno estables.

3. **La migración.** Archivo nuevo en `supabase/migraciones/` con la fecha de
   hoy por delante, solo con lo nuevo, repetible (`create or replace`,
   `if not exists`). Agrega su fila a `supabase/migraciones/LEEME.md`.

4. **La app.** La función correspondiente en `src/datos/`, y la validación en
   pantalla si la hay. Recuerda que la validación en pantalla es comodidad: la
   de verdad es la de la base.

5. **Las pruebas.** El `.test.js` que toque, y el caso en
   `supabase/pruebas/reglas.sql` si la regla vive en la base. Corre
   `npm test`.

6. **Los textos.** Si el cambio se le dice a la persona, las tres traducciones
   (`es`, `en`, `vi`) en el mismo cambio.

Al terminar, dame el resumen así:

- Qué regla quedó y en qué se diferencia de antes
- Los archivos tocados, uno por línea
- **El SQL que Rodolfo tiene que pegar en el SQL Editor de Supabase**, con el
  nombre del archivo de migración
- Si hace falta volver a correr `prueba-concurrencia.mjs` o
  `prueba-escaneo.mjs`

No hagas commit. Los commits los hace Rodolfo.
