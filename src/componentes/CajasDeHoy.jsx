import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPackageCheck, LuVolume2 } from 'react-icons/lu'
import Ayuda from './Ayuda'
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
 *
 * Compacto (17 de noviembre de 2026): el numero y lo que cuenta en un
 * renglon, y lo que significa en el "?": la camara queda mas arriba.
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-principal/5 px-3 py-2">
      <div aria-live="polite" className="flex min-w-[min(11rem,100%)] flex-1 basis-0 flex-wrap items-center gap-x-3 gap-y-1">
        <LuPackageCheck aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
        <p className="font-titulo text-3xl font-bold leading-none text-principal">{cuentas ? cuentas.cajas : '—'}</p>
        {/* Con la letra grande, lo que cuenta baja debajo del numero entero. */}
        <div className="min-w-[min(8rem,100%)] flex-1 basis-0">
          <p className="text-base font-semibold leading-tight text-principal">{t('escaneo.cajas.hoy')}</p>
          {cuentas && (
            <p className="text-chica text-principal/80">
              {t('escaneo.cajas.enTuFila', { n: cuentas.cajas_fila })}
              {fila === 'carro' && ` · ${t('escaneo.cajas.faltan', { n: cuentas.faltan_fila })}`}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Ayuda titulo={t('escaneo.cajas.ayudaTitulo')}>
          <p>{t('escaneo.cajas.ayudaTexto')}</p>
        </Ayuda>
        <button
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-principal/25 bg-superficie px-3 text-base font-semibold text-principal transition hover:border-principal"
          onClick={probar}
          type="button"
        >
          <LuVolume2 aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span className="min-w-0">{t('escaneo.sonido.probar')}</span>
        </button>
      </div>
    </div>
  )
}
