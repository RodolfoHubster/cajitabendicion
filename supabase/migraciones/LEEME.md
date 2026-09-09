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
