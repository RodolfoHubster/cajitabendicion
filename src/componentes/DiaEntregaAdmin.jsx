import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuCircleCheck, LuLock, LuRefreshCw, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import CamposApertura from './CamposApertura'
import CodigoCopiable from './CodigoCopiable'
import {
  actualizarBloque,
  actualizarDiaEntrega,
  agregarBloque,
  anticipoDe,
  bloquesDelDia,
  calcularAnticipado,
  eliminarBloque,
  eliminarDiaEntrega,
  regenerarCodigoAnticipado,
  suscriptoresSinEfecto,
} from '../datos/diasEntrega'
import { aFechaLocal, ahoraSanDiego, formatearFechaHora, formatearHora } from '../datos/disponibilidad'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-white px-4 text-base font-semibold text-principal transition hover:border-principal disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_FUERTE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-principal px-4 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'

const ESTILO_ESTADO = {
  abierta: 'bg-puede-pasar/15 text-puede-pasar',
  programada: 'bg-accion/25 text-principal',
  cerrada: 'bg-ya-recibio/15 text-ya-recibio',
}

const ESTILO_INPUT =
  'min-h-12 w-20 rounded-xl border border-principal/25 bg-white px-3 text-base text-principal outline-none focus:border-principal'

// '2026-09-11T12:00:00' -> '2026-09-11T12:00', el formato de datetime-local.
const aCampo = (marca) => (marca ? marca.slice(0, 16) : '')

function Seccion({ titulo, children }) {
  return (
    <section className="rounded-xl border border-principal/15 bg-white p-4">
      <h4 className="mb-3 text-lg font-bold text-principal">{titulo}</h4>
      {children}
    </section>
  )
}

/**
 * Apertura de registros y acceso de suscriptores. Editable en cualquier
 * estado de la fecha.
 */
function Apertura({ dia, estado, ocupado, ejecutar, mensaje, codigoRecien }) {
  const { t, i18n } = useTranslation()

  const [abreEn, setAbreEn] = useState(aCampo(dia.abre_en))
  const [conSuscriptores, setConSuscriptores] = useState(Boolean(dia.abre_anticipado_en))
  const [anticipo, setAnticipo] = useState(anticipoDe(dia.abre_en, dia.abre_anticipado_en))
  const [abreAnticipadoEn, setAbreAnticipadoEn] = useState(aCampo(dia.abre_anticipado_en))

  function guardar(evento) {
    evento.preventDefault()

    // Sin este freno se guardaba el acceso en una fecha ya abierta y el
    // publico se seguia registrando sin codigo.
    if (suscriptoresSinEfecto(conSuscriptores, abreEn)) {
      ejecutar(
        async () => {
          throw new Error('SUSCRIPTORES_FECHA_ABIERTA')
        },
        { seccion: 'apertura' },
      )
      return
    }

    const activando = conSuscriptores && !dia.abre_anticipado_en

    ejecutar(
      async () => {
        await actualizarDiaEntrega({
          fecha: dia.fecha,
          abreEn,
          abreAnticipadoEn: conSuscriptores ? calcularAnticipado(abreEn, anticipo, abreAnticipadoEn) : null,
          cerrado: dia.cerrado,
        })
        // Al activarse se genera un codigo nuevo: el de una activacion
        // anterior pudo quedar publicado.
        if (activando) await regenerarCodigoAnticipado(dia.fecha)
      },
      { seccion: 'apertura', avisar: activando ? 'diasAdmin.codigoGenerado' : 'diasAdmin.guardado' },
    )
  }

  // El acceso anticipado se conserva solo si ya habia empezado.
  function abrirAhora() {
    const ahora = ahoraSanDiego()
    const anticipado = aCampo(dia.abre_anticipado_en)

    ejecutar(
      () =>
        actualizarDiaEntrega({
          fecha: dia.fecha,
          abreEn: ahora,
          abreAnticipadoEn: anticipado && anticipado <= ahora ? anticipado : null,
          cerrado: false,
        }),
      { seccion: 'apertura', avisar: 'diasAdmin.guardado' },
    )
  }

  function alternarRegistros() {
    if (!dia.cerrado && !window.confirm(t('diasAdmin.confirmarCerrar'))) return

    ejecutar(
      () =>
        actualizarDiaEntrega({
          fecha: dia.fecha,
          abreEn: aCampo(dia.abre_en),
          abreAnticipadoEn: aCampo(dia.abre_anticipado_en) || null,
          cerrado: !dia.cerrado,
        }),
      { seccion: 'apertura', avisar: 'diasAdmin.guardado' },
    )
  }

  function regenerar() {
    if (!window.confirm(t('diasAdmin.confirmarRegenerar'))) return
    ejecutar(() => regenerarCodigoAnticipado(dia.fecha), {
      seccion: 'apertura',
      avisar: 'diasAdmin.codigoGenerado',
    })
  }

  return (
    <Seccion titulo={t('diasAdmin.seccionApertura')}>
      {estado === 'programada' && (
        <p className="flex items-start gap-2 text-base font-semibold">
          <LuLock aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-accion" />
          {t('diasAdmin.seAbren', { cuando: formatearFechaHora(dia.abre_en, i18n.language) })}
        </p>
      )}
      {estado === 'abierta' && (
        <p className="flex items-center gap-2 text-base font-semibold text-puede-pasar">
          <LuCircleCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
          {t('diasAdmin.registrosAbiertos')}
        </p>
      )}
      {estado === 'cerrada' && (
        <p className="text-base font-semibold text-ya-recibio">{t('diasAdmin.registrosCerrados')}</p>
      )}

      <form className="mt-3 space-y-3" onSubmit={guardar}>
        <CamposApertura
          abreAnticipadoEn={abreAnticipadoEn}
          abreEn={abreEn}
          alCambiarAbreAnticipadoEn={setAbreAnticipadoEn}
          alCambiarAbreEn={setAbreEn}
          alCambiarAnticipo={setAnticipo}
          alCambiarConSuscriptores={setConSuscriptores}
          anticipo={anticipo}
          conSuscriptores={conSuscriptores}
          id={dia.fecha}
        >
          {/* El codigo solo existe para el publico una vez guardado el acceso. */}
          {dia.abre_anticipado_en ? (
            <>
              <CodigoCopiable autoCopiar={codigoRecien} codigo={dia.codigo_anticipado}>
                <button className={BOTON} disabled={ocupado} onClick={regenerar} type="button">
                  <LuRefreshCw aria-hidden="true" className="h-4 w-4" />
                  {t('diasAdmin.regenerar')}
                </button>
              </CodigoCopiable>
              <p className="text-base text-principal/70">
                {t('diasAdmin.codigoDetalle', {
                  cuando: formatearFechaHora(dia.abre_anticipado_en, i18n.language),
                })}{' '}
                {/* Si esto sube mucho antes de abrir, el codigo se filtro: generar otro. */}
                {t('diasAdmin.anticipadas', { count: dia.anticipadas })}
              </p>
            </>
          ) : (
            <p className="text-base font-semibold text-principal/70">{t('diasAdmin.guardaParaCodigo')}</p>
          )}
        </CamposApertura>

        <div className="flex flex-wrap gap-2">
          <button className={BOTON_FUERTE} disabled={ocupado} type="submit">
            {t('diasAdmin.guardarCambios')}
          </button>
          {estado === 'programada' && (
            <button className={BOTON} disabled={ocupado} onClick={abrirAhora} type="button">
              {t('diasAdmin.abrirAhora')}
            </button>
          )}
          <button className={BOTON} disabled={ocupado} onClick={alternarRegistros} type="button">
            {dia.cerrado ? t('diasAdmin.reabrirRegistros') : t('diasAdmin.cerrarRegistros')}
          </button>
        </div>
      </form>

      {mensaje}
    </Seccion>
  )
}

function FilaHorario({ bloque, ocupado, alGuardar, alAlternar, alEliminar }) {
  const { t } = useTranslation()
  const [capacidad, setCapacidad] = useState(String(bloque.capacidad))
  const cambio = capacidad !== '' && Number(capacidad) !== bloque.capacidad
  const hora = formatearHora(bloque.hora)

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <span className="w-20 text-base font-semibold">{hora}</span>
      <span className={`flex-1 text-base ${bloque.cerrado ? 'text-ya-recibio' : 'text-principal/70'}`}>
        {bloque.cerrado
          ? t('diasAdmin.horarioCerrado')
          : t('diasAdmin.ocupados', { ocupados: bloque.ocupados, total: bloque.capacidad })}
      </span>

      <input
        aria-label={t('diasAdmin.cupoDe', { hora })}
        className={ESTILO_INPUT}
        inputMode="numeric"
        min="0"
        onChange={(e) => setCapacidad(e.target.value)}
        type="number"
        value={capacidad}
      />
      {cambio && (
        <button className={BOTON_FUERTE} disabled={ocupado} onClick={() => alGuardar(Number(capacidad))} type="button">
          {t('diasAdmin.guardar')}
        </button>
      )}
      <button className={BOTON} disabled={ocupado} onClick={alAlternar} type="button">
        {bloque.cerrado ? t('diasAdmin.abrirHorario') : t('diasAdmin.cerrarHorario')}
      </button>
      {/* Con registros no se borra: se cierra. La base lo vuelve a revisar. */}
      {bloque.ocupados === 0 && (
        <button
          aria-label={t('diasAdmin.eliminarHorario', { hora })}
          className={`${BOTON} px-3 text-ya-recibio`}
          disabled={ocupado}
          onClick={alEliminar}
          title={t('diasAdmin.eliminarHorario', { hora })}
          type="button"
        >
          <LuTrash2 aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
    </li>
  )
}

/**
 * Un renglon de la lista de fechas. Plegado muestra fecha, lugares y estado;
 * abierto muestra todo editable: apertura (con suscriptores) y lugares.
 */
export default function DiaEntregaAdmin({ dia, abierta, alAlternar, alCambiar }) {
  const { t, i18n } = useTranslation()

  const [ocupado, setOcupado] = useState(false)
  // { seccion, error } o { seccion, ok: llave del texto }: el aviso sale en el bloque donde se actuo.
  const [mensaje, setMensaje] = useState(null)

  const [bloques, setBloques] = useState(null)
  const [recargaBloques, setRecargaBloques] = useState(0)
  const [todos, setTodos] = useState('20')
  const [nuevaHora, setNuevaHora] = useState('')
  const [preguntandoEliminar, setPreguntandoEliminar] = useState(false)
  const [nuevaCapacidad, setNuevaCapacidad] = useState('20')

  useEffect(() => {
    if (!abierta) return

    let vigente = true

    bloquesDelDia(dia.fecha)
      .then((resultado) => {
        if (vigente) setBloques(resultado)
      })
      .catch((e) => {
        if (vigente) setMensaje({ seccion: 'lugares', error: e.message })
      })

    return () => {
      vigente = false
    }
  }, [abierta, dia.fecha, recargaBloques])

  const estado = dia.cerrado ? 'cerrada' : dia.abierto ? 'abierta' : 'programada'

  const titulo = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(dia.fecha))

  async function ejecutar(accion, { seccion, conHorarios = false, avisar = null }) {
    setMensaje(null)
    setOcupado(true)

    try {
      await accion()
      if (conHorarios) setRecargaBloques((n) => n + 1)
      if (avisar) setMensaje({ seccion, ok: avisar })
      alCambiar()
      return true
    } catch (e) {
      setMensaje({ seccion, error: e.message })
      return false
    } finally {
      setOcupado(false)
    }
  }

  const mensajeDe = (seccion) =>
    mensaje?.seccion === seccion && (
      <p
        className={`mt-3 rounded-xl p-3 text-base ${
          mensaje.error ? 'bg-ya-recibio/10 text-ya-recibio' : 'bg-puede-pasar/10 font-semibold text-puede-pasar'
        }`}
        role={mensaje.error ? 'alert' : 'status'}
      >
        {mensaje.error
          ? t(`diasAdmin.errores.${mensaje.error}`, { defaultValue: t('diasAdmin.errores.ERROR_DESCONOCIDO') })
          : t(mensaje.ok)}
      </p>
    )

  // Uno por uno con la funcion de cada horario. Si se corta la conexion a
  // la mitad, la lista se recarga y se ve cuales ya cambiaron.
  function aplicarATodos(evento) {
    evento.preventDefault()
    const capacidad = Number(todos)

    ejecutar(
      async () => {
        for (const bloque of bloques ?? []) {
          if (bloque.capacidad !== capacidad) {
            await actualizarBloque({ bloqueId: bloque.bloque_id, capacidad })
          }
        }
      },
      { seccion: 'lugares', conHorarios: true, avisar: 'diasAdmin.guardado' },
    )
  }

  async function agregarHorario(evento) {
    evento.preventDefault()

    const listo = await ejecutar(
      () => agregarBloque({ fecha: dia.fecha, hora: nuevaHora, capacidad: Number(nuevaCapacidad) }),
      { seccion: 'lugares', conHorarios: true },
    )

    if (listo) setNuevaHora('')
  }

  function eliminarFecha() {
    setPreguntandoEliminar(false)
    ejecutar(() => eliminarDiaEntrega(dia.fecha), { seccion: 'eliminar' })
  }

  return (
    <li>
      <button
        aria-expanded={abierta}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-principal/5"
        onClick={alAlternar}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold first-letter:uppercase">{titulo}</span>
          <span className="block text-base text-principal/70">
            {t('diasAdmin.lugares', { ocupados: dia.ocupados, total: dia.capacidad_total })}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-3 py-1 text-base font-semibold ${ESTILO_ESTADO[estado]}`}>
          {t(`diasAdmin.estado.${estado}`)}
        </span>
        <LuChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`}
        />
      </button>

      {abierta && (
        <div className="mb-3 space-y-3 rounded-xl bg-principal/5 p-3">
          {/* La llave reinicia el formulario con lo guardado despues de cada cambio. */}
          <Apertura
            codigoRecien={mensaje?.ok === 'diasAdmin.codigoGenerado'}
            dia={dia}
            ejecutar={ejecutar}
            estado={estado}
            key={`${dia.abre_en}|${dia.abre_anticipado_en}|${dia.cerrado}`}
            mensaje={mensajeDe('apertura')}
            ocupado={ocupado}
          />

          <Seccion titulo={t('diasAdmin.seccionLugares')}>
            {bloques === null ? (
              <p className="text-base">{t('diasAdmin.cargandoHorarios')}</p>
            ) : (
              <>
                <form
                  className="flex flex-wrap items-end gap-2 rounded-xl bg-principal/5 p-3"
                  onSubmit={aplicarATodos}
                >
                  <label className="flex flex-col gap-1" htmlFor={`todos-${dia.fecha}`}>
                    <span className="text-base font-semibold">{t('diasAdmin.todos')}</span>
                    <input
                      className={ESTILO_INPUT}
                      id={`todos-${dia.fecha}`}
                      inputMode="numeric"
                      min="0"
                      onChange={(e) => setTodos(e.target.value)}
                      required
                      type="number"
                      value={todos}
                    />
                  </label>
                  <button className={BOTON_FUERTE} disabled={ocupado || bloques.length === 0} type="submit">
                    {t('diasAdmin.aplicarTodos')}
                  </button>
                </form>

                {mensajeDe('lugares')}

                <ul className="mt-2 divide-y divide-principal/10">
                  {bloques.map((bloque) => (
                    <FilaHorario
                      alAlternar={() =>
                        ejecutar(
                          () => actualizarBloque({ bloqueId: bloque.bloque_id, cerrado: !bloque.cerrado }),
                          { seccion: 'lugares', conHorarios: true },
                        )
                      }
                      alEliminar={() => {
                        if (!window.confirm(t('diasAdmin.confirmarEliminarHorario'))) return
                        ejecutar(() => eliminarBloque(bloque.bloque_id), { seccion: 'lugares', conHorarios: true })
                      }}
                      alGuardar={(capacidad) =>
                        ejecutar(() => actualizarBloque({ bloqueId: bloque.bloque_id, capacidad }), {
                          seccion: 'lugares',
                          conHorarios: true,
                        })
                      }
                      bloque={bloque}
                      // La capacidad en la llave reinicia el campo cuando se guarda.
                      key={`${bloque.bloque_id}-${bloque.capacidad}`}
                      ocupado={ocupado}
                    />
                  ))}
                </ul>

                <form
                  className="mt-2 flex flex-wrap items-end gap-2 border-t border-principal/10 pt-3"
                  onSubmit={agregarHorario}
                >
                  <label className="flex flex-col gap-1" htmlFor={`nuevaHora-${dia.fecha}`}>
                    <span className="text-base font-semibold">{t('diasAdmin.hora')}</span>
                    <input
                      className={`${ESTILO_INPUT} w-36`}
                      id={`nuevaHora-${dia.fecha}`}
                      onChange={(e) => setNuevaHora(e.target.value)}
                      required
                      step="900"
                      type="time"
                      value={nuevaHora}
                    />
                  </label>
                  <label className="flex flex-col gap-1" htmlFor={`nuevaCapacidad-${dia.fecha}`}>
                    <span className="text-base font-semibold">{t('diasAdmin.cupo')}</span>
                    <input
                      className={ESTILO_INPUT}
                      id={`nuevaCapacidad-${dia.fecha}`}
                      inputMode="numeric"
                      min="0"
                      onChange={(e) => setNuevaCapacidad(e.target.value)}
                      required
                      type="number"
                      value={nuevaCapacidad}
                    />
                  </label>
                  <button className={BOTON} disabled={ocupado} type="submit">
                    {t('diasAdmin.agregar')}
                  </button>
                </form>
              </>
            )}
          </Seccion>

          {/* Solo sin registros. Con registros se cierra, no se borra:
              borrarla le quitaria la cita a alguien sin que se entere. */}
          {dia.ocupados > 0 ? (
            <p className="rounded-xl bg-principal/5 p-3 text-base text-principal/80">
              {t('diasAdmin.noSeElimina', { count: dia.ocupados })}
            </p>
          ) : preguntandoEliminar ? (
            <div
              aria-labelledby="pregunta-eliminar-fecha"
              className="rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-4"
              role="alertdialog"
            >
              <p className="flex items-start gap-2 text-base font-semibold text-principal" id="pregunta-eliminar-fecha">
                <LuTriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-ya-recibio" />
                {t('diasAdmin.confirmarEliminarFecha', { fecha: titulo })}
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="inline-flex min-h-14 items-center justify-center rounded-xl bg-ya-recibio px-4 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  disabled={ocupado}
                  onClick={eliminarFecha}
                  type="button"
                >
                  {t('diasAdmin.siEliminar')}
                </button>
                <button
                  className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/25 bg-white px-4 text-base font-bold text-principal transition hover:border-principal"
                  onClick={() => setPreguntandoEliminar(false)}
                  type="button"
                >
                  {t('diasAdmin.noEliminar')}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="min-h-12 px-1 text-base font-semibold text-ya-recibio underline underline-offset-4 disabled:opacity-50"
              disabled={ocupado}
              onClick={() => setPreguntandoEliminar(true)}
              type="button"
            >
              {t('diasAdmin.eliminarFecha')}
            </button>
          )}
          {mensajeDe('eliminar')}
        </div>
      )}
    </li>
  )
}
