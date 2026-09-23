import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleX, LuDownload, LuStar } from 'react-icons/lu'
import { Link, useParams } from 'react-router-dom'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import { dibujarQR } from '../../datos/cita'
import { dibujarTarjetaCita, guardarImagen, nombreArchivoCita } from '../../datos/imagenCita'
import { ORGANIZACION } from '../../datos/organizacion'
import { paseDeCodigo } from '../../datos/pases'

/**
 * El pase permanente, como lo ve la persona.
 *
 * No tiene fecha ni hora: sirve los dos dias de entrega, a la hora que
 * pueda llegar. Lo que si tiene es su nombre, para que el voluntario
 * confirme que el pase es suyo.
 */
export default function Pase() {
  const { t, i18n } = useTranslation()
  const { id: token } = useParams()

  const [pase, setPase] = useState(null)
  const [qr, setQr] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // La tarjeta se dibuja al llegar, no al tocar el boton: el iPhone solo
  // abre el menu de compartir si se pide dentro del mismo toque.
  const [tarjeta, setTarjeta] = useState(null)
  const [guardado, setGuardado] = useState(null)

  useEffect(() => {
    let vigente = true

    Promise.all([paseDeCodigo(token), dibujarQR(token)])
      .then(([datos, imagen]) => {
        if (!vigente) return
        if (!datos) {
          setError('PASE_NO_EXISTE')
          return
        }
        setPase(datos)
        setQr(imagen)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [token])

  useEffect(() => {
    if (!pase || !qr) return

    let vigente = true

    dibujarTarjetaCita({
      qr,
      codigo: pase.codigo_corto,
      nombre: pase.nombre,
      textos: {
        programa: ORGANIZACION.programa,
        iglesia: ORGANIZACION.iglesia,
        lista: t('pase.etiqueta'),
        fecha: t('pase.titulo'),
        hora: t('pase.dias'),
        siNoSeLee: t('confirmacion.siNoSeLee'),
        aNombreDe: t('confirmacion.aNombreDe'),
      },
    })
      .then((blob) => {
        if (vigente) setTarjeta(blob)
      })
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [pase, qr, i18n.language, t])

  async function guardar() {
    setGuardado(null)

    try {
      const blob = tarjeta ?? (await (await fetch(qr)).blob())
      setGuardado(await guardarImagen(blob, nombreArchivoCita(`pase-${pase.codigo_corto}`)))
    } catch {
      setGuardado('descargada')
    }
  }

  if (cargando) {
    return (
      <Tarjeta>
        <p className="text-base">{t('pase.cargando')}</p>
      </Tarjeta>
    )
  }

  if (error || !pase) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pase.titulo')}</h1>
        <p className="text-base">{t('pase.noEncontrado')}</p>
        <Link className="mt-4 inline-block text-base font-semibold text-principal underline" to="/">
          {t('confirmacion.volverInicio')}
        </Link>
      </Tarjeta>
    )
  }

  if (!pase.activo) {
    return (
      <Tarjeta>
        <p className="flex items-center gap-2 text-lg font-bold text-ya-recibio">
          <LuCircleX aria-hidden="true" className="h-6 w-6" />
          {t('pase.revocado')}
        </p>
        <p className="mt-2 text-base text-principal/80">
          {t('pase.revocadoTexto', { telefono: ORGANIZACION.telefono })}
        </p>
        <div className="mt-4 text-center">
          <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
        </div>
      </Tarjeta>
    )
  }

  return (
    <Tarjeta className="overflow-hidden p-0">
      <div className="bg-accion/20 px-5 py-4">
        <p className="flex items-center gap-2 text-lg font-bold text-principal">
          <LuStar aria-hidden="true" className="h-6 w-6" />
          {t('pase.etiqueta')}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{t('pase.titulo')}</h1>
        <p className="font-titulo text-xl font-bold text-principal">{t('pase.dias')}</p>
      </div>

      <div className="p-5">
        <img
          alt={t('confirmacion.qrAlt')}
          className="mx-auto w-full max-w-[280px] rounded-xl border border-principal/15 bg-white p-2 shadow-sm"
          src={qr}
        />

        <div className="mt-4 rounded-xl border-2 border-dashed border-principal/25 p-4 text-center">
          <p className="text-base text-principal/70">{t('confirmacion.siNoSeLee')}</p>
          <p className="my-1 font-titulo text-4xl font-bold tracking-wide text-principal">
            {pase.codigo_corto}
          </p>
          <p className="text-base text-principal/70">
            {t('confirmacion.aNombreDe')} <span className="font-semibold">{pase.nombre}</span>
          </p>
        </div>

        <p className="mt-4 text-base text-principal/80">{t('pase.comoFunciona')}</p>
        <p className="mt-2 text-base text-principal/80">{t('pase.soloTuyo')}</p>

        <button
          className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-base font-bold text-principal shadow-sm transition hover:brightness-95"
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

        <p className="mt-3 text-center text-base text-principal/60">{t('confirmacion.consejoCaptura')}</p>

        <div className="mt-2 text-center">
          <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
        </div>
      </div>
    </Tarjeta>
  )
}
