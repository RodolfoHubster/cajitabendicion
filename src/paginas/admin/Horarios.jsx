import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPlus } from 'react-icons/lu'
import Boton from '../../componentes/Boton'
import CamposApertura from '../../componentes/CamposApertura'
import Campo from '../../componentes/Campo'
import CodigoCopiable from '../../componentes/CodigoCopiable'
import DiaEntregaAdmin from '../../componentes/DiaEntregaAdmin'
import Tarjeta from '../../componentes/Tarjeta'
import {
  calcularAnticipado,
  crearDiaEntrega,
  listarDiasEntrega,
  suscriptoresSinEfecto,
  totalDeLugares,
} from '../../datos/diasEntrega'
import { ahoraSanDiego, sumarDias } from '../../datos/disponibilidad'

const ESTILO_SELECT =
  'min-h-14 w-full rounded-xl border border-principal/25 bg-white px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

const BOTON_CANCELAR =
  'inline-flex min-h-14 w-full items-center justify-center rounded-xl border border-principal/25 bg-white px-4 text-base font-bold text-principal transition hover:border-principal'

const mensajeError = (t, codigo) =>
  t(`diasAdmin.errores.${codigo}`, { defaultValue: t('diasAdmin.errores.ERROR_DESCONOCIDO') })

function NuevoDia({ alCrear, alCancelar }) {
  const { t } = useTranslation()

  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('14:00')
  const [horaFin, setHoraFin] = useState('18:30')
  const [capacidad, setCapacidad] = useState('20')

  // Cuanta gente cabe con lo que lleva escrito, al vuelo.
  const cabe = totalDeLugares(horaInicio, horaFin, capacidad)
  const [cuando, setCuando] = useState('programar')
  const [abreEn, setAbreEn] = useState('')
  const [conSuscriptores, setConSuscriptores] = useState(false)
  const [anticipo, setAnticipo] = useState('unDia')
  const [abreAnticipadoEn, setAbreAnticipadoEn] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  // Al escoger la fecha se propone abrir 3 dias antes a las 12:00 PM (el
  // formulario del lunes se arma el viernes). Se puede cambiar.
  function elegirFecha(valor) {
    setFecha(valor)
    if (valor) setAbreEn(`${sumarDias(valor, -3)}T12:00`)
  }

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)

    if (cuando !== 'ahora' && suscriptoresSinEfecto(conSuscriptores, abreEn)) {
      setError('SUSCRIPTORES_FECHA_ABIERTA')
      return
    }

    setEnviando(true)

    const ahora = cuando === 'ahora'
    const anticipado =
      !ahora && conSuscriptores ? calcularAnticipado(abreEn, anticipo, abreAnticipadoEn) : null

    try {
      // La base genera el codigo al azar al crear la fecha.
      const codigo = await crearDiaEntrega({
        fecha,
        horaInicio,
        horaFin,
        capacidad: Number(capacidad),
        abreEn: ahora ? ahoraSanDiego() : abreEn,
        abreAnticipadoEn: anticipado,
      })
      alCrear(fecha, anticipado ? codigo : '')
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <h2 className="mb-4 text-xl font-bold">{t('diasAdmin.nueva')}</h2>

      <form className="max-w-3xl space-y-4" onSubmit={enviar}>
        <Campo
          etiqueta={t('diasAdmin.fecha')}
          id="nuevaFecha"
          onChange={(e) => elegirFecha(e.target.value)}
          required
          type="date"
          value={fecha}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Campo
            etiqueta={t('diasAdmin.desde')}
            id="horaInicio"
            onChange={(e) => setHoraInicio(e.target.value)}
            required
            step="900"
            type="time"
            value={horaInicio}
          />
          <Campo
            etiqueta={t('diasAdmin.hasta')}
            id="horaFin"
            onChange={(e) => setHoraFin(e.target.value)}
            required
            step="900"
            type="time"
            value={horaFin}
          />
          <div className="col-span-2 sm:col-span-1">
            <Campo
              etiqueta={t('diasAdmin.capacidad')}
              id="capacidad"
              inputMode="numeric"
              min="0"
              onChange={(e) => setCapacidad(e.target.value)}
              required
              type="number"
              value={capacidad}
            />
          </div>
        </div>

        {/* La cuenta completa antes de crear nada: es facil poner 20 en
            cada horario sin caer en que son 380 cajas ese dia. */}
        {cabe && (
          <p className="rounded-xl bg-principal/5 p-3 text-base text-principal" role="status">
            {t('diasAdmin.cabenEnTotal', cabe)}
          </p>
        )}

        <label className="flex flex-col gap-2" htmlFor="cuandoAbre">
          <span className="text-base font-semibold text-principal">{t('diasAdmin.cuandoAbre')}</span>
          <select
            className={ESTILO_SELECT}
            id="cuandoAbre"
            onChange={(e) => setCuando(e.target.value)}
            value={cuando}
          >
            <option value="programar">{t('diasAdmin.abreProgramado')}</option>
            <option value="ahora">{t('diasAdmin.abreAhora')}</option>
          </select>
        </label>

        {cuando === 'programar' &&
          (fecha ? (
            <CamposApertura
              abreAnticipadoEn={abreAnticipadoEn}
              abreEn={abreEn}
              alCambiarAbreAnticipadoEn={setAbreAnticipadoEn}
              alCambiarAbreEn={setAbreEn}
              alCambiarAnticipo={setAnticipo}
              alCambiarConSuscriptores={setConSuscriptores}
              anticipo={anticipo}
              conSuscriptores={conSuscriptores}
              id="nueva"
            />
          ) : (
            <p className="text-base text-principal/60">{t('diasAdmin.eligeFecha')}</p>
          ))}

        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {mensajeError(t, error)}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Boton disabled={enviando} type="submit">
            {enviando ? t('diasAdmin.creando') : t('diasAdmin.crear')}
          </Boton>
          <button className={BOTON_CANCELAR} onClick={alCancelar} type="button">
            {t('diasAdmin.cancelar')}
          </button>
        </div>
      </form>
    </Tarjeta>
  )
}

/**
 * Horarios y cupos: las fechas de entrega, cuando se abren sus registros,
 * el acceso de suscriptores y los lugares de cada horario.
 *
 * La lista muestra un renglon por fecha; al tocarla se abre con todo
 * editable. La primera se abre sola para que se vea que se puede editar.
 */
export default function HorariosAdmin() {
  const { t } = useTranslation()

  const [dias, setDias] = useState(null)
  const [error, setError] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [creando, setCreando] = useState(false)
  // undefined: todavia no se decide cual abrir. null: todas plegadas a mano.
  const [abierta, setAbierta] = useState(undefined)
  // null: nada que avisar. '': se creo sin suscriptores. Texto: su codigo.
  const [creada, setCreada] = useState(null)

  const recargar = () => setRecarga((n) => n + 1)

  useEffect(() => {
    let vigente = true

    listarDiasEntrega()
      .then((resultado) => {
        if (!vigente) return
        setDias(resultado)
        setError(null)
        setAbierta((actual) => (actual === undefined ? (resultado[0]?.fecha ?? null) : actual))
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })

    return () => {
      vigente = false
    }
  }, [recarga])

  function alCrear(fecha, codigo) {
    setCreando(false)
    setCreada(codigo)
    setAbierta(fecha)
    recargar()
  }

  return (
    <div className="space-y-4">
      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t('diasAdmin.titulo')}</h1>
            <p className="text-base text-principal/70">{t('diasAdmin.ayuda')}</p>
          </div>
          {!creando && (
            <Boton
              className="sm:w-auto sm:px-6"
              onClick={() => {
                setCreada(null)
                setCreando(true)
              }}
            >
              <LuPlus aria-hidden="true" className="h-5 w-5" />
              {t('diasAdmin.nueva')}
            </Boton>
          )}
        </div>

        {creada !== null && (
          <div className="mt-3 space-y-2 rounded-xl bg-puede-pasar/10 p-3" role="status">
            <p className="text-base font-semibold text-puede-pasar">
              {creada ? t('diasAdmin.creadaConCodigo') : t('diasAdmin.creada')}
            </p>
            {creada && <CodigoCopiable autoCopiar codigo={creada} />}
          </div>
        )}
      </Tarjeta>

      {creando && <NuevoDia alCancelar={() => setCreando(false)} alCrear={alCrear} />}

      <Tarjeta>
        <h2 className="mb-2 text-xl font-bold">{t('diasAdmin.lista')}</h2>

        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {mensajeError(t, error)}
          </p>
        )}
        {!error && dias === null && <p className="text-base">{t('diasAdmin.cargando')}</p>}
        {dias && dias.length === 0 && <p className="text-base">{t('diasAdmin.sinDias')}</p>}

        {dias && dias.length > 0 && (
          <ul className="divide-y divide-principal/10">
            {dias.map((dia) => (
              <DiaEntregaAdmin
                abierta={abierta === dia.fecha}
                alAlternar={() => setAbierta((actual) => (actual === dia.fecha ? null : dia.fecha))}
                alCambiar={recargar}
                dia={dia}
                key={dia.fecha}
              />
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  )
}
