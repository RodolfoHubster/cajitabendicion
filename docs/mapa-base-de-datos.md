# Mapa de la base de datos

`supabase/schema.sql` pasa de 3900 líneas. Abrirlo completo llena el contexto
de una sesión de Claude Code con SQL que no hace falta, y deja menos espacio
para el trabajo real.

Este archivo es el índice. Ubica aquí lo que buscas y lee **solo ese rango**:

```bash
sed -n '186,254p' supabase/schema.sql
```

Números al día de `cb3051f`. Se mueven al editar el esquema; si algo no
cuadra, regenera:

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
| `renovar_pase` | 3710–3761 |
| `revocar_pase` | 3762–3803 |
| `listar_pases` | 3804–3853 |
| `entregas_pase_del_dia` | 3854–3891 |
| `pase_por_token` | 3892–3931 |

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

## Dos filas (sección 32)

| Objeto | Qué hace |
|---|---|
| `bloques.fila`, `personal.fila` | De qué fila es cada horario y en cuál escanea cada quien (`carro`, `a_pie`, `ambas`). |
| `puede_escanear_fila(fila)` | Si quien tiene la sesión entrega en esa fila. La usan las dos de escaneo para responder `OTRA_FILA`. |
| `fila_de_entrega()` | En qué fila se cuenta un pase o un "sin cita": la de quien lo registra. |
| `mi_fila()`, `guardar_fila_personal()` | La fila de la sesión; asignarla (solo admin). |

`resumen_del_dia` y `reporte_por_dias` aceptan `p_fila` (null = juntas).
`citas_del_dia`, `bloques_del_dia`, `entradas_sin_cita_del_dia`,
`listar_personal` y `consultar_cita` devuelven la fila.

## Errores de dedo y errores de gente (sección 33)

| Objeto | Qué hace |
|---|---|
| `normalizar_texto(t)` | Para COMPARAR nombres: sin acentos, minúsculas, sin puntos ni apóstrofos. |
| `normalizar_codigo_corto(t)` | "cb 4871", "4871", "CB487l" → `CB-4871`. La misma regla que `src/datos/codigoCorto.js`. |
| `codigos_parecidos(a, b)` | Un dígito distinto o dos vecinos al revés. |
| `cita_de_la_misma_persona(fecha, tel, nombre)` | Con candado. La usan los dos registros para no dar una segunda cita el mismo día. |
| `anular_entrega(codigo, motivo)` | Deshace una entrega de HOY (cita o pase). Palomita `anular_entregas`. Queda en `anulaciones_entrega`. |

`buscar_para_escaneo` ignora acentos y el orden de las palabras, y si el
código exacto no existe devuelve los de hoy que se le parecen
(`parecido = true`).

## Pases VIP (sección 40)

| Objeto | Qué hace |
|---|---|
| `pases.vip`, `vip_por`, `vip_desde` | Pase de suscriptor VIP: QR dorado y pasa directo, sin fila. |
| `marcar_pase_vip(codigo, vip)` | Lo pone o lo quita. Solo admin. `PASE_NO_EXISTE` si esa persona no tiene pase. |

## Turno a pie sin datos (sección 42)

| Objeto | Qué hace |
|---|---|
| `sacar_turno_a_pie(dispositivo, cambiar_carro, codigo)` | El QR general (`/turno`), sin sesión. Responde NUEVO, YA_TENIA, TIENE_CITA_EN_CARRO, YA_RECIBIO_EN_CARRO, AUN_NO_ABRE, NO_HAY_FILA o CERRADA; con el código del día, también FALTA_CODIGO, CODIGO_INCORRECTO o DEMASIADOS_INTENTOS (con `espera`). Un turno vivo por teléfono por día. |
| `dar_turno_sin_telefono(sena)` | La voluntaria de a pie da turno a quien no tiene teléfono, con un nombre o seña opcional. No pide el código del día. |
| `crear_turno_anonimo(...)` | Interna: persona anónima + `reservar_cita()` (mismo candado). Nadie la llama desde fuera. |
| `personas.anonima`, `citas.se_cambio_a_pie` | El turno sin datos, y la cita de carro que se canceló al cambiarse a pie. |

Cambia `registrar_entrega()` (desde la sección 44, "no se presentó" ya no
pierde el turno), `saltar_turno()`, `fila_de_turnos()`
(`saltado_en`), `buscar_personas()` (sin anónimos por nombre) y
`reporte_por_dias()` (`cambios_a_pie`).

## Voluntarios: teléfono y correo, envío y quien los atiende (sección 49)

| Objeto | Qué hace |
|---|---|
| `voluntarios.telefono`, `voluntarios.correo` | Por separado. El teléfono con lada (`+16195550101`), listo para WhatsApp. `contacto` queda de antes; lo que no se pudo separar sale en `listar_voluntarios()` como `contacto_viejo`. |
| `contacto_de_voluntario(contacto, telefono, correo)` | Interna: revisa y separa (`TELEFONO_INVALIDO`, `CORREO_INVALIDO`). Todo junto, 10 dígitos son +1 salvo 664 y 665 (Tijuana y Tecate), que son +52. |
| `credenciales_enviadas`, `marcar_credencial_enviada(voluntario, medio)` | Por dónde (`whatsapp`, `correo`, `impresa`), cuándo y quién le mandó su credencial. Se anota al confirmar; nada se manda solo. Al cambiarle el QR (`credencial_desde`), lo de antes ya no cuenta. |
| `personal.atiende_voluntarios`, `guardar_atiende_voluntarios(correo, activo)` | Por persona (Equipo y accesos, solo admin): escanea, registra, corrige y manda credenciales sin ser administrador. `mis_permisos()` lo manda como `atender_voluntarios`. |
| `exigir_atender_voluntarios()` | Interna: admin, o voluntario con "atiende voluntarios". La usan registrar, editar, listar, marcar, deshacer, la lista del día, el envío y cerrar el día. Baja, QR nuevo, horas y correcciones siguen con `exigir_rol(admin)`. |
| `cerrar_dia_voluntarios(hora)` | La salida, a esa hora (o ahora), de quienes entraron hoy antes y siguen adentro. `HORA_FUTURA`. |
| `historial_de_credencial(token)` | Público, con su enlace: sus últimas 30 visitas completas. `credencial_voluntario()` ahora también trae `dias` y `minutos`. |

## Voluntarios: credencial, entrada y salida (sección 48)

| Objeto | Qué hace |
|---|---|
| `voluntarios` | Nombre, contacto opcional (teléfono o correo), `token` de su credencial (`vol` + 48 letras o números) y si está activo. No es una cuenta del panel. |
| `asistencias_voluntarios` | Cada vez que vino: entrada, salida y estado (`dentro`, `salio`, `sin_salida`, `anulada`), quién la marcó y, si se corrigió, quién, cuándo y por qué. Índice único parcial: una sola entrada abierta por voluntario. |
| `registrar_voluntario`, `editar_voluntario`, `activar_voluntario`, `nuevo_qr_voluntario`, `listar_voluntarios` | Registrarlo, cambiarlo, darlo de baja o de alta y cambiarle la credencial. |
| `marcar_asistencia(token, voluntario)` | Escanear su credencial (o escogerlo de la lista): `ENTRADA` o `SALIDA` con sus minutos; `YA_ENTRO`/`YA_SALIO` si se leyó dos veces en 2 minutos; `INACTIVO`; `NO_EXISTE`. Bloquea al voluntario mientras decide. Una entrada de otro día queda `sin_salida` (`olvido`). |
| `deshacer_asistencia` | Los primeros 2 minutos: quita la entrada o reabre la salida. Después, `FUERA_DE_PLAZO`. |
| `corregir_asistencia`, `agregar_asistencia`, `anular_asistencia` | Con motivo (`MOTIVO_REQUERIDO`). Las horas se revisan: `HORAS_INVALIDAS` (al revés o más de 16 h), `HORA_FUTURA`, `TRASLAPE`. |
| `asistencias_del_dia`, `horas_de_voluntarios(desde, hasta)`, `asistencias_de_voluntario` | Quién vino hoy, las horas por voluntario (solo las completas) y cada asistencia de uno. |
| `credencial_voluntario(token)` | Lo único público: nombre y si está activa, para la página `/voluntario/:token`. |

Todo lo demás es **solo de administradores**. No toca citas, cupos ni
`registrar_entrega()`.

## El código del día hasta cierta hora (sección 47)

| Objeto | Qué hace |
|---|---|
| `dias_entrega.a_pie_codigo_hasta` | Hasta qué hora se pide el código del día. Nula: todo el día. |
| `codigo_del_dia_vigente(fecha)` | Interna: el código que se pide ahora (nulo si ya pasó la hora). |
| `codigo_turno_a_pie_hasta(fecha, cambiar, hasta)` | Leer o guardar la hora. Solo admin. |

La respetan `sacar_turno_a_pie()`, `fila_a_pie_hoy()` (`pide_codigo`,
`codigo_hasta`) y `fila_de_turnos()` (`codigo_dia`, `codigo_hasta`).

## Turnos anulados y todo desde el escáner (sección 46)

| Objeto | Qué hace |
|---|---|
| `citas.turno_anulado_en`, `citas.turno_anulado_por` | Cuándo y quién anuló un turno a pie (llegó tarde). |
| `anular_turno(turno)` | Anula el turno N a pie de hoy: queda cancelado y marcado; su QR ya no entrega (`CANCELADA`) y por número dice `TURNO_ANULADO`. Solo los que esperan (`TURNO_NO_EXISTE` si ya recibió). Voluntaria de a pie o admin. |
| `turnos_a_pie_de_hoy()` | Los turnos a pie de hoy, para buscar en el escáner: turno, código, seña, estado, sus horas (lo sacó, lo llamaron, recibió, se anuló) y quién se lo dio. Con los anulados. Voluntaria de a pie o admin. |
| `qr_de_turno(turno)` | El QR de un turno de hoy, para su detalle en el escáner. |

Cambia `consultar_cita()` (`saltado_en`, `anulado`: el escáner pregunta antes de
entregarle a quien llegó tarde), `turno_de_cita()` (`anulado`), `entregar_turno()`
(`TURNO_ANULADO`), `sacar_turno_a_pie()` (`p_codigo_carro`: cambiarse a pie con su
código CB, `CODIGO_CARRO_NO_EXISTE`; `TURNOS_ANULADOS` con dos anulados el mismo
día) y `reporte_por_dias()` (`turnos_anulados`).

## La fila a pie, más ágil (sección 44)

| Objeto | Qué hace |
|---|---|
| `entregar_turno(turno)` | "Entregar sin QR": entrega el turno N a pie de hoy llamando a `registrar_entrega()` (mismo candado). VALIDO, YA_USADO, CANCELADA o TURNO_NO_EXISTE. Voluntaria de a pie o admin. |

Cambia `registrar_entrega()` ("no se presentó" ya no pierde el turno),
`saltar_turno()` (regresar a la fila cuando sea), `sacar_turno_a_pie()` (si
lo saltaron y vuelve a escanear, le sale el suyo) y `buscar_para_escaneo()`
(devuelve `fila` y `turno`).

## Código del día, lista del escáner y terminar la fila (sección 43)

| Objeto | Qué hace |
|---|---|
| `dias_entrega.a_pie_codigo` | El código del día de esa fecha (4 números), o nulo si no se pide. |
| `intentos_turno` | Los códigos mal por teléfono: 5 en 5 minutos frenan ese teléfono. |
| `codigo_turno_a_pie(fecha, activo, nuevo)` | Lee, prende, apaga o cambia el código del día. Solo admin. |
| `fila_a_pie_hoy()` | Pública: si hoy hay fila a pie, si abrió, si se cerraron los turnos (`cerrada`), si terminó (`terminada`) y si pide código (nunca cuál). |
| `bloques.terminada_en`, `terminar_fila_a_pie(terminada)` | "Terminar la fila de hoy": quien todavía espera lo ve (`turno_de_cita.cerrada`). Voluntaria de a pie o admin; se deshace con `false`. No es "Cerrar los turnos" (`bloques.cerrado`). |
| `lista_para_escaneo()` | La gente de hoy de la fila de carros para el escáner: nombre, código, hora, estado y con quién va. Sin teléfono ni dirección. `OTRA_FILA` desde a pie. |

Cambia `turno_de_cita()` (`cerrada` solo si se terminó la fila o se canceló
el día), `fila_de_turnos()` (`codigo_dia`, `terminada`, y sin los códigos de
los turnos sin datos) y `buscar_para_escaneo()` (los turnos sin datos, solo
con el código exacto).

## Buscar personas y días de entrega (sección 41)

| Función | Qué hace |
|---|---|
| `buscar_personas(texto)` | "Personas" en el panel: por nombre (sin acentos, en cualquier orden), teléfono (4 dígitos o más) o código CB, en todos los registros. `grupo` junta los de mismo nombre y mismo teléfono. Del teléfono solo devuelve los últimos 4 dígitos. Permiso `ver_personas`. |
| `fechas_de_entrega()` | Los días que hubo o habrá entrega, del más reciente para atrás, para escoger el día sin calendario en Citas de hoy y Reportes. Admin y voluntario. |

## La fila a pie por turnos (sección 38)

| Objeto | Qué hace |
|---|---|
| `citas.turno`, `citas.turno_saltado_en` | Su número en la fila a pie del día y si lo llamaron y no estaba. Nulo en carro. |
| `dias_entrega.a_pie_abre_en` | A qué hora abre el registro a pie. Nulo: ese día no hay fila a pie (`A_PIE_CERRADO`). |
| `personal.fila_hoy`, `fila_hoy_fecha` | En qué fila está hoy cada quien. Manda sobre `personal.fila`. |
| `una_fila_a_pie_por_dia` | Un solo horario a pie por fecha. |
| `un_turno_por_fila` | Nunca dos citas con el mismo turno en la misma fila. |
| `dar_turno()` (disparador) | Pone el turno que sigue al guardar la cita. Lo ordena el candado de `reservar_cita()`. |
| `cupo_sin_limite()` | 10000: el cupo que se guarda con "sin límite". No se suma en reportes ni en la lista de fechas. |
| `guardar_fila_a_pie(fecha, hora, cupo, abre_en)` | Crea o cambia la fila a pie del día. Sin `abre_en`, una hora antes de empezar. Solo admin. |
| `crear_dia_a_pie(fecha, hora, cupo, abre_en)` | Una fecha solo a pie (sin horarios de carro), con su fila ya armada. Todo o nada. Solo admin. |
| `quitar_fila_a_pie(fecha)` | La quita si nadie ha sacado turno (`BLOQUE_CON_CITAS` si sí: se cierra con `actualizar_bloque`). |
| `turno_de_cita(token)` | Público: su turno, el que va, cuántos tiene antes. Solo números. |
| `fila_de_turnos(fecha)` | La voluntaria: el que va, los siguientes, los que no se presentaron y las cuentas. Voluntario: solo hoy y solo en a pie. |
| `saltar_turno(turno, saltado)` | "No se presentó" (o regresarlo a la fila). Solo hoy. |
| `elegir_fila(fila)`, `mi_fila_de_hoy()` | La fila que cada quien elige en el escáner. |

## La guía del panel (sección 37)

| Objeto | Qué hace |
|---|---|
| `guias_vistas` | Quién vio qué guía (`admin` o `voluntario`) y hasta qué versión. |
| `mis_guias_vistas()` | Las de quien pregunta, nadie más. |
| `marcar_guia_vista(guia, version)` | Ya la vio. Nunca baja de versión. |

## Incidencias del día (sección 36)

| Objeto | Qué hace |
|---|---|
| `anunciar_retraso(fecha, minutos, mensaje)` | Solo admin. Reemplaza el aviso anterior; 0 lo quita. Nadie se mueve. |
| `mover_entrega(fecha, fecha_nueva, mensaje)` | Solo admin. Crea la fecha nueva, copia los horarios y mueve cada cita con su QR y hora (`movimientos_cita.origen = 'incidencia'`). La original se cierra. Devuelve `movidas`, `sin_mover` (las que chocan con la regla de una por semana). |
| `cancelar_entrega(fecha, mensaje)` | Solo admin. Cancela las pendientes con el motivo y cierra el día. |
| `incidencias_publicas()` | Público. Lo vigente de hoy en adelante, sin datos de nadie. |
| `incidencia_de_cita(token)` | Público. El retraso, la cancelación o de dónde se movió SU cita. |
| `incidencias_de_fecha(fecha)`, `personas_a_avisar(fecha)` | Solo admin. Historial y lista con teléfono y token para avisar. |

## Entregas a mano (sección 35)

| Objeto | Qué hace |
|---|---|
| `marcar_entregada_panel(codigo, fecha, hora, motivo)` | Solo admin. Marca entregada una cita de hoy o pasada que no se escaneó. `usado_en` = la hora de su cita, para que cuente ese día. |
| `entregas_marcadas` | Quién la marcó, cuándo y por qué. |
| `anular_entrega` | Sin la palomita, quien escaneó deshace SU entrega el primer minuto; si no, `FUERA_DE_PLAZO`. |

`citas_del_dia` devuelve `marcada_por`.

## "Entró sin cita" con teléfono

`registrar_entrada_sin_cita(nombre, fila, confirmar_repetido, telefono)`:
el teléfono es opcional (+lada y número). Avisa `NOMBRE_YA_ANOTADO_HOY:SC-…`
o `TELEFONO_YA_ANOTADO_HOY:SC-…`; con `confirmar_repetido` pasa.
`entradas_sin_cita_del_dia` devuelve el teléfono.

## Ver el QR desde el panel (sección 34)

| Objeto | Qué hace |
|---|---|
| `qr_de_cita(codigo, fecha, hora)` | El token de una cita no cancelada. **Solo admin**, ninguna palomita lo abre. Anota en `qr_vistos`. |
| `qr_vistos` | Quién vio qué QR y cuándo. RLS sin políticas. |

`citas_del_dia` sigue sin traer tokens: se piden de uno en uno, al tocar.

## Códigos que devuelven

Los que la app traduce a mensaje en `src/datos/errores.js` y en las
traducciones: `VALIDO`, `YA_USADO`, `BLOQUE_LLENO`, `OTRA_FECHA`,
`SIN_PERMISO`, `FUNCION_NO_INSTALADA`, `SIN_CONEXION`.

Una función nueva devuelve un código de texto estable, nunca un mensaje ya
redactado: el mensaje se arma en la app, en el idioma de quien lee.
