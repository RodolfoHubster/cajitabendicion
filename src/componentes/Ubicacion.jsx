import { useTranslation } from 'react-i18next'
import { LuMapPin, LuPhone } from 'react-icons/lu'
import { ORGANIZACION } from '../datos/organizacion'
import Tarjeta from './Tarjeta'

const EXTERNO = { rel: 'noopener noreferrer', target: '_blank' }

/**
 * Como llegar. Dos botones que abren la app de mapas del telefono: en
 * iPhone el de Apple Maps, en Android el de Google Maps.
 */
export default function Ubicacion() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <LuMapPin aria-hidden="true" className="h-6 w-6 text-accion" />
        {t('ubicacion.titulo')}
      </h2>

      <p className="mt-3 text-base font-semibold">{ORGANIZACION.iglesia}</p>
      <p className="text-base text-principal/80">{ORGANIZACION.direccion}</p>
      <p className="mt-2 text-base text-principal/70">{t('ubicacion.entregas')}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a
          className="inline-flex min-h-14 items-center justify-center rounded-xl bg-principal px-4 text-base font-semibold text-white shadow-sm transition hover:brightness-110"
          href={ORGANIZACION.mapas.google}
          {...EXTERNO}
        >
          {t('ubicacion.googleMaps')}
        </a>
        <a
          className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/30 bg-white px-4 text-base font-semibold text-principal transition hover:border-principal"
          href={ORGANIZACION.mapas.apple}
          {...EXTERNO}
        >
          {t('ubicacion.appleMaps')}
        </a>
      </div>

      <a
        className="mt-3 inline-flex min-h-14 items-center gap-2 text-base font-semibold text-principal underline-offset-4 hover:underline"
        href={ORGANIZACION.telefonoEnlace}
      >
        <LuPhone aria-hidden="true" className="h-5 w-5 text-accion" />
        {t('ubicacion.llamar')} · {ORGANIZACION.telefono}
      </a>
    </Tarjeta>
  )
}
