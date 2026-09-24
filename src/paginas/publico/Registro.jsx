import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import AceptarReglas from '../../componentes/AceptarReglas'
import AvisoPrivacidad from '../../componentes/AvisoPrivacidad'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import CampoTelefono from '../../componentes/CampoTelefono'
import CamposDomicilio from '../../componentes/CamposDomicilio'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import OtrosHorarios from '../../componentes/OtrosHorarios'
import Pasos from '../../componentes/Pasos'
import Tarjeta from '../../componentes/Tarjeta'
import {
  mensajeCorreo,
  mensajeNombre,
  mensajeTelefono,
  mensajesDomicilio,
} from '../../componentes/mensajesValidacion'
import useCodigoPostal from '../../componentes/useCodigoPostal'
import { leerCodigoAnticipado } from '../../datos/anticipado'
import { borrarBorrador, guardarBorrador, leerBorrador } from '../../datos/borrador'
import { aFechaLocal, consultarBloquesDeFecha, formatearHora } from '../../datos/disponibilidad'
import { DOMICILIO_VACIO, PAISES_DOMICILIO, validarDomicilio } from '../../datos/domicilio'
import { citasDelDiaGuardadas } from '../../datos/misCitas'
import { registrarYReservar } from '../../datos/registro'
import { normalizarTelefono } from '../../datos/telefono'
import { formatearNombre, sugerirCorreo, validarCorreo, validarNombre } from '../../datos/validaciones'
import { EsqueletoFormulario } from '../../componentes/Esqueleto'

//  Errores en los que el horario ya no sirve: se ofrecen los otros del dia
//  ahi mismo, sin salir del formulario.
const HORARIO_PERDIDO = ['BLOQUE_LLENO', 'BLOQUE_CERRADO', 'BLOQUE_NO_EXISTE']

//  Errores de "ya tienes cita ese dia": si este telefono la guardo, se
//  ofrece verla en vez de dejar a la persona creyendo que no tiene lugar.
const YA_TIENE = ['LIMITE_DISPOSITIVO', 'YA_REGISTRADO_ESE_DIA']

// En este orden se revisan; se enfoca el primero que tenga error.
const CAMPOS = [
  'nombres',
  'apellidos',
  'telefono',
  'correo',
  'codigoPostal',
  'colonia',
  'calle',
  'numero',
  'interior',
  'acepto-reglas',
  'consentimiento',
]

export default function Registro() {
  const { t, i18n } = useTranslation()
  const [parametros, setParametros] = useSearchParams()
  const navegar = useNavigate()

  const bloqueId = parametros.get('bloque')
  const fecha = parametros.get('fecha')

  const [bloque, setBloque] = useState(null)
  const [cargando, setCargando] = useState(Boolean(bloqueId && fecha))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  //  La hora nueva que escogio tras "ese horario se lleno", para decirselo.
  const [horaCambiada, setHoraCambiada] = useState(null)

  //  Si la pagina se recargo sola (Android lo hace al volver de otra app),
  //  se recupera lo que llevaba escrito. Ver datos/borrador.js.
  const [borrador] = useState(() => leerBorrador())
  const [recuperado, setRecuperado] = useState(Boolean(borrador))

  const [nombres, setNombres] = useState(borrador?.nombres ?? '')
  const [apellidos, setApellidos] = useState(borrador?.apellidos ?? '')
  const [pais, setPais] = useState(borrador?.pais || 'US')
  const [telefono, setTelefono] = useState(borrador?.telefono ?? '')
  const [email, setEmail] = useState(borrador?.email ?? '')
  const [domicilio, setDomicilio] = useState(() => ({ ...DOMICILIO_VACIO, ...(borrador?.domicilio ?? {}) }))
  const [acepto, setAcepto] = useState(false)
  //  Las indicaciones de la entrega, aparte del aviso de privacidad.
  const [aceptoReglas, setAceptoReglas] = useState(false)

  // Un campo se marca en rojo al salir de el o al intentar enviar. Desde ahi
  // el mensaje cambia mientras escribe y desaparece en cuanto queda bien.
  const [tocados, setTocados] = useState(() => new Set())
  const [intento, setIntento] = useState(false)

  const busqueda = useCodigoPostal(domicilio.pais, domicilio.codigoPostal)

  //  Cada cambio se guarda en la pestana. Solo escribe en el almacen, no
  //  en el estado: no provoca otro render.
  useEffect(() => {
    guardarBorrador({ nombres, apellidos, pais, telefono, email, domicilio })
  }, [nombres, apellidos, pais, telefono, email, domicilio])

  function empezarDeNuevo() {
    borrarBorrador()
    setNombres('')
    setApellidos('')
    setPais('US')
    setTelefono('')
    setEmail('')
    setDomicilio(DOMICILIO_VACIO)
    setTocados(new Set())
    setIntento(false)
    setRecuperado(false)
  }

  useEffect(() => {
    if (!bloqueId || !fecha) return

    let vigente = true

    consultarBloquesDeFecha(fecha)
      .then((bloques) => {
        if (vigente) setBloque(bloques.find((b) => b.bloque_id === bloqueId) ?? null)
      })
      .catch(() => {
        if (vigente) setBloque(null)
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
  }, [bloqueId, fecha])

  const volver = (
    <Boton onClick={() => navegar('/calendario')} variant="secondary">
      {t('horarios.volverCalendario')}
    </Boton>
  )

  if (!bloqueId || !fecha) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.registro')}</h1>
        <p className="mb-4 text-base">{t('registro.sinHorario')}</p>
        {volver}
      </Tarjeta>
    )
  }

  if (cargando) {
    return <EsqueletoFormulario texto={t('registro.cargando')} />
  }

  if (!bloque) {
    return (
      <Tarjeta>
        <h1 className="mb-2 text-2xl font-bold">{t('pages.registro')}</h1>
        <p className="mb-4 text-base">{t('registro.horarioNoDisponible')}</p>
        {volver}
      </Tarjeta>
    )
  }

  // Fecha bloqueada: sin codigo de suscriptor no se llega aqui ni escribiendo
  // la direccion. La base de datos lo vuelve a revisar al guardar.
  if (bloque.abierto === false && !leerCodigoAnticipado(fecha)) {
    return <Navigate replace to="/calendario" />
  }

  const encabezado = `${new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(bloque.fecha))}, ${formatearHora(bloque.hora)}`

  const telefonoRevisado = normalizarTelefono(pais, telefono)
  const erroresDomicilio = validarDomicilio(domicilio, busqueda)

  const errores = {
    nombres: mensajeNombre(t, validarNombre(nombres), 'nombres'),
    apellidos: mensajeNombre(t, validarNombre(apellidos), 'apellidos'),
    telefono: mensajeTelefono(t, telefonoRevisado, i18n.language),
    correo: mensajeCorreo(t, validarCorreo(email)),
    ...mensajesDomicilio(t, erroresDomicilio),
    'acepto-reglas': aceptoReglas ? undefined : t('reglas.falta'),
    consentimiento: acepto ? undefined : t('privacidad.falta'),
  }

  // La casilla y "revisando el codigo postal" solo se avisan al intentar enviar.
  const errorDe = (campo) => {
    if (!intento && (campo === 'consentimiento' || campo === 'acepto-reglas' || erroresDomicilio[campo] === 'BUSCANDO')) {
      return undefined
    }
    return intento || tocados.has(campo) ? errores[campo] : undefined
  }

  const tocar = (campo) => setTocados((actuales) => new Set(actuales).add(campo))

  //  Otra hora del mismo dia: cambia la direccion (?bloque=...) pero la
  //  pantalla es la misma, asi que todo lo escrito se queda.
  function elegirOtroHorario(nuevo) {
    setParametros({ bloque: nuevo.bloque_id, fecha }, { replace: true })
    setBloque(nuevo)
    setError(null)
    setHoraCambiada(formatearHora(nuevo.hora))
    //  Al boton, para que solo falte tocarlo. setTimeout y no
    //  requestAnimationFrame: este ultimo no corre con la pestana en segundo plano.
    setTimeout(() => document.getElementById('confirmar-registro')?.focus(), 0)
  }

  const guardadas = error && YA_TIENE.includes(error) ? citasDelDiaGuardadas(fecha) : []
  const sugerencia = errores.correo ? null : sugerirCorreo(email)

  // Mientras no haya escrito su codigo postal, el domicilio sigue al pais del telefono.
  function cambiarPaisTelefono(nuevo) {
    setPais(nuevo)
    if (!domicilio.codigoPostal && PAISES_DOMICILIO.includes(nuevo)) {
      setDomicilio((antes) => ({ ...antes, pais: nuevo }))
    }
  }

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)

    const conError = CAMPOS.find((campo) => errores[campo])
    if (conError) {
      setIntento(true)
      document.getElementById(conError)?.focus()
      return
    }

    setEnviando(true)

    const nombresListos = formatearNombre(nombres)
    const apellidosListos = formatearNombre(apellidos)

    try {
      const cita = await registrarYReservar({
        nombres: nombresListos,
        apellidos: apellidosListos,
        telefono: telefonoRevisado.e164,
        email: email.trim(),
        domicilio,
        aceptoPrivacidad: acepto,
        bloqueId,
        fecha,
      })

      // Se pasa el nombre porque la funcion no lo devuelve y la pantalla de
      // confirmacion lo muestra ("A nombre de..."). Al recargar se obtiene
      // de consultar_cita.
      //  Ya quedo registrada: el borrador ya no sirve y no debe quedarse.
      borrarBorrador()
      navegar(`/confirmacion/${cita.token_qr}`, {
        state: { ...cita, nombre: `${nombresListos} ${apellidosListos}`, yaExistia: cita.ya_existia === true },
      })
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <EnlaceVolver a={`/horarios/${fecha}`}>{t('navegacion.cambiarHorario')}</EnlaceVolver>
      <Pasos actual={3} />

      <h1 className="mb-1 text-2xl font-bold">{t('pages.registro')}</h1>
      <p className="mb-4 text-base text-principal/70">{encabezado}</p>

      {/* noValidate: los avisos del navegador salen en ingles y en globitos que
          desaparecen; los nuestros se quedan junto al campo y en su idioma. */}
      {recuperado && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-puede-pasar/10 p-3" role="status">
          <p className="text-base font-semibold text-puede-pasar">{t('registro.borrador.recuperado')}</p>
          <button
            className="inline-flex min-h-12 items-center text-base font-semibold text-principal underline underline-offset-4"
            onClick={empezarDeNuevo}
            type="button"
          >
            {t('registro.borrador.empezarDeNuevo')}
          </button>
        </div>
      )}

      <form className="space-y-4" noValidate onSubmit={enviar}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            autoComplete="given-name"
            error={errorDe('nombres')}
            etiqueta={t('registro.nombre')}
            id="nombres"
            onBlur={() => {
              tocar('nombres')
              setNombres(formatearNombre(nombres))
            }}
            onChange={(e) => setNombres(e.target.value)}
            required
            value={nombres}
          />
          <Campo
            autoComplete="family-name"
            error={errorDe('apellidos')}
            etiqueta={t('registro.apellidos')}
            id="apellidos"
            onBlur={() => {
              tocar('apellidos')
              setApellidos(formatearNombre(apellidos))
            }}
            onChange={(e) => setApellidos(e.target.value)}
            required
            value={apellidos}
          />
        </div>

        <CampoTelefono
          alCambiarPais={cambiarPaisTelefono}
          alCambiarValor={setTelefono}
          error={errorDe('telefono')}
          etiqueta={t('registro.telefono')}
          id="telefono"
          onBlur={() => tocar('telefono')}
          pais={pais}
          valor={telefono}
        />

        <div>
          <Campo
            autoComplete="email"
            error={errorDe('correo')}
            etiqueta={t('registro.correo')}
            id="correo"
            inputMode="email"
            onBlur={() => tocar('correo')}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
          {sugerencia && (
            <p className="mt-1 text-base text-principal">
              {t('validacion.correo.sugerencia', { correo: sugerencia })}{' '}
              <button
                className="min-h-10 font-semibold underline underline-offset-4"
                onClick={() => setEmail(sugerencia)}
                type="button"
              >
                {t('validacion.correo.usarSugerencia')}
              </button>
            </p>
          )}
          <p className="mt-1 text-base text-principal/70">{t('registro.correoAyuda')}</p>
        </div>

        <CamposDomicilio
          alCambiar={setDomicilio}
          busqueda={busqueda}
          errorDe={errorDe}
          tocar={tocar}
          valor={domicilio}
        />

        <AceptarReglas
          acepto={aceptoReglas}
          alCambiar={setAceptoReglas}
          error={errorDe('acepto-reglas')}
        />

        <AvisoPrivacidad acepto={acepto} alCambiar={setAcepto} error={errorDe('consentimiento')} />

        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`registro.errores.${error}`, { defaultValue: t('registro.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}

        {error && HORARIO_PERDIDO.includes(error) && (
          <div className="rounded-xl border border-principal/20 bg-principal/5 p-3">
            <OtrosHorarios actual={bloqueId} alElegir={elegirOtroHorario} fecha={fecha} />
          </div>
        )}

        {guardadas.length > 0 && (
          <div className="space-y-2 rounded-xl border-2 border-accion bg-accion/10 p-3">
            <p className="text-base font-semibold">{t('registro.tuCitaGuardada')}</p>
            {guardadas.map((guardada) => (
              <Link
                className="flex min-h-14 items-center justify-center rounded-xl bg-accion px-4 text-center text-base font-bold text-sobre-accion"
                key={guardada.token}
                to={`/confirmacion/${guardada.token}`}
              >
                {t('registro.verTuCita', { hora: formatearHora(guardada.hora), nombre: guardada.nombre })}
              </Link>
            ))}
          </div>
        )}

        {horaCambiada && !error && (
          <p className="rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
            {t('registro.horaCambiada', { hora: horaCambiada })}
          </p>
        )}

        <Boton disabled={enviando} id="confirmar-registro" type="submit">
          {enviando ? t('registro.enviando') : t('registro.confirmar')}
        </Boton>
      </form>
    </Tarjeta>
  )
}
