import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCopy, LuDownload, LuPlus, LuQrCode, LuTrash2 } from 'react-icons/lu'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Tarjeta from '../../componentes/Tarjeta'
import { Hueso } from '../../componentes/Esqueleto'
import {
  agregarQr,
  copiarImagen,
  dibujarCartelQr,
  leerQrs,
  nombreArchivoQr,
  normalizarUrl,
  quitarQr,
  urlParaMostrar,
} from '../../datos/cartelQr'
import { leerQRDeImagen } from '../../datos/escaneo'
import { guardarImagen } from '../../datos/imagenCita'
import { ORGANIZACION } from '../../datos/organizacion'

const dibujar = ({ url, texto }) =>
  dibujarCartelQr({ url, mensaje: texto, programa: ORGANIZACION.programa, iglesia: ORGANIZACION.iglesia })

/**
 * Codigos QR con el logo de Cajita de Bendicion, para cualquier pagina (del
 * sistema o no): carteles para la fila, volantes, redes.
 *
 * Cada QR que se crea queda aparte en la lista, con su imagen para descargar
 * o copiar; crear otro no cambia los anteriores. Antes de crearlo se vuelve
 * a leer con el mismo lector del escaner: si una direccion no se pudiera
 * leer, no se crea (nunca se entrega un QR que no sirve).
 */
export default function CodigosQr() {
  const { t } = useTranslation()
  const [qrs, setQrs] = useState(() => leerQrs())
  const [url, setUrl] = useState('')
  const [texto, setTexto] = useState('')
  const [tocado, setTocado] = useState(false)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState(null)

  const revisada = normalizarUrl(url)
  const errorUrl = tocado && revisada.error ? t(`codigosQr.errores.${revisada.error}`) : undefined

  async function crear(evento) {
    evento.preventDefault()
    setTocado(true)
    setError(null)
    if (!revisada.url) return

    setCreando(true)
    try {
      //  Se revisa que el QR se lea antes de guardarlo.
      const blob = await dibujar({ url: revisada.url, texto })
      const vista = URL.createObjectURL(blob)
      const leido = await leerQRDeImagen(vista).catch(() => null)
      URL.revokeObjectURL(vista)
      if (leido !== revisada.url) {
        setError('NO_SE_PUDO')
        return
      }
      setQrs(agregarQr({ url: revisada.url, texto }))
      setUrl('')
      setTexto('')
      setTocado(false)
    } catch {
      setError('NO_SE_PUDO')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="text-2xl font-bold">{t('codigosQr.titulo')}</h1>
        <p className="mb-4 text-base text-principal/70">{t('codigosQr.ayuda')}</p>

        <form className="space-y-4" noValidate onSubmit={crear}>
          <Campo
            error={errorUrl}
            etiqueta={t('codigosQr.url')}
            id="qr-url"
            inputMode="url"
            onBlur={() => url && setTocado(true)}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            placeholder="citas.casadealabanzasd.com"
            value={url}
          />
          <Campo
            etiqueta={t('codigosQr.mensaje')}
            id="qr-mensaje"
            maxLength={60}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t('codigosQr.mensajeEjemplo')}
            value={texto}
          />

          {error && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`codigosQr.errores.${error}`)}
            </p>
          )}

          <Boton disabled={creando} type="submit">
            <LuPlus aria-hidden="true" className="h-5 w-5" />
            {creando ? t('codigosQr.creando') : t('codigosQr.crear')}
          </Boton>
        </form>
      </Tarjeta>

      {qrs.length === 0 ? (
        <p className="flex items-center gap-2 px-1 text-base text-principal/70">
          <LuQrCode aria-hidden="true" className="h-5 w-5" />
          {t('codigosQr.ninguno')}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {qrs.map((qr) => (
            <TarjetaQr alQuitar={() => setQrs(quitarQr(qr.id))} key={qr.id} qr={qr} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** Un QR creado: su imagen y lo que se puede hacer con el. */
function TarjetaQr({ qr, alQuitar }) {
  const { t } = useTranslation()
  const [imagen, setImagen] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [quitando, setQuitando] = useState(false)

  useEffect(() => {
    let vigente = true
    let vista = null
    dibujar({ url: qr.url, texto: qr.texto })
      .then((blob) => {
        vista = URL.createObjectURL(blob)
        if (vigente) setImagen({ blob, vista })
        else URL.revokeObjectURL(vista)
      })
      .catch(() => {})
    return () => {
      vigente = false
      if (vista) URL.revokeObjectURL(vista)
    }
  }, [qr.url, qr.texto])

  async function descargar() {
    setAviso(null)
    const resultado = await guardarImagen(imagen.blob, nombreArchivoQr(qr.url))
    if (resultado === 'descargada') setAviso('descargada')
  }

  async function copiar() {
    setAviso((await copiarImagen(imagen.blob)) ? 'copiada' : 'noCopia')
  }

  return (
    <li className="flex flex-col rounded-2xl bg-superficie p-3 shadow-tarjeta ring-1 ring-principal/10">
      {imagen ? (
        <img
          alt={t('codigosQr.alt', { url: urlParaMostrar(qr.url) })}
          className="w-full rounded-xl border border-principal/15"
          src={imagen.vista}
        />
      ) : (
        <Hueso className="aspect-[4/5] w-full rounded-xl" />
      )}

      <p className="mt-2 truncate text-base font-semibold text-principal" title={qr.texto || undefined}>
        {qr.texto || urlParaMostrar(qr.url)}
      </p>
      {qr.texto && <p className="truncate text-chica text-principal/70">{urlParaMostrar(qr.url)}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Boton className="min-h-12 px-2" disabled={!imagen} onClick={descargar}>
          <LuDownload aria-hidden="true" className="h-5 w-5" />
          {t('codigosQr.descargar')}
        </Boton>
        <Boton className="min-h-12 px-2" disabled={!imagen} onClick={copiar} variant="secondary">
          <LuCopy aria-hidden="true" className="h-5 w-5" />
          {t('codigosQr.copiar')}
        </Boton>
      </div>

      {aviso && (
        <p className="mt-2 text-center text-chica text-principal/80" role="status">
          {t(`codigosQr.avisos.${aviso}`)}
        </p>
      )}

      {quitando ? (
        <div className="mt-2 flex items-center justify-center gap-3" role="alertdialog" aria-label={t('codigosQr.quitarPregunta')}>
          <span className="text-chica font-semibold text-principal">{t('codigosQr.quitarPregunta')}</span>
          <button className="min-h-10 rounded-lg bg-peligro px-3 text-chica font-bold text-white" onClick={alQuitar} type="button">
            {t('codigosQr.siQuitar')}
          </button>
          <button className="min-h-10 px-2 text-chica font-semibold text-principal underline" onClick={() => setQuitando(false)} type="button">
            {t('codigosQr.no')}
          </button>
        </div>
      ) : (
        <button
          className="mt-2 inline-flex min-h-10 items-center justify-center gap-1.5 self-center text-chica font-semibold text-principal/70 underline underline-offset-4 hover:text-ya-recibio"
          onClick={() => setQuitando(true)}
          type="button"
        >
          <LuTrash2 aria-hidden="true" className="h-4 w-4" />
          {t('codigosQr.quitar')}
        </button>
      )}
    </li>
  )
}
