import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleX, LuDownload, LuHandHeart } from 'react-icons/lu'
import { useParams } from 'react-router-dom'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import { EsqueletoQR } from '../../componentes/Esqueleto'
import { dibujarTarjetaCredencial, nombreArchivoCredencial } from '../../datos/credencial'
import { guardarImagen } from '../../datos/imagenCita'
import { ORGANIZACION } from '../../datos/organizacion'
import { dibujarQRVoluntario } from '../../datos/qrPase'
import { credencialVoluntario } from '../../datos/voluntarios'

/**
 * La credencial de un voluntario, como la ve el (seccion 48): su nombre y
 * su QR verde para ensenarlo al llegar y al irse. Sin cuenta: quien tiene
 * el enlace es el dueno, como con los pases.
 */
export default function Credencial() {
  const { t } = useTranslation()
  const { token } = useParams()
  const [datos, setDatos] = useState(null)
  const [qr, setQr] = useState(null)
  const [estado, setEstado] = useState('cargando')
  // La tarjeta se dibuja al llegar: el iPhone solo abre "compartir" si se
  // pide en el mismo toque (ver datos/imagenCita.js).
  const [tarjeta, setTarjeta] = useState(null)
  const [guardado, setGuardado] = useState(null)

  useEffect(() => {
    let vigente = true
    credencialVoluntario(token)
      .then(async (respuesta) => {
        if (!respuesta) {
          if (vigente) setEstado('no_existe')
          return
        }
        const imagen = await dibujarQRVoluntario(token)
        if (!vigente) return
        setDatos(respuesta)
        setQr(imagen)
        setEstado('lista')
      })
      .catch(() => {
        if (vigente) setEstado('error')
      })
    return () => {
      vigente = false
    }
  }, [token])

  useEffect(() => {
    if (!qr || !datos) return undefined
    let vigente = true
    dibujarTarjetaCredencial({ qr, nombre: datos.nombre, t })
      .then((blob) => {
        if (vigente) setTarjeta(blob)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [qr, datos, t])

  async function guardar() {
    setGuardado(null)
    try {
      const blob = tarjeta ?? (await (await fetch(qr)).blob())
      setGuardado(await guardarImagen(blob, nombreArchivoCredencial(datos.nombre)))
    } catch {
      setGuardado('descargada')
    }
  }

  if (estado === 'cargando') return <EsqueletoQR texto={t('credencial.cargando')} />

  if (estado !== 'lista') {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('credencial.titulo')}</h1>
        <p className="text-base">{t(estado === 'error' ? 'credencial.sinConexion' : 'credencial.noEncontrada')}</p>
        <div className="mt-4">
          <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
        </div>
      </Tarjeta>
    )
  }

  if (!datos.activo) {
    return (
      <Tarjeta>
        <p className="flex items-center gap-2 text-lg font-bold text-ya-recibio">
          <LuCircleX aria-hidden="true" className="h-6 w-6" />
          {t('credencial.inactiva')}
        </p>
        <p className="mt-2 text-base text-principal/80">{t('credencial.inactivaTexto', { telefono: ORGANIZACION.telefono })}</p>
        <div className="mt-4 text-center">
          <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
        </div>
      </Tarjeta>
    )
  }

  return (
    <Tarjeta className="overflow-hidden p-0">
      <div className="bg-puede-pasar/15 px-5 py-4">
        <p className="flex items-center gap-2 text-lg font-bold text-puede-pasar">
          <LuHandHeart aria-hidden="true" className="h-6 w-6" />
          {t('credencial.etiqueta')}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{datos.nombre}</h1>
        <p className="text-base text-principal/80">{t('credencial.titulo')}</p>
      </div>

      <div className="p-5">
        <img
          alt={t('credencial.qrAlt', { nombre: datos.nombre })}
          className="mx-auto w-full max-w-[17.5rem] rounded-xl border-4 border-puede-pasar/60 bg-white p-2 shadow-sm"
          src={qr}
        />

        <p className="mt-4 text-base text-principal/80">{t('credencial.comoFunciona')}</p>
        <p className="mt-2 text-base text-principal/80">{t('credencial.soloTuya')}</p>

        <button
          className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-base font-bold text-sobre-accion shadow-sm transition hover:brightness-95"
          onClick={guardar}
          type="button"
        >
          <LuDownload aria-hidden="true" className="h-5 w-5" />
          {t('confirmacion.guardarImagen')}
        </button>

        {guardado === 'descargada' && (
          <p className="mt-3 rounded-xl bg-principal/5 p-3 text-base text-principal" role="status">
            {t('confirmacion.descargada')}
          </p>
        )}

        <p className="mt-3 text-center text-base text-principal/70">{t('confirmacion.consejoCaptura')}</p>
      </div>
    </Tarjeta>
  )
}
