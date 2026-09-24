import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuShieldCheck, LuUserPlus } from 'react-icons/lu'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Paginacion from '../../componentes/Paginacion'
import Tarjeta from '../../componentes/Tarjeta'
import { mensajeCorreo } from '../../componentes/mensajesValidacion'
import { horaSanDiego } from '../../datos/disponibilidad'
import { guardarAcceso, guardarMiCodigo, listarEquipo, quitarAcceso } from '../../datos/equipo'
import { FILAS_PERSONAL, guardarFila } from '../../datos/filas'
import { TAMANOS_PAGINA, coincideTexto, paginar } from '../../datos/filtros'
import { validarCorreo } from '../../datos/validaciones'
import { EsqueletoLista } from '../../componentes/Esqueleto'

const ROLES = ['admin', 'voluntario']
const ESTADOS = ['activo', 'pendiente', 'sin_acceso']

const ESTILO_ESTADO = {
  activo: 'bg-puede-pasar/15 text-puede-pasar',
  pendiente: 'bg-accion/25 text-principal',
  sin_acceso: 'bg-ya-recibio/15 text-ya-recibio',
}

const ESTILO_SELECT =
  'min-h-12 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15 disabled:bg-principal/5 disabled:text-principal/60'

const BOTON =
  'inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal transition hover:border-principal disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_FUERTE =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-marca px-4 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_PELIGRO =
  'inline-flex min-h-12 items-center justify-center rounded-xl border border-ya-recibio/40 bg-superficie px-4 text-base font-semibold text-ya-recibio transition hover:border-ya-recibio disabled:cursor-not-allowed disabled:opacity-50'

const mensajeError = (t, codigo) =>
  t(`equipo.errores.${codigo}`, { defaultValue: t('equipo.errores.ERROR_DESCONOCIDO') })

/** '2026-09-14T21:05:00Z' -> '14 de septiembre, 2:05 PM' (en San Diego). */
function fechaHora(marca, idioma) {
  const dia = new Intl.DateTimeFormat(idioma, {
    timeZone: 'America/Los_Angeles',
    day: 'numeric',
    month: 'long',
  }).format(new Date(marca))

  return `${dia}, ${horaSanDiego(marca)}`
}

function Aviso({ tipo = 'error', children }) {
  const estilo =
    tipo === 'error' ? 'bg-ya-recibio/10 text-ya-recibio' : 'bg-puede-pasar/10 font-semibold text-puede-pasar'

  return (
    <p className={`rounded-xl p-3 text-base ${estilo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

/** Dar acceso a alguien nuevo, aunque todavia no haya entrado. */
function DarAcceso({ alGuardar }) {
  const { t } = useTranslation()

  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState('voluntario')
  const [tocado, setTocado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)

  const codigoCorreo = validarCorreo(correo)
  const errorCorreo = !tocado
    ? undefined
    : codigoCorreo === 'VACIO'
      ? t('equipo.faltaCorreo')
      : mensajeCorreo(t, codigoCorreo)

  async function enviar(evento) {
    evento.preventDefault()
    setTocado(true)
    setAviso(null)
    if (codigoCorreo) return

    setEnviando(true)
    setError(null)

    try {
      const tipo = await guardarAcceso(correo, rol)
      setAviso({ correo: correo.trim().toLowerCase(), rol, tipo })
      setCorreo('')
      setTocado(false)
      alGuardar()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
        <LuUserPlus aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
        {t('equipo.darAcceso')}
      </h2>

      <form className="space-y-4" noValidate onSubmit={enviar}>
        <Campo
          autoComplete="off"
          error={errorCorreo}
          etiqueta={t('equipo.correo')}
          id="correoEquipo"
          inputMode="email"
          onBlur={() => {
            if (correo.trim()) setTocado(true)
          }}
          onChange={(e) => setCorreo(e.target.value)}
          placeholder="nombre@gmail.com"
          type="email"
          value={correo}
        />

        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold text-principal">{t('equipo.rol')}</legend>
          {ROLES.map((opcion) => (
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                rol === opcion ? 'border-principal bg-principal/5 ring-2 ring-principal/20' : 'border-principal/20'
              }`}
              key={opcion}
            >
              <input
                checked={rol === opcion}
                className="mt-1 h-5 w-5 shrink-0 accent-principal"
                name="rolEquipo"
                onChange={() => setRol(opcion)}
                type="radio"
                value={opcion}
              />
              <span>
                <span className="block text-base font-semibold text-principal">{t(`rol.nombre.${opcion}`)}</span>
                <span className="block text-base text-principal/70">{t(`equipo.descripcion.${opcion}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <Aviso>{mensajeError(t, error)}</Aviso>}

        {aviso && (
          <div className="space-y-2">
            <Aviso tipo="ok">
              {t(aviso.tipo === 'pendiente' ? 'equipo.listoPendiente' : 'equipo.listo', {
                correo: aviso.correo,
                rol: t(`rol.nombre.${aviso.rol}`),
              })}
            </Aviso>
            {aviso.tipo === 'pendiente' && <p className="text-base text-principal/70">{t('equipo.avisoGoogle')}</p>}
          </div>
        )}

        <Boton disabled={enviando} type="submit">
          {enviando ? t('equipo.guardando') : t('equipo.guardar')}
        </Boton>
      </form>
    </Tarjeta>
  )
}

/**
 * En que fila escanea un voluntario. Se guarda al escoger: es un ajuste
 * de un toque, no un formulario. El administrador escanea en las dos.
 */
function FilaDelMiembro({ persona, alCambiar }) {
  const { t } = useTranslation()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  async function cambiar(fila) {
    setOcupado(true)
    setError(null)

    try {
      await guardarFila(persona.correo, fila)
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (persona.rol === 'admin') {
    return <p className="mt-2 text-base text-principal/70">{t('equipo.filaAdmin')}</p>
  }

  return (
    <div className="mt-2">
      <label className="flex flex-wrap items-center gap-2" htmlFor={`fila-${persona.correo}`}>
        <span className="text-base font-semibold text-principal">{t('equipo.fila')}</span>
        <select
          className={ESTILO_SELECT}
          disabled={ocupado}
          id={`fila-${persona.correo}`}
          onChange={(e) => cambiar(e.target.value)}
          value={persona.fila}
        >
          {FILAS_PERSONAL.map((fila) => (
            <option key={fila} value={fila}>
              {t(`filas.nombre.${fila}`)}
            </option>
          ))}
        </select>
        {ocupado && <span className="text-base text-principal/70">{t('equipo.guardando')}</span>}
      </label>
      {error && (
        <div className="mt-2">
          <Aviso>{mensajeError(t, error)}</Aviso>
        </div>
      )}
    </div>
  )
}

/** Una persona del equipo: su rol, su estado y sus acciones. */
function Miembro({ persona, alCambiar }) {
  const { t, i18n } = useTranslation()

  const [rol, setRol] = useState(persona.rol)
  const [preguntando, setPreguntando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  const cambio = rol !== persona.rol

  async function ejecutar(accion) {
    setOcupado(true)
    setError(null)

    try {
      await accion()
      setPreguntando(false)
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-all text-base font-semibold text-principal">
            {persona.correo}{' '}
            {persona.es_yo && <span className="font-normal text-principal/70">({t('equipo.tu')})</span>}
          </p>
          <p className="text-base text-principal/70">
            {persona.ultimo_acceso
              ? t('equipo.ultimoAcceso', { cuando: fechaHora(persona.ultimo_acceso, i18n.language) })
              : t('equipo.nuncaEntro')}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-base font-semibold ${ESTILO_ESTADO[persona.estado]}`}>
          {t(`equipo.estado.${persona.estado}`)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`rol-${persona.correo}`}>
          {t('equipo.rol')}
        </label>
        {/* A si mismo no se cambia el rol: el panel nunca se queda sin admin. */}
        <select
          className={ESTILO_SELECT}
          disabled={persona.es_yo || ocupado}
          id={`rol-${persona.correo}`}
          onChange={(e) => setRol(e.target.value)}
          value={rol}
        >
          {ROLES.map((opcion) => (
            <option key={opcion} value={opcion}>
              {t(`rol.nombre.${opcion}`)}
            </option>
          ))}
        </select>

        {cambio && persona.estado !== 'sin_acceso' && (
          <button
            className={BOTON_FUERTE}
            disabled={ocupado}
            onClick={() => ejecutar(() => guardarAcceso(persona.correo, rol))}
            type="button"
          >
            {t('equipo.guardarRol')}
          </button>
        )}

        {persona.estado === 'sin_acceso' && (
          <button
            className={BOTON}
            disabled={ocupado}
            onClick={() => ejecutar(() => guardarAcceso(persona.correo, rol))}
            type="button"
          >
            {t('equipo.devolver')}
          </button>
        )}

        {!persona.es_yo && persona.estado !== 'sin_acceso' && !preguntando && (
          <button className={BOTON_PELIGRO} disabled={ocupado} onClick={() => setPreguntando(true)} type="button">
            {t('equipo.quitar')}
          </button>
        )}
      </div>

      {/* Sin la migracion de filas la base no manda "fila": no se ofrece. */}
      {persona.estado === 'activo' && persona.fila !== undefined && (
        <FilaDelMiembro alCambiar={alCambiar} persona={persona} />
      )}

      {preguntando && (
        <div className="mt-2 space-y-2 rounded-xl border border-ya-recibio/30 bg-ya-recibio/5 p-3">
          <p className="text-base font-semibold text-principal">
            {t('equipo.preguntaQuitar', { correo: persona.correo })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-60"
              disabled={ocupado}
              onClick={() => ejecutar(() => quitarAcceso(persona.correo))}
              type="button"
            >
              {t('equipo.confirmarQuitar')}
            </button>
            <button className={BOTON} onClick={() => setPreguntando(false)} type="button">
              {t('equipo.noQuitar')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2">
          <Aviso>{mensajeError(t, error)}</Aviso>
        </div>
      )}
    </li>
  )
}

/** El codigo que un voluntario le pide al pastor para una entrega de otra fecha. */
function MiCodigo({ tieneCodigo, alGuardar }) {
  const { t } = useTranslation()

  const [codigo, setCodigo] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [intento, setIntento] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [guardado, setGuardado] = useState(false)

  const errorCodigo = intento && codigo.length < 6 ? t('equipo.codigoCorto') : undefined
  const errorConfirmacion =
    intento && !errorCodigo && confirmacion !== codigo ? t('equipo.codigoNoCoincide') : undefined

  async function enviar(evento) {
    evento.preventDefault()
    setIntento(true)
    setGuardado(false)
    if (codigo.length < 6 || confirmacion !== codigo) return

    setEnviando(true)
    setError(null)

    try {
      await guardarMiCodigo(codigo)
      setGuardado(true)
      setCodigo('')
      setConfirmacion('')
      setIntento(false)
      alGuardar()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <LuShieldCheck aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
        {t('equipo.miCodigo')}
      </h2>
      <p className="text-base text-principal/70">{t('equipo.miCodigoAyuda')}</p>
      <p className="mt-2 rounded-xl bg-principal/5 p-3 text-base font-semibold text-principal">
        {tieneCodigo ? t('equipo.conCodigo') : t('equipo.sinCodigo')}
      </p>

      {/* autoComplete new-password: que el navegador no lo sugiera en otros campos. */}
      <form className="mt-4 space-y-4" noValidate onSubmit={enviar}>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
          <Campo
            autoComplete="new-password"
            error={errorCodigo}
            etiqueta={t('equipo.codigoNuevo')}
            id="codigoNuevo"
            onChange={(e) => setCodigo(e.target.value)}
            type="password"
            value={codigo}
          />
          <Campo
            autoComplete="new-password"
            error={errorConfirmacion}
            etiqueta={t('equipo.codigoConfirmar')}
            id="codigoConfirmar"
            onChange={(e) => setConfirmacion(e.target.value)}
            type="password"
            value={confirmacion}
          />
        </div>

        {error && <Aviso>{mensajeError(t, error)}</Aviso>}
        {guardado && <Aviso tipo="ok">{t('equipo.codigoGuardado')}</Aviso>}

        <Boton disabled={enviando} type="submit" variant="secondary">
          {enviando ? t('equipo.guardando') : t('equipo.guardarCodigo')}
        </Boton>
      </form>
    </Tarjeta>
  )
}

/**
 * Equipo y accesos: el pastor da y quita accesos al panel sin entrar a
 * Supabase. Solo admin; la base aplica las mismas reglas.
 */
export default function Equipo() {
  const { t } = useTranslation()

  const [equipo, setEquipo] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(TAMANOS_PAGINA[0])

  const recargar = () => setRecarga((n) => n + 1)

  useEffect(() => {
    let vigente = true

    listarEquipo()
      .then((lista) => {
        if (!vigente) return
        setEquipo(lista)
        setErrorCarga(null)
      })
      .catch((e) => {
        if (vigente) setErrorCarga(e.message)
      })

    return () => {
      vigente = false
    }
  }, [recarga])

  const visibles = (equipo ?? []).filter(
    (persona) => (filtro === 'todos' || persona.estado === filtro) && coincideTexto([persona.correo], busqueda),
  )
  const resultado = paginar(visibles, pagina, porPagina)
  const yo = (equipo ?? []).find((persona) => persona.es_yo)

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="mb-1 text-2xl font-bold">{t('equipo.titulo')}</h1>
        <p className="text-base text-principal/70">{t('equipo.ayuda')}</p>
      </Tarjeta>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-[auto_1fr]">
        <div className="md:col-start-1 md:row-start-1">
          <DarAcceso alGuardar={recargar} />
        </div>

        {/* En el celular la lista va entre los dos formularios; en pantalla ancha, a la derecha. */}
        <div className="md:col-start-2 md:row-span-2 md:row-start-1">
          <Tarjeta>
            <h2 className="scroll-mt-24 text-xl font-bold" id="lista-equipo">
              {t('equipo.lista')}
            </h2>

            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
              <Campo
                autoComplete="off"
                etiqueta={t('equipo.buscar')}
                id="buscarEquipo"
                onChange={(e) => {
                  setBusqueda(e.target.value)
                  setPagina(1)
                }}
                type="search"
                value={busqueda}
              />
              <label className="flex flex-col gap-2" htmlFor="filtroEquipo">
                <span className="text-base font-semibold text-principal">{t('equipo.filtroEstado')}</span>
                <select
                  className={`${ESTILO_SELECT} min-h-14`}
                  id="filtroEquipo"
                  onChange={(e) => {
                    setFiltro(e.target.value)
                    setPagina(1)
                  }}
                  value={filtro}
                >
                  <option value="todos">{t('equipo.todos')}</option>
                  {ESTADOS.map((estado) => (
                    <option key={estado} value={estado}>
                      {t(`equipo.estado.${estado}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3">
              {errorCarga && <Aviso>{mensajeError(t, errorCarga)}</Aviso>}
              {!errorCarga && equipo === null && <EsqueletoLista texto={t('equipo.cargando')} />}
              {equipo && visibles.length === 0 && <p className="text-base">{t('equipo.sinResultados')}</p>}

              {visibles.length > 0 && (
                <ul className="divide-y divide-principal/10">
                  {resultado.filas.map((persona) => (
                    <Miembro
                      alCambiar={recargar}
                      // Rol y estado en la llave: tras un cambio, el renglon se reinicia con lo guardado.
                      key={`${persona.correo}-${persona.rol}-${persona.estado}-${persona.fila}`}
                      persona={persona}
                    />
                  ))}
                </ul>
              )}

              {visibles.length > 0 && (
                <Paginacion
                  alCambiarPagina={setPagina}
                  alCambiarPorPagina={(tamano) => {
                    setPorPagina(tamano)
                    setPagina(1)
                  }}
                  ancla="lista-equipo"
                  id="equipo"
                  porPagina={porPagina}
                  resultado={resultado}
                  totalSinFiltro={equipo.length}
                />
              )}
            </div>
          </Tarjeta>
        </div>

        <div className="md:col-start-1 md:row-start-2">
          <MiCodigo alGuardar={recargar} tieneCodigo={Boolean(yo?.tiene_codigo)} />
        </div>
      </div>
    </div>
  )
}
