import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaPersonWalking } from 'react-icons/fa6'
import { LuCircleCheck, LuLock } from 'react-icons/lu'
import CamposFilaAPie from './CamposFilaAPie'
import { ahoraSanDiego, formatearFechaHora } from '../datos/disponibilidad'
import {
  camposFilaAPie,
  cerrarRegistroAPie,
  filaAPieParaGuardar,
  guardarFilaAPie,
  problemaFilaAPie,
  quitarFilaAPie,
} from '../datos/filaAPie'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-4 text-base font-semibold text-principal transition hover:border-principal disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_FUERTE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-marca px-4 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50'

// '2026-09-11T12:00:00' -> '2026-09-11T12:00', el formato de datetime-local.
const aCampo = (marca) => (marca ? marca.slice(0, 16) : '')

/**
 * La fila a pie de un dia, en Horarios: a que hora se empieza a entregar,
 * cuantos turnos (o sin limite, mientras se decide con el pastor) y a que
 * hora abre el registro. Lo recomendado es abrirlo una hora antes; si se
 * escoge antes, se avisa, y despues de empezar no se puede.
 *
 * dia: un renglon de listar_dias_entrega(), con sus columnas a_pie_*.
 * ejecutar(accion, opciones): el mismo de DiaEntregaAdmin, que avisa y recarga.
 */
export default function FilaAPieDelDia({ dia, ejecutar, ocupado, mensaje }) {
  const { t, i18n } = useTranslation()
  const existe = Boolean(dia.a_pie_bloque_id)

  const [campos, setCampos] = useState(() => camposFilaAPie(dia))
  const [preguntandoQuitar, setPreguntandoQuitar] = useState(false)
  const problema = problemaFilaAPie(dia.fecha, campos)

  function guardar(evento) {
    evento.preventDefault()
    ejecutar(() => guardarFilaAPie(filaAPieParaGuardar(dia.fecha, campos)), {
      seccion: 'aPie',
      avisar: 'filaAPieAdmin.guardado',
    })
  }

  function alternarRegistro() {
    if (!dia.a_pie_cerrado && !window.confirm(t('filaAPieAdmin.confirmarCerrar'))) return
    ejecutar(() => cerrarRegistroAPie(dia.a_pie_bloque_id, !dia.a_pie_cerrado), {
      seccion: 'aPie',
      avisar: 'filaAPieAdmin.guardado',
    })
  }

  function quitar() {
    setPreguntandoQuitar(false)
    ejecutar(() => quitarFilaAPie(dia.fecha), { seccion: 'aPie', avisar: 'filaAPieAdmin.quitada' })
  }

  const yaAbrio = existe && dia.a_pie_abre_en && aCampo(dia.a_pie_abre_en) <= ahoraSanDiego()

  return (
    <section className="rounded-xl border-2 border-accion/50 bg-superficie p-4">
      <h4 className="mb-1 flex items-center gap-2 text-lg font-bold text-principal">
        <FaPersonWalking aria-hidden="true" className="h-5 w-5 text-accion" />
        {t('filaAPieAdmin.titulo')}
      </h4>
      <p className="mb-3 text-base text-principal/70">{t('filaAPieAdmin.ayuda')}</p>

      {existe && (
        <p
          className={`mb-3 flex items-start gap-2 text-base font-semibold ${
            dia.a_pie_cerrado ? 'text-ya-recibio' : yaAbrio ? 'text-puede-pasar' : 'text-principal'
          }`}
        >
          {dia.a_pie_cerrado ? (
            t('filaAPieAdmin.registroCerrado')
          ) : yaAbrio ? (
            <>
              <LuCircleCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              {t('filaAPieAdmin.registroAbierto')}
            </>
          ) : (
            <>
              <LuLock aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-accion" />
              {t('filaAPieAdmin.abre', { cuando: formatearFechaHora(dia.a_pie_abre_en, i18n.language) })}
            </>
          )}
          <span className="font-normal text-principal/70">
            · {t('filaAPieAdmin.turnosDados', { count: dia.a_pie_ocupados ?? 0 })}
          </span>
        </p>
      )}

      <form className="space-y-4" onSubmit={guardar}>
        <CamposFilaAPie alCambiar={setCampos} fecha={dia.fecha} id={dia.fecha} valor={campos} />

        <div className="flex flex-wrap gap-2">
          <button className={BOTON_FUERTE} disabled={ocupado || Boolean(problema)} type="submit">
            {existe ? t('filaAPieAdmin.guardarCambios') : t('filaAPieAdmin.crear')}
          </button>
          {existe && (
            <button className={BOTON} disabled={ocupado} onClick={alternarRegistro} type="button">
              {dia.a_pie_cerrado ? t('filaAPieAdmin.reabrir') : t('filaAPieAdmin.cerrar')}
            </button>
          )}
        </div>
      </form>

      {mensaje}

      {/* Con turnos dados no se quita: se cierra el registro. */}
      {existe &&
        (dia.a_pie_ocupados ?? 0) === 0 &&
        (preguntandoQuitar ? (
          <div
            aria-labelledby={`quitar-a-pie-${dia.fecha}`}
            className="mt-3 rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-3"
            role="alertdialog"
          >
            <p className="text-base font-semibold" id={`quitar-a-pie-${dia.fecha}`}>
              {t('filaAPieAdmin.confirmarQuitar')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-12 items-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-50"
                disabled={ocupado}
                onClick={quitar}
                type="button"
              >
                {t('filaAPieAdmin.siQuitar')}
              </button>
              <button className={BOTON} onClick={() => setPreguntandoQuitar(false)} type="button">
                {t('filaAPieAdmin.noQuitar')}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="mt-3 min-h-12 px-1 text-base font-semibold text-ya-recibio underline underline-offset-4 disabled:opacity-50"
            disabled={ocupado}
            onClick={() => setPreguntandoQuitar(true)}
            type="button"
          >
            {t('filaAPieAdmin.quitar')}
          </button>
        ))}
    </section>
  )
}
