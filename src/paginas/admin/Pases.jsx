import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaWheelchair } from 'react-icons/fa6'
import { LuCrown, LuPackageCheck, LuPlus, LuRefreshCw, LuStar, LuTrash2, LuUserPlus } from 'react-icons/lu'
import { Link, useOutletContext } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import CasillaVip from '../../componentes/CasillaVip'
import Paginacion from '../../componentes/Paginacion'
import { BORDE_ORO, FONDO_ORO } from '../../componentes/SelloVip'
import Tarjeta from '../../componentes/Tarjeta'
import VentanaPase from '../../componentes/VentanaPase'
import { normalizarCodigoCorto, pareceCodigoCorto } from '../../datos/codigoCorto'
import { aFechaLocal } from '../../datos/disponibilidad'
import { fechasDeEntrega } from '../../datos/fechasEntrega'
import { paginar } from '../../datos/filtros'
import { hoyLocal } from '../../datos/panel'
import {
  FILTROS_PASES,
  buscarPases,
  contarPases,
  crearPase,
  crearPasePreferente,
  diasParaMarcar,
  filtrarPases,
  listarPases,
  marcarEntregaPase,
  marcarPasePreferente,
  marcarPaseVip,
  renovarPase,
  revocarPase,
} from '../../datos/pases'
import { separarContacto, telefonoBonito } from '../../datos/voluntarios'
import { EsqueletoLista } from '../../componentes/Esqueleto'
import RegistrarPersona from './RegistrarPersona'

const BOTON_TEXTO =
  'min-h-10 whitespace-nowrap px-2 text-base font-semibold underline underline-offset-4'

//  Seccion 53: cuantos se ven por pagina (de arranque, 10).
const TAMANOS_PASES = [10, 25, 50, 100]

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
 *
 * Seccion 53: filtros (comunes, VIP, preferentes, quitados), 10 por pagina
 * de arranque, y el administrador marca a mano la caja de un pase que no se
 * escaneo, escogiendo el dia de entrega.
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
  //  El pase preferente (seccion 50): null cerrado, o lo que se va escribiendo.
  const [preferente, setPreferente] = useState(null)
  const [intentoPreferente, setIntentoPreferente] = useState(false)
  //  { codigo, nota } mientras se escribe la nota de un pase de la lista.
  const [notaDe, setNotaDe] = useState(null)
  //  Seccion 53.
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(TAMANOS_PASES[0])
  //  { codigo, nombre, fecha, fila, motivo } mientras se marca su entrega.
  const [entregaDe, setEntregaDe] = useState(null)
  const [dias, setDias] = useState(null)
  const hoy = hoyLocal()

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

  //  Seccion 50: el telefono es opcional, pero si se escribe tiene que estar completo.
  const telefonoPreferente = separarContacto(preferente?.telefono ?? '')
  const telefonoMal =
    Boolean(preferente?.telefono.trim()) && (!telefonoPreferente.telefono || Boolean(telefonoPreferente.correo))
  const nombreMal = (preferente?.nombre.trim().length ?? 0) < 2

  async function darPreferente(evento) {
    evento.preventDefault()
    setIntentoPreferente(true)
    setError(null)
    setAviso(null)
    if (nombreMal || telefonoMal) return
    setOcupado(true)
    try {
      const pase = await crearPasePreferente(preferente.nombre, {
        telefono: telefonoPreferente.telefono,
        nota: preferente.nota,
      })
      setAviso({ codigo: pase.codigo_corto, texto: t('pases.preferente.dado', { codigo: pase.codigo_corto }), token: pase.token })
      setPreferente(null)
      setIntentoPreferente(false)
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  //  Volverlo preferente (con su nota) o quitarselo.
  async function guardarPreferente(codigo, hacer, nota = null) {
    setError(null)
    setAviso(null)
    setOcupado(true)
    try {
      await marcarPasePreferente(codigo, hacer, nota)
      setAviso({ codigo, texto: t(hacer ? 'pases.preferente.puesto' : 'pases.preferente.quitado', { codigo }) })
      setNotaDe(null)
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  //  La caja de un pase que no se escaneo (seccion 53): los dias se piden al abrir.
  async function abrirEntrega(pase) {
    setError(null)
    setAviso(null)
    setConfirmando(null)
    setNotaDe(null)
    let lista = dias
    if (!lista) {
      try {
        lista = diasParaMarcar(await fechasDeEntrega(), hoy)
        setDias(lista)
      } catch (e) {
        setError(e.message)
        return
      }
    }
    setEntregaDe({ codigo: pase.codigo_corto, nombre: pase.nombre, fecha: lista[0] ?? '', fila: 'carro', motivo: '' })
    //  El panel sale abajo de la tabla: que se vea sin buscarlo.
    requestAnimationFrame(() => document.getElementById('entrega-pase')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }))
  }

  async function marcarEntrega() {
    setOcupado(true)
    setError(null)
    try {
      await marcarEntregaPase(entregaDe.codigo, entregaDe)
      setAviso({
        codigo: entregaDe.codigo,
        texto: t('pases.entrega.lista', { nombre: entregaDe.nombre, dia: fecha(entregaDe.fecha) }),
      })
      setEntregaDe(null)
      setRecarga((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const cuentas = contarPases(pases)
  const filtrados = buscarPases(filtrarPases(pases, filtro), busqueda)
  const paginados = paginar(filtrados, pagina, porPagina)

  const activos = (pases ?? []).filter((pase) => pase.activo).length
  const vips = (pases ?? []).filter((pase) => pase.activo && pase.vip).length
  const preferentes = (pases ?? []).filter((pase) => pase.activo && pase.preferente).length

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

      {/* Seccion 50: tercera edad o movilidad reducida. Solo su nombre y una
          nota para reconocerla; pasa sin fila y se revisa al escanear. */}
      <section className="mb-6 space-y-3 rounded-2xl border-2 border-principal/30 p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-principal">
          <FaWheelchair aria-hidden="true" className="h-5 w-5" />
          {t('pases.preferente.titulo')}
        </h2>
        <p className="text-base text-principal/80">{t('pases.preferente.ayuda')}</p>

        {preferente === null ? (
          <button
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-principal/30 bg-superficie px-4 text-base font-semibold text-principal"
            onClick={() => {
              setIntentoPreferente(false)
              setPreferente({ nombre: '', telefono: '', nota: '' })
            }}
            type="button"
          >
            <LuPlus aria-hidden="true" className="h-5 w-5 text-accion" />
            {t('pases.preferente.abrir')}
          </button>
        ) : (
          <form className="aparecer space-y-3" noValidate onSubmit={darPreferente}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                autoComplete="off"
                error={intentoPreferente && nombreMal ? t('pases.preferente.faltaNombre') : undefined}
                etiqueta={t('pases.preferente.nombre')}
                id="preferente-nombre"
                maxLength={80}
                onChange={(e) => setPreferente({ ...preferente, nombre: e.target.value })}
                value={preferente.nombre}
              />
              <Campo
                autoComplete="off"
                error={telefonoMal ? t('pases.preferente.telefonoMal') : undefined}
                etiqueta={t('pases.preferente.telefono')}
                id="preferente-telefono"
                inputMode="tel"
                onChange={(e) => setPreferente({ ...preferente, telefono: e.target.value })}
                placeholder="619 555 0101"
                value={preferente.telefono}
              />
            </div>
            {telefonoPreferente.telefono && !telefonoMal && (
              <p className="text-base font-semibold text-puede-pasar">
                {t('voluntarios.contacto.whatsapp', { telefono: telefonoBonito(telefonoPreferente.telefono) })}
              </p>
            )}
            <Campo
              autoComplete="off"
              etiqueta={t('pases.preferente.nota')}
              id="preferente-nota"
              maxLength={200}
              onChange={(e) => setPreferente({ ...preferente, nota: e.target.value })}
              placeholder={t('pases.preferente.notaEjemplo')}
              value={preferente.nota}
            />
            <div className="flex flex-wrap gap-2">
              <Boton className="sm:w-auto sm:px-6" disabled={ocupado} type="submit">
                <FaWheelchair aria-hidden="true" className="h-5 w-5" />
                {ocupado ? t('pases.guardando') : t('pases.preferente.boton')}
              </Boton>
              <Boton className="sm:w-auto sm:px-6" onClick={() => setPreferente(null)} type="button" variant="secondary">
                {t('pases.no')}
              </Boton>
            </div>
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
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPagina(1)
              }}
              placeholder={t('filtros.buscarEjemplo')}
              type="search"
              value={busqueda}
            />
          </div>

          {/* Seccion 53: de un toque, solo los de un tipo. */}
          <div aria-label={t('pases.filtros.titulo')} className="mb-3 flex flex-wrap gap-2" role="group">
            {FILTROS_PASES.map((clave) => {
              const activo = filtro === clave
              return (
                <button
                  aria-pressed={activo}
                  className={`inline-flex min-h-12 items-center gap-1.5 rounded-full border-2 px-4 text-base font-semibold transition ${
                    activo ? 'border-marca bg-marca text-white' : 'border-principal/20 bg-superficie text-principal hover:border-principal'
                  }`}
                  key={clave}
                  onClick={() => {
                    setFiltro(clave)
                    setPagina(1)
                  }}
                  type="button"
                >
                  {clave === 'vip' && <LuCrown aria-hidden="true" className="h-4 w-4" />}
                  {clave === 'preferentes' && <FaWheelchair aria-hidden="true" className="h-4 w-4" />}
                  {t(`pases.filtros.${clave}`, { count: cuentas[clave] })}
                </button>
              )
            })}
          </div>

          <p className="mb-3 text-base text-principal/70">
            {t('pases.activos', { count: activos })}
            {vips > 0 && ` · ${t('pases.vips', { count: vips })}`}
            {preferentes > 0 && ` · ${t('pases.preferente.cuantos', { count: preferentes })}`}
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
                {paginados.filas.map((pase) => (
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
                      {pase.preferente && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-principal px-2 text-chica font-bold text-principal">
                          <FaWheelchair aria-hidden="true" className="h-3.5 w-3.5" />
                          {t('preferente.etiqueta')}
                        </span>
                      )}
                      {pase.nota && (
                        <span className="block text-base text-principal/70">{t('pases.preferente.notaEnLista', { nota: pase.nota })}</span>
                      )}
                      {pase.activo && pase.ultima_entrega === hoy && (
                        <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-puede-pasar/15 px-2 text-chica font-semibold text-puede-pasar">
                          <LuPackageCheck aria-hidden="true" className="h-3.5 w-3.5" />
                          {t('pases.entrega.hoy')}
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
                    <td className="min-w-[14rem] py-2 text-right">
                      {/* Las acciones bajan de renglon si no caben (27 de octubre de 2026). */}
                      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
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
                                onClick={() => abrirEntrega(pase)}
                                type="button"
                              >
                                {t('pases.entrega.boton')}
                              </button>
                            )}
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
                              onClick={() => setNotaDe({ codigo: pase.codigo_corto, nota: pase.nota ?? '' })}
                              type="button"
                            >
                              {pase.preferente ? t('pases.preferente.editarNota') : t('pases.preferente.hacer')}
                            </button>
                            {pase.preferente && (
                              <button
                                className={`${BOTON_TEXTO} text-principal`}
                                disabled={ocupado}
                                onClick={() => guardarPreferente(pase.codigo_corto, false)}
                                type="button"
                              >
                                {t('pases.preferente.quitar')}
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

          {filtrados.length === 0 ? (
            <p className="mt-3 text-base">{t('filtros.sinResultados')}</p>
          ) : (
            <Paginacion
              alCambiarPagina={setPagina}
              alCambiarPorPagina={(n) => {
                setPorPagina(n)
                setPagina(1)
              }}
              id="pases"
              porPagina={porPagina}
              resultado={paginados}
              tamanos={TAMANOS_PASES}
              totalSinFiltro={pases.length}
            />
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
      {/* La caja de un pase que no se escaneo (seccion 53). */}
      {entregaDe && (
        <div
          aria-labelledby="entrega-pase"
          className="mt-4 space-y-3 rounded-xl border-2 border-accion bg-accion/10 p-4"
          role="dialog"
        >
          <p className="flex items-center gap-2 text-base font-semibold text-principal" id="entrega-pase">
            <LuPackageCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
            {t('pases.entrega.titulo', { nombre: entregaDe.nombre, codigo: entregaDe.codigo })}
          </p>
          <p className="text-base text-principal/80">{t('pases.entrega.ayuda')}</p>
          {dias && dias.length === 0 ? (
            <p className="text-base font-semibold text-ya-recibio">{t('pases.entrega.sinDias')}</p>
          ) : (
            <label className="flex flex-col gap-1 text-base font-semibold text-principal" htmlFor="entrega-dia">
              {t('pases.entrega.dia')}
              <select
                className="min-h-14 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal"
                id="entrega-dia"
                onChange={(e) => setEntregaDe({ ...entregaDe, fecha: e.target.value })}
                value={entregaDe.fecha}
              >
                {(dias ?? []).map((dia) => (
                  <option key={dia} value={dia}>
                    {dia === hoy ? t('pases.entrega.hoyEs', { dia: fecha(dia) }) : fecha(dia)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend className="mb-1 text-base font-semibold text-principal">{t('pases.entrega.fila')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {['carro', 'a_pie'].map((valor) => (
                <label
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 ${
                    entregaDe.fila === valor ? 'border-2 border-principal bg-superficie' : 'border-principal/25 bg-superficie'
                  }`}
                  key={valor}
                >
                  <input
                    checked={entregaDe.fila === valor}
                    className="h-5 w-5 shrink-0 accent-principal"
                    name="entrega-fila"
                    onChange={() => setEntregaDe({ ...entregaDe, fila: valor })}
                    type="radio"
                    value={valor}
                  />
                  <span className="text-base font-semibold text-principal">{t(`pases.entrega.filas.${valor}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Campo
            etiqueta={t('pases.entrega.motivo')}
            id="entrega-motivo"
            maxLength={200}
            onChange={(e) => setEntregaDe({ ...entregaDe, motivo: e.target.value })}
            placeholder={t('pases.entrega.motivoEjemplo')}
            value={entregaDe.motivo}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Boton disabled={ocupado || !entregaDe.fecha} onClick={marcarEntrega}>
              {ocupado ? t('pases.guardando') : t('pases.entrega.si')}
            </Boton>
            <Boton onClick={() => setEntregaDe(null)} variant="secondary">
              {t('pases.no')}
            </Boton>
          </div>
        </div>
      )}

      {/* Volverlo preferente, o cambiar su nota (seccion 50). */}
      {notaDe && (
        <div
          aria-labelledby="nota-pase"
          className="mt-4 space-y-3 rounded-xl border border-principal/25 bg-principal/5 p-4"
          role="dialog"
        >
          <p className="flex items-center gap-2 text-base font-semibold text-principal" id="nota-pase">
            <FaWheelchair aria-hidden="true" className="h-5 w-5 shrink-0" />
            {t('pases.preferente.notaDe', { codigo: notaDe.codigo })}
          </p>
          <Campo
            etiqueta={t('pases.preferente.nota')}
            id="nota-de-pase"
            maxLength={200}
            onChange={(e) => setNotaDe({ ...notaDe, nota: e.target.value })}
            placeholder={t('pases.preferente.notaEjemplo')}
            value={notaDe.nota}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Boton disabled={ocupado} onClick={() => guardarPreferente(notaDe.codigo, true, notaDe.nota)}>
              {ocupado ? t('pases.guardando') : t('pases.preferente.guardar')}
            </Boton>
            <Boton onClick={() => setNotaDe(null)} variant="secondary">
              {t('pases.no')}
            </Boton>
          </div>
        </div>
      )}
      {verPase && <VentanaPase alCerrar={() => setVerPase(null)} token={verPase} />}
    </Tarjeta>
  )
}
