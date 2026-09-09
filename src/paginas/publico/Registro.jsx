import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Pasos from '../../componentes/Pasos'
import Tarjeta from '../../componentes/Tarjeta'
import { aFechaLocal, consultarBloquesDeFecha, formatearHora } from '../../datos/disponibilidad'
import { registrarYReservar } from '../../datos/registro'
import { OTRA_ZONA, ZONAS } from '../../datos/zonas'

export default function Registro() {
  const { t, i18n } = useTranslation()
  const [parametros] = useSearchParams()
  const navegar = useNavigate()

  const bloqueId = parametros.get('bloque')
  const fecha = parametros.get('fecha')

  const [bloque, setBloque] = useState(null)
  const [cargando, setCargando] = useState(Boolean(bloqueId && fecha))
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [zona, setZona] = useState('')
  const [otraZona, setOtraZona] = useState('')

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
    return (
      <Tarjeta>
        <p className="text-base">{t('registro.cargando')}</p>
      </Tarjeta>
    )
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

  const encabezado = `${new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(aFechaLocal(bloque.fecha))}, ${formatearHora(bloque.hora)}`

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const cita = await registrarYReservar({
        nombre,
        telefono,
        email,
        ciudad: zona === OTRA_ZONA ? otraZona : zona,
        bloqueId,
      })

      // Se pasa el nombre porque la funcion no lo devuelve y la pantalla de
      // confirmacion lo muestra ("A nombre de..."). Al recargar se obtiene
      // de consultar_cita.
      navegar(`/confirmacion/${cita.token_qr}`, { state: { ...cita, nombre: nombre.trim() } })
    } catch (e) {
      setError(e.message)
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <Pasos actual={3} />

      <h1 className="mb-1 text-2xl font-bold">{t('pages.registro')}</h1>
      <p className="mb-4 text-base text-principal/70">{encabezado}</p>

      <form className="space-y-4" onSubmit={enviar}>
        <Campo
          autoComplete="name"
          etiqueta={t('registro.nombre')}
          id="nombre"
          onChange={(e) => setNombre(e.target.value)}
          required
          value={nombre}
        />

        <Campo
          autoComplete="tel"
          etiqueta={t('registro.telefono')}
          id="telefono"
          inputMode="tel"
          onChange={(e) => setTelefono(e.target.value)}
          required
          type="tel"
          value={telefono}
        />

        <div>
          <Campo
            autoComplete="email"
            etiqueta={t('registro.correo')}
            id="correo"
            inputMode="email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
          <p className="mt-1 text-base text-principal/60">{t('registro.correoAyuda')}</p>
        </div>

        <div>
          <label className="flex w-full flex-col gap-2 text-left" htmlFor="zona">
            <span className="text-base font-medium text-principal">{t('registro.zona')}</span>
            <select
              className="min-h-14 rounded-xl border border-principal/20 bg-white px-3 text-base outline-none focus:border-principal"
              id="zona"
              onChange={(e) => setZona(e.target.value)}
              value={zona}
            >
              <option value="">{t('registro.zonaSinResponder')}</option>
              {ZONAS.map((nombreZona) => (
                <option key={nombreZona} value={nombreZona}>
                  {nombreZona}
                </option>
              ))}
              <option value={OTRA_ZONA}>{t('registro.zonaOtra')}</option>
            </select>
          </label>

          {zona === OTRA_ZONA && (
            <div className="mt-3">
              <Campo
                etiqueta={t('registro.zonaOtraEtiqueta')}
                id="otraZona"
                onChange={(e) => setOtraZona(e.target.value)}
                value={otraZona}
              />
            </div>
          )}

          <p className="mt-1 text-base text-principal/60">{t('registro.zonaAyuda')}</p>
        </div>

        <p className="text-base text-principal/70">{t('registro.privacidad')}</p>

        {error && (
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`registro.errores.${error}`, { defaultValue: t('registro.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}

        <Boton disabled={enviando} type="submit">
          {enviando ? t('registro.enviando') : t('registro.confirmar')}
        </Boton>
      </form>
    </Tarjeta>
  )
}
