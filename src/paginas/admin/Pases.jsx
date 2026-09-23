import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuRefreshCw, LuStar, LuTrash2 } from 'react-icons/lu'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal } from '../../datos/disponibilidad'
import { crearPase, listarPases, renovarPase, revocarPase } from '../../datos/pases'

const BOTON_TEXTO =
  'min-h-10 whitespace-nowrap px-2 text-base font-semibold underline underline-offset-4'

/**
 * Los pases permanentes: verlos, renovarles el codigo, quitarlos y
 * volver a darlos.
 *
 * Es el permiso mas delicado del sistema, por eso las dos acciones que
 * cambian algo preguntan antes: renovar deja sin servir el codigo que la
 * persona ya trae, y quitar le cierra la puerta.
 */
export default function Pases() {
  const { t, i18n } = useTranslation()

  const [pases, setPases] = useState(null)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  // El codigo CB sobre el que se esta preguntando algo, y que se pregunta.
  const [confirmando, setConfirmando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)

  // Se vuelve a pedir la lista despues de cada cambio.
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true

    listarPases()
      .then((lista) => {
        if (!vigente) return
        setPases(lista)
        setError(null)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })

    return () => {
      vigente = false
    }
  }, [recarga])

  const fecha = (dia) =>
    dia
      ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(
          aFechaLocal(dia),
        )
      : '—'

  function preguntar(codigo, accion) {
    setConfirmando({ codigo, accion })
    setMotivo('')
    setError(null)
    setAviso(null)
  }

  async function confirmar() {
    const { codigo, accion } = confirmando
    setOcupado(true)
    setError(null)

    try {
      if (accion === 'renovar') {
        const pase = await renovarPase(codigo)
        setAviso({ codigo, texto: t('pases.renovado'), token: pase?.token })
      } else if (accion === 'revocar') {
        await revocarPase(codigo, motivo)
        setAviso({ codigo, texto: t('pases.quitado') })
      } else {
        const pase = await crearPase(codigo, motivo)
        setAviso({ codigo, texto: t('pases.devuelto'), token: pase?.token })
      }

      setConfirmando(null)
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const texto = busqueda.trim().toLowerCase()
  const filtrados = (pases ?? []).filter(
    (pase) =>
      !texto ||
      pase.nombre?.toLowerCase().includes(texto) ||
      pase.codigo_corto?.toLowerCase().includes(texto) ||
      pase.telefono?.includes(texto),
  )

  const activos = (pases ?? []).filter((pase) => pase.activo).length

  return (
    <Tarjeta>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <LuStar aria-hidden="true" className="h-6 w-6 text-accion" />
        {t('pases.titulo')}
      </h1>
      <p className="mb-4 text-base text-principal/70">{t('pases.ayuda')}</p>

      {error && (
        <p className="mb-4 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      {aviso && (
        <div className="mb-4 rounded-xl bg-puede-pasar/10 p-3 text-base text-principal" role="status">
          <p className="font-semibold">{aviso.texto}</p>
          {aviso.token && (
            <a
              className="mt-1 inline-block font-semibold text-principal underline underline-offset-4"
              href={`/pase/${aviso.token}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t('pases.verQR')}
            </a>
          )}
        </div>
      )}

      {pases === null ? (
        <p className="text-base">{t('pases.cargando')}</p>
      ) : pases.length === 0 ? (
        <p className="text-base">{t('pases.sinPases')}</p>
      ) : (
        <>
          <div className="mb-3 sm:max-w-sm">
            <Campo
              autoComplete="off"
              etiqueta={t('pases.buscar')}
              id="buscar-pase"
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('filtros.buscarEjemplo')}
              type="search"
              value={busqueda}
            />
          </div>

          <p className="mb-3 text-base text-principal/70">{t('pases.activos', { count: activos })}</p>

          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-principal/15 text-principal/70">
                  <th className="py-2 pr-3 font-medium">{t('panel.col.nombre')}</th>
                  <th className="py-2 pr-3 font-medium">{t('panel.col.codigo')}</th>
                  <th className="py-2 pr-3 font-medium">{t('pases.col.motivo')}</th>
                  <th className="py-2 pr-3 font-medium">{t('pases.col.cajas')}</th>
                  <th className="py-2 pr-3 font-medium">{t('pases.col.ultima')}</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">{t('pases.col.acciones')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((pase) => (
                  <tr className="border-b border-principal/10 last:border-0" key={pase.codigo_corto}>
                    <td className="py-2 pr-3">
                      <span className={pase.activo ? '' : 'text-principal/60 line-through'}>{pase.nombre}</span>
                      {!pase.activo && (
                        <span className="block text-base text-principal/60">
                          {t('pases.quitadoEl', { cuando: fecha(pase.revocado_en?.slice(0, 10)) })}
                          {pase.motivo_revocacion && ` · ${pase.motivo_revocacion}`}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 font-semibold">{pase.codigo_corto}</td>
                    <td className="py-2 pr-3 text-principal/70">{pase.motivo ?? '—'}</td>
                    <td className="py-2 pr-3 text-principal/70">{pase.cajas_entregadas ?? 0}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-principal/70">{fecha(pase.ultima_entrega)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {pase.activo ? (
                          <>
                            <a
                              className={`${BOTON_TEXTO} text-principal`}
                              href={`/pase/${pase.token}`}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {t('pases.verQR')}
                            </a>
                            <button
                              className={`${BOTON_TEXTO} text-principal`}
                              onClick={() => preguntar(pase.codigo_corto, 'renovar')}
                              type="button"
                            >
                              {t('pases.renovar')}
                            </button>
                            <button
                              className={`${BOTON_TEXTO} text-ya-recibio`}
                              onClick={() => preguntar(pase.codigo_corto, 'revocar')}
                              type="button"
                            >
                              {t('pases.quitar')}
                            </button>
                          </>
                        ) : (
                          <button
                            className={`${BOTON_TEXTO} text-principal`}
                            onClick={() => preguntar(pase.codigo_corto, 'devolver')}
                            type="button"
                          >
                            {t('pases.devolver')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtrados.length === 0 && (
            <p className="mt-3 text-base">{t('filtros.sinResultados')}</p>
          )}
        </>
      )}

      {confirmando && (
        <div
          aria-labelledby="pregunta-pase"
          className="mt-4 rounded-xl border border-principal/25 bg-principal/5 p-4"
          role="alertdialog"
        >
          <p className="flex items-start gap-2 text-base font-semibold text-principal" id="pregunta-pase">
            {confirmando.accion === 'renovar' ? (
              <LuRefreshCw aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />
            ) : (
              <LuTrash2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />
            )}
            {t(`pases.pregunta.${confirmando.accion}`, { codigo: confirmando.codigo })}
          </p>

          {confirmando.accion !== 'renovar' && (
            <div className="mt-3">
              <Campo
                etiqueta={t('pases.motivo')}
                id="motivo-pase"
                onChange={(e) => setMotivo(e.target.value)}
                type="text"
                value={motivo}
              />
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Boton disabled={ocupado} onClick={confirmar}>
              {ocupado ? t('pases.guardando') : t(`pases.si.${confirmando.accion}`)}
            </Boton>
            <Boton onClick={() => setConfirmando(null)} variant="secondary">
              {t('pases.no')}
            </Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  )
}
