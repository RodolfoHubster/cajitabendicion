import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import { LuArrowRight, LuHeart, LuHeartHandshake, LuListChecks } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router-dom'
import ListaAvisos from '../../componentes/ListaAvisos'
import { LogoCompleto } from '../../componentes/Logo'
import MisCitas from '../../componentes/MisCitas'
import Tarjeta from '../../componentes/Tarjeta'
import TarjetaDonar from '../../componentes/TarjetaDonar'
import Ubicacion from '../../componentes/Ubicacion'
import { ORGANIZACION } from '../../datos/organizacion'

/** Las dos opciones miden lo mismo: mismo alto, mismo circulo, mismo icono. */
const OPCION =
  'relative flex min-h-[11rem] flex-col items-center justify-center gap-2.5 overflow-hidden rounded-2xl p-3 text-center'

const CIRCULO = 'flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300'

export default function Inicio() {
  const { t } = useTranslation()
  const navegar = useNavigate()

  return (
    <div className="space-y-5">
      {/* Si este telefono ya hizo una cita, es lo primero que se ve. */}
      <MisCitas />

      {/* Todo aparece junto, sin entrada escalonada: bloque por bloque se
          veia como una pagina que carga a pedazos. */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-marca text-white shadow-elevada">
        {/* Dos luces que respiran despacio detras de todo: le quitan lo
            plano al azul sin distraer de lo que hay que leer. Azules y no
            naranjas: el naranja difuminado sobre azul se ve cafe. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 -z-10 h-72 w-72 animate-brillo rounded-full bg-sky-300/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -left-24 -z-10 h-80 w-80 animate-brillo rounded-full bg-sky-200/15 blur-3xl [animation-delay:-3.5s]"
        />
        {/* El techo del logo, en grande y casi invisible, como marca de agua. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-16 -z-10 w-[130%] max-w-none -translate-x-1/2 text-white/[0.05]"
          fill="none"
          viewBox="0 0 120 70"
        >
          <path
            d="M8 62 L60 12 L112 62"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="6"
          />
        </svg>

        <div aria-hidden="true" className="h-1.5 bg-accion" />

        <div className="flex flex-col items-center gap-3 px-5 pb-8 pt-8 text-center">
          <div>
            <div className="rounded-full bg-white p-2 shadow-md ring-4 ring-accion/80 ring-offset-4 ring-offset-marca">
              <LogoCompleto className="h-36 w-36 rounded-full sm:h-44 sm:w-44" />
            </div>
          </div>

          <p className="mt-2 text-base font-semibold uppercase tracking-[0.2em] text-accion">
            {ORGANIZACION.lema}
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
            {t('inicio.titulo')}
          </h1>
          <p className="text-lg text-white/85">
            {t('inicio.subtitulo')}
          </p>
          <p className="text-base text-white/70">
            {t('marca.ministerio', { iglesia: ORGANIZACION.iglesia })}
          </p>

          <h2 className="mt-4 font-sans text-lg font-bold text-white">
            {t('inicio.comoVienes')}
          </h2>

          {/* Lado a lado si caben; una debajo de la otra si no (telefonos de 360 px o
              letra grande). Con dos columnas fijas, "Próximamente" se cortaba. */}
          <div className="grid w-full max-w-md grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
            <button
              className={`${OPCION} group bg-accion text-sobre-accion shadow-lg shadow-black/25 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/30 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70`}
              onClick={() => navegar('/calendario')}
              type="button"
            >
              {/* Un brillo que cruza la tarjeta al pasar el mouse. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
              />
              <span className={`${CIRCULO} bg-white/40 group-hover:scale-110`}>
                <FaCarSide aria-hidden="true" className="h-9 w-9" />
              </span>
              <span className="text-lg font-bold leading-tight">{t('inicio.enCarro')}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-sobre-accion/10 px-3 py-0.5 text-chica font-bold">
                {t('inicio.hacerCita')}
                <LuArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                />
              </span>
            </button>

            {/* Fase 2. Deshabilitado de verdad, no solo gris: un boton que
                se ve apagado pero responde confunde mas que uno que no esta. */}
            <button
              aria-describedby="proximamente-a-pie"
              className={`${OPCION} cursor-not-allowed border-2 border-dashed border-white/30 bg-white/[0.06] text-white/75`}
              disabled
              type="button"
            >
              <span className={`${CIRCULO} bg-white/10`}>
                <FaPersonWalking aria-hidden="true" className="h-9 w-9" />
              </span>
              <span className="text-lg font-bold leading-tight">{t('inicio.aPie')}</span>
              <span
                className="max-w-full rounded-full bg-white/15 px-2.5 py-0.5 text-chica font-semibold leading-snug text-white/90"
                id="proximamente-a-pie"
              >
                {t('inicio.proximamente')}
              </span>
            </button>
          </div>

          <p className="max-w-md text-chica text-white/70">
            {t('inicio.aPieAviso')}
          </p>

          <p className="mt-1 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-left text-base font-semibold text-white ring-1 ring-white/15">
            <LuHeartHandshake aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
            {t('inicio.gratuito')}
          </p>
        </div>
      </section>

      {/* Las reglas van antes del registro, no escondidas en el formulario:
          se aceptan mejor cuando se entienden desde el principio. */}
      <div>
        <Tarjeta>
          <h2 className="flex items-center gap-3 text-xl font-bold">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accion/15 text-accion">
              <LuListChecks aria-hidden="true" className="h-6 w-6" />
            </span>
            {t('inicio.antesDeEmpezar')}
          </h2>
          <div className="mt-4">
            <ListaAvisos respaldo={[t('inicio.reglaRespaldo')]} seccion="inicio" />
          </div>
          <p className="mt-4 rounded-xl border-l-4 border-accion bg-principal/5 p-3 text-base text-principal/85">
            {t('inicio.yaTienesCita')}
          </p>
        </Tarjeta>
      </div>

      <div>
        <Link
          className="group flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-superficie p-5 text-left shadow-tarjeta ring-1 ring-principal/10 transition duration-300 hover:-translate-y-0.5 hover:shadow-elevada hover:ring-accion/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/50"
          to="/quienes-somos"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accion/15 text-accion transition-transform duration-300 group-hover:scale-110">
              <LuHeart aria-hidden="true" className="h-6 w-6" />
            </span>
            <span>
              <span className="block text-lg font-bold text-principal">{t('quienesSomos.titulo')}</span>
              <span className="block text-base text-principal/70">{t('quienesSomos.invitacion')}</span>
            </span>
          </span>
          <LuArrowRight
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-principal/70 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accion"
          />
        </Link>
      </div>

      <div>
        <Ubicacion />
      </div>

      <div>
        <TarjetaDonar />
      </div>
    </div>
  )
}
