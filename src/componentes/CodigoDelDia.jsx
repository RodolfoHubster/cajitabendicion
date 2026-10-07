import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuDownload, LuKeyRound, LuRefreshCw } from 'react-icons/lu'
import { dibujarCartelQr, urlDeTurno } from '../datos/cartelQr'
import { codigoTurnoAPie } from '../datos/filaAPie'
import { guardarImagen } from '../datos/imagenCita'
import { ORGANIZACION } from '../datos/organizacion'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal transition hover:border-principal disabled:cursor-not-allowed disabled:opacity-50'

/**
 * En la Fila a pie de una fecha: el codigo del dia y el cartel del QR.
 *
 * El codigo del dia (seccion 43 de la base): con la casilla prendida, para
 * sacar turno en /turno hay que escribir 4 numeros que solo se ven en la
 * entrada (pizarron, o los dice la voluntaria). Asi nadie saca turno desde
 * su casa. Cada fecha tiene los suyos, al azar. Los turnos que da la
 * voluntaria no lo piden.
 *
 * El cartel: el QR de /turno con el logo, listo para imprimir, con un
 * recuadro en blanco para escribir a mano el codigo de ese dia.
 */
export default function CodigoDelDia({ fecha }) {
  const { t } = useTranslation()
  //  undefined: preguntando; null: no se pide; '1234': el codigo.
  const [codigo, setCodigo] = useState(undefined)
  const [disponible, setDisponible] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [cartel, setCartel] = useState(null)

  useEffect(() => {
    let vigente = true
    codigoTurnoAPie(fecha)
      .then((actual) => {
        if (vigente) setCodigo(actual ?? null)
      })
      .catch((e) => {
        if (!vigente) return
        //  La base todavia no lo tiene: no se ofrece.
        if (e.message === 'FUNCION_NO_INSTALADA') setDisponible(false)
        else setError(e.message)
        setCodigo(null)
      })
    return () => {
      vigente = false
    }
  }, [fecha])

  async function cambiar(opciones) {
    setOcupado(true)
    setError(null)
    try {
      setCodigo((await codigoTurnoAPie(fecha, opciones)) ?? null)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  async function descargarCartel() {
    setCartel('dibujando')
    try {
      const blob = await dibujarCartelQr({
        url: urlDeTurno(),
        mensaje: t('codigoDelDia.cartel.mensaje'),
        programa: ORGANIZACION.programa,
        iglesia: ORGANIZACION.iglesia,
        recuadro: t('codigoDelDia.cartel.recuadro'),
      })
      const resultado = await guardarImagen(blob, 'cajita-cartel-turnos-a-pie.png')
      setCartel(resultado === 'descargada' ? 'descargada' : null)
    } catch {
      setCartel('error')
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-principal/15 p-3">
      {disponible && (
        <div>
          <label className="flex min-h-12 items-center gap-3 text-base font-semibold text-principal">
            <input
              checked={Boolean(codigo)}
              className="h-6 w-6 shrink-0 accent-principal"
              disabled={ocupado || codigo === undefined}
              onChange={(e) => cambiar({ activo: e.target.checked })}
              type="checkbox"
            />
            {t('codigoDelDia.casilla')}
          </label>
          <p className="text-base text-principal/70">{t('codigoDelDia.ayuda')}</p>

          {codigo && (
            <div className="aparecer mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-dashed border-accion bg-accion/10 px-3 py-2">
              <span className="inline-flex items-center gap-2 text-base font-semibold text-principal">
                <LuKeyRound aria-hidden="true" className="h-5 w-5 text-accion" />
                {t('codigoDelDia.esteDia')}
              </span>
              <span className="font-titulo text-4xl font-bold tracking-[0.3em] text-principal">{codigo}</span>
              <button
                className="inline-flex min-h-12 items-center gap-1.5 text-base font-semibold text-principal underline underline-offset-4 disabled:opacity-50"
                disabled={ocupado}
                onClick={() => cambiar({ activo: true, nuevo: true })}
                type="button"
              >
                <LuRefreshCw aria-hidden="true" className="h-4 w-4" />
                {t('codigoDelDia.otro')}
              </button>
            </div>
          )}

          {error && (
            <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {t(`diasAdmin.errores.${error}`, { defaultValue: t('codigoDelDia.error') })}
            </p>
          )}
        </div>
      )}

      <div>
        <button className={BOTON} disabled={cartel === 'dibujando'} onClick={descargarCartel} type="button">
          <LuDownload aria-hidden="true" className="h-5 w-5 text-accion" />
          {cartel === 'dibujando' ? t('codigoDelDia.cartel.dibujando') : t('codigoDelDia.cartel.boton')}
        </button>
        <p className="mt-1 text-base text-principal/70">{t('codigoDelDia.cartel.ayuda')}</p>
        {cartel === 'descargada' && (
          <p className="mt-1 text-base font-semibold text-puede-pasar" role="status">
            {t('codigoDelDia.cartel.listo')}
          </p>
        )}
        {cartel === 'error' && (
          <p className="mt-1 text-base text-ya-recibio" role="alert">
            {t('codigoDelDia.cartel.error')}
          </p>
        )}
      </div>
    </div>
  )
}
