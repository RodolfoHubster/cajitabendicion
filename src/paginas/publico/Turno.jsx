import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import { LuBellRing, LuCheck, LuHandHeart, LuShieldCheck, LuTicket, LuTriangleAlert } from 'react-icons/lu'
import AperturaFilaAPie from '../../componentes/AperturaFilaAPie'
import Boton from '../../componentes/Boton'
import CampoCodigo from '../../componentes/CampoCodigo'
import { Hueso } from '../../componentes/Esqueleto'
import Tarjeta from '../../componentes/Tarjeta'
import TurnoEnVivo from '../../componentes/TurnoEnVivo'
import { avisosPublicos, textoDeAviso } from '../../datos/avisos'
import { dibujarQR } from '../../datos/cita'
import { formatearHora, segundosHasta } from '../../datos/disponibilidad'
import {
  consultarFilasAPie,
  estadoFilaAPie,
  filaAlDia,
  siguienteFilaAPie,
  situacionDelTurno,
} from '../../datos/filaAPie'
import { hoyLocal } from '../../datos/panel'
import { prepararSonido } from '../../datos/sonido'
import {
  RESULTADOS_DE_CODIGO,
  filaAPieHoy,
  guardarMiTurno,
  leerMiTurno,
  olvidarMiTurno,
  relojDeEspera,
  sacarTurnoAPie,
  traeTurno,
} from '../../datos/turnoAPie'

//  Las reglas de respaldo: si la base no responde o la seccion esta vacia.
//  Las de verdad son las de "Textos y reglas > Reglas > Fila a pie".
const AVISOS = ['sinDatos', 'soloHoy', 'abierta', 'teLlaman', 'cadaQuien']
const ICONO_AVISO = { sinDatos: LuShieldCheck, soloHoy: LuTicket, abierta: LuBellRing, teLlaman: LuTriangleAlert, cadaQuien: LuHandHeart }

/** Hoy ya no se puede sacar turno: abajo, cuando es la proxima fila. */
const SIN_TURNO_HOY = ['no_hay', 'terminada', 'cerrada', 'llena']

/** "2026-10-08T09:00:00" (hora de San Diego) -> "9:00 AM". */
const horaDe = (marca) => (marca ? formatearHora(String(marca).slice(11, 19)) : '')

/** Si no llega cuanto esperar, el freno de la base: 5 minutos. */
const FRENO_SEGUNDOS = 300

/**
 * El turno a pie SIN DATOS, desde el QR general de la entrada (seccion 42
 * de la base). Un boton grande: "Sacar mi turno". No se pide nombre, edad
 * ni telefono. Despues: el numero en grande, su QR, la fila en vivo, y el
 * telefono suena y vibra cuando falta poco y cuando le toca.
 *
 * Si ese dia se pide el codigo del dia (seccion 43), se escribe antes del
 * boton: esta en el pizarron de la entrada. Con 5 codigos mal, el telefono
 * espera 5 minutos (se ve la cuenta regresiva).
 *
 * Antes de que abra (o si hoy no hay fila), cuando se abren los turnos y
 * cuanto falta: el boton aparece solo a esa hora, sin recargar.
 */
export default function Turno() {
  const { t, i18n } = useTranslation()
  const hoy = hoyLocal()

  //  El turno de hoy de este telefono, si ya lo saco.
  const [miTurno, setMiTurno] = useState(() => leerMiTurno(hoy))
  const [qr, setQr] = useState(null)
  const [situacion, setSituacion] = useState(null)
  const [avisoVisto, setAvisoVisto] = useState(false)

  //  La fila de hoy: si hay, si ya abrio, a que hora y si pide el codigo del dia.
  const [fila, setFila] = useState(undefined)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  //  Lo que contesto la base al tocar el boton, cuando no fue un turno.
  const [respuesta, setRespuesta] = useState(null)
  //  La siguiente fila despues de hoy (null: no hay; undefined: no se sabe).
  const [proxima, setProxima] = useState(undefined)
  //  Al llegar la hora de apertura se vuelve a preguntar a la base.
  const [recarga, setRecarga] = useState(0)
  const volverAPreguntar = useCallback(() => setRecarga((n) => n + 1), [])

  //  El codigo del dia: lo que escribe, si la base lo pidio y que paso.
  const [codigoDia, setCodigoDia] = useState('')
  const [pideCodigo, setPideCodigo] = useState(false)
  const [avisoCodigo, setAvisoCodigo] = useState(null)
  //  Tenia cita en carro (seccion 46): su codigo CB, para cambiarse a pie
  //  aunque abra esta pagina en otro navegador.
  const [conCarro, setConCarro] = useState(false)
  const [codigoCarro, setCodigoCarro] = useState('')
  const [avisoCarro, setAvisoCarro] = useState(null)
  //  Frenado por intentos fallidos: hasta cuando (y la hora, para la cuenta regresiva).
  const [frenoHasta, setFrenoHasta] = useState(0)
  const [ahora, setAhora] = useState(0)
  //  Las reglas que el pastor edita en Textos y reglas (registro_a_pie).
  //  null: preguntando; []: no hay o no respondio (salen las de respaldo).
  const [reglas, setReglas] = useState(null)

  useEffect(() => {
    let vigente = true
    avisosPublicos('registro_a_pie')
      .then((lista) => {
        if (vigente) setReglas(lista)
      })
      .catch(() => {
        if (vigente) setReglas([])
      })
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    if (miTurno) return undefined
    let vigente = true
    //  Si la base todavia no sabe del codigo del dia, la fila se ve igual.
    Promise.all([consultarFilasAPie(hoy), filaAPieHoy().catch(() => null)])
      .then(([filas, deHoy]) => {
        if (!vigente) return
        const disponible = filas.find((f) => f.fecha === hoy) ?? null
        setProxima(siguienteFilaAPie(filas, hoy))
        if (deHoy?.cerrada) {
          setFila({ ...(disponible ?? {}), cerrada: true, terminada: Boolean(deHoy.terminada) })
        } else {
          setFila(
            disponible
              ? { ...disponible, pide_codigo: Boolean(deHoy?.pide_codigo), codigo_hasta: deHoy?.codigo_hasta ?? null }
              : null,
          )
        }
      })
      .catch(() => {
        if (vigente) setFila(null)
      })
    return () => {
      vigente = false
    }
  }, [hoy, miTurno, recarga])

  //  El codigo del dia deja de pedirse a cierta hora (seccion 47): a esa
  //  hora se vuelve a preguntar y el campo se quita solo. Unos segundos de
  //  mas, por si el reloj del telefono va adelantado; si la base todavia lo
  //  pide, se vuelve a preguntar cada 30 segundos.
  const codigoHasta = fila?.pide_codigo ? fila.codigo_hasta : null
  useEffect(() => {
    if (!codigoHasta) return undefined
    const segundos = segundosHasta(codigoHasta)
    const reloj = setTimeout(
      () => {
        setPideCodigo(false)
        setAvisoCodigo(null)
        volverAPreguntar()
      },
      segundos > 0 ? segundos * 1000 + 2000 : 30000,
    )
    return () => clearTimeout(reloj)
  }, [codigoHasta, recarga, volverAPreguntar])

  useEffect(() => {
    if (!miTurno?.token) return undefined
    let vigente = true
    dibujarQR(miTurno.token, 'a_pie')
      .then((imagen) => {
        if (vigente) setQr(imagen)
      })
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [miTurno?.token])

  //  La cuenta regresiva del freno: cada segundo, hasta que se puede otra vez.
  useEffect(() => {
    if (!frenoHasta) return undefined
    const reloj = setInterval(() => {
      const ya = Date.now()
      setAhora(ya)
      if (ya >= frenoHasta) {
        setFrenoHasta(0)
        setAvisoCodigo(null)
      }
    }, 1000)
    return () => clearInterval(reloj)
  }, [frenoHasta])

  const segundosFreno = frenoHasta ? Math.max(0, (frenoHasta - ahora) / 1000) : 0
  const frenado = segundosFreno > 0

  async function sacar(cambiarCarro = false) {
    //  Dentro del toque: asi el telefono deja sonar cuando le toque.
    prepararSonido()
    setOcupado(true)
    setError(null)
    try {
      //  Los codigos se quedan escritos: si tiene cita de carro, el segundo
      //  toque los vuelve a mandar. El de carro, solo si esta completo.
      const r = await sacarTurnoAPie({
        cambiarCarro,
        codigo: codigoDia,
        codigoCarro: conCarro && codigoCarro.length >= 4 ? codigoCarro : '',
      })
      if (traeTurno(r)) {
        const nuevo = { fecha: hoy, token: r.token_qr, turno: r.turno, codigo: r.codigo }
        guardarMiTurno(nuevo)
        setMiTurno(nuevo)
        setRespuesta(null)
        setAvisoCodigo(null)
        setAvisoCarro(null)
      } else if (r?.resultado === 'CODIGO_CARRO_NO_EXISTE') {
        setRespuesta(null)
        setAvisoCarro(r.resultado)
      } else if (RESULTADOS_DE_CODIGO.includes(r?.resultado)) {
        //  El freno tambien llega por codigos de carro mal escritos: el
        //  codigo del dia solo se pide si la base lo pidio.
        if (r.resultado !== 'DEMASIADOS_INTENTOS') setPideCodigo(true)
        setRespuesta(null)
        setAvisoCodigo(r.resultado)
        if (r.resultado === 'CODIGO_INCORRECTO') setCodigoDia('')
        if (r.resultado === 'DEMASIADOS_INTENTOS') {
          const ya = Date.now()
          setAhora(ya)
          setFrenoHasta(ya + (Number(r.espera) || FRENO_SEGUNDOS) * 1000)
        }
      } else {
        setRespuesta(r)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  const encabezado = (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accion/20">
        <FaPersonWalking aria-hidden="true" className="h-7 w-7 text-principal" />
      </span>
      <div>
        <h1 className="text-2xl font-bold">{t('turnoAPie.titulo')}</h1>
        <p className="text-base text-principal/70">{t('turnoAPie.subtitulo')}</p>
      </div>
    </div>
  )

  const avisos = reglas?.length ? (
    <ul className="space-y-2">
      {reglas.map((regla) => (
        <li className="flex items-start gap-3 rounded-xl bg-principal/5 p-3 text-base text-principal" key={regla.id}>
          <LuCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
          {textoDeAviso(regla, i18n.language)}
        </li>
      ))}
    </ul>
  ) : reglas === null ? null : (
    <ul className="space-y-2">
      {AVISOS.map((clave) => {
        const Icono = ICONO_AVISO[clave]
        return (
          <li className="flex items-start gap-3 rounded-xl bg-principal/5 p-3 text-base text-principal" key={clave}>
            <Icono aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
            {t(`turnoAPie.avisos.${clave}`)}
          </li>
        )
      })}
    </ul>
  )

  //  Su turno se anulo (llego tarde): se olvida y saca uno nuevo, al final.
  function sacarOtro() {
    olvidarMiTurno()
    setMiTurno(null)
    setQr(null)
    setSituacion(null)
    setAvisoVisto(false)
    setRespuesta(null)
  }

  // ---------------- Ya tiene su turno ----------------
  if (miTurno) {
    const esTuTurno = situacion?.tipo === 'tuTurno'
    //  Anulado (seccion 46): ni su numero ni su QR sirven ya; no se ensenan.
    const anulado = situacion?.tipo === 'anulado'

    return (
      <div className="space-y-4">
        <Tarjeta>
          {encabezado}
          <TurnoEnVivo
            accionPerdido={
              <button
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 text-lg font-bold text-sobre-accion shadow-sm"
                onClick={sacarOtro}
                type="button"
              >
                <LuTicket aria-hidden="true" className="h-6 w-6" />
                {t('turnoAPie.otroTurno')}
              </button>
            }
            alCambiar={(datos) => setSituacion(situacionDelTurno(datos))}
            esHoy
            token={miTurno.token}
            turnoInicial={miTurno.turno}
          />

          {!anulado && (
            <>
            {/* Mucha gente abre el QR en una ventana privada y, si se le cierra,
                pierde la pagina. Con su numero, la voluntaria le entrega igual. */}
            <p className="mt-3 rounded-xl border-2 border-accion bg-accion/10 p-3 text-base font-semibold text-principal">
              {t('turnoAPie.anotalo', { turno: miTurno.turno })}
            </p>

            <div className="mt-4">
              {qr ? (
                <img
                  alt={t('confirmacion.qrAlt')}
                  className="aparecer mx-auto w-full max-w-[16rem] rounded-xl border-4 border-accion bg-white p-2 shadow-sm"
                  src={qr}
                />
              ) : (
                <Hueso className="mx-auto h-64 w-64 max-w-full" />
              )}
            </div>

            <div className="mt-4 rounded-xl border-2 border-dashed border-principal/25 p-3 text-center">
              <p className="text-base text-principal/70">{t('confirmacion.siNoSeLee')}</p>
              <p className="font-titulo text-3xl font-bold tracking-wide text-principal">{miTurno.codigo}</p>
              <p className="mt-1 text-base text-principal/80">{t('turnoAPie.codigoEsTuyo')}</p>
            </div>
            </>
          )}
        </Tarjeta>

        <Tarjeta>{avisos}</Tarjeta>

        {/* Le toca: la pantalla completa en verde, para que se vea desde lejos. */}
        {esTuTurno && !avisoVisto && (
          <div
            aria-live="assertive"
            className="aparecer fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#1F7A47] p-6 text-center text-white"
            role="alert"
          >
            <LuBellRing aria-hidden="true" className="h-16 w-16 animate-bounce" />
            <p className="font-titulo text-4xl font-bold">{t('turnoAPie.esTuTurno')}</p>
            <p className="font-titulo text-8xl font-bold leading-none">{miTurno.turno}</p>
            <p className="max-w-xs text-xl">{t('turnoAPie.acercate')}</p>
            <button
              className="mt-2 inline-flex min-h-14 items-center justify-center rounded-xl bg-white px-8 text-lg font-bold text-[#1F7A47]"
              onClick={() => setAvisoVisto(true)}
              type="button"
            >
              {t('turnoAPie.verMiQr')}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ---------------- Todavia no tiene turno ----------------
  const estado =
    fila === undefined
      ? 'cargando'
      : fila?.terminada
        ? 'terminada'
        : fila?.cerrada
          ? 'cerrada'
          : estadoFilaAPie(filaAlDia(fila))
  const conCodigo = Boolean(fila?.pide_codigo) || pideCodigo
  const faltaEscribir = conCodigo && codigoDia.length < 4

  return (
    <div className="space-y-4">
      <Tarjeta>
        {encabezado}

        {estado === 'cargando' && (
          <div className="space-y-3" role="status">
            <span className="sr-only">{t('turnoAPie.revisando')}</span>
            <Hueso className="h-28 w-full" />
            <Hueso className="h-5 w-2/3" />
          </div>
        )}

        {/* Sin fila hoy ni fecha proxima: "por ahora no hay; cuando haya, aqui mismo". */}
        {estado === 'no_hay' && (
          <p className="text-lg">{t(proxima === null ? 'aPie.noHay' : 'turnoAPie.noHay')}</p>
        )}

        {estado === 'terminada' && (
          <p className="rounded-xl bg-principal/10 p-4 text-lg font-semibold text-principal" role="status">
            {t('turnoAPie.terminada')}
          </p>
        )}

        {estado === 'cerrada' && (
          <p className="rounded-xl bg-accion/15 p-4 text-lg font-semibold text-principal" role="status">
            {t('turnoAPie.resultado.CERRADA')}
          </p>
        )}

        {estado === 'por_abrir' && (
          <AperturaFilaAPie alAbrir={volverAPreguntar} esHoy fila={fila} key={fila.abre_en} />
        )}

        {estado === 'llena' && <p className="text-lg">{t('turnoAPie.llena')}</p>}

        {SIN_TURNO_HOY.includes(estado) && proxima && (
          <AperturaFilaAPie alAbrir={volverAPreguntar} fila={proxima} key={proxima.abre_en} />
        )}

        {/* Ya abrio: el codigo del dia (si se pide) y el boton grande. */}
        {estado === 'abierta' && !respuesta && (
          <form
            onSubmit={(evento) => {
              evento.preventDefault()
              sacar(false)
            }}
          >
            {conCodigo && (
              <div className="mb-3 rounded-2xl border-2 border-principal/20 p-4">
                <label className="block text-lg font-bold text-principal" htmlFor="codigo-del-dia">
                  {t('turnoAPie.codigo.etiqueta')}
                </label>
                <p className="text-base text-principal/80" id="codigo-del-dia-ayuda">
                  {t('turnoAPie.codigo.ayuda')}
                </p>
                <input
                  aria-describedby="codigo-del-dia-ayuda"
                  autoComplete="off"
                  className="mt-2 min-h-16 w-full rounded-xl border-2 border-principal/30 bg-superficie px-4 text-center font-titulo text-4xl font-bold tracking-[0.4em] text-principal focus:border-principal disabled:opacity-60"
                  disabled={frenado}
                  enterKeyHint="go"
                  id="codigo-del-dia"
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => setCodigoDia(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  pattern="[0-9]*"
                  placeholder="····"
                  value={codigoDia}
                />
                {avisoCodigo && (
                  <p
                    className={`mt-2 rounded-xl p-3 text-base font-semibold ${
                      avisoCodigo === 'FALTA_CODIGO' ? 'bg-accion/15 text-principal' : 'bg-ya-recibio/10 text-ya-recibio'
                    }`}
                    role="alert"
                  >
                    {t(`turnoAPie.codigo.${avisoCodigo}`, { reloj: relojDeEspera(segundosFreno) })}
                  </p>
                )}
              </div>
            )}

            <button
              className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl bg-accion px-4 py-5 text-sobre-accion shadow-md transition hover:brightness-95 disabled:opacity-60"
              disabled={ocupado || frenado || faltaEscribir}
              type="submit"
            >
              <LuTicket aria-hidden="true" className="h-9 w-9" />
              <span className="font-titulo text-3xl font-bold">
                {frenado
                  ? t('turnoAPie.codigo.esperaBoton', { reloj: relojDeEspera(segundosFreno) })
                  : ocupado
                    ? t('turnoAPie.sacando')
                    : t('turnoAPie.boton')}
              </span>
            </button>
            {fila?.hora && (
              <p className="mt-2 text-center text-base text-principal/80">
                {t('turnoAPie.empiezaA', { hora: formatearHora(fila.hora) })}
              </p>
            )}
            {/* Tenia cita en carro (seccion 46): con su codigo CB se cambia a
                pie aunque abra esta pagina en otro navegador (el de la camara
                y no el de Facebook, donde hizo su cita). */}
            {conCarro ? (
              <div className="aparecer mt-4 space-y-3 rounded-2xl border-2 border-principal/20 p-4">
                <p className="flex items-center gap-2 text-lg font-bold text-principal">
                  <FaCarSide aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
                  {t('turnoAPie.carroCodigo.titulo')}
                </p>
                <p className="text-base text-principal">{t('turnoAPie.carroCodigo.ayuda')}</p>
                <CampoCodigo
                  alCambiar={(numeros) => {
                    setCodigoCarro(numeros)
                    setAvisoCarro(null)
                  }}
                  ayuda={t('turnoAPie.carroCodigo.campoAyuda')}
                  etiqueta={t('turnoAPie.carroCodigo.etiqueta')}
                  id="codigo-carro"
                  valor={codigoCarro}
                />
                {(avisoCarro || (frenado && !conCodigo)) && (
                  <p className="rounded-xl bg-ya-recibio/10 p-3 text-base font-semibold text-ya-recibio" role="alert">
                    {avisoCarro
                      ? t(`turnoAPie.carroCodigo.${avisoCarro}`)
                      : t('turnoAPie.codigo.DEMASIADOS_INTENTOS', { reloj: relojDeEspera(segundosFreno) })}
                  </p>
                )}
                <Boton disabled={ocupado || frenado || faltaEscribir || codigoCarro.length < 4} type="submit">
                  <FaCarSide aria-hidden="true" className="h-5 w-5 shrink-0" />
                  {t('turnoAPie.carroCodigo.boton')}
                </Boton>
                <button
                  className="inline-flex min-h-12 w-full items-center justify-center text-base font-semibold text-principal underline underline-offset-4"
                  onClick={() => {
                    setConCarro(false)
                    setCodigoCarro('')
                    setAvisoCarro(null)
                  }}
                  type="button"
                >
                  {t('turnoAPie.carroCodigo.cancelar')}
                </button>
              </div>
            ) : (
              <button
                className="mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-principal/25 px-4 text-base font-semibold text-principal transition hover:border-principal"
                onClick={() => setConCarro(true)}
                type="button"
              >
                <FaCarSide aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
                {t('turnoAPie.carroCodigo.abrir')}
              </button>
            )}

            {/* Para no sacar un segundo turno hasta atras. */}
            <p className="mt-3 rounded-xl bg-principal/5 p-3 text-base text-principal">{t('turnoAPie.yaTenias')}</p>
          </form>
        )}

        {/* Tiene cita de carro hoy: se le pregunta antes de cancelarla. */}
        {respuesta?.resultado === 'TIENE_CITA_EN_CARRO' && (
          <div className="aparecer space-y-3 rounded-2xl border-2 border-accion bg-accion/10 p-4">
            <p className="flex items-start gap-2 text-lg font-bold text-principal">
              <LuTriangleAlert aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-accion" />
              {t('turnoAPie.carro.titulo', { hora: formatearHora(respuesta.hora_carro) })}
            </p>
            <p className="text-base text-principal">{t('turnoAPie.carro.texto', { count: respuesta.citas_carro })}</p>
            {/* Es el dueno del carro: el carro sale de la fila con todo y sus acompanantes. */}
            {respuesta.acompanantes > 0 && (
              <p className="rounded-xl border-2 border-ya-recibio bg-ya-recibio/10 p-3 text-base font-bold text-principal">
                {t('turnoAPie.carro.duenio', { count: respuesta.acompanantes })}
              </p>
            )}
            <p className="text-base font-semibold text-principal">{t('turnoAPie.carro.seguro')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="inline-flex min-h-14 items-center justify-center rounded-xl bg-marca px-4 text-base font-bold text-white disabled:opacity-60"
                disabled={ocupado}
                onClick={() => sacar(true)}
                type="button"
              >
                {respuesta.acompanantes > 0 ? t('turnoAPie.carro.siTodos') : t('turnoAPie.carro.si')}
              </button>
              <button
                className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal px-4 text-base font-semibold text-principal"
                onClick={() => setRespuesta(null)}
                type="button"
              >
                {t('turnoAPie.carro.no')}
              </button>
            </div>
          </div>
        )}

        {respuesta && respuesta.resultado !== 'TIENE_CITA_EN_CARRO' && (
          <p className="rounded-xl bg-accion/15 p-4 text-lg font-semibold text-principal" role="status">
            {t(`turnoAPie.resultado.${respuesta.resultado}`, {
              hora: horaDe(respuesta.abre_en),
              defaultValue: t('turnoAPie.resultado.CERRADA'),
            })}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`turnoAPie.errores.${error}`, { defaultValue: t('turnoAPie.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}
      </Tarjeta>

      <Tarjeta>{avisos}</Tarjeta>
    </div>
  )
}
