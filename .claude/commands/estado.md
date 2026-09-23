---
description: Poner al día docs/estado.md con lo que de verdad hay en el repo
allowed-tools: Bash(git log:*), Bash(git status:*), Read, Grep, Glob, Edit, Write
model: sonnet
---

## Últimos commits

!`git log --oneline -20`

---

Pon al día `docs/estado.md`.

Un "Estado actual" desactualizado es peor que no tenerlo: hace que se
reprograme algo que ya existe, o que se dé por hecho algo que falta.

1. Lee `docs/estado.md`.
2. Comprueba cada punto contra el repo de verdad — archivos, migraciones
   aplicadas en `supabase/migraciones/LEEME.md`, pruebas que existen. No te
   fíes de lo que dice el documento.
3. Reescribe las tres secciones: **Hecho**, **Pendiente inmediato** y
   **Decisiones ya aplicadas**.
4. Señálame aparte cualquier punto que no puedas verificar desde el repo
   (plan de Supabase, datos de prueba borrados, DNS, SES): esos los confirma
   Rodolfo, no los declares hechos por tu cuenta.

Sé breve. Una línea por punto. No hagas commit.
