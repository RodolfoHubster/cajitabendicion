import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCrown, LuPlus, LuRefreshCw, LuStar, LuTrash2, LuUserPlus } from 'react-icons/lu'
import { Link, useOutletContext } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import CasillaVip from '../../componentes/CasillaVip'
import Tarjeta from '../../componentes/Tarjeta'
import VentanaPase from '../../componentes/VentanaPase'
import { normalizarCodigoCorto, pareceCodigoCorto } from '../../datos/codigoCorto'
import { aFechaLocal } from '../../datos/disponibilidad'
import { crearPase, listarPases, marcarPaseVip, renovarPase, revocarPase } from '../../datos/pases'
import { EsqueletoLista } from '../../componentes/Esqueleto'
import RegistrarPersona from './RegistrarPersona'

const BOTON_TEXTO =
  'min-h-10 whitespace-nowrap px-2 text-base font-semibold underline underline-offset-4'

/**
 * Los pases permanentes: verlos, renovarles el codigo, quitarlos y
 * volver a darlos.
 *
 * Es el permiso mas delicado del sistema, por eso las dos acciones que
 * cambian algo preguntan antes: renovar deja sin servir el codigo que la
 * persona ya trae, y quitar le cierra la puerta.
 *
 * Dar un pase pregunta primero "¿Ya tiene codigo CB?": si si, se escribe;
 * si no, se registra aqui mismo (los datos de Registrar persona, sin fecha
 * ni horario). En los dos caminos, la casilla VIP en dorado. El pase sirve
 * en la fila de carros y en la de a pie.
 */
export default function Pases() {
  const { t, i18n } = useTranslation()
  //  Lo VIP solo lo pone o lo quita el administrador (la base lo revisa).
  const { rol, permisos = [] } = useOutletContext() ?? {}
  const esAdmin = rol === 'admin'
  //  Quien no sabe el codigo CB lo busca por nombre en Personas.
  const puedeBuscarPersonas = esAdmin || permisos.includes('ver_personas')
  //  Registrarla aqui mismo pide la palomita de registrar personas.
  const puedeRegistrar = esAdmin || permisos.includes('registrar_personas')
  //  "¿Ya tiene codigo CB?": null sin contestar, 'si' o 'no'.
  const [tieneCodigo, setTieneCodigo] = useState(null)
  const camino = puedeRegistrar ? tieneCodigo : 'si'

  //  Dar un pase a alguien que ya esta registrado, por su codigo CB.
  const [nuevo, setNuevo] = useState({ codigo: '', motivo: '', vip: false })
  const [intentoNuevo, setIntentoNuevo] = useState(false)

  const [pases, setPases] = useState(null)
  const [error, setError] = useState(null)
  const [busqueda, setBusqueda] = useState('')

  // El codigo CB sobre el que se esta preguntando algo, y que se pregunta.
  const [confirmando, setConfirmando] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)
  // El QR se ve en una ventana del panel, no en otra pagina.
  const [verPase, setVerPase] = useState(null)

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

  const codigoValido = pareceCodigoCorto(nuevo.codigo)

  async function darPase(evento) {
    evento.preventDefault()
    setIntentoNuevo(true)
    setError(null)
    setAviso(null)
    if (!codigoValido) return

    const codigo = normalizarCodigoCorto(nuevo.codigo)
    setOcupado(true)
    try {
      const pase = await crearPase(codigo, nuevo.motivo, { vip: esAdmin && nuevo.vip })
      setAviso({
        codigo,
        texto: nuevo.vip && esAdmin ? t('pases.dadoVip', { codigo }) : t('pases.dado', { codigo }),
        token: pase?.token,
      })
      setNuevo({ codigo: '', motivo: '', vip: false })
      setIntentoNuevo(false)
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  //  Se registro aqui mismo y ya tiene su pase.
  function alRegistrarConPase({ codigo, token, vip }) {
    setError(null)
    setAviso({
      codigo,
      texto: vip ? t('pases.dadoVip', { codigo }) : t('pases.dado', { codigo }),
      token,
    })
    setTieneCodigo(null)
    setRecarga((n) => n + 1)
  }

  async function cambiarVip(pase) {
    setError(null)
    setAviso(null)
    try {
      await marcarPaseVip(pase.codigo_corto, !pase.vip)
      setAviso({ codigo: pase.codigo_corto, texto: t(pase.vip ? 'pases.vipQuitado' : 'pases.vipPuesto', { codigo: pase.codigo_corto }) })
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e.message)
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
  const vips = (pases ?? []).filter((pase) => pase.activo && pase.vip).length

  return (
    <Tarjeta>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <LuStar aria-hidden="true" className="h-6 w-6 text-accion" />
        {t('pases.titulo')}
      </h1>
      <p className="mb-4 text-base text-principal/70">{t('pases.ayuda')}</p>

      {/* Dar el pase: con su codigo CB, o registrandola aqui mismo. */}
      <section className="mb-6 space-y-3 rounded-2xl border border-principal/20 p-4">
        <h2 className="text-lg font-bold text-principal">{t('pases.dar')}</h2>

        {puedeRegistrar && (
          <fieldset>
            <legend className="mb-2 text-base font-semibold text-principal">{t('pases.tieneCodigo')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {['si', 'no'].map((valor) => (
                <label
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 ${
                    tieneCodigo === valor ? 'border-2 border-principal bg-principal/5' : 'border-principal/25'
                  }`}
                  key={valor}
                >
                  <input
                    checked={tieneCodigo === valor}
                    className="h-5 w-5 shrink-0 accent-principal"
                    name="tiene-codigo"
                    onChange={() => setTieneCodigo(valor)}
                    type="radio"
                    value={valor}
                  />
                  <span className="text-base font-semibold text-principal">{t(`pases.tieneCodigoOpciones.${valor}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {camino === 'no' && (
          <div className="aparecer rounded-xl bg-principal/5 p-3">
            <p className="mb-3 flex items-center gap-2 text-base font-semibold text-principal">
              <LuUserPlus aria-hidden="true" className="h-5 w-5 text-accion" />
              {t('pases.registrarAqui')}
            </p>
            <RegistrarPersona alTerminar={alRegistrarConPase} modo="pase" />
          </div>
        )}

        {camino === 'si' && (
          <form className="aparecer space-y-3" noValidate onSubmit={darPase}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                autoCapitalize="characters"
                error={intentoNuevo && !codigoValido ? t('pases.faltaCodigo') : undefined}
                etiqueta={t('pases.codigoPersona')}
                id="pase-codigo"
                onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
                placeholder="CB-4871"
                value={nuevo.codigo}
              />
              <Campo
                etiqueta={t('pases.motivoOpcional')}
                id="pase-motivo"
                onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })}
                value={nuevo.motivo}
              />
            </div>

            {puedeBuscarPersonas && (
              <p className="text-base">
                <Link className="font-semibold text-principal underline underline-offset-4" to="/admin/personas">
                  {t('pases.buscarEnPersonas')}
                </Link>
              </p>
            )}

            {/* Lo VIP, enmarcado en dorado para que no pase desapercibido. */}
            {esAdmin && (
              <CasillaVip alCambiar={(vip) => setNuevo({ ...nuevo, vip })} id="pase-vip" marcada={nuevo.vip} />
            )}

            <Boton className="sm:w-auto sm:px-6" disabled={ocupado} type="submit">
              <LuPlus aria-hidden="true" className="h-5 w-5" />
              {ocupado ? t('pases.guardando') : t('pases.darBoton')}
            </Boton>
          </form>
        )}
      </section>

      {error && (
        <p className="mb-4 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      {aviso && (
        <div className="mb-4 rounded-xl bg-puede-pasar/10 p-3 text-base text-principal" role="status">
          <p className="font-semibold">{aviso.texto}</p>
          {aviso.token && (
            <button
              className="mt-1 min-h-12 font-semibold text-principal underline underline-offset-4"
              onClick={() => setVerPase(aviso.token)}
              type="button"
            >
              {t('pases.verQR')}
            </button>
          )}
        </div>
      )}

      {pases === null ? (
        <EsqueletoLista texto={t('pases.cargando')} />
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

          <p className="mb-3 text-base text-principal/70">
            {t('pases.activos', { count: activos })}
            {vips > 0 && ` · ${t('pases.vips', { count: vips })}`}
          </p>

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
                      <span className={pase.activo ? '' : 'text-principal/70 line-through'}>{pase.nombre}</span>
                      {pase.vip && (
                        <span
                          className={`ml-2 inline-flex items-center gap-1 rounded-full border ${BORDE_ORO} ${FONDO_ORO} px-2 text-chica font-bold text-principal`}
                        >
                          <LuCrown aria-hidden="true" className="h-3.5 w-3.5 text-[#B8860B]" />
                          VIP
                        </span>
                      )}
                      {!pase.activo && (
                        <span className="block text-base text-principal/70">
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
                            <button
                              className={`${BOTON_TEXTO} text-principal`}
                              onClick={() => setVerPase(pase.token)}
                              type="button"
                            >
                              {t('pases.verQR')}
                            </button>
                            {esAdmin && (
                              <button
                                className={`${BOTON_TEXTO} text-principal`}
                                onClick={() => cambiarVip(pase)}
                                type="button"
                              >
                                {pase.vip ? t('pases.quitarVip') : t('pases.hacerVip')}
                              </button>
                            )}
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
      {verPase && <VentanaPase alCerrar={() => setVerPase(null)} token={verPase} />}
    </Tarjeta>
  )
}
