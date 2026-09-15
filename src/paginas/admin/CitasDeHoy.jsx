import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import EntradaSinCita from '../../componentes/EntradaSinCita'
import ListaCitas from '../../componentes/ListaCitas'
import ListaSinCita from '../../componentes/ListaSinCita'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal, consultarDisponibilidad, formatearHora } from '../../datos/disponibilidad'
import { bloquesDelDia, citasDelDia, hoyLocal, resumenDelDia } from '../../datos/panel'

export default function CitasDeHoy() {
  const { t, i18n } = useTranslation()
  const hoy = hoyLocal()

  const [parametros] = useSearchParams()
  // Desde Reportes se llega con ?fecha=AAAA-MM-DD para ver ese dia.
  const [fecha, setFecha] = useState(() => {
    const pedida = parametros.get('fecha') ?? ''
    return /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoy
  })
  const [proxima, setProxima] = useState(null)
  const [recarga, setRecarga] = useState(0)

  // Los datos guardan de que fecha son. Asi "esta cargando" se deduce al
  // pintar (los datos no son de la fecha que se pide) en vez de andar
  // encendiendo y apagando una bandera, que provoca renders en cascada.
  const [datos, setDatos] = useState(null)
  const [fallo, setFallo] = useState(null)

  const cargando = datos?.fecha !== fecha && fallo?.fecha !== fecha
  const error = fallo?.fecha === fecha ? fallo.codigo : null
  const esHoy = fecha === hoy
  const esPasado = fecha < hoy

  const recargar = () => setRecarga((n) => n + 1)

  // El proximo dia con horarios abiertos. Cinco de cada siete dias no hay
  // entrega, y sin esto el panel parece roto en vez de vacio.
  useEffect(() => {
    let vigente = true

    consultarDisponibilidad()
      .then((futuros) => {
        if (vigente) setProxima(futuros[0]?.fecha ?? null)
      })
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    let vigente = true

    Promise.all([resumenDelDia(fecha), bloquesDelDia(fecha), citasDelDia(fecha)])
      .then(([resumen, bloques, citas]) => {
        if (vigente) setDatos({ fecha, resumen, bloques, citas })
      })
      .catch((e) => {
        if (vigente) setFallo({ fecha, codigo: e.message })
      })

    return () => {
      vigente = false
    }
  }, [fecha, recarga])

  if (error) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.adminCitasHoy')}</h1>
        <p className="text-base text-ya-recibio">
          {t(`panel.errores.${error}`, { defaultValue: t('panel.errores.ERROR_DESCONOCIDO') })}
        </p>
      </Tarjeta>
    )
  }

  const fechaLarga = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(fecha))

  const resumen = datos?.resumen
  const bloques = datos?.bloques ?? []
  const citas = datos?.citas ?? []

  const numeros = [
    { clave: esHoy ? 'conCita' : 'conCitaDia', valor: resumen?.con_cita ?? 0, color: 'text-principal' },
    { clave: 'yaRecibieron', valor: resumen?.ya_recibieron ?? 0, color: 'text-puede-pasar' },
    // Un dia que ya paso no tiene "faltan": quien no llego, no asistio.
    esPasado
      ? { clave: 'noAsistieron', valor: resumen?.no_asistieron ?? 0, color: 'text-ya-recibio' }
      : { clave: 'faltan', valor: resumen?.faltan_por_llegar ?? 0, color: 'text-principal' },
    { clave: 'sinCita', valor: resumen?.sin_cita ?? 0, color: 'text-principal' },
    { clave: 'canceladas', valor: resumen?.canceladas ?? 0, color: 'text-principal/70' },
    { clave: 'repetidos', valor: resumen?.intentos_repetidos ?? 0, color: 'text-ya-recibio' },
  ]

  return (
    <div className="space-y-4">
      <Tarjeta>
        {/* En pantalla ancha, el dia a la izquierda y como cambiarlo a la derecha. */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-bold first-letter:uppercase">{fechaLarga}</h1>
            <p className="text-base text-principal/70">{esHoy ? t('panel.subtitulo') : t('panel.otroDia')}</p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-2" htmlFor="fecha">
              <span className="text-base font-medium text-principal">{t('panel.verDia')}</span>
              <input
                className="min-h-14 rounded-xl border border-principal/20 px-3 text-base outline-none focus:border-principal"
                id="fecha"
                onChange={(e) => setFecha(e.target.value || hoy)}
                type="date"
                value={fecha}
              />
            </label>

            {!esHoy && (
              <button
                className="min-h-14 rounded-xl border border-principal px-4 text-base font-semibold text-principal"
                onClick={() => setFecha(hoy)}
                type="button"
              >
                {t('panel.volverHoy')}
              </button>
            )}

            {proxima && fecha !== proxima && (
              <button
                className="min-h-14 rounded-xl border border-principal px-4 text-base font-semibold text-principal"
                onClick={() => setFecha(proxima)}
                type="button"
              >
                {t('panel.irProxima')}
              </button>
            )}
          </div>
        </div>

        {cargando ? (
          <p className="text-base">{t('panel.cargando')}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {numeros.map(({ clave, valor, color }) => (
              <div className="rounded-xl bg-principal/5 p-3" key={clave}>
                <dd className={`text-3xl font-bold ${color}`}>{valor}</dd>
                <dt className="text-base text-principal/70">{t(`panel.${clave}`)}</dt>
              </div>
            ))}
          </dl>
        )}
      </Tarjeta>

      {!cargando && (
        <>
          {/* Hoy: anotar sin cita junto al cupo. Otro dia solo hay cupo, a todo lo ancho. */}
          <div className={`grid items-start gap-4 ${esHoy ? 'md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''}`}>
            {/* Solo hoy: una entrada sin cita se anota cuando pasa, no despues. */}
            {esHoy && (
              <Tarjeta>
                <h2 className="mb-1 text-lg font-bold">{t('sinCita.titulo')}</h2>
                <p className="mb-3 text-base text-principal/70">{t('sinCita.ayuda')}</p>
                <EntradaSinCita alCambiar={recargar} />
              </Tarjeta>
            )}

            <Tarjeta>
              <h2 className="mb-1 text-lg font-bold">{t('panel.cupoPorHorario')}</h2>
              <p className="mb-3 text-base text-principal/70">{t('panel.cupoAyuda')}</p>

              {bloques.length === 0 ? (
                <p className="text-base">{t('panel.sinBloques')}</p>
              ) : (
                <ul
                  className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${
                    esHoy ? 'xl:grid-cols-4' : 'md:grid-cols-5 xl:grid-cols-6'
                  }`}
                >
                  {bloques.map((bloque) => (
                    <li
                      className={`rounded-xl border p-3 ${
                        bloque.cerrado ? 'border-ya-recibio/30 bg-ya-recibio/5' : 'border-principal/20'
                      }`}
                      key={bloque.bloque_id}
                    >
                      <p className="text-base font-semibold text-principal">{formatearHora(bloque.hora)}</p>
                      <p className="text-base text-principal/70">
                        {bloque.cerrado
                          ? t('panel.cerrado')
                          : t('panel.deTotal', {
                              ocupados: bloque.ocupados,
                              total: bloque.capacidad,
                            })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>

          {/* key={fecha}: al cambiar de dia, filtros y pagina empiezan de cero. */}
          <ListaCitas alCambiar={recargar} citas={citas} fecha={fecha} hoy={hoy} key={`citas-${fecha}`} />

          <ListaSinCita alCambiar={recargar} fecha={fecha} key={`sin-cita-${fecha}`} recarga={recarga} />
        </>
      )}
    </div>
  )
}
