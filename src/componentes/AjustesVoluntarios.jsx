import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCircle, LuCircleDot, LuSlidersHorizontal } from 'react-icons/lu'
import { formatearHora } from '../datos/disponibilidad'
import { MODOS, guardarAjustesVoluntarios } from '../datos/voluntarios'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal transition hover:border-principal disabled:opacity-50'

/**
 * Como se anota la asistencia de los voluntarios (seccion 52, solo el
 * administrador): solo la entrada (la salida se pone sola a la hora de
 * salida de siempre) o entrada y salida, como antes.
 *
 * ajustes: { modo, hora_salida }. alGuardar(nuevos). alCerrar.
 */
export default function AjustesVoluntarios({ ajustes, alGuardar, alCerrar }) {
  const { t } = useTranslation()
  const [modo, setModo] = useState(ajustes.modo)
  const [hora, setHora] = useState(ajustes.hora_salida ?? '18:30')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)

  async function guardar(evento) {
    evento.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      alGuardar(await guardarAjustesVoluntarios(modo, hora))
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form className="space-y-3 rounded-xl border-2 border-principal/20 bg-principal/5 p-3" onSubmit={guardar}>
      <h3 className="flex items-center gap-2 text-lg font-bold text-principal">
        <LuSlidersHorizontal aria-hidden="true" className="h-5 w-5 text-accion" />
        {t('voluntarios.ajustes.titulo')}
      </h3>
      <fieldset className="space-y-2">
        <legend className="sr-only">{t('voluntarios.ajustes.titulo')}</legend>
        {MODOS.map((clave) => {
          const escogido = modo === clave
          const Icono = escogido ? LuCircleDot : LuCircle
          return (
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 bg-superficie p-3 transition ${
                escogido ? 'border-marca' : 'border-principal/15 hover:border-principal/40'
              }`}
              htmlFor={`modo-${clave}`}
              key={clave}
            >
              <input
                checked={escogido}
                className="sr-only"
                id={`modo-${clave}`}
                name="modo-voluntarios"
                onChange={() => setModo(clave)}
                type="radio"
                value={clave}
              />
              <Icono aria-hidden="true" className={`mt-0.5 h-6 w-6 shrink-0 ${escogido ? 'text-marca' : 'text-principal/70'}`} />
              <span>
                <span className="block font-bold text-principal">{t(`voluntarios.ajustes.${clave}.titulo`)}</span>
                <span className="block text-base text-principal/80">
                  {t(`voluntarios.ajustes.${clave}.ayuda`, { hora: formatearHora(hora || '18:30') })}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {modo === 'solo_entrada' && (
        <label className="flex flex-wrap items-center gap-3 text-base font-semibold text-principal" htmlFor="hora-salida-voluntarios">
          {t('voluntarios.ajustes.horaSalida')}
          <input
            className="min-h-12 rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal outline-none focus:border-principal"
            id="hora-salida-voluntarios"
            onChange={(e) => setHora(e.target.value)}
            required
            type="time"
            value={hora}
          />
        </label>
      )}

      {error && (
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-12 items-center rounded-xl bg-marca px-4 text-base font-semibold text-white disabled:opacity-50"
          disabled={ocupado || !hora}
          type="submit"
        >
          {t('voluntarios.ajustes.guardar')}
        </button>
        <button className={BOTON} onClick={alCerrar} type="button">
          {t('voluntarios.lista.cancelar')}
        </button>
      </div>
    </form>
  )
}
