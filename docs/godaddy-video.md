# El video de Cajita de Bendición en casadealabanzasd.com

Pedido del Pastor David (27 de octubre de 2026): que en la página de la
iglesia la gente vea qué es Cajita de Bendición, como un video que se abre en
grande y se puede cerrar, con un botón para ir a hacer su cita.

**No se toca el dominio, el DNS ni el correo.** Solo se pega código en el
editor de GoDaddy, igual que cualquier otra sección. Se quita borrando esa
sección o esa línea.

---

## Qué es

- **El video** es la página `https://citas.casadealabanzasd.com/video`: una
  animación de unos 30 segundos hecha con código (no se grabó nada). Sale en
  español, inglés o vietnamita, según el teléfono, y trae el botón
  **«Haz tu cita»**.
- **El código para GoDaddy** es el archivo `public/cajita-video.js` de este
  repositorio, publicado en `https://citas.casadealabanzasd.com/cajita-video.js`.
  Pone la portada del video (o un botón flotante) y, al tocarla, abre el
  video encima de la página de la iglesia, con una ✕ para cerrarlo (también
  se cierra con Esc o tocando afuera).
- Si cambiamos el video o el diseño aquí, en la página de la iglesia se
  actualiza solo. No hay que volver a entrar a GoDaddy.

**Antes de pegar nada en GoDaddy, el código tiene que estar publicado** (el
commit subido a `main`). Para comprobarlo, abre
`https://citas.casadealabanzasd.com/video` en el teléfono.

---

## Opción 1: la portada del video en un lugar de la página (la segura)

GoDaddy siempre tiene la sección «HTML».

1. GoDaddy → **Websites + Marketing** → **Edit Website** (Editar sitio).
2. En la página **Inicio**, donde quieras el video (por ejemplo, después
   de «Información»), toca **Add Section** (Agregar sección).
3. Busca **HTML** y escoge **Embed custom code on the page** (Insertar código
   personalizado).
4. En **Custom Code** pega exactamente esto:

   ```html
   <div id="cajita-de-bendicion"></div>
   <script src="https://citas.casadealabanzasd.com/cajita-video.js"></script>
   ```

5. **Done** y luego **Publish** (Publicar).

Notas:

- En el editor, GoDaddy enseña un recuadro gris en lugar de la portada:
  **solo se ve en la página ya publicada.**
- GoDaddy pone esta sección dentro de un recuadro. Por eso el video no puede
  salirse de él: al tocarlo se abre en **pantalla completa** y, si GoDaddy no
  lo deja, se abre en **otra pestaña**. Las dos formas se probaron.
- Si la portada sale cortada, en las opciones de la sección súbele la
  altura.

## Opción 2: un botón flotante en todas las páginas (si tu cuenta lo tiene)

Algunas cuentas de GoDaddy traen un campo de código para todo el sitio:
**Settings** (Configuración) → **Head HTML**. GoDaddy no lo documenta, así
que hay que ver si aparece.

Si aparece, pega solo esta línea:

```html
<script src="https://citas.casadealabanzasd.com/cajita-video.js" defer></script>
```

Sale un botón naranja «▶ Cajita de Bendición» abajo a la izquierda, en todas
las páginas. Al tocarlo, el video se abre **encima de toda la página**, que
es lo más parecido a un video emergente.

Si usas las dos opciones, no pasa nada: el código se carga una sola vez.

## Opción 3 (extra): el aviso emergente de GoDaddy al entrar

GoDaddy trae su propio emergente: **Website** → **Popup** (en los atajos de
abajo del editor). Lleva título, texto, un botón y la opción de esperar
unos segundos; quien lo cierra no lo vuelve a ver en 24 horas. Sugerencia:

| Campo | Texto |
|---|---|
| Título | Cajita de Bendición |
| Texto | Despensa gratuita los lunes y jueves. Mira cómo funciona y haz tu cita desde tu teléfono. |
| Botón | Ver el video |
| Enlace del botón | `https://citas.casadealabanzasd.com/video` |

---

## Algo que ya está en la página de la iglesia

En «Información» ya hay una tarjeta **Cajita de Bendición** con horario
**lunes y jueves, 3:30 a 5:00 PM** y un **QR**. Revisar con el pastor:

- El horario no coincide con el del sistema (los horarios de cada día salen
  en `https://citas.casadealabanzasd.com/calendario`).
- A dónde lleva ese QR. Si es el Google Form de antes, hay que cambiarlo por
  uno que lleve a `https://citas.casadealabanzasd.com/`.
