import { useTranslation } from 'react-i18next'
import { LuTriangleAlert } from 'react-icons/lu'
import ListaAvisos from './ListaAvisos'

/**
 * Las indicaciones de la entrega y la casilla de "las lei".
 *
 * Van justo antes del boton que genera el QR, a proposito: es el ultimo
 * momento en que la persona esta prestando atencion, y lo que dicen --llegar
 * 5 minutos antes, un registro por dia, una caja por codigo-- es lo que
 * despues causa problemas en la fila si nadie lo leyo.
 *
 * El texto lo edita el pastor desde el panel; aqui solo se muestra.
 */
export default function AceptarReglas({ acepto, alCambiar, error }) {
  const { t } = useTranslation()
  const idError = error ? 'reglas-error' : undefined

  return (
    <div
      className={`rounded-2xl border bg-accion/10 p-4 ${
        error ? 'border-ya-recibio ring-2 ring-ya-recibio/25' : 'border-accion/40'
      }`}
    >
      <p className="flex items-center gap-2 text-base font-bold text-principal">
        <LuTriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
        {t('reglas.titulo')}
      </p>

      <div className="mt-3">
        <ListaAvisos
          respaldo={[t('reglas.respaldo1'), t('reglas.respaldo2'), t('reglas.respaldo3')]}
          seccion="registro"
        />
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3" htmlFor="acepto-reglas">
        <input
          aria-describedby={idError}
          aria-invalid={error ? true : undefined}
          checked={acepto}
          className="mt-1 h-6 w-6 shrink-0 accent-principal"
          id="acepto-reglas"
          onChange={(e) => alCambiar(e.target.checked)}
          type="checkbox"
        />
        <span className="text-base font-semibold text-principal">{t('reglas.casilla')}</span>
      </label>

      {error && (
        <p className="mt-2 text-base font-semibold text-ya-recibio" id={idError}>
          {error}
        </p>
      )}
    </div>
  )
}
