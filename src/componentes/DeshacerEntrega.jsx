import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuUndo2 } from 'react-icons/lu'
import { anularEntrega } from '../datos/escaneo'

const MOTIVOS = ['otraPersona', 'sinQuerer', 'otro']

/**
 * "Me equivoqué de persona": deshace una entrega de HOY.
 *
 * En la prisa se escanea a la Maria equivocada o se toca la persona de
 * arriba en la lista. Sin esto, la Maria de verdad llega y su codigo dice
 * "ya recibio". Pide un motivo (se guarda quien, cuando y por que) y
 * pregunta antes: deshacer es poder volver a entregar ese codigo.
 *
 * Solo aparece con la palomita "Deshacer entregas"; la base lo vuelve a
 * revisar.
 */
export default function DeshacerEntrega({ codigo, nombre, alDeshacer, alCancelar, abiertoAlInicio = false }) {
  const { t, i18n } = useTranslation()

  const [abierto, setAbierto] = useState(abiertoAlInicio)
  const [motivo, setMotivo] = useState('otraPersona')
  const [otro, setOtro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [listo, setListo] = useState(false)

  if (listo) {
    return (
      <p className="mt-3 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
        {t('deshacer.listo', { codigo })}
      </p>
    )
  }

  if (!abierto) {
    return (
      <button
        className="mt-3 inline-flex min-h-12 items-center gap-2 text-base font-semibold text-principal/80 underline underline-offset-4 hover:text-principal"
        onClick={() => setAbierto(true)}
        type="button"
      >
        <LuUndo2 aria-hidden="true" className="h-5 w-5" />
        {t('deshacer.abrir')}
      </button>
    )
  }

  //  El motivo se guarda en espanol, que es como lo lee el pastor, aunque
  //  la pantalla este en otro idioma. El "otro" va como lo escribieron.
  const textoMotivo = motivo === 'otro' ? otro.trim() : i18n.t(`deshacer.motivos.${motivo}`, { lng: 'es' })

  async function confirmar() {
    if (!textoMotivo) {
      setError('MOTIVO_REQUERIDO')
      return
    }

    setEnviando(true)
    setError(null)

    try {
      await anularEntrega(codigo, textoMotivo)
      setListo(true)
      alDeshacer?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-4">
      <p className="text-base font-bold">{t('deshacer.pregunta', { nombre: nombre ?? codigo, codigo })}</p>
      <p className="text-base text-principal/80">{t('deshacer.explicacion')}</p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-base font-semibold">{t('deshacer.motivo')}</legend>
        {MOTIVOS.map((opcion) => (
          <label
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 ${
              motivo === opcion ? 'border-principal bg-principal/5' : 'border-principal/20'
            }`}
            key={opcion}
          >
            <input
              checked={motivo === opcion}
              className="h-5 w-5 accent-principal"
              name="motivo-deshacer"
              onChange={() => setMotivo(opcion)}
              type="radio"
            />
            <span className="text-base">{t(`deshacer.motivos.${opcion}`)}</span>
          </label>
        ))}
      </fieldset>

      {motivo === 'otro' && (
        <label className="flex flex-col gap-2" htmlFor="motivo-otro">
          <span className="text-base font-semibold">{t('deshacer.cualMotivo')}</span>
          <textarea
            className="min-h-20 rounded-xl border border-principal/25 bg-superficie p-3 text-base text-principal outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
            id="motivo-otro"
            maxLength={300}
            onChange={(e) => setOtro(e.target.value)}
            value={otro}
          />
        </label>
      )}

      {error && (
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`deshacer.errores.${error}`, { defaultValue: t('deshacer.errores.ERROR_DESCONOCIDO') })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-14 items-center justify-center rounded-xl bg-peligro px-5 text-base font-bold text-white disabled:opacity-60"
          disabled={enviando}
          onClick={confirmar}
          type="button"
        >
          {enviando ? t('deshacer.deshaciendo') : t('deshacer.confirmar')}
        </button>
        <button
          className="inline-flex min-h-14 items-center px-3 text-base font-semibold underline underline-offset-4"
          disabled={enviando}
          onClick={() => {
            setAbierto(false)
            setError(null)
            alCancelar?.()
          }}
          type="button"
        >
          {t('deshacer.cancelar')}
        </button>
      </div>
    </div>
  )
}
