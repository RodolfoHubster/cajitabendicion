import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import {
  LuCalendarClock,
  LuCalendarPlus,
  LuCircleCheck,
  LuCircleX,
  LuDownload,
  LuSun,
  LuVolume2,
} from 'react-icons/lu'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import TarjetaDonar from '../../componentes/TarjetaDonar'
import {
  archivoIcs,
  enlaceGoogleCalendar,
  nombreArchivoCalendario,
  usarGoogleCalendar,
} from '../../datos/calendario'
import { consultarCita, dibujarQR } from '../../datos/cita'
import { filaDe } from '../../datos/filas'
import { cancelarMiCita } from '../../datos/citas'
import { aFechaLocal, formatearHora } from '../../datos/disponibilidad'
import { dibujarTarjetaCita, guardarImagen, nombreArchivoCita } from '../../datos/imagenCita'
import { guardarMiCita, quitarMiCita } from '../../datos/misCitas'
import { ORGANIZACION } from '../../datos/organizacion'
import { hoyLocal } from '../../datos/panel'
import { callar, deletrear, hablar, puedeHablar } from '../../datos/voz'
import { EsqueletoQR } from '../../componentes/Esqueleto'

export default function Confirmacion() {
  const { t, i18n } = useTranslation()
  const { id: token } = useParams()
  const { state } = useLocation()
  const navegar = useNavigate()

  const [cita, setCita] = useState(null)
  const [qr, setQr] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  // La tarjeta para guardar se dibuja al llegar, no al tocar el boton: el
  // iPhone solo abre el menu de compartir si se pide en el mismo toque.
  const [tarjeta, setTarjeta] = useState(null)
  const [guardado, setGuardado] = useState(null)

  // Cancelar: primero se pregunta, y solo con el "si" se cancela.
  const [preguntando, setPreguntando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [errorCancelar, setErrorCancelar] = useState(null)

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

        //  "Mis citas en este telefono": asi, si cierra la pagina o pierde la
        //  captura, al volver a entrar ve su cita en la portada.
        if (datos.estado === 'cancelada' || datos.estado === 'entregada') {
          quitarMiCita(token)
        } else {
          guardarMiCita(
            { token, codigo: datos.codigo_corto, fecha: datos.fecha, hora: datos.hora, nombre: datos.nombre },
            hoyLocal(),
          )
        }
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

  useEffect(() => {
    if (!cita || !qr) return

    let vigente = true
    const idioma = i18n.language
    const fecha = new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long' }).format(
      aFechaLocal(cita.fecha),
    )

    dibujarTarjetaCita({
      qr,
      codigo: cita.codigo_corto,
      nombre: cita.nombre,
      textos: {
        programa: ORGANIZACION.programa,
        iglesia: ORGANIZACION.iglesia,
        lista: t('confirmacion.lista'),
        fecha: fecha.charAt(0).toLocaleUpperCase(idioma) + fecha.slice(1),
        hora: formatearHora(cita.hora),
        siNoSeLee: t('confirmacion.siNoSeLee'),
        aNombreDe: t('confirmacion.aNombreDe'),
      },
    })
      .then((blob) => {
        if (vigente) setTarjeta({ idioma, blob })
      })
      // Si el navegador no puede dibujarla, se guarda solo el QR.
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [cita, qr, i18n.language, t])

  async function guardar() {
    setGuardado(null)

    try {
      const blob = tarjeta?.blob ?? (await (await fetch(qr)).blob())
      setGuardado(await guardarImagen(blob, nombreArchivoCita(cita.codigo_corto)))
    } catch {
      setGuardado('descargada')
    }
  }

  //  La cita al calendario del telefono, con recordatorio y con el enlace
  //  que abre este mismo codigo (ver datos/calendario.js).
  function agregarCalendario() {
    const enlace = window.location.href
    const datos = {
      fecha: cita.fecha,
      hora: cita.hora,
      codigo: cita.codigo_corto,
      titulo: t('recordatorio.titulo'),
      lugar: `${ORGANIZACION.iglesia}, ${ORGANIZACION.direccion}`,
      descripcion: t('recordatorio.descripcion', { codigo: cita.codigo_corto, enlace }),
      enlace,
      aviso: t('recordatorio.aviso'),
    }

    if (usarGoogleCalendar()) {
      window.open(enlaceGoogleCalendar(datos), '_blank', 'noopener')
      return
    }

    const url = URL.createObjectURL(new Blob([archivoIcs(datos)], { type: 'text/calendar;charset=utf-8' }))
    const enlaceDescarga = document.createElement('a')
    enlaceDescarga.href = url
    enlaceDescarga.download = nombreArchivoCalendario(cita.codigo_corto)
    document.body.appendChild(enlaceDescarga)
    enlaceDescarga.click()
    enlaceDescarga.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  //  Al salir de la pagina se calla: no se queda hablando en otra pantalla.
  useEffect(() => callar, [])

  function escuchar() {
    const fecha = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
      aFechaLocal(cita.fecha),
    )
    hablar(
      t('escuchar.frase', { fecha, hora: formatearHora(cita.hora), codigo: deletrear(cita.codigo_corto) }),
      i18n.language,
    )
  }

  async function cancelar() {
    setCancelando(true)
    setErrorCancelar(null)

    try {
      await cancelarMiCita(token)
      quitarMiCita(token)
      setCita((actual) => ({ ...actual, estado: 'cancelada' }))
      setPreguntando(false)
    } catch (e) {
      setErrorCancelar(e.message)
    } finally {
      setCancelando(false)
    }
  }

  if (cargando) {
    return <EsqueletoQR texto={t('confirmacion.cargando')} />
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

  // Recien registrada, la cita llega sin estado: es "reservada".
  const estado = cita.estado ?? 'reservada'

  if (estado === 'cancelada') {
    return (
      <Tarjeta>
        <p className="flex items-center gap-2 text-lg font-bold text-ya-recibio">
          <LuCircleX aria-hidden="true" className="h-6 w-6" />
          {t('confirmacion.canceladaTitulo')}
        </p>
        <p className="mt-1 text-2xl font-bold first-letter:uppercase">
          {fechaLarga}, {formatearHora(cita.hora)}
        </p>
        <p className="mt-2 text-base text-principal/80">{t('confirmacion.canceladaTexto')}</p>
        <Boton className="mt-4" onClick={() => navegar('/calendario')}>
          {t('confirmacion.registrarOtra')}
        </Boton>
        <div className="mt-2 text-center">
          <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
        </div>
      </Tarjeta>
    )
  }

  // Solo una cita que no se ha usado y cuyo dia no ha pasado.
  const cancelable = estado === 'reservada' && cita.fecha >= hoyLocal()

  return (
    <div className="space-y-4">
      <Tarjeta className="overflow-hidden p-0">
        <div className="bg-puede-pasar/10 px-5 py-4">
          <p className="flex items-center gap-2 text-lg font-bold text-puede-pasar">
            <LuCircleCheck aria-hidden="true" className="h-6 w-6" />
            {t('confirmacion.lista')}
          </p>
          {/* first-letter y no capitalize: capitalize pondria "14 De Septiembre" */}
          <h1 className="mt-1 text-2xl font-bold first-letter:uppercase">{fechaLarga}</h1>
          <p className="font-titulo text-4xl font-bold text-principal">{formatearHora(cita.hora)}</p>
        </div>

        <div className="p-5">
          {/* Volvio a registrarse (el doble toque, o regreso y lo lleno otra
              vez): se le dice que es la misma cita, para que no crea que
              ahora tiene dos. */}
          {state?.yaExistia && (
            <p className="mb-4 rounded-xl bg-accion/15 p-3 text-base font-semibold text-principal" role="status">
              {t('confirmacion.yaExistia')}
            </p>
          )}

          {state?.movida && (
            <p
              className="mb-4 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar"
              role="status"
            >
              {t('confirmacion.horarioCambiado')}
            </p>
          )}

          {/* De que fila es el codigo, arriba del QR: cada fila tiene su
              gente escaneando, y el de carros no entrega uno a pie. */}
          <p
            className={`mx-auto mb-3 flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-base font-bold ${
              filaDe(cita) === 'a_pie' ? 'bg-accion/20 text-principal' : 'bg-principal/10 text-principal'
            }`}
          >
            {filaDe(cita) === 'a_pie' ? (
              <FaPersonWalking aria-hidden="true" className="h-5 w-5" />
            ) : (
              <FaCarSide aria-hidden="true" className="h-5 w-5" />
            )}
            {t(`filas.nombre.${filaDe(cita)}`)}
          </p>

          {/* El QR a pie lleva marco naranja: se distingue de lejos. */}
          <img
            alt={t('confirmacion.qrAlt')}
            className={`mx-auto w-full max-w-[17.5rem] rounded-xl bg-white p-2 shadow-sm ${
              filaDe(cita) === 'a_pie' ? 'border-4 border-accion' : 'border border-principal/15'
            }`}
            src={qr}
          />

          <div className="mt-4 rounded-xl border-2 border-dashed border-principal/25 p-4 text-center">
            <p className="text-base text-principal/70">{t('confirmacion.siNoSeLee')}</p>
            <p className="my-1 font-titulo text-4xl font-bold tracking-wide text-principal">
              {cita.codigo_corto}
            </p>
            <p className="text-base text-principal/70">
              {t('confirmacion.aNombreDe')} <span className="font-semibold">{cita.nombre}</span>
            </p>
          </div>

          {/* Para quien ve poco o lee con trabajo: el telefono lo dice en voz alta. */}
          {puedeHablar() && (
            <button
              className="mt-3 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-4 text-base font-bold text-principal transition hover:border-principal"
              onClick={escuchar}
              type="button"
            >
              <LuVolume2 aria-hidden="true" className="h-6 w-6 text-accion" />
              {t('escuchar.boton')}
            </button>
          )}

          <p className="mt-4 text-base text-principal/80">{t('confirmacion.unSoloUso')}</p>

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

          <p className="mt-3 text-center text-base text-principal/70">
            {t('confirmacion.consejoCaptura')}
          </p>

          {/* Para que no se le olvide: un recordatorio en su calendario. */}
          {cancelable && (
            <Boton className="mt-3" onClick={agregarCalendario} variant="secondary">
              <LuCalendarPlus aria-hidden="true" className="h-5 w-5" />
              {t('recordatorio.agregar')}
            </Boton>
          )}

          {/* El dia de la entrega, con el sol de frente, una pantalla oscura
              es la razon numero uno de que el QR no se lea. */}
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-accion/10 p-3 text-base text-principal">
            <LuSun aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
            {t('confirmacion.consejoBrillo')}
          </p>

          <div className="mt-2 text-center">
            <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>
          </div>

          {cancelable && (
            <div className="mt-6 border-t border-principal/10 pt-4">
              {!preguntando ? (
                <>
                  <Boton onClick={() => navegar(`/cambiar/${token}`)} variant="secondary">
                    <LuCalendarClock aria-hidden="true" className="h-5 w-5" />
                    {t('confirmacion.cambiarHorario')}
                  </Boton>
                  <button
                    className="mt-2 min-h-12 w-full text-base font-semibold text-ya-recibio underline underline-offset-4"
                    onClick={() => setPreguntando(true)}
                    type="button"
                  >
                    {t('confirmacion.cancelar')}
                  </button>
                </>
              ) : (
                <div
                  aria-labelledby="pregunta-cancelar"
                  className="rounded-xl border border-ya-recibio/30 bg-ya-recibio/5 p-4"
                  role="alertdialog"
                >
                  <p className="text-base font-semibold text-principal" id="pregunta-cancelar">
                    {t('confirmacion.cancelarPregunta')}
                  </p>

                  {errorCancelar && (
                    <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
                      {t(`citas.errores.${errorCancelar}`, {
                        defaultValue: t('citas.errores.ERROR_DESCONOCIDO'),
                      })}
                    </p>
                  )}

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      className="inline-flex min-h-14 items-center justify-center rounded-xl bg-peligro px-4 text-base font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={cancelando}
                      onClick={cancelar}
                      type="button"
                    >
                      {cancelando ? t('confirmacion.cancelando') : t('confirmacion.cancelarSi')}
                    </button>
                    <button
                      className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/25 bg-superficie px-4 text-base font-bold text-principal transition hover:border-principal"
                      onClick={() => {
                        setPreguntando(false)
                        setErrorCancelar(null)
                      }}
                      type="button"
                    >
                      {t('confirmacion.cancelarNo')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Tarjeta>

      {/* Despues de tener su codigo, no antes: primero se asegura que la
          persona tiene su cita, y solo entonces se invita a apoyar. */}
      <TarjetaDonar titulo={t('donar.tituloTrasRegistro')} />
    </div>
  )
}
