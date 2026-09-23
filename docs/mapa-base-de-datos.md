# Mapa de la base de datos

`supabase/schema.sql` pasa de 3900 líneas. Abrirlo completo llena el contexto
de una sesión de Claude Code con SQL que no hace falta, y deja menos espacio
para el trabajo real.

Este archivo es el índice. Ubica aquí lo que buscas y lee **solo ese rango**:

```bash
sed -n '186,254p' supabase/schema.sql
```

Números al día de `15261be` (pases permanentes). Se mueven al editar el
esquema; si algo no cuadra, regenera:

```bash
grep -n "^create or replace function" supabase/schema.sql
```

---

## Las dos críticas

| Objeto | Líneas | Qué hace |
|---|---|---|
| `reservar_cita` | 186–254 | Aparta un lugar. `select ... for update` sobre la fila del bloque: 5 reservas simultáneas sobre 2 lugares dejan exactamente 2 citas, el resto recibe `BLOQUE_LLENO`. |
| `registrar_entrega` | 255–396 | Marca el QR como usado. Mismo bloqueo sobre la fila de la cita: dos voluntarios a la vez, uno `VALIDO` y el otro `YA_USADO`. Recibe **solo** `p_token`; el voluntario sale de `auth.uid()`. Desde los pases, también acepta un pase permanente: ahí lo que se quema es la fecha, no el código. |

Cualquier cambio a estas dos se revisa con el subagente `revisor-reglas` y se
vuelve a probar con `scripts/prueba-concurrencia.mjs` y
`scripts/prueba-escaneo.mjs`.

---

## Tablas

| Tabla | Líneas |
|---|---|
| `personas` | 23–68 |
| `bloques` | 69–86 |
| `citas` | 87–130 |
| `escaneos` | 131–147 |
| `entradas_sin_cita` | 148–164 |
| `excepciones` | 165–185 |
| `configuracion` | 564–605 |
| `autorizadores` | 1192–1201 |
| `intentos_autorizacion` | 1202–1225 |
| `personal` | 1448–1461 |
| `dias_entrega` | 1768–1804 |
| `personal_pendiente` | 2559–2574 |
| `codigos_postales` | 2929–2960 |
| `movimientos_cita` | 3138–3175 |
| `pases` | 3599–3623 |
| `entregas_pase` | 3624–3648 |

Todas tienen RLS activo y **cero policies**: todo entra por las funciones
`security definer`.

Vista: `resumen_dia` (397–501).

---

## Registro y reserva desde el público

| Función | Líneas |
|---|---|
| `consultar_disponibilidad` | 502–563 |
| `registrar_y_reservar` | 606–847 |
| `consultar_cita` | 848–892 |
| `cancelar_mi_cita` | 2169–2215 |
| `mover_mi_cita` | 3285–3340 |
| `cambios_restantes` | 3341–3379 |

`registrar_y_reservar` es la puerta del público: valida apertura, código de
suscriptor, tope por teléfono (por fecha de entrega), domicilio y
consentimiento, y de ahí llama a la reserva. `reservar_cita` ya no se puede
llamar desde el navegador.

## Escaneo

| Función | Líneas |
|---|---|
| `buscar_para_escaneo` | 1086–1139 |
| `registrar_entrega_por_codigo` | 1140–1191 |
| `definir_autorizador` | 1226–1269 |
| `registrar_entrega_autorizada` | 1270–1387 |
| `registrar_entrega_autorizada_por_codigo` | 1388–1447 |

Las "autorizadas" son la entrega de una cita de **otra fecha**: un voluntario
necesita el código de autorización de un admin; un admin no.

## Pases permanentes

| Función | Líneas |
|---|---|
| `crear_pase` | 3649–3709 |
| `renovar_pase` | 3710–3758 |
| `revocar_pase` | 3759–3800 |
| `listar_pases` | 3801–3850 |
| `entregas_pase_del_dia` | 3851–3888 |
| `pase_por_token` | 3889–3928 |

Una caja por pase por fecha, garantizada por `unique (pase_id, fecha)` en
`entregas_pase`. El pase no aparta lugar del cupo y su caja se cuenta aparte,
como "entró sin cita". Solo admin. Revocar no borra.

Los pases cambian también `registrar_entrega()`, `resumen_del_dia()` y
`reporte_por_dias()`.

## Panel: el día de la entrega

| Función | Líneas |
|---|---|
| `resumen_del_dia` | 893–967 |
| `citas_del_dia` | 968–1021 |
| `bloques_del_dia` | 1022–1085 |
| `registrar_desde_panel` | 1588–1746 |
| `cancelar_cita_panel` | 2216–2290 |
| `registrar_entrada_sin_cita` | 2291–2345 |
| `anular_entrada_sin_cita` | 2346–2391 |
| `entradas_sin_cita_del_dia` | 2392–2439 |
| `reservar_con_excepcion` | 2440–2558 |
| `mover_cita` | 3176–3284 |
| `mover_cita_panel` | 3380–3410 |
| `historial_de_cita` | 3411–3463 |
| `detalle_de_persona` | 3464–3541 |
| `citas_de_persona` | 3542–3598 |
| `reporte_por_dias` | 2795–2928 |

## Horarios y cupos

| Función | Líneas |
|---|---|
| `listar_dias_entrega` | 1833–1880 |
| `crear_dia_entrega` | 1881–1939 |
| `actualizar_dia_entrega` | 1940–1979 |
| `eliminar_dia_entrega` | 2010–2039 |
| `agregar_bloque` | 2068–2105 |
| `actualizar_bloque` | 2040–2067 |
| `eliminar_bloque` | 2106–2168 |
| `generar_codigo_anticipado` | 1747–1767 |
| `regenerar_codigo_anticipado` | 1980–2009 |
| `validar_codigo_anticipado` | 1805–1832 |

Toda fecha de entrega se crea desde el panel, no con SQL a mano. Antes de
`abre_en` la fecha está con candado; desde `abre_anticipado_en` reserva quien
trae el código de suscriptor de Facebook de esa fecha.

## Roles y equipo

| Función | Líneas |
|---|---|
| `exigir_rol` | 1462–1493 |
| `mi_rol` | 1494–1517 |
| `definir_personal` | 1518–1587 |
| `aplicar_personal_pendiente` | 2575–2635 |
| `listar_personal` | 2636–2680 |
| `guardar_personal` | 2681–2710 |
| `quitar_acceso_personal` | 2711–2756 |
| `definir_mi_codigo_autorizacion` | 2757–2794 |

`exigir_rol` es la que hace que los permisos se revisen **dentro** de la base y
no solo en pantalla. Toda función nueva del panel la llama.

## Domicilio

| Función | Líneas |
|---|---|
| `buscar_codigo_postal` | 2961–2987 |
| `validar_domicilio` | 2988–3137 |

Catálogo de códigos postales de California y Baja California (GeoNames,
CC BY 4.0). Sin API de mapas: las direcciones no salen de la base.

---

## Códigos que devuelven

Los que la app traduce a mensaje en `src/datos/errores.js` y en las
traducciones: `VALIDO`, `YA_USADO`, `BLOQUE_LLENO`, `OTRA_FECHA`,
`SIN_PERMISO`, `FUNCION_NO_INSTALADA`, `SIN_CONEXION`.

Una función nueva devuelve un código de texto estable, nunca un mensaje ya
redactado: el mensaje se arma en la app, en el idioma de quien lee.
