import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router-dom'
import Tarjeta from '../../componentes/Tarjeta'
import { consultarCita, dibujarQR } from '../../datos/cita'
import { aFechaLocal, formatearHora } from '../../datos/disponibilidad'

export default function Confirmacion() {
  const { t, i18n } = useTranslation()
  const { id: token } = useParams()
  const { state } = useLocation()

  const [cita, setCita] = useState(null)
  const [qr, setQr] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true

    // El registro recien hecho ya trae los datos; recargar la pagina no,
    // y por eso se consultan por token.
    //
    // Se exige `nombre` y no solo que exista el estado: el navegador
    // conserva estados de visitas anteriores, y uno viejo o incompleto
    // dejaria el "A nombre de" en blanco en vez de ir a buscarlo.
    const obtener = state?.nombre ? Promise.resolve(state) : consultarCita(token)

    Promise.all([obtener, dibujarQR(token)])
      .then(([datos, imagen]) => {
        if (!vigente) return
        setCita(datos)
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
  }, [token, state])

  if (cargando) {
    return (
      <Tarjeta>
        <p className="text-base">{t('confirmacion.cargando')}</p>
      </Tarjeta>
    )
  }

  if (error || !cita) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.confirmacion')}</h1>
        <p className="mb-4 text-base">{t('confirmacion.noEncontrada')}</p>
        <Link className="text-base font-semibold text-principal underline" to="/">
          {t('confirmacion.volverInicio')}
        </Link>
      </Tarjeta>
    )
  }

  const fechaLarga = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(cita.fecha))

  return (
    <Tarjeta>
      <p className="text-base font-semibold text-puede-pasar">{t('confirmacion.lista')}</p>

      {/* first-letter y no capitalize: capitalize pondria "14 De Septiembre" */}
      <h1 className="mt-1 text-2xl font-bold first-letter:uppercase">{fechaLarga}</h1>
      <p className="mb-4 text-3xl font-bold text-principal">{formatearHora(cita.hora)}</p>

      <img
        alt={t('confirmacion.qrAlt')}
        className="mx-auto w-full max-w-[280px] rounded-xl border border-principal/15"
        src={qr}
      />

      <div className="mt-4 rounded-xl bg-principal/5 p-4 text-center">
        <p className="text-base text-principal/70">{t('confirmacion.siNoSeLee')}</p>
        <p className="my-1 text-4xl font-bold tracking-wide text-principal">{cita.codigo_corto}</p>
        <p className="text-base text-principal/70">
          {t('confirmacion.aNombreDe')} <span className="font-semibold">{cita.nombre}</span>
        </p>
      </div>

      <p className="mt-4 text-base text-principal/80">{t('confirmacion.unSoloUso')}</p>

      <a
        className="mt-4 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-accion px-4 text-base font-semibold text-white transition hover:opacity-90"
        download={`${cita.codigo_corto}.png`}
        href={qr}
      >
        {t('confirmacion.guardarImagen')}
      </a>

      <p className="mt-3 text-center text-base text-principal/60">
        {t('confirmacion.consejoCaptura')}
      </p>
    </Tarjeta>
  )
}
