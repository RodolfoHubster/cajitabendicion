import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircleAlert, LuTriangleAlert } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import { consultarCita } from '../../datos/cita'
import { cambiosRestantes, moverMiCita } from '../../datos/citas'
import {
  aFechaLocal,
  agruparPorFecha,
  consultarDisponibilidad,
  formatearHora,
} from '../../datos/disponibilidad'
import { ORGANIZACION } from '../../datos/organizacion'
import { hoyLocal } from '../../datos/panel'
import { EsqueletoHorarios } from '../../componentes/Esqueleto'

/**
 * Cambiar el horario de una cita que ya existe.
 *
 * Es la misma cita, movida: conserva su codigo CB y su QR. Antes de esto,
 * la unica salida era cancelar y volver a registrarse, y la persona
 * terminaba con otro codigo y duplicada en el padron.
 *
 * La regla de "una sola vez" la manda la base de datos; aqui solo se avisa
 * antes, para que nadie la gaste sin querer.
 */
export default function CambiarHorario() {
  const { t, i18n } = useTranslation()
  const { id: token } = useParams()
  const navegar = useNavigate()

  const [cita, setCita] = useState(null)
  const [bloques, setBloques] = useState([])
  const [restantes, setRestantes] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)

  const [fecha, setFecha] = useState(null)
  const [bloqueId, setBloqueId] = useState(null)
  const [deAcuerdo, setDeAcuerdo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorCambio, setErrorCambio] = useState(null)

  useEffect(() => {
    let vigente = true

    Promise.all([consultarCita(token), consultarDisponibilidad(), cambiosRestantes(token)])
      .then(([datos, libres, cambios]) => {
        if (!vigente) return
        setCita(datos)
        setBloques(libres)
        setRestantes(cambios)
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

  // Solo los dias ya abiertos al publico: mover la cita no puede ser la
  // puerta de atras para apartar lugar en una fecha que todavia no abre.
  const dias = agruparPorFecha(bloques)
    .filter((dia) => dia.abierto !== false)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  // Mientras no toque ningun dia, viene elegido el primero con lugar, que
  // es lo que casi siempre quieren. Se calcula al dibujar y no con un
  // efecto: un efecto obligaria a dibujar la pantalla dos veces.
  const fechaElegida = fecha ?? (dias.find((dia) => dia.libres > 0) ?? dias[0])?.fecha ?? null

  const volver = (
    <div className="mt-4 text-center">
      <EnlaceVolver a={`/confirmacion/${token}`}>{t('cambiar.volver')}</EnlaceVolver>
    </div>
  )

  if (cargando) {
    return <EsqueletoHorarios texto={t('cambiar.cargando')} />
  }

  if (error || !cita) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('cambiar.titulo')}</h1>
        <p className="text-base text-ya-recibio" role="alert">
          {t(`citas.errores.${error}`, { defaultValue: t('confirmacion.noEncontrada') })}
        </p>
        {volver}
      </Tarjeta>
    )
  }

  // Recien registrada, la cita llega sin estado: es "reservada".
  const estado = cita.estado ?? 'reservada'
  const sePuede = estado === 'reservada' && cita.fecha >= hoyLocal()

  if (!sePuede || restantes <= 0) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('cambiar.titulo')}</h1>
        <p className="flex items-start gap-2 rounded-xl bg-principal/5 p-4 text-base">
          <LuCircleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
          {sePuede ? t('cambiar.yaCambiaste', { telefono: ORGANIZACION.telefono }) : t('cambiar.noSePuede')}
        </p>
        {volver}
      </Tarjeta>
    )
  }

  const fechaActual = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(cita.fecha))

  const horas = bloques.filter((bloque) => bloque.fecha === fechaElegida)
  const esElSuyo = (bloque) => bloque.fecha === cita.fecha && bloque.hora === cita.hora

  async function cambiar() {
    setGuardando(true)
    setErrorCambio(null)

    try {
      await moverMiCita(token, bloqueId)
      navegar(`/confirmacion/${token}`, { state: { movida: true } })
    } catch (e) {
      setErrorCambio(e.message)
      setGuardando(false)

      // Los lugares ya no son los que se dibujaron: si el horario se
      // acaba de llenar, la lista seguiria diciendo "quedan 3" y la
      // persona le daria otra vez al mismo. Se vuelven a pedir y se
      // suelta el que habia elegido.
      setBloqueId(null)
      consultarDisponibilidad()
        .then((libres) => setBloques(libres))
        .catch(() => {})
    }
  }

  return (
    <Tarjeta>
      <EnlaceVolver a={`/confirmacion/${token}`}>{t('cambiar.volver')}</EnlaceVolver>

      <h1 className="mb-1 text-2xl font-bold">{t('cambiar.titulo')}</h1>
      <p className="text-base text-principal/70">{t('cambiar.tuCitaAhora')}</p>
      <p className="font-titulo text-2xl font-bold first-letter:uppercase">
        {fechaActual}, {formatearHora(cita.hora)}
      </p>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-accion/15 p-3 text-base">
        <LuTriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
        {t('cambiar.aviso', { codigo: cita.codigo_corto })}
      </p>

      {dias.length === 0 ? (
        <>
          <p className="mt-4 text-base">{t('cambiar.sinDias')}</p>
          {volver}
        </>
      ) : (
        <>
          <h2 className="mb-2 mt-5 text-base font-semibold">{t('cambiar.elegirDia')}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {dias.map((dia) => {
              const lleno = dia.libres === 0
              const elegido = dia.fecha === fechaElegida

              return (
                <li key={dia.fecha}>
                  <button
                    aria-pressed={elegido}
                    className={[
                      'flex min-h-14 w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition',
                      lleno && 'cursor-not-allowed border-principal/20 bg-principal/5',
                      !lleno && elegido && 'border-2 border-principal bg-principal/5',
                      !lleno && !elegido && 'border-principal/20 hover:border-principal',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={lleno}
                    onClick={() => {
                      setFecha(dia.fecha)
                      setBloqueId(null)
                    }}
                    type="button"
                  >
                    <span
                      className={`text-base font-semibold first-letter:uppercase ${lleno ? 'text-principal/50' : 'text-principal'}`}
                    >
                      {new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
                        aFechaLocal(dia.fecha),
                      )}
                    </span>
                    {lleno && <span className="text-base text-ya-recibio">{t('horarios.lleno')}</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          <h2 className="mb-2 mt-5 text-base font-semibold">{t('cambiar.elegirHora')}</h2>
          <ul className="space-y-3">
            {horas.map((bloque) => {
              const suyo = esElSuyo(bloque)
              const lleno = bloque.libres === 0 || suyo
              const elegido = bloqueId === bloque.bloque_id

              return (
                <li key={bloque.bloque_id}>
                  <button
                    aria-pressed={elegido}
                    className={[
                      'flex min-h-14 w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                      lleno && 'cursor-not-allowed border-principal/20 bg-principal/5',
                      !lleno && elegido && 'border-2 border-principal bg-principal/5',
                      !lleno && !elegido && 'border-principal/20 hover:border-principal',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={lleno}
                    onClick={() => setBloqueId(bloque.bloque_id)}
                    type="button"
                  >
                    <span className={`text-lg font-semibold ${lleno ? 'text-principal/50' : 'text-principal'}`}>
                      {formatearHora(bloque.hora)}
                    </span>
                    <span className={`text-base ${lleno ? 'text-ya-recibio' : 'text-puede-pasar'}`}>
                      {suyo
                        ? t('cambiar.actual')
                        : bloque.libres === 0
                          ? t('horarios.lleno')
                          : t('horarios.quedan', { count: bloque.libres })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {errorCambio && (
            <p className="mt-4 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`citas.errores.${errorCambio}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
            </p>
          )}

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-principal/20 p-4">
            <input
              checked={deAcuerdo}
              className="mt-0.5 h-5 w-5 shrink-0 accent-principal"
              onChange={(evento) => setDeAcuerdo(evento.target.checked)}
              type="checkbox"
            />
            <span className="text-base">{t('cambiar.deAcuerdo')}</span>
          </label>

          <Boton
            className="mt-4"
            disabled={!bloqueId || !deAcuerdo || guardando}
            onClick={cambiar}
          >
            {guardando ? t('cambiar.cambiando') : t('cambiar.confirmar')}
          </Boton>

          {volver}
        </>
      )}
    </Tarjeta>
  )
}
