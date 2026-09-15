import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCalendarPlus, LuCircleCheck } from 'react-icons/lu'
import Boton from './Boton'
import Campo from './Campo'
import Tarjeta from './Tarjeta'
import { reservarConExcepcion } from '../datos/citas'
import { aFechaLocal, agruparPorFecha, formatearHora } from '../datos/disponibilidad'

const ESTILO_SELECT =
  'min-h-14 w-full rounded-xl border border-principal/25 bg-white px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

/**
 * Segunda cita en la misma semana, con autorizacion del administrador.
 *
 * Para una persona que ya tiene su cita de la semana y necesita otra por una
 * razon especial (enfermedad, emergencia). Se busca por su codigo CB; el
 * motivo es obligatorio y la base guarda quien lo autorizo.
 */
export default function ExcepcionSemana({ bloques, alAutorizar }) {
  const { t, i18n } = useTranslation()

  const [abierta, setAbierta] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [fecha, setFecha] = useState('')
  const [bloqueId, setBloqueId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [autorizada, setAutorizada] = useState(null)

  const fechaLarga = (valor) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(aFechaLocal(valor))

  const dias = agruparPorFecha(bloques ?? [])
  const horarios = (bloques ?? []).filter((bloque) => bloque.fecha === fecha)
  const completo = codigo.trim() !== '' && bloqueId !== '' && motivo.trim().length >= 3

  async function enviar(evento) {
    evento.preventDefault()
    setError(null)
    setEnviando(true)

    try {
      const cita = await reservarConExcepcion({ codigo: codigo.trim(), bloqueId, motivo: motivo.trim() })
      setAutorizada(cita)
      setAbierta(false)
      setCodigo('')
      setFecha('')
      setBloqueId('')
      setMotivo('')
      alAutorizar?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Tarjeta>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <LuCalendarPlus aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
        {t('excepcion.titulo')}
      </h2>
      <p className="mt-1 text-base text-principal/70">{t('excepcion.ayuda')}</p>

      {autorizada && (
        <div className="mt-3 rounded-xl bg-puede-pasar/10 p-3" role="status">
          <p className="flex items-center gap-2 text-base font-bold text-puede-pasar">
            <LuCircleCheck aria-hidden="true" className="h-5 w-5" />
            {t('excepcion.listo')}
          </p>
          <p className="mt-1 text-base first-letter:uppercase">
            {autorizada.codigo_corto} · {fechaLarga(autorizada.fecha)}, {formatearHora(autorizada.hora)}
          </p>
          <a
            className="mt-1 inline-flex min-h-12 items-center text-base font-semibold text-principal underline underline-offset-4"
            href={`/confirmacion/${autorizada.token_qr}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('registrarPanel.verQR')}
          </a>
        </div>
      )}

      {!abierta ? (
        <Boton
          className="mt-3"
          onClick={() => {
            setAbierta(true)
            setAutorizada(null)
          }}
          variant="secondary"
        >
          {t('excepcion.abrir')}
        </Boton>
      ) : (
        <form className="mt-4 space-y-4" noValidate onSubmit={enviar}>
          <Campo
            autoCapitalize="characters"
            autoComplete="off"
            etiqueta={t('excepcion.codigo')}
            id="excepcionCodigo"
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="CB-4871"
            value={codigo}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <label className="flex flex-col gap-2" htmlFor="excepcionFecha">
              <span className="text-base font-semibold text-principal">{t('registrarPanel.fecha')}</span>
              <select
                className={ESTILO_SELECT}
                id="excepcionFecha"
                onChange={(e) => {
                  setFecha(e.target.value)
                  setBloqueId('')
                }}
                value={fecha}
              >
                <option value="">{t('registrarPanel.elegirFecha')}</option>
                {dias.map((dia) => (
                  <option disabled={dia.libres === 0} key={dia.fecha} value={dia.fecha}>
                    {fechaLarga(dia.fecha)} ·{' '}
                    {dia.libres > 0
                      ? t('registrarPanel.lugares', { count: dia.libres })
                      : t('registrarPanel.lleno')}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2" htmlFor="excepcionHorario">
              <span className="text-base font-semibold text-principal">{t('registrarPanel.horario')}</span>
              <select
                className={ESTILO_SELECT}
                disabled={!fecha}
                id="excepcionHorario"
                onChange={(e) => setBloqueId(e.target.value)}
                value={bloqueId}
              >
                <option value="">{t('registrarPanel.elegirHorario')}</option>
                {horarios.map((bloque) => (
                  <option disabled={bloque.libres === 0} key={bloque.bloque_id} value={bloque.bloque_id}>
                    {formatearHora(bloque.hora)} ·{' '}
                    {bloque.libres > 0
                      ? t('registrarPanel.lugares', { count: bloque.libres })
                      : t('registrarPanel.lleno')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-2" htmlFor="excepcionMotivo">
            <span className="text-base font-semibold text-principal">{t('excepcion.motivo')}</span>
            <textarea
              className="min-h-24 rounded-xl border border-principal/25 bg-white p-3 text-base text-principal shadow-sm outline-none placeholder:text-principal/40 focus:border-principal focus:ring-4 focus:ring-principal/15"
              id="excepcionMotivo"
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={t('excepcion.motivoEjemplo')}
              rows={3}
              value={motivo}
            />
          </label>

          {error && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Boton disabled={enviando || !completo} type="submit">
              {enviando ? t('excepcion.autorizando') : t('excepcion.autorizar')}
            </Boton>
            <button
              className="inline-flex min-h-14 w-full items-center justify-center rounded-xl border border-principal/25 bg-white px-4 text-base font-bold text-principal transition hover:border-principal"
              onClick={() => {
                setAbierta(false)
                setError(null)
              }}
              type="button"
            >
              {t('excepcion.cerrar')}
            </button>
          </div>
        </form>
      )}
    </Tarjeta>
  )
}
