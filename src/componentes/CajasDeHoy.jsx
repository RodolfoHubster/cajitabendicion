import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPackageCheck, LuVolume2 } from 'react-icons/lu'
import useCadaRato from './useCadaRato'
import { cajasDeHoy } from '../datos/escaneo'
import { prepararSonido, probarSonido, sonarAunEnSilencio } from '../datos/sonido'

/**
 * Arriba del escaner (seccion 55): cuantas cajas van hoy en todas las filas
 * (lo que se le reporta al banco de alimentos), cuantas en esta fila y, en
 * carros, cuantas citas faltan por llegar. Es lo que el equipo pregunta todo
 * el dia. Se pregunta cada 30 segundos y en cuanto cambia `version` (una
 * entrega).
 *
 * Al lado, "Probar sonido": para revisar el volumen al empezar el dia. El
 * toque tambien deja listo el sonido (el navegador lo pide).
 */
export default function CajasDeHoy({ fila, version }) {
  const { t } = useTranslation()
  const [cuentas, setCuentas] = useState(null)

  useCadaRato(
    async () => {
      try {
        setCuentas(await cajasDeHoy(fila))
      } catch {
        //  Sin senal: se queda lo ultimo que se supo.
      }
    },
    30000,
    { clave: `${fila}-${version}` },
  )

  function probar() {
    sonarAunEnSilencio()
    prepararSonido()
    probarSonido()
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-principal/5 p-3">
      <div aria-live="polite">
        <p className="flex items-center gap-2 text-base font-semibold text-principal">
          <LuPackageCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
          {t('escaneo.cajas.hoy')}
        </p>
        <p className="font-titulo text-4xl font-bold leading-tight text-principal">{cuentas ? cuentas.cajas : '—'}</p>
        {cuentas && (
          <p className="text-base text-principal/80">
            {t('escaneo.cajas.enTuFila', { n: cuentas.cajas_fila })}
            {fila === 'carro' && ` · ${t('escaneo.cajas.faltan', { n: cuentas.faltan_fila })}`}
          </p>
        )}
      </div>
      <button
        className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-4 text-base font-semibold text-principal transition hover:border-principal"
        onClick={probar}
        type="button"
      >
        <LuVolume2 aria-hidden="true" className="h-5 w-5 shrink-0" />
        {t('escaneo.sonido.probar')}
      </button>
    </div>
  )
}
