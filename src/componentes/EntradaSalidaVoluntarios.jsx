import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuLogIn, LuLogOut, LuSearch, LuUndo2 } from 'react-icons/lu'
import LectorQR from './LectorQR'
import Tarjeta from './Tarjeta'
import { EsqueletoLista } from './Esqueleto'
import { horaDeMarca } from '../datos/filaAPie'
import { avisoDetente, avisoLeido, avisoValido, prepararSonido } from '../datos/sonido'
import {
  asistenciasDelDia,
  buscarVoluntarios,
  deshacerAsistencia,
  esCredencial,
  esQrDeCita,
  marcarAsistencia,
  textoDuracion,
} from '../datos/voluntarios'

//  "Deshacer" se ve el primer minuto (la base lo acepta hasta los 2).
const MS_DESHACER = 60_000

const ESTILO = {
  ENTRADA: 'border-puede-pasar bg-puede-pasar/10',
  SALIDA: 'border-principal bg-principal/5',
  YA_ENTRO: 'border-principal/30 bg-principal/5',
  YA_SALIO: 'border-principal/30 bg-principal/5',
  INACTIVO: 'border-ya-recibio bg-ya-recibio/10',
  NO_EXISTE: 'border-ya-recibio bg-ya-recibio/10',
}

/** '2026-10-18' -> 'sábado 18 de octubre'. */
function diaLargo(fecha, idioma) {
  return new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
}

/**
 * Entrada y salida de los voluntarios (seccion 48): el administrador escanea
 * su credencial. Si no ha entrado hoy es su entrada; si ya entro, su
 * salida, con sus horas. Quien no trae su credencial se busca por nombre.
 * Abajo, quien vino hoy.
 *
 * voluntarios: la lista (para buscar). alCambiar: para que se vuelva a pedir.
 */
export default function EntradaSalidaVoluntarios({ voluntarios, alCambiar }) {
  const { t, i18n } = useTranslation()
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const [deshecho, setDeshecho] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [hoy, setHoy] = useState(null)
  const [version, setVersion] = useState(0)

  //  El bip necesita un primer toque en la pagina (los navegadores lo piden).
  useEffect(() => {
    const preparar = () => prepararSonido()
    document.addEventListener('pointerdown', preparar, { once: true })
    return () => document.removeEventListener('pointerdown', preparar)
  }, [])

  useEffect(() => {
    let vigente = true
    asistenciasDelDia()
      .then((lista) => {
        if (vigente) setHoy(lista)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [version])

  useEffect(() => {
    if (!puedeDeshacer) return undefined
    const reloj = setTimeout(() => setPuedeDeshacer(false), MS_DESHACER)
    return () => clearTimeout(reloj)
  }, [puedeDeshacer, resultado])

  const marcar = useCallback(
    async (cual) => {
      setOcupado(true)
      setError(null)
      setDeshecho(null)
      setPuedeDeshacer(false)
      try {
        const respuesta = await marcarAsistencia(cual)
        setResultado(respuesta)
        if (respuesta?.resultado === 'ENTRADA' || respuesta?.resultado === 'SALIDA') {
          avisoValido()
          setPuedeDeshacer(true)
        } else if (respuesta?.resultado === 'YA_ENTRO' || respuesta?.resultado === 'YA_SALIO') {
          avisoLeido()
        } else {
          avisoDetente()
        }
        setBusqueda('')
        setVersion((n) => n + 1)
        alCambiar?.()
      } catch (e) {
        setResultado(null)
        setError(e.message)
        avisoDetente()
      } finally {
        setOcupado(false)
      }
    },
    [alCambiar],
  )

  //  Un QR que no es credencial ni se pregunta: se dice que es.
  const alLeer = useCallback(
    (texto) => {
      if (!esCredencial(texto)) {
        avisoDetente()
        setError(null)
        setPuedeDeshacer(false)
        setResultado({ resultado: 'NO_EXISTE', deCita: esQrDeCita(texto) })
        return
      }
      marcar({ token: texto })
    },
    [marcar],
  )

  async function deshacer() {
    setOcupado(true)
    setError(null)
    try {
      setDeshecho(await deshacerAsistencia(resultado.asistencia_id))
      setResultado(null)
      setPuedeDeshacer(false)
      setVersion((n) => n + 1)
      alCambiar?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const activos = (voluntarios ?? []).filter((v) => v.activo)
  const encontrados = buscarVoluntarios(activos, busqueda, 6)
  const adentro = (hoy ?? []).filter((a) => a.estado === 'dentro').length

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h2 className="text-xl font-bold">{t('voluntarios.entrada.titulo')}</h2>
        <p className="mb-3 text-base text-principal/70">{t('voluntarios.entrada.ayuda')}</p>

        <LectorQR activo alLeer={alLeer} olvidar={5000} />

        <div aria-live="polite" className="mt-4 space-y-3">
          {resultado && (
            <div className={`aparecer rounded-xl border-2 p-4 ${ESTILO[resultado.resultado] ?? ESTILO.NO_EXISTE}`}>
              <p className="flex items-center gap-2 text-2xl font-bold text-principal">
                {resultado.resultado === 'ENTRADA' && <LuLogIn aria-hidden="true" className="h-7 w-7 text-puede-pasar" />}
                {resultado.resultado === 'SALIDA' && <LuLogOut aria-hidden="true" className="h-7 w-7" />}
                {t(`voluntarios.resultado.${resultado.resultado}`)}
              </p>
              {resultado.nombre && <p className="mt-1 text-xl font-bold text-principal">{resultado.nombre}</p>}
              <p className="mt-1 text-base text-principal">
                {resultado.resultado === 'NO_EXISTE'
                  ? t(resultado.deCita ? 'voluntarios.resultado.esCita' : 'voluntarios.resultado.noEsCredencial')
                  : resultado.resultado === 'INACTIVO'
                    ? t('voluntarios.resultado.inactivoAyuda')
                    : resultado.salida_en
                      ? t('voluntarios.resultado.entroSalio', {
                          entrada: horaDeMarca(resultado.entrada_en),
                          salida: horaDeMarca(resultado.salida_en),
                          duracion: textoDuracion(t, resultado.minutos),
                        })
                      : t('voluntarios.resultado.entro', { hora: horaDeMarca(resultado.entrada_en) })}
              </p>
              {resultado.olvido && (
                <p className="mt-2 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
                  {t('voluntarios.resultado.olvido', { dia: diaLargo(resultado.olvido, i18n.language) })}
                </p>
              )}
              {puedeDeshacer && (
                <button
                  className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold text-principal disabled:opacity-50"
                  disabled={ocupado}
                  onClick={deshacer}
                  type="button"
                >
                  <LuUndo2 aria-hidden="true" className="h-5 w-5" />
                  {t('voluntarios.deshacer')}
                </button>
              )}
            </div>
          )}

          {deshecho && (
            <p className="rounded-xl bg-principal/5 p-3 text-base font-semibold text-principal" role="status">
              {t(`voluntarios.deshecho.${deshecho}`)}
            </p>
          )}

          {error && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
            </p>
          )}
        </div>

        {/* Quien no trae su credencial (o se le acabo la pila): por nombre. */}
        <div className="mt-5 border-t border-principal/10 pt-4">
          <label className="block text-base font-semibold text-principal" htmlFor="buscar-voluntario">
            {t('voluntarios.entrada.sinCredencial')}
          </label>
          <div className="relative mt-2">
            <LuSearch aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-principal/70" />
            <input
              autoComplete="off"
              className="min-h-14 w-full rounded-xl border border-principal/25 bg-superficie pl-11 pr-4 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
              id="buscar-voluntario"
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('voluntarios.entrada.buscarEjemplo')}
              type="search"
              value={busqueda}
            />
          </div>
          {busqueda.trim() && (
            <ul className="mt-2 space-y-2">
              {encontrados.length === 0 && (
                <li className="rounded-xl bg-principal/5 p-3 text-base text-principal">{t('voluntarios.entrada.nadie')}</li>
              )}
              {encontrados.map((v) => (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-principal/15 p-3" key={v.id}>
                  <span className="min-w-0">
                    <span className="block font-semibold text-principal">{v.nombre}</span>
                    {v.dentro_desde && (
                      <span className="text-base text-principal/70">
                        {t('voluntarios.adentroDesde', { hora: horaDeMarca(v.dentro_desde) })}
                      </span>
                    )}
                  </span>
                  <button
                    className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-marca px-4 text-base font-semibold text-white disabled:opacity-50"
                    disabled={ocupado}
                    onClick={() => marcar({ voluntario: v.id })}
                    type="button"
                  >
                    {v.dentro_desde ? <LuLogOut aria-hidden="true" className="h-5 w-5" /> : <LuLogIn aria-hidden="true" className="h-5 w-5" />}
                    {v.dentro_desde ? t('voluntarios.marcarSalida') : t('voluntarios.marcarEntrada')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Tarjeta>

      <Tarjeta>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">{t('voluntarios.hoy.titulo')}</h2>
          {hoy && <p className="text-base font-semibold text-puede-pasar">{t('voluntarios.hoy.adentro', { count: adentro })}</p>}
        </div>
        {hoy === null ? (
          <div className="mt-3">
            <EsqueletoLista filas={3} texto={t('voluntarios.cargando')} />
          </div>
        ) : hoy.length === 0 ? (
          <p className="mt-2 text-base text-principal/70">{t('voluntarios.hoy.nadie')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-principal/10">
            {hoy.map((a) => (
              <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={a.id}>
                <span className="min-w-0">
                  <span className="block font-semibold text-principal">{a.nombre}</span>
                  <span className="text-base text-principal/80">
                    {a.salida
                      ? t('voluntarios.resultado.entroSalio', {
                          entrada: horaDeMarca(a.entrada),
                          salida: horaDeMarca(a.salida),
                          duracion: textoDuracion(t, a.minutos),
                        })
                      : t('voluntarios.resultado.entro', { hora: horaDeMarca(a.entrada) })}
                  </span>
                </span>
                {a.estado === 'dentro' ? (
                  <button
                    className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold text-principal disabled:opacity-50"
                    disabled={ocupado}
                    onClick={() => marcar({ voluntario: a.voluntario_id })}
                    type="button"
                  >
                    <LuLogOut aria-hidden="true" className="h-5 w-5" />
                    {t('voluntarios.marcarSalida')}
                  </button>
                ) : a.estado === 'sin_salida' ? (
                  <span className="rounded-full bg-accion/25 px-3 py-1 text-base font-semibold text-principal">
                    {t('voluntarios.estado.sin_salida')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
