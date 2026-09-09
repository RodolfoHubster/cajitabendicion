import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Pasos from '../../componentes/Pasos'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal, consultarBloquesDeFecha, formatearHora } from '../../datos/disponibilidad'

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
    return (
      <Tarjeta>
        <p className="text-base">{t('horarios.cargando')}</p>
      </Tarjeta>
    )
  }

  if (error) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.horarios')}</h1>
        <p className="text-base text-ya-recibio">{t('horarios.error')}</p>
      </Tarjeta>
    )
  }

  const titulo = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(fecha))

  return (
    <Tarjeta>
      <Pasos actual={2} />

      <h1 className="mb-1 text-2xl font-bold">{titulo}</h1>
      <p className="mb-4 text-base text-principal/70">{t('horarios.duracion')}</p>

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
                    <span
                      className={`text-base ${lleno ? 'text-ya-recibio' : 'text-puede-pasar'}`}
                    >
                      {lleno
                        ? t('horarios.lleno')
                        : t('horarios.quedan', { count: bloque.libres })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <Boton
            disabled={!elegido}
            onClick={() => navegar(`/registro?bloque=${elegido}&fecha=${fecha}`)}
            className={elegido ? '' : 'opacity-40'}
          >
            {t('actions.primary')}
          </Boton>
        </>
      )}
    </Tarjeta>
  )
}
