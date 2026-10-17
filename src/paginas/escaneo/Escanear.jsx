import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import { LuArrowLeftRight, LuKeyRound, LuLayers, LuLogIn, LuRefreshCw, LuShieldCheck } from 'react-icons/lu'
import { useNavigate, useOutletContext } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import BuscarTurno from '../../componentes/BuscarTurno'
import Campo from '../../componentes/Campo'
import DeshacerEntrega from '../../componentes/DeshacerEntrega'
import ElegirFila from '../../componentes/ElegirFila'
import EntradaSinCita from '../../componentes/EntradaSinCita'
import LectorQR from '../../componentes/LectorQR'
import LlegoTarde from '../../componentes/LlegoTarde'
import ListaDelDia from '../../componentes/ListaDelDia'
import PanelTurnos from '../../componentes/PanelTurnos'
import SelloVip from '../../componentes/SelloVip'
import { Hueso } from '../../componentes/Esqueleto'
import Tarjeta from '../../componentes/Tarjeta'
import TurnoQueVa from '../../componentes/TurnoQueVa'
import { textoParaBuscar } from '../../datos/codigoCorto'
import { aFechaLocal, formatearHora } from '../../datos/disponibilidad'
import {
  MS_DESHACER_PROPIA,
  buscarParaEscaneo,
  entregaDirecta,
  esRecienEntregado,
  previaPorError,
  queEsElQR,
  registrarEntrega,
  registrarEntregaAutorizada,
  registrarEntregaAutorizadaPorCodigo,
  registrarEntregaPorCodigo,
  verCita,
  verPase,
} from '../../datos/escaneo'
import { anularTurno, elegirFila, entregarTurno, miFilaDeHoy, saltarTurno, turnoAdelantado } from '../../datos/filaAPie'
import { esDeOtraFila, filaDe, miFila } from '../../datos/filas'
import { hoyLocal } from '../../datos/panel'
import { PUEDE_PASAR, avisoDelResultado, avisoLeido, prepararSonido } from '../../datos/sonido'

// Colores del logo, segun CLAUDE.md: verde puede pasar, rojo ya recibio.
const ESTILO_RESULTADO = {
  VALIDO: 'bg-puede-pasar/15 text-puede-pasar border-puede-pasar',
  VALIDO_AUTORIZADO: 'bg-puede-pasar/15 text-puede-pasar border-puede-pasar',
  VALIDO_PASE: 'bg-puede-pasar/15 text-puede-pasar border-puede-pasar',
  PASE_REVOCADO: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
  NO_ES_DIA_DE_ENTREGA: 'bg-accion/15 text-principal border-accion',
  YA_USADO: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
  OTRA_FECHA: 'bg-accion/15 text-principal border-accion',
  OTRA_FILA: 'bg-accion/15 text-principal border-accion',
  CANCELADA: 'bg-accion/15 text-principal border-accion',
  TURNO_PERDIDO: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
  NO_EXISTE: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
  //  Seccion 46: el turno se anulo (al escanearlo, o porque se acaba de anular).
  TURNO_ANULADO: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
  TURNO_ANULADO_AHORA: 'bg-principal/10 text-principal border-principal',
}

const ICONO_FILA = { carro: FaCarSide, a_pie: FaPersonWalking, ambas: LuLayers }

//  Lo que la vista previa muestra sin ser una cita que entregar: el codigo
//  no existe, no hubo senal, se cerro la sesion, otra falla, es el que se
//  acaba de entregar, o su turno se anulo. Con todos, la camara sigue lista
//  y la busqueda a la mano: no hay que tocar nada para seguir.
const PREVIAS_ESPECIALES = ['NO_EXISTE', 'SIN_CONEXION', 'RECIEN_ENTREGADO', 'SIN_SESION', 'NO_SE_PUDO_REVISAR', 'TURNO_ANULADO']

// Respuestas de la autorizacion que NO terminan el tramite: se muestran en
// el mismo formulario para que se pueda corregir el codigo.
const RECHAZOS_DE_CODIGO = ['CODIGO_INVALIDO', 'BLOQUEADO']

export default function Escanear() {
  const { t, i18n } = useTranslation()
  const navegar = useNavigate()
  const { rol, permisos = [] } = useOutletContext() ?? {}

  // El admin autoriza con su propia sesion; el voluntario necesita el
  // codigo de un admin. La base de datos aplica la misma regla.
  const esAdmin = rol === 'admin'

  // Anotar a alguien sin cita ya no es "solo el pastor": es una palomita
  // que se le puede dar a quien esta en la fila.
  const puedeAnotarSinCita = permisos.includes('anotar_sin_cita')

  // "Me equivoque de persona": deshacer una entrega de hoy.
  const puedeDeshacer = permisos.includes('anular_entregas')
  // Sin la palomita, quien escaneo deshace la SUYA el primer minuto.
  const [deshacerPropia, setDeshacerPropia] = useState(false)
  // El QR que se acaba de entregar: la camara del siguiente no lo cuenta.
  const [tokenEntregado, setTokenEntregado] = useState(null)
  const plazoDeshacer = useRef(null)

  const [vista, setVista] = useState('camara')
  // La cita que se esta revisando. Llega del QR (trae `token`) o de la
  // busqueda manual (trae `porCodigo`); desde aqui las dos se tratan igual.
  const [previa, setPrevia] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [encontrados, setEncontrados] = useState(null)

  // La fila que le dieron en Equipo ('ambas' hasta saberla) y la que eligio
  // hoy al abrir el escaner (undefined: preguntando; null: todavia no elige).
  // Manda la de hoy: asi nadie entrega en la fila equivocada.
  const [asignada, setAsignada] = useState('ambas')
  const [filaHoy, setFilaHoy] = useState(undefined)
  // Si la base todavia no sabe de filas por dia, se sigue como antes.
  const [sinEleccion, setSinEleccion] = useState(false)
  const [eligiendo, setEligiendo] = useState(false)
  const [errorFila, setErrorFila] = useState(null)
  const [preguntaCambio, setPreguntaCambio] = useState(false)
  const fila = filaHoy ?? asignada
  const cargandoFila = filaHoy === undefined && !sinEleccion
  const debeElegir = filaHoy === null && !sinEleccion
  const listo = !cargandoFila && !debeElegir

  // A pie: el turno que va (lo trae el panel de turnos) y cuantas veces ha
  // cambiado la fila, para que el panel pregunte de inmediato.
  const [queVa, setQueVa] = useState(null)
  //  Toda la fila (el que va y los que siguen), para la tira de arriba.
  const [datosTurnos, setDatosTurnos] = useState(null)
  const turnoQueVa = queVa?.turno ?? null
  const turnoQueVaRef = useRef(null)
  const [versionTurnos, setVersionTurnos] = useState(0)

  const [autorizando, setAutorizando] = useState(false)
  const [codigoAutorizacion, setCodigoAutorizacion] = useState('')

  const hoy = hoyLocal()

  const fechaLarga = (fecha) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(aFechaLocal(fecha))

  // La vista previa ya sabe de que dia es la cita. Si no es de hoy se dice
  // desde el principio, en vez de dejar que se pida la entrega y apenas
  // entonces se sepa que no procedia.
  const citaDeOtroDia = Boolean(previa?.fecha) && previa.fecha !== hoy
  const previaEspecial = PREVIAS_ESPECIALES.includes(previa?.resultado)
  //  A pie (seccion 46): lo llamaron y no estaba. No se entrega solo.
  const llegoTarde =
    Boolean(previa) && !previaEspecial && !citaDeOtroDia && !previa.pase &&
    filaDe(previa) === 'a_pie' && Boolean(previa.saltado_en) && !previa.anulado

  //  El ultimo codigo entregado con la camara: { token, nombre, momento }.
  const ultimaEntrega = useRef(null)
  //  La fila de esta cuenta, para decidir la entrega directa sin reiniciar la camara.
  const filaRef = useRef('ambas')

  function recordarEntrega(respuesta, token) {
    if (token && PUEDE_PASAR.includes(respuesta?.resultado)) {
      ultimaEntrega.current = { token, nombre: respuesta.nombre, momento: Date.now() }
    }
  }

  useEffect(() => {
    let vigente = true
    Promise.all([miFila(), miFilaDeHoy()]).then(([suya, deHoy]) => {
      if (!vigente) return
      setAsignada(suya)
      setFilaHoy(deHoy)
    })
    return () => {
      vigente = false
      clearTimeout(plazoDeshacer.current)
    }
  }, [])

  useEffect(() => {
    filaRef.current = fila
  }, [fila])

  //  Elegir (o cambiar) la fila de hoy. La base la guarda: si recarga la
  //  pagina o cambia de telefono, sigue en la misma.
  async function elegir(nueva) {
    setEligiendo(true)
    setErrorFila(null)
    try {
      await elegirFila(nueva)
      setFilaHoy(nueva)
      setPreguntaCambio(false)
      setQueVa(null)
      turnoQueVaRef.current = null
      reiniciar()
    } catch (e) {
      if (e.message === 'FUNCION_NO_INSTALADA') {
        setSinEleccion(true)
        setPreguntaCambio(false)
      } else {
        setErrorFila(e.message)
      }
    } finally {
      setEligiendo(false)
    }
  }

  function alActualizarTurnos(datos) {
    turnoQueVaRef.current = datos?.actual?.turno ?? null
    setQueVa(datos?.actual ?? null)
    setDatosTurnos(datos ?? null)
  }

  //  A pie, sin QR: trae su numero pero perdio su pagina (seccion 44). Es la
  //  misma entrega que al escanear; el resultado sale arriba, como un escaneo,
  //  con "Deshacer" a la mano.
  async function entregarPorTurno(turno) {
    setOcupado(true)
    setError(null)
    try {
      mostrarResultado(await entregarTurno(turno), null)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  //  "No se presento" desde la tira: la fila sigue. Si llega a los pocos
  //  minutos se le entrega; si tarda, se anula su turno (seccion 46).
  async function saltarDesdeTira(turno) {
    setOcupado(true)
    setError(null)
    try {
      await saltarTurno(turno)
      setVersionTurnos((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  //  A pie (seccion 46): anular el turno de quien llego tarde. Sale arriba,
  //  como un escaneo; la fila y la busqueda se ponen al dia solas.
  async function anularPorTurno(turno) {
    setOcupado(true)
    setError(null)
    try {
      await anularTurno(turno)
      clearTimeout(plazoDeshacer.current)
      setDeshacerPropia(false)
      setTokenEntregado(null)
      setResultado({ resultado: 'TURNO_ANULADO_AHORA', turno, token: previa?.token ?? null })
      setPrevia(null)
      setVista('resultado')
      setVersionTurnos((n) => n + 1)
      document.getElementById('escaner-arriba')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  //  Lo llamaron, no estaba y regreso a los pocos minutos: vuelve a su lugar.
  async function regresarTurno(turno) {
    setOcupado(true)
    setError(null)
    try {
      await saltarTurno(turno, false)
      setVersionTurnos((n) => n + 1)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  //  La respuesta de la base, con su tono. Si puede pasar, "Deshacer" queda a
  //  la mano el primer minuto (la base revisa que sea quien escaneo).
  //  extra: lo que la pantalla sabe y la base no dice (a pie, si llego
  //  antes de su turno).
  function mostrarResultado(respuesta, token, extra = {}) {
    //  El token se guarda para que la camara de abajo no lo vuelva a leer
    //  mientras la persona no baja su telefono.
    setResultado(respuesta ? { ...respuesta, ...extra, token: token ?? null } : respuesta)
    setVista('resultado')
    recordarEntrega(respuesta, token)
    avisoDelResultado(respuesta?.resultado)
    clearTimeout(plazoDeshacer.current)
    const puedePasar = PUEDE_PASAR.includes(respuesta?.resultado)
    //  La fila a pie avanza: el panel pregunta de inmediato.
    if (puedePasar) setVersionTurnos((n) => n + 1)
    setDeshacerPropia(puedePasar)
    setTokenEntregado(puedePasar ? (token ?? null) : null)
    if (puedePasar) plazoDeshacer.current = setTimeout(() => setDeshacerPropia(false), MS_DESHACER_PROPIA)
    //  El resultado sale arriba. Si se entrego desde el campo del codigo o
    //  desde el panel (abajo de la camara), en el telefono quedaba fuera de
    //  la vista: se sube a el.
    document.getElementById('escaner-arriba')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  //  Ni el iPhone ni Chrome dejan que una pagina suene antes de que
  //  alguien la haya tocado. Se prepara con el primer toque, sea cual sea:
  //  para cuando se lea un codigo, el bip ya puede sonar.
  useEffect(() => {
    const preparar = () => prepararSonido()
    document.addEventListener('pointerdown', preparar, { once: true })
    return () => document.removeEventListener('pointerdown', preparar)
  }, [])

  // Se memoriza para que el lector no reinicie la camara en cada render.
  const alLeer = useCallback(async (token) => {
    setError(null)
    //  Primero el aviso y luego la consulta: el voluntario sabe que el
    //  codigo entro sin tener que despegar la vista del coche.
    avisoLeido()
    //  Se borra la anterior para que no parezca que ya respondio.
    setPrevia(null)
    setVista('previa')

    //  El QR que se acaba de entregar, leido otra vez porque la persona no
    //  ha bajado su telefono: no es un intento de sacar otra caja. No se
    //  pregunta a la base (ahi contaria como "intento repetido").
    if (esRecienEntregado(ultimaEntrega.current, token)) {
      setPrevia({ resultado: 'RECIEN_ENTREGADO', token, nombre: ultimaEntrega.current.nombre })
      return
    }

    try {
      const cita = await verCita(token)
      // No es una cita: puede ser un pase permanente, que no se quema.
      const pase = cita ? null : await verPase(token)
      //  Un turno anulado (seccion 46) no se intenta entregar: se dice.
      //  Un QR que no es de nadie: se dice que es (el cartel, otra pagina).
      const vistaPrevia = cita
        ? cita.anulado
          ? { ...cita, token, resultado: 'TURNO_ANULADO' }
          : { ...cita, token }
        : pase
          ? { ...pase, token, pase: true }
          : { resultado: 'NO_EXISTE', token, ajeno: queEsElQR(token) }

      //  El caso de todos los dias: escanear ya es entregar (ver
      //  entregaDirecta). Lo demas se sigue revisando antes.
      if (entregaDirecta(vistaPrevia, { hoy: hoyLocal(), fila: filaRef.current })) {
        //  A pie, si llega antes de su turno pasa igual: la respuesta lo avisa
        //  y queda "Deshacer" a la mano.
        const va = filaRef.current === 'a_pie' ? turnoQueVaRef.current : null
        const adelantado = turnoAdelantado(vistaPrevia.turno, va) ? { turno: vistaPrevia.turno, va } : null
        try {
          //  Pase VIP: la pantalla lo dice en grande (pasa directo, sin fila).
          const vip = Boolean(vistaPrevia.pase && vistaPrevia.vip)
          mostrarResultado(await registrarEntrega(token), token, { adelantado, vip })
        } catch (e) {
          //  Sin senal a medio camino: queda la vista previa con su boton
          //  para volver a intentar. La base no entrega dos veces.
          setPrevia(vistaPrevia)
          setError(e.message)
        }
        return
      }

      setPrevia(vistaPrevia)
    } catch (e) {
      //  Una falla NO es "codigo no reconocido": el codigo puede estar bien.
      //  Decir "no existe" hacia que se rechazara a alguien con cita.
      setPrevia({ resultado: previaPorError(e.message), token })
    }
  }, [])

  function cerrarAutorizacion() {
    setAutorizando(false)
    setCodigoAutorizacion('')
    setError(null)
  }

  function reiniciar() {
    setPrevia(null)
    setResultado(null)
    setEncontrados(null)
    setBusqueda('')
    cerrarAutorizacion()
    setVista('camara')
  }

  //  Desde la busqueda, entregar sin pasar por "Ver cita": el nombre y el
  //  codigo ya estan a la vista. Es un toque a proposito, nunca automatico.
  async function entregarDeLista(persona) {
    setOcupado(true)
    setError(null)
    try {
      mostrarResultado(await registrarEntregaPorCodigo(persona.codigo_corto), null)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  // Un resultado de la busqueda manual abre la misma vista previa que el QR.
  function elegirDeLista(persona) {
    cerrarAutorizacion()
    setPrevia({ ...persona, porCodigo: true })
    setVista('previa')
  }

  async function registrarPrevia() {
    setOcupado(true)
    setError(null)

    try {
      const respuesta = previa.porCodigo
        ? await registrarEntregaPorCodigo(previa.codigo_corto)
        : await registrarEntrega(previa.token)
      mostrarResultado(respuesta, previa.token, { vip: Boolean(previa.pase && previa.vip) })
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function autorizar(evento) {
    evento.preventDefault()
    setOcupado(true)
    setError(null)

    // Al admin no se le pide codigo: la base ya sabe que es admin por su sesion.
    const codigo = esAdmin ? '' : codigoAutorizacion

    try {
      const respuesta = previa.porCodigo
        ? await registrarEntregaAutorizadaPorCodigo(previa.codigo_corto, previa.fecha, codigo)
        : await registrarEntregaAutorizada(previa.token, codigo)

      if (RECHAZOS_DE_CODIGO.includes(respuesta?.resultado)) {
        setError(respuesta.resultado)
        // Se borra para que el siguiente intento no reuse un codigo errado.
        setCodigoAutorizacion('')
      } else {
        mostrarResultado(respuesta, previa.token)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function buscar(evento) {
    evento.preventDefault()
    setError(null)

    try {
      // "cb 4871", "4871" o "CB487l" se buscan como CB-4871.
      setEncontrados(await buscarParaEscaneo(textoParaBuscar(busqueda)))
    } catch (e) {
      setError(e.message)
    }
  }

  const avisoError = error && (
    <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
      {t(`escaneo.errores.${error}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') })}
    </p>
  )

  const otraFila = fila === 'a_pie' ? 'carro' : 'a_pie'

  //  Debajo de la camara, siempre: a pie, buscar un turno en vivo; en carros,
  //  el boton a la busqueda por nombre o codigo.
  const busquedaBajoCamara =
    fila === 'a_pie' ? (
      <BuscarTurno
        actual={turnoQueVa}
        alAnular={anularPorTurno}
        alEntregar={entregarPorTurno}
        alRegresar={regresarTurno}
        ocupado={ocupado}
        version={versionTurnos}
      />
    ) : (
      <Boton
        className="mt-3"
        onClick={() => {
          reiniciar()
          setVista('manual')
        }}
        variant="secondary"
      >
        {t('escaneo.buscarManual')}
      </Boton>
    )

  return (
    //  grid-cols-1 (minmax(0,1fr)): en el telefono la columna nunca es mas
    //  ancha que la pantalla, aunque algo de adentro pida mas.
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* El color de arriba es el de la fila: azul carros, naranja a pie. */}
      <Tarjeta className={listo && fila === 'a_pie' ? 'border-t-8 border-accion' : listo && fila === 'carro' ? 'border-t-8 border-principal' : ''}>
        <h1 className="mb-1 scroll-mt-24 text-2xl font-bold" id="escaner-arriba">{t('pages.escanear')}</h1>
        <p className="text-base text-principal/70">{t('escaneo.instruccion')}</p>

        {cargandoFila && (
          <div className="mt-4 space-y-3" role="status">
            <span className="sr-only">{t('elegirFila.cargando')}</span>
            <Hueso className="h-10 w-56" />
            <Hueso className="h-28 w-full" />
          </div>
        )}

        {/* Una vez al dia, antes de la camara: en que fila esta hoy. */}
        {debeElegir && (
          <div className="mt-4">
            <ElegirFila alElegir={elegir} asignada={asignada} error={errorFila} ocupado={eligiendo} />
          </div>
        )}

        {/* A la vista siempre: si alguien se para en la fila equivocada, lo ve aqui. */}
        {listo && (
          <FilaActual
            alCambiar={sinEleccion ? null : () => setPreguntaCambio(true)}
            fila={fila}
          />
        )}

        {/* Cambiarse de fila se confirma: un toque sin querer dejaria a la
            voluntaria entregando en la fila de otros. */}
        {listo && preguntaCambio && (
          <div
            aria-labelledby="pregunta-cambiar-fila"
            className="mb-4 rounded-xl border-2 border-accion bg-accion/10 p-4 text-principal"
            role="alertdialog"
          >
            <p className="text-lg font-bold" id="pregunta-cambiar-fila">
              {t('elegirFila.confirmarPregunta', { fila: t(`filas.nombre.${otraFila}`) })}
            </p>
            <p className="mt-1 text-base">
              {t('elegirFila.confirmarAyuda', { fila: t(`filas.nombre.${fila}`) })}
            </p>
            {errorFila && (
              <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
                {t(`escaneo.errores.${errorFila}`, { defaultValue: t('escaneo.errores.ERROR_DESCONOCIDO') })}
              </p>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Boton disabled={eligiendo} onClick={() => elegir(otraFila)}>
                {t('elegirFila.confirmarSi', { fila: t(`filas.nombre.${otraFila}`) })}
              </Boton>
              <Boton
                onClick={() => {
                  setPreguntaCambio(false)
                  setErrorFila(null)
                }}
                variant="secondary"
              >
                {t('elegirFila.confirmarNo')}
              </Boton>
            </div>
          </div>
        )}

        {/* A pie, el turno que va queda siempre encima de la camara, con sus
            botones: se grita, se escanea o se entrega sin QR sin bajar al panel. */}
        {listo && fila === 'a_pie' && vista !== 'manual' && (
          <TurnoQueVa alEntregar={entregarPorTurno} alSaltar={saltarDesdeTira} datos={datosTurnos} ocupado={ocupado} />
        )}

        {listo && fila === 'a_pie' && error && (vista === 'camara' || vista === 'resultado') && avisoError}

        {listo && vista === 'camara' && (
          <>
            <LectorQR activo alLeer={alLeer} />
            {busquedaBajoCamara}
          </>
        )}

        {/* Entre leer el codigo y saber de quien es hay una consulta.
            Sin esto, la pantalla se quedaba en blanco justo ahi. */}
        {vista === 'previa' && !previa && (
          <div className="rounded-xl border-2 border-principal/30 bg-principal/5 p-4" role="status">
            <p className="flex items-center gap-3 text-2xl font-bold text-principal">
              <span
                aria-hidden="true"
                className="h-6 w-6 shrink-0 animate-spin rounded-full border-4 border-principal/25 border-t-principal"
              />
              {t('escaneo.leido')}
            </p>
            <p className="mt-2 text-base text-principal/80">{t('escaneo.buscando')}</p>
          </div>
        )}

        {vista === 'previa' && previa && (
          <>
            {/* Un QR que no es de nadie, una falla, un turno anulado: se dice
                que paso, y la camara y la busqueda siguen ahi mismo (el 15 de
                octubre de 2026 se quedaba en "no reconocido" y habia que
                bajar hasta "Escanear otro"). No se vuelve a leer el mismo. */}
            {previaEspecial && (
              <>
                <AvisoEspecial
                  alEntrar={() => navegar('/admin/login', { state: { destino: '/escanear' } })}
                  alReintentar={() => alLeer(previa.token)}
                  previa={previa}
                />
                <div className="mt-4">
                  <p className="mb-2 text-lg font-bold text-principal">
                    {previa.resultado === 'RECIEN_ENTREGADO' ? t('escaneo.siguiente') : t('escaneo.intentarOtraVez')}
                  </p>
                  <LectorQR activo alLeer={alLeer} ignorar={previa.token ?? null} />
                  {busquedaBajoCamara}
                </div>
              </>
            )}

            {/* A pie (seccion 46): lo llamaron y no estaba. Quien escanea ve
                cuanto tardo y decide: entregar o anular su turno. */}
            {llegoTarde && (
              <div className="mb-3">
                <LlegoTarde
                  alAnular={() => anularPorTurno(previa.turno)}
                  alEntregar={registrarPrevia}
                  ocupado={ocupado}
                  saltadoEn={previa.saltado_en}
                  turno={previa.turno}
                />
              </div>
            )}

            {!previaEspecial && citaDeOtroDia && (
              <>
                <div className={`rounded-xl border-2 p-4 ${ESTILO_RESULTADO.OTRA_FECHA}`}>
                  <p className="text-2xl font-bold">{t('escaneo.resultado.OTRA_FECHA')}</p>
                  <p className="mt-2 text-lg text-principal">
                    {previa.nombre} · {previa.codigo_corto}
                  </p>
                  <p className="mt-2 text-base text-principal/80">
                    {t('escaneo.otraFechaDetalle', {
                      fecha: fechaLarga(previa.fecha),
                      hora: formatearHora(previa.hora),
                    })}
                  </p>
                </div>

                {!autorizando && (
                  <Boton
                    className="mt-4"
                    onClick={() => {
                      setAutorizando(true)
                      setError(null)
                    }}
                    variant="secondary"
                  >
                    <LuShieldCheck aria-hidden="true" className="h-5 w-5" />
                    {esAdmin ? t('escaneo.autorizar.botonAdmin') : t('escaneo.autorizar.boton')}
                  </Boton>
                )}

                {autorizando && (
                  <form
                    className="mt-4 space-y-3 rounded-xl border border-principal/20 bg-principal/5 p-4"
                    onSubmit={autorizar}
                  >
                    <p className="text-base text-principal/80">
                      {esAdmin
                        ? t('escaneo.autorizar.explicacionAdmin')
                        : t('escaneo.autorizar.explicacion')}
                    </p>

                    {/* autoComplete off: el telefono del voluntario no debe
                        guardar ni sugerir el codigo personal del pastor. */}
                    {!esAdmin && (
                      <Campo
                        autoComplete="off"
                        autoFocus
                        etiqueta={t('escaneo.autorizar.etiqueta')}
                        id="codigoAutorizacion"
                        onChange={(e) => setCodigoAutorizacion(e.target.value)}
                        required
                        type="password"
                        value={codigoAutorizacion}
                      />
                    )}

                    {avisoError}

                    <Boton
                      disabled={ocupado || (!esAdmin && codigoAutorizacion.length === 0)}
                      type="submit"
                    >
                      <LuKeyRound aria-hidden="true" className="h-5 w-5" />
                      {ocupado ? t('escaneo.registrando') : t('escaneo.autorizar.confirmar')}
                    </Boton>

                    <button
                      className="inline-flex min-h-14 w-full items-center justify-center text-base font-semibold text-principal underline underline-offset-4"
                      onClick={cerrarAutorizacion}
                      type="button"
                    >
                      {t('escaneo.autorizar.cancelar')}
                    </button>
                  </form>
                )}
              </>
            )}

            {/* Antes de tocar "entregar": este codigo es de la otra fila. La
                base igual lo detiene (OTRA_FILA) y no lo quema. */}
            {!previa.pase && !previaEspecial && esDeOtraFila(fila, previa.fila) && (
              <div className={`mb-3 rounded-xl border-2 p-4 ${ESTILO_RESULTADO.OTRA_FILA}`} role="status">
                <p className="text-xl font-bold">{t('escaneo.resultado.OTRA_FILA')}</p>
                <p className="mt-1 text-base">
                  {t('escaneo.deOtraFila', { fila: t(`filas.nombre.${filaDe(previa)}`) })}
                </p>
              </div>
            )}

            {/* A pie: llega alguien cuyo turno todavia no llaman. Puede pasar,
                pero lo decide quien escanea; no se entrega solo. */}
            {!previa.pase && !previaEspecial && !citaDeOtroDia && fila === 'a_pie' &&
              filaDe(previa) === 'a_pie' && turnoAdelantado(previa.turno, turnoQueVa) && (
              <div className="mb-3 rounded-xl border-2 border-accion bg-accion/15 p-4 text-principal" role="status">
                <p className="text-xl font-bold">{t('escaneo.turnoAdelantado.titulo')}</p>
                <p className="mt-1 text-base">
                  {t('escaneo.turnoAdelantado.texto', { turno: previa.turno, actual: turnoQueVa })}
                </p>
              </div>
            )}

            {!previaEspecial && !citaDeOtroDia && (
              <div className="rounded-xl border border-principal/20 p-4">
                {previa.pase && previa.vip && <SelloVip className="mb-3" />}
                {previa.pase && (
                  <p className="mb-2 inline-block rounded-lg bg-accion/20 px-2 py-1 text-base font-bold text-principal">
                    {t('escaneo.pase')}
                  </p>
                )}
                {!previa.pase && filaDe(previa) === 'a_pie' && (
                  <p className="mb-2 inline-flex items-center gap-2 rounded-lg bg-accion/20 px-2 py-1 text-base font-bold text-principal">
                    <FaPersonWalking aria-hidden="true" className="h-4 w-4" />
                    {t('filas.nombre.a_pie')}
                    {previa.turno ? ` · ${t('turno.numero', { turno: previa.turno })}` : ''}
                  </p>
                )}
                <p className="text-2xl font-bold text-principal">{previa.nombre}</p>
                <p className="mt-1 text-lg text-principal/80">
                  {previa.codigo_corto}
                  {previa.hora ? ` · ${formatearHora(previa.hora)}` : ''}
                </p>
                <p className="mt-2 text-base text-principal/70">
                  {previa.pase
                    ? t(previa.activo ? 'escaneo.estadoPrevio.pase' : 'escaneo.estadoPrevio.paseRevocado')
                    : t(`escaneo.estadoPrevio.${previa.estado}`, { defaultValue: previa.estado })}
                </p>
              </div>
            )}

            {/* Con el formulario de autorizacion abierto, el error ya se muestra dentro. */}
            {!autorizando && avisoError}

            {!previaEspecial && !citaDeOtroDia && !llegoTarde && !(previa.pase && !previa.activo) && (
              <Boton className="mt-4" disabled={ocupado} onClick={registrarPrevia}>
                {ocupado ? t('escaneo.registrando') : t('escaneo.registrarEntrega')}
              </Boton>
            )}

            {!previaEspecial && (
              <Boton className="mt-3" onClick={reiniciar} variant="secondary">
                {t('escaneo.escanearOtro')}
              </Boton>
            )}
          </>
        )}

        {vista === 'resultado' && resultado && (
          <>
            <div
              className={`rounded-xl border-2 p-4 ${
                ESTILO_RESULTADO[resultado.resultado] ?? 'border-principal/20'
              }`}
            >
              <p className="text-2xl font-bold">{t(`escaneo.resultado.${resultado.resultado}`, { turno: resultado.turno })}</p>
              {resultado.nombre && (
                <p className="mt-2 text-lg text-principal">
                  <span className="font-bold">{resultado.nombre}</span> · {resultado.codigo_corto}
                </p>
              )}
              {/* Un QR se puede pasar a otra persona. El nombre es la forma de
                  saber que es de quien lo trae. */}
              {/* Un turno sin datos ("Turno 23") no tiene nombre que preguntar. */}
              {resultado.nombre && !/^Turno \d+$/.test(resultado.nombre) && PUEDE_PASAR.includes(resultado.resultado) && (
                <p className="mt-2 rounded-lg bg-principal/5 px-3 py-2 text-base font-semibold text-principal">
                  {t('escaneo.revisaNombre')}
                </p>
              )}
              {resultado.hora && (
                <p className="text-base text-principal/70">{formatearHora(resultado.hora)}</p>
              )}
              <p className="mt-2 text-base text-principal/80">
                {t(`escaneo.explicacion.${resultado.resultado}`, { turno: resultado.turno })}
              </p>
              {resultado.vip && PUEDE_PASAR.includes(resultado.resultado) && <SelloVip className="mt-3" />}
              {resultado.adelantado && PUEDE_PASAR.includes(resultado.resultado) && (
                <p className="mt-3 rounded-lg border-2 border-accion bg-accion/15 px-3 py-2 text-base font-semibold text-principal">
                  {t('escaneo.turnoAdelantado.paso', {
                    turno: resultado.adelantado.turno,
                    actual: resultado.adelantado.va,
                  })}
                </p>
              )}
            </div>

            {(puedeDeshacer || deshacerPropia) && PUEDE_PASAR.includes(resultado.resultado) && resultado.codigo_corto && (
              <DeshacerEntrega codigo={resultado.codigo_corto} nombre={resultado.nombre} />
            )}

            {/* La camara ya esta lista para el siguiente, pase o no pase: no
                hay que tocar "Escanear otro". El codigo que se acaba de leer no
                cuenta: la persona todavia no baja su telefono. */}
            <div className="mt-4">
              <p className="mb-2 text-lg font-bold text-principal">
                {PUEDE_PASAR.includes(resultado.resultado) ? t('escaneo.siguiente') : t('escaneo.siguienteOtraVez')}
              </p>
              <LectorQR activo alLeer={alLeer} ignorar={resultado.token ?? tokenEntregado} />
              {busquedaBajoCamara}
            </div>

            <Boton
              className="mt-4"
              onClick={reiniciar}
              variant={PUEDE_PASAR.includes(resultado.resultado) ? 'secondary' : undefined}
            >
              {t('escaneo.escanearOtro')}
            </Boton>
          </>
        )}

        {/* Carros: la gente de hoy ahi mismo, y se busca mientras se escribe.
            A pie: solo con su codigo (es lo que prueba de quien es el turno). */}
        {vista === 'manual' && (
          <>
            <form className="space-y-3" onSubmit={buscar}>
              <Campo
                autoComplete="off"
                autoFocus
                etiqueta={fila === 'a_pie' ? t('escaneo.aPie.etiqueta') : t('escaneo.buscarEtiqueta')}
                id="busqueda"
                onChange={(e) => {
                  setBusqueda(e.target.value)
                  setEncontrados(null)
                }}
                placeholder={fila === 'a_pie' ? 'CB-4871' : t('escaneo.lista.ejemplo')}
                value={busqueda}
              />
              {fila === 'a_pie' && <p className="text-base text-principal/80">{t('escaneo.aPie.ayuda')}</p>}
              {(fila === 'a_pie' || busqueda.trim() !== '') && (
                <Boton type="submit" variant="secondary">
                  {fila === 'a_pie' ? t('escaneo.buscar') : t('escaneo.lista.buscarOtras')}
                </Boton>
              )}
            </form>

            {avisoError}

            {fila !== 'a_pie' && encontrados === null && (
              <ListaDelDia alEntregar={entregarDeLista} alVer={elegirDeLista} ocupado={ocupado} texto={busqueda} />
            )}

            {encontrados && encontrados.length === 0 && (
              <p className="mt-4 text-base">{t('escaneo.sinResultados')}</p>
            )}

            {encontrados && encontrados.length > 0 && (
              <ul className="mt-4 space-y-3">
                {encontrados.map((persona) => {
                  const deOtroDia = persona.fecha !== hoy

                  return (
                    <li
                      className={`rounded-xl border p-3 ${
                        deOtroDia ? 'border-accion/60 bg-accion/5' : 'border-principal/20'
                      }`}
                      key={`${persona.codigo_corto}-${persona.fecha}`}
                    >
                      {/* No hubo ese codigo exacto: este se le parece (un numero
                          distinto o dos al reves). Se confirma con el nombre. */}
                      {persona.parecido && (
                        <p className="mb-1 inline-block rounded-lg bg-accion/20 px-2 py-0.5 text-base font-bold text-principal">
                          {t('escaneo.parecido')}
                        </p>
                      )}
                      <p className="text-lg font-semibold text-principal">{persona.nombre}</p>
                      <p className="text-base text-principal/70">
                        {persona.codigo_corto} · {formatearHora(persona.hora)}
                      </p>
                      <p className="mt-1 text-base text-principal/80">
                        {deOtroDia
                          ? `${t('escaneo.resultado.OTRA_FECHA')}: ${fechaLarga(persona.fecha)}`
                          : t(`escaneo.estadoPrevio.${persona.estado}`, { defaultValue: persona.estado })}
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Boton onClick={() => elegirDeLista(persona)} variant="secondary">
                          {t('escaneo.verCita')}
                        </Boton>
                        {/* De hoy y sin recibir: se entrega aqui mismo. Si es de
                            la otra fila, la base lo detiene y no se quema. */}
                        {!deOtroDia && ['reservada', 'llego'].includes(persona.estado) && (
                          <Boton disabled={ocupado} onClick={() => entregarDeLista(persona)}>
                            {ocupado ? t('escaneo.registrando') : t('escaneo.registrarEntrega')}
                          </Boton>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <Boton className="mt-4" onClick={reiniciar} variant="secondary">
              {t('escaneo.escanearOtro')}
            </Boton>
          </>
        )}
      </Tarjeta>

      {/* En la fila tambien pasa gente sin cita. En computadora va a un lado.
          Se queda a la vista tanto con la camara como buscando por codigo: quien
          no trae QR es justo quien acaba anotandose sin cita, y tener que volver
          a la camara para anotarlo cuesta tiempo con la fila afuera. */}
      {/* El panel de turnos y "sin cita": en el telefono, debajo de la
          camara; en computadora, en la columna de la derecha. */}
      <div className="space-y-4">
        {listo && fila === 'a_pie' && (
          <Tarjeta className="border-t-8 border-accion">
            <PanelTurnos
              alActualizar={alActualizarTurnos}
              alAnularTurno={anularPorTurno}
              alBuscar={() => {
                reiniciar()
                //  La busqueda de turnos esta debajo de la camara.
                setTimeout(() => {
                  const campo = document.getElementById('buscar-turno')
                  campo?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  campo?.focus()
                }, 50)
              }}
              alEntregarTurno={entregarPorTurno}
              ocupadoFuera={ocupado}
              version={versionTurnos}
            />
          </Tarjeta>
        )}

        {/* A pie no: ahi a quien llega sin nada se le da turno nuevo en el panel.
            A la vista siempre, tambien con un resultado en pantalla. */}
        {listo && puedeAnotarSinCita && fila !== 'a_pie' && (
          <Tarjeta>
            <h2 className="mb-1 text-lg font-bold">{t('sinCita.titulo')}</h2>
            <p className="mb-3 text-base text-principal/70">{t('sinCita.ayuda')}</p>
            <EntradaSinCita />
          </Tarjeta>
        )}
      </div>
    </div>
  )
}

/**
 * Lo que se le dice a quien escanea cuando lo leido no es una cita que
 * entregar. Cada caso con su que hacer:
 *
 *   NO_EXISTE           no es de nadie; si es el cartel de la entrada u otra
 *                       pagina, se dice (seccion 46)
 *   SIN_CONEXION        se corto la senal: el codigo puede estar bien
 *   NO_SE_PUDO_REVISAR  otra falla: el codigo puede estar bien
 *   SIN_SESION          se cerro la sesion: volver a entrar
 *   TURNO_ANULADO       lo llamaron, no estaba y se anulo: turno nuevo
 *   RECIEN_ENTREGADO    es el que se acaba de entregar
 */
function AvisoEspecial({ previa, alReintentar, alEntrar }) {
  const { t } = useTranslation()
  const r = previa.resultado

  if (r === 'RECIEN_ENTREGADO') {
    return (
      <div className="rounded-xl border-2 border-puede-pasar bg-puede-pasar/10 p-4 text-principal" role="status">
        <p className="text-2xl font-bold text-puede-pasar">{t('escaneo.resultado.RECIEN_ENTREGADO')}</p>
        <p className="mt-2 text-base">{t('escaneo.explicacion.RECIEN_ENTREGADO', { nombre: previa.nombre ?? '' })}</p>
      </div>
    )
  }

  if (r === 'SIN_CONEXION' || r === 'NO_SE_PUDO_REVISAR' || r === 'SIN_SESION') {
    return (
      <div className="rounded-xl border-2 border-accion bg-accion/15 p-4 text-principal" role="alert">
        <p className="text-2xl font-bold">{t(`escaneo.resultado.${r}`)}</p>
        <p className="mt-2 text-base">{t(`escaneo.explicacion.${r}`)}</p>
        {r === 'SIN_SESION' ? (
          <Boton className="mt-3" onClick={alEntrar} variant="secondary">
            <LuLogIn aria-hidden="true" className="h-5 w-5" />
            {t('escaneo.volverAEntrar')}
          </Boton>
        ) : (
          <Boton className="mt-3" onClick={alReintentar} variant="secondary">
            <LuRefreshCw aria-hidden="true" className="h-5 w-5" />
            {t('escaneo.volverARevisar')}
          </Boton>
        )}
      </div>
    )
  }

  if (r === 'TURNO_ANULADO') {
    return (
      <div className={`rounded-xl border-2 p-4 ${ESTILO_RESULTADO.TURNO_ANULADO}`} role="alert">
        <p className="text-2xl font-bold">{t('escaneo.resultado.TURNO_ANULADO')}</p>
        {previa.turno && <p className="mt-1 text-lg font-bold text-principal">{t('turno.numero', { turno: previa.turno })}</p>}
        <p className="mt-2 text-base text-principal/80">{t('escaneo.explicacion.TURNO_ANULADO')}</p>
      </div>
    )
  }

  //  NO_EXISTE: que es lo que se escaneo, si se sabe.
  return (
    <div className={`rounded-xl border-2 p-4 ${ESTILO_RESULTADO.NO_EXISTE}`} role="alert">
      <p className="text-2xl font-bold">{t('escaneo.resultado.NO_EXISTE')}</p>
      <p className="mt-2 text-base text-principal/80">
        {t(`escaneo.ajeno.${previa.ajeno?.tipo ?? 'TEXTO'}`, { dominio: previa.ajeno?.dominio ?? '' })}
      </p>
    </div>
  )
}

/** "Escaneas en: Fila de carros", con su icono, y el boton para cambiarse. */
function FilaActual({ fila, alCambiar }) {
  const { t } = useTranslation()
  const Icono = ICONO_FILA[fila] ?? LuLayers

  return (
    <div className="mb-4 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <p
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-base font-semibold text-principal ring-1 ${
          fila === 'a_pie' ? 'bg-accion/20 ring-accion/40' : 'bg-principal/5 ring-principal/10'
        }`}
      >
        <Icono aria-hidden="true" className="h-4 w-4 shrink-0 text-accion" />
        {t('escaneo.estasEn', { fila: t(`filas.nombre.${fila}`) })}
      </p>
      {alCambiar && (
        <button
          className="inline-flex min-h-12 items-center gap-1.5 text-base font-semibold text-principal underline underline-offset-4"
          onClick={alCambiar}
          type="button"
        >
          <LuArrowLeftRight aria-hidden="true" className="h-4 w-4" />
          {t('elegirFila.cambiar')}
        </button>
      )}
    </div>
  )
}
