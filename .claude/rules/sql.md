---
paths:
  - "supabase/**/*.sql"
  - "scripts/*.mjs"
---

# Reglas de la base de datos

## Antes de escribir SQL

No leas `supabase/schema.sql` completo: son 3900+ líneas. Abre primero
`docs/mapa-base-de-datos.md`, ubica la función y lee **solo ese rango** con
`sed -n 'INICIO,FINp' supabase/schema.sql`.

## Concurrencia

Toda función que consuma un cupo o marque algo como usado bloquea la fila
primero:

```sql
select * into v_fila from bloques where id = p_bloque_id for update;
```

El patrón `select count(*)` seguido de `insert` **es el bug del Google Form**.
Nunca se usa, ni siquiera "porque aquí no hay concurrencia".

El otro mecanismo válido es un **índice único** que haga imposible el
duplicado. Así funciona "una caja por pase por fecha":
`unique (pase_id, fecha)` en `entregas_pase`. Si dos voluntarios escanean el
mismo pase a la vez, uno inserta y el otro choca contra el índice. La regla la
sostiene la base, no el orden en que corra el código.

## Forma de una función nueva

- `security definer` con `set search_path = public, extensions, pg_temp`.
  **`extensions` no es opcional**: ahí vive pgcrypto, y sin él
  `gen_random_bytes()`, `crypt()` y `gen_salt()` truenan en tiempo de
  ejecución, no al crear la función. Es lo que usan `reservar_cita`,
  `registrar_y_reservar`, `crear_pase` y `renovar_pase` para los tokens.
  Solo tres funciones del esquema usan la forma corta `public, pg_temp`
  (`exigir_rol`, `mi_rol`, `buscar_codigo_postal`), porque no llaman a nada
  de extensions. En la duda, la larga
- Permisos con `exigir_rol(...)` **dentro** de la función, no solo en pantalla
- Devuelve un código de texto estable (`VALIDO`, `YA_USADO`, `BLOQUE_LLENO`,
  `OTRA_FECHA`, `SIN_PERMISO`) que `src/datos/errores.js` traduce a mensaje
- `create or replace`, `create table if not exists`, `add column if not exists`:
  las migraciones se corren dos veces sin romper nada
- Nombres en español, como el resto del sistema

## RLS

Las 15 tablas tienen RLS activo y **cero policies**: nadie lee nada directo,
todo pasa por funciones `security definer`. Una tabla nueva nace con
`enable row level security` en el mismo bloque en que se crea.

Un voluntario no puede leer el padrón completo de personas, solo lo que
necesita para escanear.

## Zona horaria

La base corre en `America/Los_Angeles`. En UTC todo lo posterior a las 5 PM
caía al día siguiente y el escáner rechazaba citas válidas con `OTRA_FECHA` en
la hora más cargada. Nunca uses `now() at time zone 'utc'` para comparar fechas
de entrega.

## Migraciones

Un cambio son **dos archivos**: `schema.sql` actualizado (la receta desde cero)
y `supabase/migraciones/AAAA-MM-DD-nombre.sql` (solo lo nuevo, para la base que
ya corre), más su fila en `supabase/migraciones/LEEME.md`. Solo lo primero y el
cambio nunca llega a producción; solo lo segundo y el día que alguien recree la
base le va a faltar.

## Pruebas

Al cambiar una regla, actualiza `supabase/pruebas/reglas.sql`. Si el cambio
toca cupo o escaneo, se vuelven a correr `scripts/prueba-concurrencia.mjs`
(capacidad 2, 50 llamadas → exactamente 2 citas) y `scripts/prueba-escaneo.mjs`
(10 escaneos → un solo `VALIDO`). Esos scripts pegan a la base real: avisa
antes de correrlos.
