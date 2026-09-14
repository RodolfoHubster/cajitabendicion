import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ORGANIZACION } from '../datos/organizacion'
import { IDIOMAS } from '../i18n/config'
import { LogoIglesia } from './Logo'

export default function Encabezado() {
  const { i18n } = useTranslation()

  return (
    // Fijo solo en pantallas anchas. En el celular ocupa dos renglones
    // (marca e idiomas), y fijo le robaria a la persona un tercio de la
    // pantalla mientras llena el formulario.
    <header className="z-20 bg-principal text-white shadow-md sm:sticky sm:top-0">
      <div aria-hidden="true" className="h-1 bg-accion" />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:py-3">
        {/* El combo de marca: el logo de la iglesia y, junto, su ministerio. */}
        <Link
          className="flex min-h-14 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60"
          to="/"
        >
          <LogoIglesia className="h-11 w-auto shrink-0" />
          <span aria-hidden="true" className="h-10 w-px shrink-0 bg-white/25" />
          <span className="flex flex-col leading-tight">
            <span className="font-titulo text-lg font-bold">{ORGANIZACION.programa}</span>
            <span className="text-[15px] text-accion">{ORGANIZACION.iglesia}</span>
          </span>
        </Link>

        {/*
          Los tres idiomas siempre a la vista, cada uno escrito en su propio
          idioma. Un interruptor que solo dice "EN" deja atrapado a quien no
          reconoce la abreviatura. La etiqueta del grupo va en los tres
          idiomas a proposito, no traducida: tiene que entenderse sin
          importar en cual este la pantalla.
        */}
        <div aria-label="Idioma · Language · Ngôn ngữ" className="grid grid-cols-3 gap-2" role="group">
          {IDIOMAS.map(({ codigo, nombre }) => {
            const activo = i18n.resolvedLanguage === codigo

            return (
              <button
                aria-pressed={activo}
                className={`min-h-14 rounded-xl border px-3 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60 ${
                  activo
                    ? 'border-white bg-white text-principal shadow-sm'
                    : 'border-white/30 bg-white/5 text-white hover:border-white'
                }`}
                key={codigo}
                lang={codigo}
                onClick={() => i18n.changeLanguage(codigo)}
                type="button"
              >
                {nombre}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
