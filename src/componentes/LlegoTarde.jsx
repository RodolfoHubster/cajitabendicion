import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuBan, LuPackageCheck, LuTriangleAlert } from 'react-icons/lu'
import Boton from './Boton'
import { haceCuanto, horaDeMarca, minutosDesde } from '../datos/filaAPie'

/** Pasados estos minutos, lo sugerido es anular (el boton naranja). */
const MINUTOS_TARDE = 10

/**
 * "¿Anular el turno 12?" Anular no tiene regreso: se pregunta antes, con lo
 * que pasa despues dicho en claro.
 */
export function ConfirmarAnular({ turno, ocupado = false, alSi, alNo }) {
  const { t } = useTranslation()
  const id = `anular-turno-${turno}`

  return (
    <div aria-labelledby={id} className="rounded-xl border-2 border-ya-recibio bg-superficie p-3 text-principal" role="alertdialog">
      <p className="text-lg font-bold" id={id}>
        {t('escaneo.anular.pregunta', { turno })}
      </p>
      <p className="mt-1 text-base">{t('escaneo.anular.explicacion')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-peligro px-4 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          disabled={ocupado}
          onClick={alSi}
          type="button"
        >
          <LuBan aria-hidden="true" className="h-5 w-5 shrink-0" />
          {t('escaneo.anular.si')}
        </button>
        <Boton disabled={ocupado} onClick={alNo} variant="secondary">
          {t('escaneo.anular.no')}
        </Boton>
      </div>
    </div>
  )
}

/**
 * A pie (seccion 46): lo llamaron, no estaba, y ahora llego. No se le
 * entrega solo: se ve a que hora lo llamaron y cuanto tardo, y quien
 * escanea decide. Unos minutos: se le entrega. Mucho: se anula su turno y,
 * si quiere, saca uno nuevo y espera desde el final.
 */
export default function LlegoTarde({ turno, saltadoEn, ocupado = false, alEntregar, alAnular }) {
  const { t } = useTranslation()
  const [confirmando, setConfirmando] = useState(false)
  const muyTarde = minutosDesde(saltadoEn) >= MINUTOS_TARDE

  const entregar = (
    <Boton disabled={ocupado} onClick={alEntregar} variant={muyTarde ? 'secondary' : 'primary'}>
      <LuPackageCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
      {t('escaneo.tarde.entregar')}
    </Boton>
  )
  const anular = (
    <Boton disabled={ocupado} onClick={() => setConfirmando(true)} variant={muyTarde ? 'primary' : 'secondary'}>
      <LuBan aria-hidden="true" className="h-5 w-5 shrink-0" />
      {t('escaneo.tarde.anular')}
    </Boton>
  )

  return (
    <div className="rounded-xl border-2 border-accion bg-accion/15 p-3 text-principal" role="status">
      <p className="flex items-start gap-2 text-lg font-bold">
        <LuTriangleAlert aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-accion" />
        {t('escaneo.tarde.titulo', { turno, hora: horaDeMarca(saltadoEn), hace: haceCuanto(t, saltadoEn) })}
      </p>
      <p className="mt-1 text-base">{t('escaneo.tarde.ayuda')}</p>

      <div className="mt-3">
        {confirmando ? (
          <ConfirmarAnular alNo={() => setConfirmando(false)} alSi={alAnular} ocupado={ocupado} turno={turno} />
        ) : (
          //  Lo sugerido va primero y en naranja: entregar si fueron unos
          //  minutos, anular si tardo mas.
          <div className="grid gap-2 sm:grid-cols-2">
            {muyTarde ? anular : entregar}
            {muyTarde ? entregar : anular}
          </div>
        )}
      </div>
    </div>
  )
}
