import { useTranslation } from 'react-i18next'
import { LuArrowRight, LuCar, LuFootprints, LuHeart } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router-dom'
import ListaAvisos from '../../componentes/ListaAvisos'
import { LogoCompleto } from '../../componentes/Logo'
import Tarjeta from '../../componentes/Tarjeta'
import TarjetaDonar from '../../componentes/TarjetaDonar'
import Ubicacion from '../../componentes/Ubicacion'
import { ORGANIZACION } from '../../datos/organizacion'

export default function Inicio() {
  const { t } = useTranslation()
  const navegar = useNavigate()

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl bg-principal text-white shadow-lg">
        {/* Franja naranja arriba, como la linea del techo en el logo. */}
        <div aria-hidden="true" className="h-1.5 bg-accion" />

        <div className="flex flex-col items-center gap-3 px-5 pb-7 pt-7 text-center">
          <div className="rounded-full bg-white p-2 shadow-md">
            <LogoCompleto className="h-36 w-36 rounded-full sm:h-44 sm:w-44" />
          </div>

          <p className="text-base font-semibold uppercase tracking-[0.2em] text-accion">
            {ORGANIZACION.lema}
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{t('inicio.titulo')}</h1>
          <p className="text-lg text-white/85">{t('inicio.subtitulo')}</p>
          <p className="text-base text-white/75">
            {t('marca.ministerio', { iglesia: ORGANIZACION.iglesia })}
          </p>

          <p className="mt-3 text-base font-semibold text-white">{t('inicio.comoVienes')}</p>

          <div className="grid w-full max-w-md gap-3 sm:grid-cols-2">
            <button
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl bg-accion px-4 py-3 text-base font-bold text-principal shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              onClick={() => navegar('/calendario')}
              type="button"
            >
              <span className="flex items-center gap-2">
                <LuCar aria-hidden="true" className="h-5 w-5" />
                {t('inicio.enCarro')}
              </span>
            </button>

            {/* Fase 2. Deshabilitado de verdad, no solo gris: un boton que
                se ve apagado pero responde confunde mas que uno que no esta. */}
            <button
              aria-describedby="proximamente-a-pie"
              className="flex min-h-14 cursor-not-allowed flex-col items-center justify-center gap-1 rounded-xl border border-white/25 bg-white/5 px-4 py-3 text-base font-bold text-white/60"
              disabled
              type="button"
            >
              <span className="flex items-center gap-2">
                <LuFootprints aria-hidden="true" className="h-5 w-5" />
                {t('inicio.aPie')}
              </span>
              <span
                className="rounded-lg bg-white/15 px-2 py-0.5 text-base font-semibold text-white/80"
                id="proximamente-a-pie"
              >
                {t('inicio.proximamente')}
              </span>
            </button>
          </div>

          <p className="text-base text-white/75">{t('inicio.aPieAviso')}</p>

          <p className="text-base font-semibold text-white">{t('inicio.gratuito')}</p>
        </div>
      </section>

      {/* Las reglas van antes del registro, no escondidas en el formulario:
          se aceptan mejor cuando se entienden desde el principio. */}
      <Tarjeta>
        <h2 className="text-xl font-bold">{t('inicio.antesDeEmpezar')}</h2>
        <div className="mt-3">
          <ListaAvisos respaldo={[t('inicio.reglaRespaldo')]} seccion="inicio" />
        </div>
        <p className="mt-4 rounded-xl bg-principal/5 p-3 text-base text-principal/80">
          {t('inicio.yaTienesCita')}
        </p>
      </Tarjeta>

      <Tarjeta>
        <Link
          className="flex min-h-14 items-center justify-between gap-3 text-left"
          to="/quienes-somos"
        >
          <span className="flex items-start gap-3">
            <LuHeart aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-accion" />
            <span>
              <span className="block text-lg font-bold text-principal">{t('quienesSomos.titulo')}</span>
              <span className="block text-base text-principal/70">{t('quienesSomos.invitacion')}</span>
            </span>
          </span>
          <LuArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-principal/60" />
        </Link>
      </Tarjeta>

      <Ubicacion />

      <TarjetaDonar />
    </div>
  )
}
