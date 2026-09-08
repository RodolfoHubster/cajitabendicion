# Infraestructura

Estado del dominio, hosting y correo. Este documento describe configuración
que vive **fuera del repositorio**, en paneles web. Nada de lo que está aquí
se puede cambiar con código.

---

## Resumen rápido

| Pieza | Dónde vive | Estado |
|---|---|---|
| Dominio `casadealabanzasd.com` | GoDaddy | Propiedad de la iglesia. Activo. |
| Sitio público de la iglesia | GoDaddy Website Builder | Activo. **No se toca.** |
| Correo de la iglesia | Microsoft 365 | Activo. **No se toca.** |
| Sistema de citas | Cloudflare Pages | Proyecto `cajitabendicion` |
| URL temporal del sistema | `cajitabendicion.pages.dev` | Activa |
| URL final del sistema | `citas.casadealabanzasd.com` | **Pendiente** |

---

## Decisión de fondo: subdominio, no reemplazo

El Pastor David planteó cancelar GoDaddy y mover todo. Se descartó por dos
razones:

1. Él administra su sitio por bloques, sin código. Reemplazarlo significaría
   quitarle esa autonomía o reconstruir el sitio completo, y eso no cabe en
   el periodo del proyecto.
2. Cancelar un dominio es irreversible. Si alguien más lo registra, la iglesia
   pierde la dirección que ya está impresa en volantes y publicada en redes.

**La solución**: el sitio de la iglesia se queda intacto y el sistema vive en
un subdominio. En la página principal solo se agrega un botón "Hacer una cita"
que apunta a `citas.casadealabanzasd.com`.

---

## GoDaddy

Nameservers: `ns63.domaincontrol.com` / `ns64.domaincontrol.com`.
El DNS lo administra GoDaddy. **No cambiar los nameservers.**

### Registros existentes (18 en total)

Los relevantes:

| Tipo | Nombre | Apunta a | Función |
|---|---|---|---|
| A | `@` | WebsiteBuilder Site | El sitio de la iglesia |
| CNAME | `www` | `casadealabanzasd.com` | El sitio con www |
| MX | `@` | `casadealabanzasd-com.mail.protection.outlook.com` | **Correo de la iglesia** |
| TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | **SPF del correo** |
| TXT | `@` | dos registros `NETORGFT*.onmicrosoft.com` | Verificación de Microsoft |
| CNAME | `autodiscover` | `autodiscover.outlook.com` | Outlook |
| CNAME | `msoid`, `sip`, `lyncdiscover` | Microsoft | Teams / Skype |
| SRV | `_sip._tls`, `_sipfederationtls._tcp` | Microsoft | Teams |

### Regla absoluta

**Solo se agregan registros. Nunca se editan ni se borran los existentes.**

- Tocar el `MX` o los `TXT` deja a la iglesia sin correo.
- Tocar el `A @` o el `CNAME www` tumba el sitio.
- El síntoma de romper el correo aparece días después y es difícil de
  diagnosticar, por eso la regla es tajante.

### Registro pendiente de agregar

| Campo | Valor |
|---|---|
| Type | `CNAME` |
| Name | `citas` |
| Value | `cajitabendicion.pages.dev` |
| TTL | 1 Hour |

Dos errores comunes al capturarlo:

- En **Name** va solo la palabra `citas`. GoDaddy le agrega el dominio solo.
  Si escribes el dominio completo queda `citas.casadealabanzasd.com.casadealabanzasd.com`.
- En **Value** va el host pelón, sin `https://` y sin diagonal al final.

### Acceso

El Pastor David compartió las credenciales. Lo correcto es migrar a
**Delegate Access** de GoDaddy: le permite dar acceso a otra cuenta sin
compartir su contraseña, y revocarlo al terminar el proyecto. El dominio le
pertenece a la iglesia.

---

## Cloudflare Pages

- Proyecto: `cajitabendicion`
- Repositorio conectado: `RodolfoHubster/cajitabendicion`, rama `main`
- Despliegue automático en cada push a `main`

### Configuración de build

| Campo | Valor |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

Nota: en el selector de presets, **Vite** y **VitePress** son cosas distintas.
VitePress es un generador de documentación y su configuración de build no
sirve aquí.

### Variables de entorno

Se configuran en el panel de Cloudflare, no en el repo:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Vite congela las variables al momento de compilar. Si se cambian, hay que
volver a desplegar para que surtan efecto.

### `public/_redirects`

```
/*    /index.html   200
```

Sin esta línea, React Router funciona al navegar dentro de la app, pero da 404
al recargar la página o al abrir un enlace directo. Y eso va a pasar, porque
la gente comparte enlaces y recarga.

### Dominio personalizado

En el proyecto, pestaña **Custom domains**, agregar
`citas.casadealabanzasd.com`. Cloudflare verifica el CNAME y emite solo el
certificado de seguridad. Si queda en pendiente más de quince minutos, casi
siempre es el error de nombre duplicado descrito arriba.

---

## Correo transaccional (pendiente)

El sistema necesita mandar confirmaciones con el código QR. Proveedor
elegido: **Amazon SES**, por costo — alrededor de 8,000 correos al mes salen
en menos de un dólar, contra unos veinte dólares en otros servicios.

### Advertencia importante sobre el SPF

El registro SPF del dominio termina en `-all`, que significa "rechaza
cualquier correo que no venga de Outlook". Si el sistema manda correos como
`@casadealabanzasd.com` desde SES, **van a rebotar o caer en spam**.

**No modificar ese SPF.** La solución es mandar desde el subdominio:

- Remitente: `citas@citas.casadealabanzasd.com`
- El SPF y el DKIM de SES se configuran bajo `citas.casadealabanzasd.com`,
  que es territorio nuevo y vacío
- El correo de la iglesia queda intacto

Beneficio adicional: si los correos del sistema llegaran a tener problemas de
reputación por volumen, no arrastran al correo del pastor.

---

## Costos

| Concepto | Mensual |
|---|---|
| Dominio | Ya lo paga la iglesia, sin costo adicional |
| Cloudflare Pages | $0 |
| Supabase | $0 en plan gratis, $25 en Pro |
| Amazon SES | Menos de $1 |
| **Total** | **$0 a $26 USD** |

Al Pastor David se le presentó un estimado de alrededor de $20 mensuales.

---

## Propiedad

Pendiente de dejar por escrito: el dominio, la base de datos, la información
de las familias y el código son propiedad de la organización. También falta
definir quién dará soporte al terminar el periodo del proyecto.
