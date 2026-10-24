import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleCheck, LuCopy, LuDownload, LuHandHeart, LuMail, LuMessageCircle, LuShieldAlert, LuX } from 'react-icons/lu'
import { EsqueletoQR } from './Esqueleto'
import { dibujarTarjetaCredencial, nombreArchivoCredencial } from '../datos/credencial'
import { horaDeMarca } from '../datos/filaAPie'
import { guardarImagen } from '../datos/imagenCita'
import { dibujarQRVoluntario } from '../datos/qrPase'
import {
  enlaceCorreoCredencial,
  enlaceCredencial,
  enlaceWhatsAppCredencial,
  marcarCredencialEnviada,
  mensajeCredencial,
  telefonoBonito,
} from '../datos/voluntarios'

const BOTON =
  'inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-principal px-4 text-base font-semibold text-principal transition hover:bg-principal/10'

/** '2026-10-23T13:05:00' -> '23 oct, 1:05 PM'. */
function cuando(marca, idioma) {
  const dia = new Intl.DateTimeFormat(idioma, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${String(marca).slice(0, 10)}T12:00:00Z`),
  )
  return `${dia}, ${horaDeMarca(marca)}`
}

/**
 * La credencial de un voluntario, desde el panel (secciones 48 y 49): su QR
 * para guardarlo o imprimirlo, y mandarsela por WhatsApp o por correo. Se
 * manda desde el telefono de quien la manda, con el mensaje ya escrito,
 * como las invitaciones de "sin cita": nada sale solo. Al volver, se
 * pregunta si se envio; con "Si" queda anotado por donde y cuando.
 *
 * voluntario: { id, nombre, token, activo, telefono, correo, enviada_en, enviada_medio }.
 * alEnviada: para que la lista se vuelva a pedir.
 */
export default function VentanaCredencial({ voluntario, alCerrar, alEnviada }) {
  const { t, i18n } = useTranslation()
  const [qr, setQr] = useState(null)
  // La tarjeta se dibuja al llegar: el iPhone solo abre "compartir" si se
  // pide en el mismo toque (ver datos/imagenCita.js).
  const [tarjeta, setTarjeta] = useState(null)
  const [guardado, setGuardado] = useState(null)
  const [copiado, setCopiado] = useState(false)
  //  'whatsapp' | 'correo' mientras se pregunta si se envio.
  const [preguntando, setPreguntando] = useState(null)
  const [enviada, setEnviada] = useState(
    voluntario.enviada_en ? { en: voluntario.enviada_en, medio: voluntario.enviada_medio } : null,
  )
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    dibujarQRVoluntario(voluntario.token)
      .then((imagen) => {
        if (vigente) setQr(imagen)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [voluntario.token])

  useEffect(() => {
    if (!qr) return undefined
    let vigente = true
    dibujarTarjetaCredencial({ qr, nombre: voluntario.nombre, t })
      .then((blob) => {
        if (vigente) setTarjeta(blob)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [qr, voluntario.nombre, t])

  useEffect(() => {
    const escape = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [alCerrar])

  const enlace = enlaceCredencial(voluntario.token)
  const mensaje = mensajeCredencial(t, voluntario.nombre, enlace)
  const whatsapp = enlaceWhatsAppCredencial(voluntario.telefono, mensaje)
  const correo = enlaceCorreoCredencial(voluntario.correo, t('voluntarios.envio.asunto'), mensaje)

  async function guardar() {
    setGuardado(null)
    try {
      const blob = tarjeta ?? (await (await fetch(qr)).blob())
      setGuardado(await guardarImagen(blob, nombreArchivoCredencial(voluntario.nombre)))
    } catch {
      setGuardado('descargada')
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  async function confirmar(medio) {
    setOcupado(true)
    setError(null)
    try {
      const en = await marcarCredencialEnviada(voluntario.id, medio)
      setEnviada({ en, medio })
      setPreguntando(null)
      alEnviada?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div
      aria-labelledby="ventana-credencial-titulo"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end justify-center bg-principal/40 p-0 sm:items-center sm:p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) alCerrar()
      }}
      role="dialog"
    >
      <div className="ventana-sube max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-principal/10 bg-superficie px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-bold text-puede-pasar">
              <LuHandHeart aria-hidden="true" className="h-5 w-5" />
              {t('credencial.etiqueta')}
            </p>
            <h2 className="truncate text-xl font-bold text-principal" id="ventana-credencial-titulo">
              {voluntario.nombre}
            </h2>
          </div>
          <button
            aria-label={t('detalle.cerrar')}
            className="-mr-2 flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl text-principal transition hover:bg-principal/10"
            onClick={alCerrar}
            type="button"
          >
            <LuX aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {!qr && <EsqueletoQR texto={t('credencial.cargando')} />}

          {qr && (
            <>
              {voluntario.activo === false && (
                <p className="rounded-xl bg-ya-recibio/10 p-3 text-base font-semibold text-ya-recibio" role="alert">
                  {t('credencial.inactiva')}
                </p>
              )}

              <img
                alt={t('credencial.qrAlt', { nombre: voluntario.nombre })}
                className="aparecer mx-auto w-full max-w-[14rem] rounded-xl border-4 border-puede-pasar/60 bg-white p-2 shadow-sm"
                src={qr}
              />

              {/* Mandarsela: desde este telefono, con el mensaje ya escrito. */}
              <section aria-labelledby="mandar-credencial" className="space-y-2 rounded-xl border border-principal/15 p-3">
                <h3 className="text-lg font-bold text-principal" id="mandar-credencial">
                  {t('voluntarios.envio.titulo')}
                </h3>
                <p
                  className={`flex items-start gap-2 text-base ${enviada ? 'font-semibold text-puede-pasar' : 'text-principal/80'}`}
                  role="status"
                >
                  {enviada && <LuCircleCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />}
                  {enviada
                    ? t(`voluntarios.envio.enviada.${enviada.medio}`, { cuando: cuando(enviada.en, i18n.language) })
                    : t('voluntarios.envio.noEnviada')}
                </p>

                {whatsapp && (
                  <a
                    className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-base font-bold text-sobre-accion shadow-sm transition hover:brightness-95"
                    href={whatsapp}
                    onClick={() => setPreguntando('whatsapp')}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <LuMessageCircle aria-hidden="true" className="h-5 w-5" />
                    {t('voluntarios.envio.porWhatsApp', { telefono: telefonoBonito(voluntario.telefono) })}
                  </a>
                )}
                {correo && (
                  <a className={BOTON} href={correo} onClick={() => setPreguntando('correo')}>
                    <LuMail aria-hidden="true" className="h-5 w-5" />
                    <span className="min-w-0 truncate">{t('voluntarios.envio.porCorreo', { correo: voluntario.correo })}</span>
                  </a>
                )}
                {!whatsapp && !correo && (
                  <>
                    <p className="text-base text-principal">{t('voluntarios.envio.sinContacto')}</p>
                    {!enviada && (
                      <button className={BOTON} disabled={ocupado} onClick={() => confirmar('impresa')} type="button">
                        {t('voluntarios.envio.yaImpresa')}
                      </button>
                    )}
                  </>
                )}

                {preguntando && (
                  <div className="space-y-2 rounded-xl border-2 border-accion bg-accion/10 p-3" role="alertdialog">
                    <p className="text-base font-semibold text-principal">{t(`voluntarios.envio.pregunta.${preguntando}`)}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="inline-flex min-h-12 items-center rounded-xl bg-marca px-4 text-base font-semibold text-white disabled:opacity-50"
                        disabled={ocupado}
                        onClick={() => confirmar(preguntando)}
                        type="button"
                      >
                        {t('voluntarios.envio.si')}
                      </button>
                      <button
                        className="inline-flex min-h-12 items-center rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold text-principal"
                        onClick={() => setPreguntando(null)}
                        type="button"
                      >
                        {t('voluntarios.envio.no')}
                      </button>
                    </div>
                  </div>
                )}
                {error && (
                  <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
                    {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
                  </p>
                )}
              </section>

              <div className="grid gap-2">
                <button className={BOTON} onClick={guardar} type="button">
                  <LuDownload aria-hidden="true" className="h-5 w-5" />
                  {t('confirmacion.guardarImagen')}
                </button>
                <button className={BOTON} onClick={copiar} type="button">
                  <LuCopy aria-hidden="true" className="h-5 w-5" />
                  {copiado ? t('personas.copiado') : t('credencial.copiar')}
                </button>
              </div>

              {guardado === 'descargada' && (
                <p className="rounded-xl bg-principal/5 p-3 text-base text-principal" role="status">
                  {t('confirmacion.descargada')}
                </p>
              )}

              <p className="flex items-start gap-2 rounded-xl bg-principal/5 p-3 text-base text-principal">
                <LuShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
                {t('credencial.cuidado')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
