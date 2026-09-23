---
description: Revisión rápida de lo que está sin commitear, antes de que Rodolfo commitee
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(npm test), Bash(npm run lint), Read, Grep, Glob
model: sonnet
---

## Sin commitear

!`git status --short`

## Cambios

!`git diff`

---

Revisa ese diff contra las reglas de este proyecto. Busca en concreto:

- **Cupo y escaneo**: ¿aparece algún `count(*)` seguido de `insert`, o algún
  camino que reserve sin `for update`? Es el bug del Google Form.
- **Permisos**: ¿hay una regla que solo se revisa en pantalla y no dentro de
  la función de Postgres?
- **Llaves**: ¿se coló la `service_role key`, un token o una URL con secreto?
- **Migración**: si cambió `schema.sql`, ¿existe el archivo en
  `supabase/migraciones/` y su fila en `LEEME.md`?
- **Traducciones**: ¿alguna clave nueva quedó en `es.json` pero falta en
  `en.json` o `vi.json`?
- **Accesibilidad**: botones bajo 56px, texto bajo 15px, blanco sobre naranja.
- **Pruebas**: ¿la regla que cambió tiene prueba que la cubra?

Corre `npm test` y `npm run lint`.

Dame los hallazgos ordenados de más grave a menos, cada uno con archivo y
línea. Si no hay nada, dilo en una línea: no inventes observaciones para
llenar. No hagas commit.
