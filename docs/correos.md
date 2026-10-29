# Correos automáticos (Amazon SES)

Decisión del 28 de octubre de 2026, con el visto bueno del Pastor David para
el gasto de Amazon SES.

## Qué se manda

| Correo | Cuándo | Qué lleva |
|---|---|---|
| **Confirmación** | Al hacer la cita (registro público, desde el panel con correo, acompañantes) | Fecha, hora, fila, lugar, **su QR dentro del correo**, su código CB y el botón «Ver mi cita» |
| **Se canceló la entrega** | Cuando el administrador cancela la entrega de un día (Horarios → incidencia) | El día, el mensaje que escribió la iglesia y el botón «Hacer otra cita» |
| **Se movió la entrega** | Cuando el administrador mueve la entrega a otra fecha | De qué día a qué día, a la misma hora; su mismo código sirve |

- Sale en el idioma en que la persona se registró: español, inglés o vietnamita.
- **Nadie los contesta.** El correo dice que no se responda y da el teléfono
  de la iglesia.
- Solo lleva lo necesario: nombre de pila, fecha, hora, código y QR. Ni
  domicilio ni teléfono. Al final, el aviso de que su información no se
  comparte con nadie, tampoco con las autoridades.
- Quien no tiene correo (registro desde el panel para un adulto mayor, turno
  a pie sin datos) no recibe nada.

### El boletín (aparte)

En el registro hay una casilla **sin marcar**: «Quiero recibir por correo
avisos e información general de la iglesia (opcional)». Solo si la palomea,
su correo entra a la tabla `boletin`, con su idioma y la fecha en que dio el
permiso. Sin la casilla no se guarda nada ahí.

**Todavía no se manda ningún boletín.** Falta la pantalla del panel para
escribirlo y mandarlo; cada boletín llevará el enlace «darme de baja»
(`boletin.token_baja`).

## Cómo funciona

```
cita nueva / entrega cancelada o movida
        │  (misma operación en la base)
        ▼
tabla correos: pendiente
        │  cada minuto, pg_cron llama a la función
        ▼
enviar-correos (Supabase, Edge Function) ──► Amazon SES ──► la persona
        │
        ▼
enviado · o pendiente otra vez (reintenta hasta 5) · o fallo
```

- Si Amazon falla, la cita no se pierde ni se traba: el correo se queda
  pendiente y se reintenta.
- Si la persona cancela antes de que salga la confirmación, ya no sale.
- Los correos de fechas que ya pasaron no salen (por si SES tarda en estar
  listo: no le llegan a nadie confirmaciones viejas).
- Las llaves de Amazon viven en los **secretos de Supabase**. Nunca en el
  repo, nunca en el navegador.

| Pieza | Dónde |
|---|---|
| Tablas `correos` y `boletin`, y sus funciones | `supabase/schema.sql`, sección 54 (migración `2026-10-28-correos-y-boletin.sql`) |
| La función que los manda | `supabase/functions/enviar-correos/` (`index.js` y `correo.js`, que trae los textos y la plantilla) |
| Que corra cada minuto | `supabase/correo/programar-envios.sql` |
| Pruebas | `src/datos/correo.test.js` (plantilla) y `supabase/pruebas/reglas.sql`, sección 54 (base) |

---

## Ponerlo en marcha

**Primero todo en la base de pruebas** (`cajita-muestra`) y, cuando ahí
funcione, lo mismo en la real.

### 1. La migración

SQL Editor → pegar `supabase/migraciones/2026-10-28-correos-y-boletin.sql` →
Run. **Antes de subir el código** de la página de registro: el registro
nuevo manda `p_idioma` y `p_boletin`, y sin la migración la base no los
reconoce.

Desde ese momento cada cita nueva deja su correo pendiente. Mientras Amazon
no esté listo, solo esperan.

### 2. La cuenta de AWS (la iglesia)

Yo no puedo crear cuentas ni poner la tarjeta: lo hace el pastor o tú con
él, **a nombre de la iglesia**, para que la iglesia sea la dueña.

1. Crear la cuenta en <https://aws.amazon.com> con un correo de la iglesia y
   la tarjeta autorizada.
2. Activar la verificación en dos pasos (MFA) de la cuenta principal.
3. Arriba a la derecha, región **US West (Oregon) `us-west-2`**. Todo lo que
   sigue va en esa región.

### 3. El dominio en SES

**Amazon SES → Identities → Create identity → Domain**

- Dominio: `envios.casadealabanzasd.com`. **No** `citas.casadealabanzasd.com`:
  ese ya tiene el CNAME de la página y no admite más registros (ver
  `docs/infraestructura.md`).
- *Easy DKIM*, RSA 2048.
- *Use a custom MAIL FROM domain*: `bounce.envios.casadealabanzasd.com`. Si
  el MX falla: *Use default MAIL FROM*.

Amazon enseña los registros que hay que poner. En GoDaddy → el dominio → DNS
→ **Agregar registro nuevo**, uno por uno. En «Nombre» va solo la parte de
antes de `.casadealabanzasd.com` (GoDaddy pone el resto):

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `xxxx._domainkey.envios` (tres, los que dé Amazon) | `xxxx.dkim.amazonses.com` |
| MX | `bounce.envios` | `feedback-smtp.us-west-2.amazonses.com`, prioridad 10 |
| TXT | `bounce.envios` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc.envios` | `v=DMARC1; p=none;` |

**No tocar** los registros `@` (el MX y el SPF del Outlook del pastor) ni el
CNAME `citas`. Todo lo de arriba es nuevo y solo de `envios`.

Amazon dice «Verified» en unos minutos (puede tardar hasta 72 horas).

### 4. Salir del modo de prueba de SES

Al principio SES está en *sandbox*: solo manda a correos verificados.
Para probar, verifica el tuyo: **Identities → Create identity → Email
address**.

Para mandarle a todos: **SES → Account dashboard → Request production
access**:

- *Mail type*: **Transactional**
- *Website URL*: `https://citas.casadealabanzasd.com`
- *Use case description* (en inglés, lo revisa Amazon):

> Cajita de Bendición is a free food distribution run by Iglesia Casa de
> Alabanza, a nonprofit church in San Diego, CA. People book an appointment at
> https://citas.casadealabanzasd.com and enter their own email address. We send
> only transactional emails: a confirmation with the appointment date, time
> and QR code right after booking, and a notice if the church cancels or moves
> a distribution day. Expected volume is about 500 to 1,000 emails per week.
> Every address comes from the person's own booking form; we never use
> purchased lists. Bounces and complaints are handled by the SES account-level
> suppression list, and permanently rejected messages are not retried. An
> optional newsletter will only go to people who check an unchecked opt-in box,
> with an unsubscribe link in every message.

Tarda alrededor de un día.

### 5. Un usuario que solo puede mandar correos

**IAM → Users → Create user**: `cajita-correos`, sin acceso a la consola.
Permisos → *Create inline policy* → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*",
      "Condition": { "StringEquals": { "ses:FromAddress": "citas@envios.casadealabanzasd.com" } }
    }
  ]
}
```

Luego **Security credentials → Create access key** (uso: *Application
running outside AWS*). Amazon enseña la llave secreta **una sola vez**: va
directo al paso 6, no a un chat, un correo ni un archivo del repo.

### 6. La función en Supabase

Con la terminal en la carpeta del proyecto:

```bash
npx supabase login
```

```bash
npx supabase functions deploy enviar-correos --project-ref ID-DEL-PROYECTO
```

`ID-DEL-PROYECTO` es lo que va antes de `.supabase.co` en la dirección del
proyecto. `supabase/config.toml` ya dice que la función es `index.js` y que no
pide sesión de usuario (la protege su propio secreto).

Luego, en Supabase → **Edge Functions → Secrets**, agregar:

| Nombre | Valor |
|---|---|
| `AWS_ACCESS_KEY_ID` | la del paso 5 |
| `AWS_SECRET_ACCESS_KEY` | la del paso 5 |
| `AWS_REGION` | `us-west-2` |
| `CORREOS_SECRETO` | una contraseña larga al azar (abajo) |

Para sacar la contraseña al azar:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### 7. Probarla a mano

Haz una cita en la base de pruebas con tu correo (el verificado del paso 4)
y llama a la función:

```bash
curl -X POST https://ID-DEL-PROYECTO.supabase.co/functions/v1/enviar-correos -H "x-cajita-secreto: EL-SECRETO"
```

Debe contestar `{"enviados":1,"fallidos":0}` y llegarte el correo. Si dice
`fallidos`, en el SQL Editor:

```sql
select tipo, estado, intentos, error, creado_en
  from correos order by creado_en desc limit 20;
```

### 8. Que corra solo, cada minuto

SQL Editor → `supabase/correo/programar-envios.sql`, cambiando las dos cosas
marcadas con `<<< >>>` (la dirección de la función y el mismo
`CORREOS_SECRETO`). Se corre una sola vez.

Para apagarlo: `select cron.unschedule('enviar-correos');`

---

## Revisar cómo va

```sql
select estado, count(*) from correos group by estado;
```

```sql
select count(*) from boletin where baja_en is null;
```

## Costo

Amazon SES cobra 10 centavos de dólar por cada 1,000 correos. Con unas 500
citas por semana sale en menos de un dólar al mes. Las funciones de Supabase
entran en el plan gratis.
