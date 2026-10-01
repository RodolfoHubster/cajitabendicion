import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuCrown, LuQrCode, LuStar, LuTriangleAlert } from 'react-icons/lu'
import { Link, useOutletContext } from 'react-router-dom'
import Campo from '../../componentes/Campo'
import DetallePersona from '../../componentes/DetallePersona'
import Desplegable from '../../componentes/Desplegable'
import { EsqueletoLista } from '../../componentes/Esqueleto'
import Paginacion from '../../componentes/Paginacion'
import { BORDE_ORO, FONDO_ORO } from '../../componentes/SelloVip'
import Tarjeta from '../../componentes/Tarjeta'
import VentanaPase from '../../componentes/VentanaPase'
import { aFechaLocal } from '../../datos/disponibilidad'
import { TAMANOS_PAGINA, paginar } from '../../datos/filtros'
import { crearPase, marcarPaseVip } from '../../datos/pases'
import {
  agruparPersonas,
  alternarAbierto,
  buscarPersonas,
  codigoParaPase,
  sePuedeBuscar,
} from '../../datos/personas'

const BOTON_TEXTO =
  'min-h-12 rounded-xl px-3 text-base font-semibold underline underline-offset-4 transition hover:bg-principal/10'

/**
 * Personas: buscar a alguien en todos los registros, por nombre, telefono o
 * codigo CB, y darle su pase (o su pase VIP) desde ahi mismo.
 *
 * Antes, para encontrar el codigo de alguien de quien solo se sabia el
 * nombre, habia que revisar dia por dia en Reportes. Los registros con el
 * mismo nombre y el mismo telefono salen juntos (es la misma persona que se
 * registro varias semanas); el mismo nombre con otro telefono sale aparte,
 * con su ciudad, para no confundirlas.
 */
export default function Personas() {
  const { t, i18n } = useTranslation()
  const { rol, permisos = [] } = useOutletContext() ?? {}
  const esAdmin = rol === 'admin'
  const puedeDarPase = esAdmin || permisos.includes('dar_pases')

  const [texto, setTexto] = useState('')
  // Lo que se busco y lo que llego: "buscando" se deduce de que no coincidan.
  const [resultado, setResultado] = useState(null)
  const [fallo, setFallo] = useState(null)
  const [recarga, setRecarga] = useState(0)

  const [ficha, setFicha] = useState(null)
  // El grupo sobre el que se pregunta "¿hacer VIP?" o "¿dar pase?".
  const [confirmando, setConfirmando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  // El pase recien dado, en una ventana del panel (no en otra pagina).
  const [verPase, setVerPase] = useState(null)

  // Las personas desplegadas, en el orden en que se abrieron (tres a lo
  // mucho), y en que pagina va la lista.
  const [abiertos, setAbiertos] = useState([])
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(TAMANOS_PAGINA[0])

  const buscado = texto.trim()
  const clave = `${buscado}|${recarga}`

  // Espera a que deje de escribir: no se pregunta letra por letra.
  useEffect(() => {
    if (!sePuedeBuscar(buscado)) return undefined

    let vigente = true
    const pedida = `${buscado}|${recarga}`
    const espera = setTimeout(() => {
      buscarPersonas(buscado)
        .then((filas) => {
          if (!vigente) return
          const grupos = agruparPersonas(filas)
          setResultado({ clave: pedida, grupos })
          // Con un solo resultado se abre solo: es a quien se buscaba.
          if (grupos.length === 1) setAbiertos([grupos[0].grupo])
        })
        .catch((e) => {
          if (vigente) setFallo({ clave: pedida, codigo: e.message })
        })
    }, 350)

    return () => {
      vigente = false
      clearTimeout(espera)
    }
  }, [buscado, recarga])

  const puedeBuscar = sePuedeBuscar(buscado)
  const error = puedeBuscar && fallo?.clave === clave ? fallo.codigo : null
  const grupos = puedeBuscar && resultado?.clave === clave ? resultado.grupos : null
  // Al recargar despues de dar un pase se siguen viendo los de antes.
  const visibles = grupos ?? (puedeBuscar && resultado?.clave.startsWith(`${buscado}|`) ? resultado.grupos : null)
  const buscando = puedeBuscar && !error && !visibles
  const paginaActual = paginar(visibles ?? [], pagina, porPagina)

  const fecha = (valor) =>
    valor
      ? new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }).format(
          aFechaLocal(String(valor).slice(0, 10)),
        )
      : null

  //  accion: 'vip' (darle pase VIP), 'pase' (pase normal) o 'quitarVip'.
  async function confirmar(grupo, accion) {
    const codigo = codigoParaPase(grupo)
    setOcupado(true)
    setErrorAccion(null)
    setAviso(null)

    try {
      let token = null
      if (grupo.paseActivo) {
        // Ya tiene pase: solo se le pone o se le quita lo VIP.
        await marcarPaseVip(codigo, accion === 'vip')
      } else {
        token = (await crearPase(codigo, null, { vip: accion === 'vip' && esAdmin }))?.token ?? null
      }

      setAviso({ texto: t(`personas.listo.${accion}`, { nombre: grupo.nombre, codigo }), token })
      setConfirmando(null)
      setRecarga((n) => n + 1)
    } catch (e) {
      setErrorAccion(e.message)
    } finally {
      setOcupado(false)
    }
  }

  function alternar(grupo) {
    const nuevos = alternarAbierto(abiertos, grupo)
    setAbiertos(nuevos)
    // La que se cerro (a mano o por abrir una cuarta) deja de preguntar.
    if (confirmando && !nuevos.includes(confirmando.grupo)) {
      setConfirmando(null)
      setErrorAccion(null)
    }
  }

  const mensajeError = (codigo) =>
    t(`citas.errores.${codigo}`, {
      defaultValue: t(`panel.errores.${codigo}`, { defaultValue: t('panel.errores.ERROR_DESCONOCIDO') }),
    })

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="mb-1 text-2xl font-bold">{t('personas.titulo')}</h1>
        <p className="mb-4 text-base text-principal/70">{t('personas.ayuda')}</p>

        <Campo
          autoComplete="off"
          enterKeyHint="search"
          etiqueta={t('personas.buscar')}
          id="buscar-persona"
          onChange={(e) => {
            setTexto(e.target.value)
            setPagina(1)
            setAbiertos([])
          }}
          placeholder={t('personas.ejemplo')}
          type="search"
          value={texto}
        />
      </Tarjeta>

      {aviso && (
        <div className="aparecer rounded-2xl bg-puede-pasar/10 p-4 text-base text-principal" role="status">
          <p className="font-semibold">{aviso.texto}</p>
          {aviso.token && (
            <button
              className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-xl bg-marca px-4 font-bold text-white"
              onClick={() => setVerPase(aviso.token)}
              type="button"
            >
              <LuQrCode aria-hidden="true" className="h-5 w-5" />
              {t('personas.verPase')}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {mensajeError(error)}
        </p>
      )}

      {buscando && (
        <Tarjeta>
          <EsqueletoLista filas={3} texto={t('personas.buscando')} />
        </Tarjeta>
      )}

      {visibles && visibles.length === 0 && (
        <Tarjeta>
          <p className="text-base">{t('personas.sinResultados', { texto: buscado })}</p>
        </Tarjeta>
      )}

      {visibles && visibles.length > 0 && (
        <Tarjeta>
          <p className="mb-1 scroll-mt-24 text-base text-principal/70" id="lista-personas" role="status">
            {t('personas.encontradas', { count: visibles.length })}
          </p>

          {/* Solo el nombre; al tocarlo se despliegan sus codigos y lo que se le puede dar. */}
          <ul className="divide-y divide-principal/10">
            {paginaActual.filas.map((grupo, posicion) => {
              const preguntando = confirmando?.grupo === grupo.grupo
              const abierto = abiertos.includes(grupo.grupo)
              const idDetalle = `persona-${grupo.grupo}`

              return (
                // Uno tras otro, no todos de golpe.
                <li className="aparecer" key={grupo.grupo} style={{ animationDelay: `${Math.min(posicion, 10) * 40}ms` }}>
                  <button
                    aria-controls={idDetalle}
                    aria-expanded={abierto}
                    className="flex min-h-16 w-full items-center gap-3 py-2 text-left"
                    onClick={() => alternar(grupo.grupo)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold text-principal">{grupo.nombre}</span>
                        {grupo.vip ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border ${BORDE_ORO} ${FONDO_ORO} px-2 text-chica font-bold text-principal`}
                          >
                            <LuCrown aria-hidden="true" className="h-4 w-4 text-[#B8860B]" />
                            VIP
                          </span>
                        ) : (
                          grupo.paseActivo && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accion/20 px-2 text-chica font-bold text-principal">
                              <LuStar aria-hidden="true" className="h-4 w-4" />
                              {t('personas.conPase')}
                            </span>
                          )
                        )}
                      </span>
                      {/* Dos con el mismo nombre: sin abrirlas, que se vea cual es cual. */}
                      {grupo.mismoNombre && (
                        <span className="block text-chica text-principal/70">
                          {[
                            grupo.telefonoFinal && t('personas.telefonoFinal', { numeros: grupo.telefonoFinal }),
                            grupo.ciudad,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </span>
                    <LuChevronDown
                      aria-hidden="true"
                      className={`girar-suave h-6 w-6 shrink-0 text-principal ${abierto ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <Desplegable abierto={abierto} id={idDetalle}>
                    <div className={`mb-3 rounded-xl p-3 ${grupo.vip ? `border-2 ${BORDE_ORO}` : 'bg-principal/5'}`}>
                        {/* Con el mismo nombre ya se ve arriba, en el renglon. */}
                        {!grupo.mismoNombre && (
                          <p className="text-base text-principal/80">
                            {[
                              grupo.telefonoFinal && t('personas.telefonoFinal', { numeros: grupo.telefonoFinal }),
                              grupo.ciudad,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                        <p className="text-base text-principal/70">
                          {t('personas.registros', { count: grupo.registros.length })} ·{' '}
                          {t('personas.cajas', { count: grupo.cajas })}
                          {grupo.ultimaFecha && ` · ${t('personas.ultimaVez', { fecha: fecha(grupo.ultimaFecha) })}`}
                        </p>

                        {grupo.mismoNombre && (
                          <p className="mt-2 flex items-start gap-2 rounded-xl bg-accion/15 p-2 text-chica text-principal">
                            <LuTriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accion" />
                            {t('personas.mismoNombre')}
                          </p>
                        )}

                        <ul className="mt-3 divide-y divide-principal/10 rounded-xl border border-principal/15">
                          {grupo.registros.map((registro) => (
                            <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" key={registro.codigo_corto}>
                              <span>
                                <span className="block font-titulo text-lg font-bold tracking-wide text-principal">
                                  {registro.codigo_corto}
                                  {registro.pase_activo && (
                                    <span className="ml-2 align-middle text-chica font-semibold text-principal/70">
                                      {registro.vip ? t('personas.paseVipAqui') : t('personas.paseAqui')}
                                    </span>
                                  )}
                                </span>
                                <span className="block text-chica text-principal/70">
                                  {t('personas.registrado', { fecha: fecha(registro.registrada_en) })} ·{' '}
                                  {t('personas.cajas', { count: registro.cajas })}
                                </span>
                              </span>
                              <button
                                className={`${BOTON_TEXTO} text-principal`}
                                onClick={() => setFicha(registro.codigo_corto)}
                                type="button"
                              >
                                {t('personas.verFicha')}
                              </button>
                            </li>
                          ))}
                        </ul>

                        {preguntando ? (
                          <div
                            className={`mt-3 rounded-xl border-2 p-3 ${confirmando.accion === 'vip' ? `${BORDE_ORO} ${FONDO_ORO}` : 'border-principal/25'}`}
                            role="group"
                          >
                            <p className="text-base font-semibold text-principal">
                              {t(`personas.pregunta.${confirmando.accion}`, {
                                nombre: grupo.nombre,
                                codigo: codigoParaPase(grupo),
                              })}
                            </p>
                            {errorAccion && (
                              <p className="mt-2 text-base font-semibold text-ya-recibio" role="alert">
                                {mensajeError(errorAccion)}
                              </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-marca px-5 text-base font-bold text-white disabled:opacity-60"
                                disabled={ocupado}
                                onClick={() => confirmar(grupo, confirmando.accion)}
                                type="button"
                              >
                                {confirmando.accion === 'vip' && <LuCrown aria-hidden="true" className="h-5 w-5" />}
                                {ocupado ? t('personas.guardando') : t('personas.si')}
                              </button>
                              <button
                                className="min-h-14 rounded-xl border border-principal px-5 text-base font-semibold text-principal"
                                disabled={ocupado}
                                onClick={() => {
                                  setConfirmando(null)
                                  setErrorAccion(null)
                                }}
                                type="button"
                              >
                                {t('personas.no')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {esAdmin && !grupo.vip && (
                              <button
                                className={`inline-flex min-h-14 items-center gap-2 rounded-xl border-2 ${BORDE_ORO} ${FONDO_ORO} px-4 text-base font-bold text-principal`}
                                onClick={() => setConfirmando({ grupo: grupo.grupo, accion: 'vip' })}
                                type="button"
                              >
                                <LuCrown aria-hidden="true" className="h-5 w-5 text-[#B8860B]" />
                                {t('personas.hacerVip')}
                              </button>
                            )}
                            {puedeDarPase && !grupo.paseActivo && (
                              <button
                                className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-principal px-4 text-base font-semibold text-principal"
                                onClick={() => setConfirmando({ grupo: grupo.grupo, accion: 'pase' })}
                                type="button"
                              >
                                <LuStar aria-hidden="true" className="h-5 w-5" />
                                {t('personas.darPase')}
                              </button>
                            )}
                            {esAdmin && grupo.vip && (
                              <button
                                className={`${BOTON_TEXTO} text-principal`}
                                onClick={() => setConfirmando({ grupo: grupo.grupo, accion: 'quitarVip' })}
                                type="button"
                              >
                                {t('personas.quitarVip')}
                              </button>
                            )}
                            {grupo.paseActivo && puedeDarPase && (
                              <Link className={`${BOTON_TEXTO} inline-flex items-center text-principal`} to="/admin/pases">
                                {t('personas.verEnPases')}
                              </Link>
                            )}
                          </div>
                        )}
                    </div>
                  </Desplegable>
                </li>
              )
            })}
          </ul>

          {visibles.length > TAMANOS_PAGINA[0] && (
            <Paginacion
              alCambiarPagina={setPagina}
              alCambiarPorPagina={(tamano) => {
                setPorPagina(tamano)
                setPagina(1)
              }}
              ancla="lista-personas"
              id="personas"
              porPagina={porPagina}
              resultado={paginaActual}
            />
          )}
        </Tarjeta>
      )}

      {ficha && <DetallePersona alCerrar={() => setFicha(null)} codigo={ficha} />}
      {verPase && <VentanaPase alCerrar={() => setVerPase(null)} token={verPase} />}
    </div>
  )
}
