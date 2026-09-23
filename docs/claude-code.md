# Cómo está armado el andamiaje de Claude Code

Este proyecto no le explica el contexto a Claude conversando cada vez. Lo tiene
escrito, repartido en archivos que se cargan **solo cuando hacen falta**. Esto
documenta por qué está así, para quien lo herede.

---

## El problema: el contexto cuesta

Cada sesión arranca con una ventana de contexto vacía y Claude Code mete ahí,
antes de que escribas nada:

- `CLAUDE.md` del proyecto, **completo, en cada sesión**
- las reglas de `.claude/rules/` sin `paths`
- la memoria automática

Todo eso se paga en cada turno de la conversación, no una sola vez. Un
`CLAUDE.md` de 300 líneas que incluye el estado del proyecto y la
configuración del DNS se está pagando también cuando el trabajo del día es
centrar un botón.

Y hay un segundo costo, más caro que los tokens: **mientras más largas las
instrucciones, menos se siguen**. La recomendación oficial es mantener el
`CLAUDE.md` por debajo de 200 líneas.

---

## Qué mecanismo usar para cada cosa

| Mecanismo | Cuándo se carga | Para qué lo usamos aquí |
|---|---|---|
| `CLAUDE.md` | Siempre, en cada sesión | Lo invariable: reglas de negocio, las dos funciones críticas, mapa del repo, lo que nunca se hace |
| `.claude/rules/*.md` con `paths` | Solo al abrir un archivo que coincide | Convenciones por área: SQL, interfaz, i18n, capa de datos, pruebas |
| `.claude/commands/*.md` | Solo cuando escribes `/nombre` | Procedimientos de varios pasos que se repiten |
| `.claude/agents/*.md` | Solo cuando se delega la tarea | Trabajo que conviene hacer en su propia ventana de contexto |
| `docs/*.md` | Solo si alguien los abre | Referencia larga: estado, infraestructura, mapa de la base |

La regla: **si algo solo importa cuando tocas cierta carpeta, no va en el
`CLAUDE.md`**.

### Un detalle que engaña

En `CLAUDE.md`, escribir `@docs/estado.md` **importa el archivo entero al
arrancar**. Escribirlo entre comillas invertidas, `` `docs/estado.md` ``, lo
deja como un puntero que Claude abre si lo necesita. En este proyecto todos
los enlaces a `docs/` son punteros, a propósito.

---

## Cómo quedó repartido

```
CLAUDE.md                     ~180 líneas, siempre cargado
.claude/
  rules/
    sql.md          paths: supabase/**/*.sql, scripts/*.mjs
    ui.md           paths: src/**/*.jsx, src/index.css, tailwind.config.js
    i18n.md         paths: src/i18n/**
    datos.md        paths: src/datos/**/*.js, src/lib/supabase.js
    pruebas.md      paths: src/**/*.test.js, supabase/pruebas/*.sql
  commands/
    regla.md        /regla     — cambiar una regla en los 4 lugares donde vive
    pantalla.md     /pantalla  — programar una pantalla con marca, i18n y 56px
    revisar.md      /revisar   — revisión del diff antes de commitear
    estado.md       /estado    — poner al día docs/estado.md
  agents/
    revisor-reglas.md   opus   — auditoría de concurrencia, permisos y RLS
    traductor.md        haiku  — sincronizar es/en/vi
    buscador.md         haiku  — localizar código sin llenar el contexto
  settings.json               — permisos: qué corre sin preguntar, qué pregunta,
                                qué está prohibido
docs/
  mapa-base-de-datos.md       — índice de schema.sql con números de línea
  estado.md                   — qué está hecho y qué falta
  infraestructura.md          — dominio, DNS, hosting, correo
  claude-code.md              — este archivo
```

El `.gitignore` versiona `rules/`, `commands/`, `agents/` y `settings.json`, y
deja fuera `settings.local.json` y `launch.json`, que son de cada máquina.

---

## Qué modelo para qué

Claude Code permite cambiar de modelo con `/model` a media sesión, y un
subagente puede fijar el suyo con `model:` en su encabezado. La diferencia de
costo entre el modelo grande y el chico es de más de un orden de magnitud: no
es un detalle.

| Trabajo | Modelo | Por qué |
|---|---|---|
| Funciones de Postgres con bloqueo de filas, RLS, roles, diseño de una regla nueva, decisiones de arquitectura | **Opus** | Si se equivoca aquí, alguien se queda sin caja o alguien se lleva dos |
| Pantallas, componentes, capa de datos, pruebas, refactores, depurar un error concreto | **Sonnet** | Es la mayoría del trabajo y le sobra |
| Sincronizar traducciones, renombrar, localizar dónde vive algo, listar, formatear | **Haiku** | Trabajo mecánico y verificable |

En la práctica: **deja Sonnet puesto** y sube a Opus solo cuando vayas a tocar
`supabase/schema.sql` o a decidir una regla. Los comandos de este repo ya
traen el modelo que les toca (`/regla` es `opus`, `/pantalla` y `/revisar` son
`sonnet`), así que al invocarlos no tienes que acordarte.

Los subagentes cortan por partida doble: `traductor` y `buscador` corren en
Haiku **y** en su propia ventana de contexto, así que los 850 archivos de
traducción o los resultados de veinte búsquedas no se quedan pegados en tu
conversación.

---

## Hábitos que ahorran más que cualquier configuración

1. **Una tarea, una sesión.** El contexto se arrastra: cuando termines algo,
   `/clear`. Seguir con otro tema en la misma sesión hace que cada turno
   vuelva a pagar todo lo anterior.
2. **Nunca `schema.sql` completo.** Son 3900+ líneas. `docs/mapa-base-de-datos.md`
   tiene los rangos; se lee con `sed -n '186,254p'`.
3. **Di el archivo.** "Arregla el contraste en `src/componentes/Boton.jsx`"
   cuesta una fracción de "arregla el contraste del botón", que obliga a
   buscarlo.
4. **`/context`** muestra en qué se está yendo la ventana. Si el `CLAUDE.md`
   aparece grande, es señal de mover algo a `.claude/rules/`.
5. **Deja que Claude corra las pruebas.** Está en la lista de permitidos: no
   pregunta y confirma solo. Una ronda de `npm test` cuesta menos que un ida y
   vuelta contigo.
6. **`/regla` en vez de explicar el procedimiento otra vez.** Ese comando
   existe precisamente porque el procedimiento se repetía en cada cambio.

---

## Mantenimiento

Esto se desactualiza si no se cuida. Dos hábitos:

- Cuando corrijas a Claude **dos veces por lo mismo**, esa corrección va a un
  archivo: al `CLAUDE.md` si aplica siempre, a la regla del área si aplica a
  una carpeta.
- Cuando cierres un pendiente, `/estado`. Y de vez en cuando, `/init` propone
  mejoras al `CLAUDE.md` sin sobrescribirlo.

Reglas que se contradicen entre archivos son peor que no tenerlas: Claude
escoge una arbitrariamente. Al agregar una, revisa que no choque con otra.
