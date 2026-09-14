import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuKeyRound, LuShieldCheck } from 'react-icons/lu'
import { useOutletContext } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import LectorQR from '../../componentes/LectorQR'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal, formatearHora } from '../../datos/disponibilidad'
import {
  buscarParaEscaneo,
  registrarEntrega,
  registrarEntregaAutorizada,
  registrarEntregaAutorizadaPorCodigo,
  registrarEntregaPorCodigo,
  verCita,
} from '../../datos/escaneo'
import { hoyLocal } from '../../datos/panel'

// Colores del logo, segun CLAUDE.md: verde puede pasar, rojo ya recibio.
const ESTILO_RESULTADO = {
  VALIDO: 'bg-puede-pasar/15 text-puede-pasar border-puede-pasar',
  VALIDO_AUTORIZADO: 'bg-puede-pasar/15 text-puede-pasar border-puede-pasar',
  YA_USADO: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
  OTRA_FECHA: 'bg-accion/15 text-principal border-accion',
  CANCELADA: 'bg-accion/15 text-principal border-accion',
  NO_EXISTE: 'bg-ya-recibio/10 text-ya-recibio border-ya-recibio',
}

// Respuestas de la autorizacion que NO terminan el tramite: se muestran en
// el mismo formulario para que se pueda corregir el codigo.
const RECHAZOS_DE_CODIGO = ['CODIGO_INVALIDO', 'BLOQUEADO']

export default function Escanear() {
  const { t, i18n } = useTranslation()
  const { rol } = useOutletContext() ?? {}

  // El admin autoriza con su propia sesion; el voluntario necesita el
  // codigo de un admin. La base de datos aplica la misma regla.
  const esAdmin = rol === 'admin'

  const [vista, setVista] = useState('camara')
  // La cita que se esta revisando. Llega del QR (trae `token`) o de la
  // busqueda manual (trae `porCodigo`); desde aqui las dos se tratan igual.
  const [previa, setPrevia] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  const [busqueda, setBusqueda] = useState('')
  const [encontrados, setEncontrados] = useState(null)

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

  // Se memoriza para que el lector no reinicie la camara en cada render.
  const alLeer = useCallback(async (token) => {
    setError(null)
    setVista('previa')

    try {
      const cita = await verCita(token)
      setPrevia(cita ? { ...cita, token } : { resultado: 'NO_EXISTE', token })
    } catch {
      setPrevia({ resultado: 'NO_EXISTE', token })
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
      setEncontrados(await buscarParaEscaneo(busqueda))
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
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="mb-1 text-2xl font-bold">{t('pages.escanear')}</h1>
        <p className="mb-4 text-base text-principal/70">{t('escaneo.instruccion')}</p>

        {vista === 'camara' && (
          <>
            <LectorQR activo alLeer={alLeer} />
            <Boton className="mt-3" onClick={() => setVista('manual')} variant="secondary">
              {t('escaneo.buscarManual')}
            </Boton>
          </>
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

            {previa.resultado !== 'NO_EXISTE' && citaDeOtroDia && (
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

            {previa.resultado !== 'NO_EXISTE' && !citaDeOtroDia && (
              <div className="rounded-xl border border-principal/20 p-4">
                <p className="text-2xl font-bold text-principal">{previa.nombre}</p>
                <p className="mt-1 text-lg text-principal/80">
                  {previa.codigo_corto} · {formatearHora(previa.hora)}
                </p>
                <p className="mt-2 text-base text-principal/70">
                  {t(`escaneo.estadoPrevio.${previa.estado}`, { defaultValue: previa.estado })}
                </p>
              </div>
            )}

            {/* Con el formulario de autorizacion abierto, el error ya se muestra dentro. */}
            {!autorizando && avisoError}

            {previa.resultado !== 'NO_EXISTE' && !citaDeOtroDia && (
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
    </div>
  )
}
