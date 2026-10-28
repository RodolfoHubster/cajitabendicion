# El video de Cajita de Bendición en casadealabanzasd.com

Pedido del Pastor David (27 de octubre de 2026): que al entrar a la página
de la iglesia salga, en la esquina, **un video de la entrega** (el que él
mande) reproduciéndose solo; que al tocarlo se vea más grande, con **«Más
información»** (la presentación animada) y de ahí **«Haz tu cita»**. Y
«Cajita de Bendición» en el menú de arriba.

**No se toca el dominio, el DNS ni el correo.** Solo se pega código en el
editor de GoDaddy, igual que cualquier otra sección. Se quita borrando esa
sección o esa línea.

---

## Qué es

- **El video del pastor** va en `public/medios/entrega.mp4` (y su portada,
  `public/medios/entrega.jpg`). Mientras no esté, en la esquina sale una
  miniatura que abre la presentación.
- **La presentación** («Más información») es la página
  `https://citas.casadealabanzasd.com/video`: una animación de unos 30
  segundos hecha con código. Sale en español, inglés o vietnamita, según el
  teléfono, y termina en **«Haz tu cita»**.
- **El código para GoDaddy** es el archivo `public/cajita-video.js` de este
  repositorio, publicado en `https://citas.casadealabanzasd.com/cajita-video.js`.
  - En la sección donde se pega: una franja delgada, «¿Qué es Cajita de
    Bendición? Mira el video».
  - En la **esquina inferior derecha** de la página, a los pocos segundos:
    el video del pastor, chico, **reproduciéndose solo y sin sonido**, con su
    ✕. (A quien tiene activado «ahorrar datos» o «menos movimiento» no le
    arranca solo.)
  - Al tocarlo (o la franja), crece a una **ventana en la misma esquina**,
    nunca a pantalla completa, **con sonido** y el botón **«Más
    información»**: la presentación, que termina en **«Haz tu cita»**. «‹»
    regresa al video, «–» lo hace chico otra vez y ✕ lo quita. Quien lo
    quita no lo vuelve a ver solo mientras siga en la página.
  - GoDaddy pone la sección dentro de un recuadro, pero con permiso para
    tocar la página: por eso la ventanita puede salir en la esquina de toda
    la página y no dentro del recuadro.
- Si cambiamos el video o el diseño aquí, en la página de la iglesia se
  actualiza solo. No hay que volver a entrar a GoDaddy.

**Antes de pegar nada en GoDaddy, el código tiene que estar publicado** (el
commit subido a `main`). Para comprobarlo, abre
`https://citas.casadealabanzasd.com/video` en el teléfono.

---

## El video del pastor

1. Que el pastor lo mande tal cual sale del teléfono. Mejor de **menos de un
   minuto**; puede ser vertical u horizontal.
2. **Cuidado con quién sale:** parte de la gente que recibe despensa tiene
   un estatus migratorio delicado. Que no se vean caras de quienes reciben
   sin su permiso (mejor voluntarios, cajas, el pastor).
3. Se comprime (para que cargue rápido con datos del celular) y se publica
   como `public/medios/entrega.mp4`, con su portada `public/medios/entrega.jpg`.
   Con `ffmpeg`:

   ```bash
   ffmpeg -i original.mp4 -vf "scale='min(720,iw)':-2" -c:v libx264 -crf 28 -preset slow -c:a aac -b:a 96k -movflags +faststart public/medios/entrega.mp4
   ```

   ```bash
   ffmpeg -i public/medios/entrega.mp4 -ss 1 -frames:v 1 -q:v 3 public/medios/entrega.jpg
   ```

4. Commit y push. **En GoDaddy no se toca nada:** la esquina lo toma sola.

Para cambiarlo después, se reemplazan esos dos archivos.

## «Cajita de Bendición» en el menú de arriba

En el editor de GoDaddy, a la derecha, pestaña **SITIO WEB** (las páginas):

1. Toca **+** (Agregar) y escoge **Nuevo enlace externo**.
2. Título: **Cajita de Bendición** (máximo 25 letras).
3. Enlace: `https://citas.casadealabanzasd.com`
4. Activa **Mostrar en la navegación**.
5. **Crear enlace** y luego **Publicar**.

Sale en el menú junto a Inicio, Eventos y Quiénes somos, y lleva directo al
sistema de citas.

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
- Si algún día GoDaddy le quita a la sección el permiso de tocar la
  página, la ventanita ya no sale en la esquina y la franja abre el video en
  otra pestaña.

## Opción 2: un botón flotante en todas las páginas (si tu cuenta lo tiene)

Algunas cuentas de GoDaddy traen un campo de código para todo el sitio:
**Settings** (Configuración) → **Head HTML**. GoDaddy no lo documenta, así
que hay que ver si aparece.

Si aparece, pega solo esta línea:

```html
<script src="https://citas.casadealabanzasd.com/cajita-video.js" defer></script>
```

El video de la esquina sale entonces en todas las páginas, no solo en la que
tiene la sección. No hace falta: con la Opción 1 ya sale en la esquina.

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
