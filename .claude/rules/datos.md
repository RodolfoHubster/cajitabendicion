---
paths:
  - "src/datos/**/*.js"
  - "src/lib/supabase.js"
---

# Reglas de la capa de datos

`src/datos/` es la única parte de la app que habla con Supabase. Ninguna
pantalla importa `supabase` directo.

## Forma de una función

```js
/** Las citas del dia, ordenadas por horario. */
export async function citasDelDia(fecha) {
  const { data, error } = await supabase.rpc('citas_del_dia', { p_fecha: fecha })
  if (error) throw new Error(clasificarError(error))
  return data
}
```

- Una función por RPC, con el mismo nombre en camelCase
- El error crudo de Postgres **nunca** sale de aquí: pasa por
  `clasificarError()` de `errores.js`, que devuelve un código
  (`FUNCION_NO_INSTALADA`, `SIN_PERMISO`, `SIN_CONEXION`, `ERROR_DESCONOCIDO`)
- La pantalla traduce ese código a un mensaje con `t()`. Un "revisa tu
  conexión" genérico manda a buscar al lugar equivocado; el día de la entrega,
  con la fila afuera, eso cuesta minutos que nadie tiene
- Comentario de una línea arriba, en español, diciendo para qué sirve

## Validaciones

Las validaciones puras (nombre, teléfono, código postal, fechas, horas) viven
en su propio archivo y se prueban solas: `validaciones.js`, `telefono.js`,
`domicilio.js`, `disponibilidad.js`. No mezcles una validación nueva dentro de
una función que llama a la red.

**La validación en pantalla es comodidad, no seguridad.** La regla de verdad
está en la función de Postgres. Si agregas una aquí, agrégala también allá.

## Pruebas

Cada archivo tiene su `.test.js` al lado, con Supabase simulado. `npm test` no
toca la base real y así debe seguir.

## Llaves

Solo la `anon key`, que es pública por diseño. Si algo necesita
`service_role`, no va aquí: va en una Edge Function.
