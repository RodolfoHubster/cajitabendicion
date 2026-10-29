/**
 * Manda los correos pendientes por Amazon SES (seccion 54 de schema.sql).
 *
 * Corre en Supabase (Edge Function, Deno). La base la llama cada minuto
 * (supabase/correo/programar-envios.sql); tambien se puede llamar a mano
 * para probar. Toma hasta 50 pendientes, arma cada correo y lo manda; si
 * Amazon falla, el correo se queda pendiente y se reintenta (5 veces).
 *
 * Secretos (Supabase -> Edge Functions -> Secrets, nunca en el repo):
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  el usuario de AWS que solo manda correos
 *   AWS_REGION        us-west-2 (donde se dio de alta el dominio en SES)
 *   CORREOS_SECRETO   la contrasena que manda la base al llamar (x-cajita-secreto)
 *   CORREO_REMITENTE  citas@envios.casadealabanzasd.com (opcional)
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo: la
 * service_role se queda aqui adentro, nunca llega al navegador.
 *
 * Guia completa: docs/correos.md
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'
import QRCode from 'npm:qrcode@1.5.4'
import { AwsClient } from 'npm:aws4fetch@1.0.20'
import { aBase64, armarCorreo, armarMime } from './correo.js'

const REGION = Deno.env.get('AWS_REGION') ?? 'us-west-2'
const REMITENTE = Deno.env.get('CORREO_REMITENTE') ?? 'citas@envios.casadealabanzasd.com'
const SITIO = 'https://citas.casadealabanzasd.com'
const SECRETO = Deno.env.get('CORREOS_SECRETO')
const POR_VUELTA = 50

//  Errores de Amazon que no se arreglan reintentando: el correo esta mal
//  escrito o Amazon no lo acepta. Los demas (limite, pausa) se reintentan.
const DEFINITIVOS = ['BadRequestException', 'MessageRejected']

const base = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const amazon = new AwsClient({
  accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') ?? '',
  secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '',
  region: REGION,
  service: 'ses',
})

//  El mismo QR que la pantalla de confirmacion: el token, en el azul del logo.
function dibujarQR(token) {
  return QRCode.toBuffer(token, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 480,
    color: { dark: '#1B3A6B', light: '#FFFFFF' },
  })
}

async function mandar(c) {
  const correo = armarCorreo(c, { sitio: SITIO })
  const qr = c.tipo === 'confirmacion' ? new Uint8Array(await dibujarQR(c.token_qr)) : null
  const mime = armarMime({ de: REMITENTE, para: c.email, ...correo, qr })

  const respuesta = await amazon.fetch(`https://email.${REGION}.amazonaws.com/v2/email/outbound-emails`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      FromEmailAddress: REMITENTE,
      Destination: { ToAddresses: [c.email] },
      Content: { Raw: { Data: aBase64(mime) } },
    }),
  })
  const cuerpo = await respuesta.json().catch(() => ({}))

  if (respuesta.ok) return { enviado: true, idMensaje: cuerpo.MessageId ?? null }

  const tipo = (respuesta.headers.get('x-amzn-errortype') ?? cuerpo.__type ?? '').split(':')[0]
  return {
    enviado: false,
    definitivo: DEFINITIVOS.includes(tipo),
    error: `${respuesta.status} ${tipo} ${cuerpo.message ?? cuerpo.Message ?? ''}`.trim(),
  }
}

Deno.serve(async (peticion) => {
  //  Solo la base (o quien tenga el secreto) puede pedir que se manden.
  if (!SECRETO || peticion.headers.get('x-cajita-secreto') !== SECRETO) {
    return new Response('No autorizado', { status: 401 })
  }

  const { data: pendientes, error } = await base.rpc('correos_por_enviar', { p_limite: POR_VUELTA })
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  let enviados = 0
  let fallidos = 0
  for (const c of pendientes ?? []) {
    let resultado
    try {
      resultado = await mandar(c)
    } catch (e) {
      resultado = { enviado: false, definitivo: false, error: String(e?.message ?? e) }
    }

    await base.rpc('marcar_correo', {
      p_id: c.id,
      p_enviado: resultado.enviado,
      p_id_mensaje: resultado.idMensaje ?? null,
      p_error: resultado.error ?? null,
      p_definitivo: resultado.definitivo ?? false,
    })

    if (resultado.enviado) enviados += 1
    else fallidos += 1
  }

  return Response.json({ enviados, fallidos })
})
