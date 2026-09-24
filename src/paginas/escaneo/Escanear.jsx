import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import { LuKeyRound, LuLayers, LuShieldCheck } from 'react-icons/lu'
import { useOutletContext } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import DeshacerEntrega from '../../componentes/DeshacerEntrega'
import EntradaSinCita from '../../componentes/EntradaSinCita'
import LectorQR from '../../componentes/LectorQR'
import Tarjeta from '../../componentes/Tarjeta'
import { textoParaBuscar } from '../../datos/codigoCorto'
import { aFechaLocal, formatearHora } from '../../datos/disponibilidad'
import {
  buscarParaEscaneo,
  esRecienEntregado,
  previaPorError,
  registrarEntrega,
  registrarEntregaAutorizada,
  registrarEntregaAutorizadaPorCodigo,
  registrarEntregaPorCodigo,
  verCita,
  verPase,
} from '../../datos/escaneo'
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
  NO_EXISTE: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
}

const ICONO_FILA = { carro: FaCarSide, a_pie: FaPersonWalking, ambas: LuLayers }

//  Lo que la vista previa muestra sin ser una cita: el codigo no existe, no
//  hubo senal para revisarlo, o es el que se acaba de entregar.
const PREVIAS_ESPECIALES = ['NO_EXISTE', 'SIN_CONEXION', 'RECIEN_ENTREGADO']

// Respuestas de la autorizacion que NO terminan el tramite: se muestran en
// el mismo formulario para que se pueda corregir el codigo.
const RECHAZOS_DE_CODIGO = ['CODIGO_INVALIDO', 'BLOQUEADO']

export default function Escanear() {
  const { t, i18n } = useTranslation()
  const { rol, permisos = [] } = useOutletContext() ?? {}

  // El admin autoriza con su propia sesion; el voluntario necesita el
  // codigo de un admin. La base de datos aplica la misma regla.
  const esAdmin = rol === 'admin'

  // Anotar a alguien sin cita ya no es "solo el pastor": es una palomita
  // que se le puede dar a quien esta en la fila.
  const puedeAnotarSinCita = permisos.includes('anotar_sin_cita')

  // "Me equivoque de persona": deshacer una entrega de hoy.
  const puedeDeshacer = permisos.includes('anular_entregas')

  const [vista, setVista] = useState('camara')
  // La cita que se esta revisando. Llega del QR (trae `token`) o de la
  // busqueda manual (trae `porCodigo`); desde aqui las dos se tratan igual.
  const [previa, setPrevia] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [encontrados, setEncontrados] = useState(null)

  // En que fila escanea esta cuenta. Hasta saberlo, como siempre: las dos.
  const [fila, setFila] = useState('ambas')

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

  //  El ultimo codigo entregado con la camara: { token, nombre, momento }.
  const ultimaEntrega = useRef(null)

  function recordarEntrega(respuesta, token) {
    if (token && PUEDE_PASAR.includes(respuesta?.resultado)) {
      ultimaEntrega.current = { token, nombre: respuesta.nombre, momento: Date.now() }
    }
  }

  useEffect(() => {
    let vigente = true
    miFila().then((suya) => {
      if (vigente) setFila(suya)
    })
    return () => {
      vigente = false
    }
  }, [])

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

      if (cita) {
        setPrevia({ ...cita, token })
        return
      }

      // No es una cita: puede ser un pase permanente, que no se quema.
      const pase = await verPase(token)
      setPrevia(pase ? { ...pase, token, pase: true } : { resultado: 'NO_EXISTE', token })
    } catch (e) {
      //  Sin senal NO es "codigo no reconocido": el codigo puede estar bien.
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
      setResultado(respuesta)
      setVista('resultado')
      recordarEntrega(respuesta, previa.token)
      //  El tono de "puede pasar" o "detente". Antes solo sonaba en la
      //  entrega autorizada, y esta es la de todos los dias.
      avisoDelResultado(respuesta?.resultado)
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
        setResultado(respuesta)
        setVista('resultado')
        recordarEntrega(respuesta, previa.token)
        //  Tono distinto para "puede pasar" y para "detente": en la fila se
        //  distingue sin mirar la pantalla.
        avisoDelResultado(respuesta?.resultado)
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

  return (
    <div className="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Tarjeta>
        <h1 className="mb-1 text-2xl font-bold">{t('pages.escanear')}</h1>
        <p className="text-base text-principal/70">{t('escaneo.instruccion')}</p>
        {/* A la vista siempre: si alguien se para en la fila equivocada, lo ve aqui. */}
        <FilaActual fila={fila} />

        {vista === 'camara' && (
          <>
            <LectorQR activo alLeer={alLeer} />
            <Boton className="mt-3" onClick={() => setVista('manual')} variant="secondary">
              {t('escaneo.buscarManual')}
            </Boton>
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
            {previa.resultado === 'NO_EXISTE' && (
              <div className={`rounded-xl border-2 p-4 ${ESTILO_RESULTADO.NO_EXISTE}`}>
                <p className="text-2xl font-bold">{t('escaneo.resultado.NO_EXISTE')}</p>
                <p className="mt-2 text-base text-principal/80">
                  {t('escaneo.explicacion.NO_EXISTE')}
                </p>
              </div>
            )}

            {previa.resultado === 'SIN_CONEXION' && (
              <div className="rounded-xl border-2 border-accion bg-accion/15 p-4 text-principal" role="alert">
                <p className="text-2xl font-bold">{t('escaneo.resultado.SIN_CONEXION')}</p>
                <p className="mt-2 text-base">{t('escaneo.explicacion.SIN_CONEXION')}</p>
                <Boton className="mt-3" onClick={() => alLeer(previa.token)} variant="secondary">
                  {t('escaneo.volverARevisar')}
                </Boton>
              </div>
            )}

            {previa.resultado === 'RECIEN_ENTREGADO' && (
              <div className="rounded-xl border-2 border-puede-pasar bg-puede-pasar/10 p-4 text-principal" role="status">
                <p className="text-2xl font-bold text-puede-pasar">{t('escaneo.resultado.RECIEN_ENTREGADO')}</p>
                <p className="mt-2 text-base">
                  {t('escaneo.explicacion.RECIEN_ENTREGADO', { nombre: previa.nombre ?? '' })}
                </p>
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

            {!previaEspecial && !citaDeOtroDia && (
              <div className="rounded-xl border border-principal/20 p-4">
                {previa.pase && (
                  <p className="mb-2 inline-block rounded-lg bg-accion/20 px-2 py-1 text-base font-bold text-principal">
                    {t('escaneo.pase')}
                  </p>
                )}
                {!previa.pase && filaDe(previa) === 'a_pie' && (
                  <p className="mb-2 inline-flex items-center gap-2 rounded-lg bg-accion/20 px-2 py-1 text-base font-bold text-principal">
                    <FaPersonWalking aria-hidden="true" className="h-4 w-4" />
                    {t('filas.nombre.a_pie')}
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

            {!previaEspecial && !citaDeOtroDia && !(previa.pase && !previa.activo) && (
              <Boton className="mt-4" disabled={ocupado} onClick={registrarPrevia}>
                {ocupado ? t('escaneo.registrando') : t('escaneo.registrarEntrega')}
              </Boton>
            )}

            <Boton className="mt-3" onClick={reiniciar} variant="secondary">
              {t('escaneo.escanearOtro')}
            </Boton>
          </>
        )}

        {vista === 'resultado' && resultado && (
          <>
            <div
              className={`rounded-xl border-2 p-4 ${
                ESTILO_RESULTADO[resultado.resultado] ?? 'border-principal/20'
              }`}
            >
              <p className="text-2xl font-bold">{t(`escaneo.resultado.${resultado.resultado}`)}</p>
              {resultado.nombre && (
                <p className="mt-2 text-lg text-principal">
                  {resultado.nombre} · {resultado.codigo_corto}
                </p>
              )}
              {resultado.hora && (
                <p className="text-base text-principal/70">{formatearHora(resultado.hora)}</p>
              )}
              <p className="mt-2 text-base text-principal/80">
                {t(`escaneo.explicacion.${resultado.resultado}`)}
              </p>
            </div>

            {puedeDeshacer && PUEDE_PASAR.includes(resultado.resultado) && resultado.codigo_corto && (
              <DeshacerEntrega codigo={resultado.codigo_corto} nombre={resultado.nombre} />
            )}

            <Boton className="mt-4" onClick={reiniciar}>
              {t('escaneo.escanearOtro')}
            </Boton>
          </>
        )}

        {vista === 'manual' && (
          <>
            <form className="space-y-3" onSubmit={buscar}>
              <Campo
                autoFocus
                etiqueta={t('escaneo.buscarEtiqueta')}
                id="busqueda"
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="CB-4871"
                value={busqueda}
              />
              <Boton type="submit" variant="secondary">
                {t('escaneo.buscar')}
              </Boton>
            </form>

            {avisoError}

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
                      <Boton className="mt-2" onClick={() => elegirDeLista(persona)} variant="secondary">
                        {t('escaneo.verCita')}
                      </Boton>
                    </li>
                  )
                })}
              </ul>
            )}

            <Boton className="mt-4" onClick={reiniciar} variant="secondary">
              {t('escaneo.volverCamara')}
            </Boton>
          </>
        )}
      </Tarjeta>

      {/* En la fila tambien pasa gente sin cita. En computadora va a un lado.
          Se queda a la vista tanto con la camara como buscando por codigo: quien
          no trae QR es justo quien acaba anotandose sin cita, y tener que volver
          a la camara para anotarlo cuesta tiempo con la fila afuera. */}
      {puedeAnotarSinCita && (vista === 'camara' || vista === 'manual') && (
        <Tarjeta>
          <h2 className="mb-1 text-lg font-bold">{t('sinCita.titulo')}</h2>
          <p className="mb-3 text-base text-principal/70">{t('sinCita.ayuda')}</p>
          <EntradaSinCita />
        </Tarjeta>
      )}
    </div>
  )
}

/** "Escaneas en: Fila de carros", con su icono. */
function FilaActual({ fila }) {
  const { t } = useTranslation()
  const Icono = ICONO_FILA[fila] ?? LuLayers

  return (
    <p className="mb-4 mt-2 inline-flex items-center gap-2 rounded-full bg-principal/5 px-3 py-1.5 text-base font-semibold text-principal ring-1 ring-principal/10">
      <Icono aria-hidden="true" className="h-4 w-4 shrink-0 text-accion" />
      {t('escaneo.estasEn', { fila: t(`filas.nombre.${fila}`) })}
    </p>
  )
}
