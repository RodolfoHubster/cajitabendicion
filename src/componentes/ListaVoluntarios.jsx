import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuCircleCheck,
  LuMail,
  LuMessageCircle,
  LuPencil,
  LuPrinter,
  LuRefreshCw,
  LuSend,
  LuSquare,
  LuSquareCheck,
  LuStickyNote,
  LuTriangleAlert,
  LuUserPlus,
} from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import Boton from './Boton'
import Campo from './Campo'
import CampoContactoVoluntario from './CampoContactoVoluntario'
import Selector from './Selector'
import Tarjeta from './Tarjeta'
import VentanaCredencial from './VentanaCredencial'
import { EsqueletoLista } from './Esqueleto'
import { horaDeMarca } from '../datos/filaAPie'
import {
  FILTROS,
  ORDENES,
  activarVoluntario,
  buscarVoluntarios,
  contactoEnTexto,
  contarPorFiltro,
  editarVoluntario,
  filtrarVoluntarios,
  nombreRepetido,
  nuevoQrVoluntario,
  ordenarVoluntarios,
  registrarVoluntario,
  separarContacto,
  telefonoBonito,
} from '../datos/voluntarios'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-3 text-base font-semibold text-principal transition hover:border-principal disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_PELIGRO =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-50'

/** '2026-10-23T13:05:00' -> '23 oct'. */
function diaCorto(marca, idioma) {
  return new Intl.DateTimeFormat(idioma, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${String(marca).slice(0, 10)}T12:00:00Z`),
  )
}

/**
 * Los voluntarios (secciones 48 y 49): registrarlos (nombre y, si quieren,
 * telefono y correo), mandarles su credencial, ordenarlos y filtrarlos, e
 * imprimir credenciales. Quien "atiende voluntarios" sin ser administrador
 * registra, corrige y manda; dar de baja y cambiar el QR son del
 * administrador (esAdmin).
 *
 * Seccion 52: una nota interna; aviso si ya hay alguien con el mismo
 * nombre; filtro "sin venir"; cuantos dias vino. soloEntrada: el mensaje de
 * su credencial no dice "y al irte".
 */
export default function ListaVoluntarios({ voluntarios, alCambiar, esAdmin, soloEntrada = false }) {
  const { t, i18n } = useTranslation()
  const navegar = useNavigate()
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [nota, setNota] = useState('')
  //  Los marcados para imprimir sus credenciales (27 de octubre de 2026).
  const [marcados, setMarcados] = useState(() => new Set())
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [credencial, setCredencial] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('activos')
  const [orden, setOrden] = useState('recientes')
  //  { id, nombre, contacto, nota } mientras se cambia.
  const [editando, setEditando] = useState(null)
  //  { voluntario, accion: 'baja' | 'qr' } mientras se pregunta.
  const [preguntando, setPreguntando] = useState(null)

  async function hacer(accion, avisar) {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await accion()
      if (avisar) setAviso(avisar)
      alCambiar()
      return respuesta ?? true
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setOcupado(false)
    }
  }

  const separado = separarContacto(contacto)

  async function registrar(evento) {
    evento.preventDefault()
    if (separado.error) return
    const nuevo = await hacer(
      () => registrarVoluntario(nombre, { telefono: separado.telefono, correo: separado.correo, nota }),
      'registrado',
    )
    if (nuevo) {
      setNombre('')
      setContacto('')
      setNota('')
      //  Su credencial de una vez, para mandarsela o imprimirla.
      setCredencial({ ...nuevo, activo: true, telefono: separado.telefono, correo: separado.correo })
    }
  }

  async function guardarEdicion(evento) {
    evento.preventDefault()
    const partes = separarContacto(editando.contacto)
    if (partes.error) return
    const listo = await hacer(
      () =>
        editarVoluntario(editando.id, editando.nombre, {
          telefono: partes.telefono,
          correo: partes.correo,
          nota: editando.nota,
        }),
      'guardado',
    )
    if (listo) setEditando(null)
  }

  async function confirmar() {
    const { voluntario, accion } = preguntando
    setPreguntando(null)
    if (accion === 'baja') {
      await hacer(() => activarVoluntario(voluntario.id, false), 'baja')
      return
    }
    const token = await hacer(() => nuevoQrVoluntario(voluntario.id), 'nuevoQr')
    if (token) setCredencial({ ...voluntario, token, enviada_en: null, enviada_medio: null })
  }

  const lista = voluntarios ?? []
  const cuentas = contarPorFiltro(lista)
  const delFiltro = ordenarVoluntarios(filtrarVoluntarios(lista, filtro), orden)
  const vistos = busqueda.trim() ? buscarVoluntarios(delFiltro, busqueda, delFiltro.length) : delFiltro
  const todosMarcados = vistos.length > 0 && vistos.every((v) => marcados.has(v.id))
  const paraImprimir = marcados.size > 0 ? lista.filter((v) => marcados.has(v.id)) : vistos

  function marcar(id) {
    const nuevos = new Set(marcados)
    if (nuevos.has(id)) nuevos.delete(id)
    else nuevos.add(id)
    setMarcados(nuevos)
  }

  const repetido = nombreRepetido(lista, nombre)
  const repetidoAlEditar = editando ? nombreRepetido(lista, editando.nombre, editando.id) : null

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <LuUserPlus aria-hidden="true" className="h-6 w-6 text-accion" />
          {t('voluntarios.registrar.titulo')}
        </h2>
        <p className="mb-3 text-base text-principal/70">{t('voluntarios.registrar.ayuda')}</p>
        <form className="space-y-3" onSubmit={registrar}>
          <Campo
            autoComplete="off"
            etiqueta={t('voluntarios.registrar.nombre')}
            id="voluntario-nombre"
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            required
            value={nombre}
          />
          {repetido && (
            <p className="flex items-start gap-2 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
              <LuTriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
              {t('voluntarios.registrar.repetido', { nombre: repetido.nombre })}
            </p>
          )}
          <CampoContactoVoluntario alCambiar={setContacto} id="voluntario-contacto" valor={contacto} />
          <Campo
            autoComplete="off"
            etiqueta={t('voluntarios.registrar.nota')}
            id="voluntario-nota"
            maxLength={300}
            onChange={(e) => setNota(e.target.value)}
            placeholder={t('voluntarios.registrar.notaEjemplo')}
            value={nota}
          />
          <Boton disabled={ocupado || nombre.trim().length < 2 || Boolean(separado.error)} type="submit">
            {t('voluntarios.registrar.boton')}
          </Boton>
        </form>
      </Tarjeta>

      <Tarjeta>
        <h2 className="text-xl font-bold">{t('voluntarios.lista.titulo', { count: cuentas.activos })}</h2>

        {aviso && (
          <p className="mt-2 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
            {t(`voluntarios.lista.avisos.${aviso}`)}
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}

        {/* Los que todavia no tienen su credencial: a un toque de verlos. */}
        {cuentas.pendiente > 0 && filtro !== 'pendiente' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-accion bg-accion/10 p-3">
            <p className="flex items-center gap-2 text-base font-semibold text-principal">
              <LuSend aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
              {t('voluntarios.lista.faltan', { count: cuentas.pendiente })}
            </p>
            <button className={BOTON} onClick={() => setFiltro('pendiente')} type="button">
              {t('voluntarios.lista.verFaltan')}
            </button>
          </div>
        )}

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Campo
            etiqueta={t('voluntarios.lista.buscar')}
            id="filtro-voluntarios"
            onChange={(e) => setBusqueda(e.target.value)}
            type="search"
            value={busqueda}
          />
          <Selector
            activo={filtro !== 'activos'}
            etiqueta={t('voluntarios.lista.mostrar')}
            id="voluntarios-filtro"
            onChange={(e) => setFiltro(e.target.value)}
            value={filtro}
          >
            {FILTROS.map((clave) => (
              <option key={clave} value={clave}>
                {t(`voluntarios.lista.filtros.${clave}`, { count: cuentas[clave] })}
              </option>
            ))}
          </Selector>
          <Selector
            etiqueta={t('voluntarios.lista.ordenar')}
            id="voluntarios-orden"
            onChange={(e) => setOrden(e.target.value)}
            value={orden}
          >
            {ORDENES.map((clave) => (
              <option key={clave} value={clave}>
                {t(`voluntarios.lista.ordenes.${clave}`)}
              </option>
            ))}
          </Selector>
        </div>

        {/* Imprimir: los marcados o, sin marcas, todos los que se ven. */}
        {vistos.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-base text-principal/80">
              {marcados.size > 0
                ? t('voluntarios.lista.marcados', { count: marcados.size })
                : t('voluntarios.lista.seVen', { count: vistos.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={BOTON}
                onClick={() => setMarcados(todosMarcados ? new Set() : new Set([...marcados, ...vistos.map((v) => v.id)]))}
                type="button"
              >
                {todosMarcados ? <LuSquare aria-hidden="true" className="h-5 w-5" /> : <LuSquareCheck aria-hidden="true" className="h-5 w-5" />}
                {todosMarcados ? t('voluntarios.lista.quitarMarcas') : t('voluntarios.lista.marcarTodos', { count: vistos.length })}
              </button>
              <button
                className={BOTON}
                onClick={() => navegar('/admin/voluntarios/imprimir', { state: { ids: paraImprimir.map((v) => v.id) } })}
                type="button"
              >
                <LuPrinter aria-hidden="true" className="h-5 w-5 text-accion" />
                {t('voluntarios.lista.imprimir', { count: paraImprimir.length })}
              </button>
            </div>
          </div>
        )}

        {voluntarios === null ? (
          <div className="mt-3">
            <EsqueletoLista texto={t('voluntarios.cargando')} />
          </div>
        ) : lista.length === 0 ? (
          <p className="mt-2 text-base text-principal/70">{t('voluntarios.lista.vacia')}</p>
        ) : vistos.length === 0 ? (
          <p className="mt-3 text-base text-principal/70">{t('voluntarios.lista.nadieAsi')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-principal/10">
            {vistos.map((v) => (
              <li className={`py-3 ${v.activo ? '' : 'opacity-70'}`} key={v.id}>
                {editando?.id === v.id ? (
                  <form className="space-y-3" onSubmit={guardarEdicion}>
                    <Campo
                      etiqueta={t('voluntarios.registrar.nombre')}
                      id={`editar-nombre-${v.id}`}
                      maxLength={80}
                      onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                      required
                      value={editando.nombre}
                    />
                    {repetidoAlEditar && (
                      <p className="flex items-start gap-2 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
                        <LuTriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
                        {t('voluntarios.registrar.repetido', { nombre: repetidoAlEditar.nombre })}
                      </p>
                    )}
                    <CampoContactoVoluntario
                      alCambiar={(valor) => setEditando({ ...editando, contacto: valor })}
                      id={`editar-contacto-${v.id}`}
                      valor={editando.contacto}
                    />
                    <Campo
                      autoComplete="off"
                      etiqueta={t('voluntarios.registrar.nota')}
                      id={`editar-nota-${v.id}`}
                      maxLength={300}
                      onChange={(e) => setEditando({ ...editando, nota: e.target.value })}
                      placeholder={t('voluntarios.registrar.notaEjemplo')}
                      value={editando.nota}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={BOTON}
                        disabled={ocupado || editando.nombre.trim().length < 2 || Boolean(separarContacto(editando.contacto).error)}
                        type="submit"
                      >
                        {t('voluntarios.lista.guardar')}
                      </button>
                      <button className={BOTON} onClick={() => setEditando(null)} type="button">
                        {t('voluntarios.lista.cancelar')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <label className="flex min-h-10 cursor-pointer items-center gap-3 font-semibold text-principal">
                          <input
                            aria-label={t('voluntarios.lista.marcarUno', { nombre: v.nombre })}
                            checked={marcados.has(v.id)}
                            className="h-6 w-6 shrink-0 accent-principal"
                            onChange={() => marcar(v.id)}
                            type="checkbox"
                          />
                          {v.nombre}
                        </label>
                        {v.telefono && (
                          <p className="flex items-center gap-1.5 text-base text-principal/80">
                            <LuMessageCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                            {telefonoBonito(v.telefono)}
                          </p>
                        )}
                        {v.correo && (
                          <p className="flex min-w-0 items-center gap-1.5 break-all text-base text-principal/80">
                            <LuMail aria-hidden="true" className="h-4 w-4 shrink-0" />
                            {v.correo}
                          </p>
                        )}
                        {v.contacto_viejo && (
                          <p className="text-base text-ya-recibio">{t('voluntarios.lista.contactoViejo', { contacto: v.contacto_viejo })}</p>
                        )}
                        {v.nota && (
                          <p className="flex items-start gap-1.5 text-base italic text-principal/80">
                            <LuStickyNote aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
                            {v.nota}
                          </p>
                        )}
                        {v.visitas !== undefined && v.visitas !== null && (
                          <p className="text-base text-principal/80">
                            {v.visitas > 0
                              ? t('voluntarios.lista.visitas', { count: v.visitas, ultimos: v.visitas_30 ?? 0 })
                              : t('voluntarios.lista.nuncaVino')}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {!v.activo && (
                          <span className="rounded-full bg-ya-recibio/10 px-3 py-1 text-base font-semibold text-ya-recibio">
                            {t('voluntarios.lista.deBaja')}
                          </span>
                        )}
                        {v.dentro_desde && (
                          <span className="rounded-full bg-puede-pasar/15 px-3 py-1 text-base font-semibold text-puede-pasar">
                            {t('voluntarios.adentroDesde', { hora: horaDeMarca(v.dentro_desde) })}
                          </span>
                        )}
                        {v.sin_salida > 0 && (
                          <span className="rounded-full bg-accion/25 px-3 py-1 text-base font-semibold text-principal">
                            {t('voluntarios.lista.sinSalida', { count: v.sin_salida })}
                          </span>
                        )}
                        {v.activo &&
                          (v.enviada_en ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-principal/10 px-3 py-1 text-base text-principal">
                              <LuCircleCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-puede-pasar" />
                              {t(`voluntarios.lista.enviada.${v.enviada_medio}`, { dia: diaCorto(v.enviada_en, i18n.language) })}
                            </span>
                          ) : (
                            <span className="rounded-full bg-accion/25 px-3 py-1 text-base font-semibold text-principal">
                              {t('voluntarios.lista.sinMandar')}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className={BOTON} onClick={() => setCredencial(v)} type="button">
                        <LuSend aria-hidden="true" className="h-5 w-5 text-accion" />
                        {v.enviada_en ? t('voluntarios.lista.credencial') : t('voluntarios.lista.mandar')}
                      </button>
                      <button
                        className={BOTON}
                        onClick={() => setEditando({ id: v.id, nombre: v.nombre, contacto: contactoEnTexto(v), nota: v.nota ?? '' })}
                        type="button"
                      >
                        <LuPencil aria-hidden="true" className="h-4 w-4" />
                        {t('voluntarios.lista.editar')}
                      </button>
                      {esAdmin &&
                        (v.activo ? (
                          <>
                            <button className={BOTON} onClick={() => setPreguntando({ voluntario: v, accion: 'qr' })} type="button">
                              <LuRefreshCw aria-hidden="true" className="h-4 w-4" />
                              {t('voluntarios.lista.nuevoQr')}
                            </button>
                            <button
                              className={`${BOTON} text-ya-recibio`}
                              onClick={() => setPreguntando({ voluntario: v, accion: 'baja' })}
                              type="button"
                            >
                              {t('voluntarios.lista.darDeBaja')}
                            </button>
                          </>
                        ) : (
                          <button
                            className={BOTON}
                            disabled={ocupado}
                            onClick={() => hacer(() => activarVoluntario(v.id, true), 'alta')}
                            type="button"
                          >
                            {t('voluntarios.lista.darDeAlta')}
                          </button>
                        ))}
                    </div>

                    {preguntando?.voluntario.id === v.id && (
                      <div
                        aria-labelledby={`pregunta-${v.id}`}
                        className="mt-3 rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-3"
                        role="alertdialog"
                      >
                        <p className="text-base font-semibold" id={`pregunta-${v.id}`}>
                          {t(`voluntarios.lista.preguntar.${preguntando.accion}`, { nombre: v.nombre })}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button className={BOTON_PELIGRO} disabled={ocupado} onClick={confirmar} type="button">
                            {t(`voluntarios.lista.preguntar.si_${preguntando.accion}`)}
                          </button>
                          <button className={BOTON} onClick={() => setPreguntando(null)} type="button">
                            {t('voluntarios.lista.cancelar')}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {credencial && (
        <VentanaCredencial
          alCerrar={() => setCredencial(null)}
          alEnviada={alCambiar}
          soloEntrada={soloEntrada}
          voluntario={credencial}
        />
      )}
    </div>
  )
}
