import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Pasos from '../../componentes/Pasos'
import Tarjeta from '../../componentes/Tarjeta'
import {
  borrarCodigoAnticipado,
  leerCodigoAnticipado,
  validarCodigoAnticipado,
} from '../../datos/anticipado'
import { aFechaLocal, consultarBloquesDeFecha, formatearHora } from '../../datos/disponibilidad'
import { EsqueletoHorarios } from '../../componentes/Esqueleto'

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

export default function Horarios() {
  const { t, i18n } = useTranslation()
  const { fecha } = useParams()
  const navegar = useNavigate()

  const fechaValida = FORMATO_FECHA.test(fecha ?? '')

  const [bloques, setBloques] = useState([])
  const [elegido, setElegido] = useState(null)
  // Con una fecha invalida no se consulta nada, asi que no hay nada que cargar.
  const [cargando, setCargando] = useState(fechaValida)
  const [error, setError] = useState(null)
  // Fecha aun cerrada al publico: null mientras se revisa el codigo guardado.
  const [codigoValido, setCodigoValido] = useState(null)

  useEffect(() => {
    if (!fechaValida) return

    let vigente = true

    consultarBloquesDeFecha(fecha)
      .then((datos) => {
        if (vigente) setBloques(datos)
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
  }, [fecha, fechaValida])

  const cerradoAlPublico = bloques[0]?.abierto === false
  const horaElegida = elegido ? bloques.find((bloque) => bloque.bloque_id === elegido)?.hora : null

  // El codigo guardado se vuelve a revisar: pudo cambiarse o vencer.
  useEffect(() => {
    if (!cerradoAlPublico) return

    const guardado = leerCodigoAnticipado(fecha)
    if (!guardado) return

    let vigente = true

    validarCodigoAnticipado(fecha, guardado)
      .then((valido) => {
        if (!vigente) return
        if (!valido) borrarCodigoAnticipado(fecha)
        setCodigoValido(valido)
      })
      .catch(() => {
        if (vigente) setCodigoValido(false)
      })

    return () => {
      vigente = false
    }
  }, [cerradoAlPublico, fecha])

  if (!fechaValida) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.horarios')}</h1>
        <p className="mb-4 text-base">{t('horarios.fechaInvalida')}</p>
        <Boton onClick={() => navegar('/calendario')} variant="secondary">
          {t('horarios.volverCalendario')}
        </Boton>
      </Tarjeta>
    )
  }

  if (cargando) {
    return <EsqueletoHorarios texto={t('horarios.cargando')} />
  }

  if (error) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.horarios')}</h1>
        <p className="text-base text-ya-recibio">{t('horarios.error')}</p>
      </Tarjeta>
    )
  }

  if (cerradoAlPublico) {
    // Bloqueada: sin un codigo de suscriptor valido no se entra, ni
    // escribiendo la direccion a mano. El codigo se escribe en el calendario.
    if (!leerCodigoAnticipado(fecha) || codigoValido === false) {
      return <Navigate replace to="/calendario" />
    }

    if (codigoValido === null) {
      return (
        <Tarjeta>
          <p className="text-base">{t('horarios.revisandoCodigo')}</p>
        </Tarjeta>
      )
    }
  }

  const titulo = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(fecha))

  return (
    <Tarjeta>
      <EnlaceVolver a="/calendario">{t('navegacion.cambiarFecha')}</EnlaceVolver>
      <Pasos actual={2} />

      <h1 className="mb-1 text-2xl font-bold first-letter:uppercase">{titulo}</h1>
      <p className="mb-4 text-base text-principal/70">{t('horarios.duracion')}</p>

      {cerradoAlPublico && (
        <p className="mb-4 rounded-xl bg-puede-pasar/10 p-3 text-base text-puede-pasar">
          {t('horarios.conCodigo')}
        </p>
      )}

      {bloques.length === 0 ? (
        <>
          <p className="mb-4 text-base">{t('horarios.sinBloques')}</p>
          <Boton onClick={() => navegar('/calendario')} variant="secondary">
            {t('horarios.volverCalendario')}
          </Boton>
        </>
      ) : (
        <>
          <ul className="mb-4 space-y-3">
            {bloques.map((bloque) => {
              const lleno = bloque.libres === 0
              const seleccionado = elegido === bloque.bloque_id

              return (
                <li key={bloque.bloque_id}>
                  <button
                    aria-pressed={seleccionado}
                    className={[
                      'flex min-h-14 w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                      lleno && 'cursor-not-allowed border-principal/20 bg-principal/5',
                      !lleno && seleccionado && 'border-principal border-2 bg-principal/5',
                      !lleno && !seleccionado && 'border-principal/20 hover:border-principal',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={lleno}
                    onClick={() => setElegido(bloque.bloque_id)}
                    type="button"
                  >
                    <span
                      className={`text-lg font-semibold ${lleno ? 'text-principal/50' : 'text-principal'}`}
                    >
                      {formatearHora(bloque.hora)}
                    </span>
                    <span className={`text-base ${lleno ? 'text-ya-recibio' : 'text-puede-pasar'}`}>
                      {lleno ? t('horarios.lleno') : t('horarios.quedan', { count: bloque.libres })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Pegado abajo mientras se baja por la lista: con 16 horarios el
              boton quedaba fuera de la pantalla, y al escoger parecia que no
              pasaba nada. Dice la hora escogida, para confirmarla de un vistazo. */}
          <div className="sticky bottom-3 z-10">
            <Boton
              className={elegido ? 'shadow-elevada' : 'opacity-40'}
              disabled={!elegido}
              onClick={() => navegar(`/registro?bloque=${elegido}&fecha=${fecha}`)}
            >
              {horaElegida ? t('horarios.continuarCon', { hora: formatearHora(horaElegida) }) : t('horarios.eligeUno')}
            </Boton>
          </div>
        </>
      )}
    </Tarjeta>
  )
}
