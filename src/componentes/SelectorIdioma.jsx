import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuChevronDown, LuGlobe } from 'react-icons/lu'
import { IDIOMAS } from '../i18n/config'

/**
 * El idioma, arriba a la derecha.
 *
 * Se abre como menu y NO va cambiando de idioma a cada toque: con tres
 * idiomas, quien le pica dos veces sin querer termina en uno que no lee y
 * ya no sabe como volver. En el menu cada idioma esta escrito en el suyo,
 * asi la persona reconoce el que busca sin entender el resto de la
 * pantalla. El boton muestra en cual esta, por lo mismo.
 */
export default function SelectorIdioma() {
  const { i18n } = useTranslation()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)

  useEffect(() => {
    if (!abierto) return

    const tocarFuera = (evento) => {
      if (!caja.current?.contains(evento.target)) setAbierto(false)
    }
    const teclaEscape = (evento) => {
      if (evento.key === 'Escape') setAbierto(false)
    }

    document.addEventListener('pointerdown', tocarFuera)
    document.addEventListener('keydown', teclaEscape)

    return () => {
      document.removeEventListener('pointerdown', tocarFuera)
      document.removeEventListener('keydown', teclaEscape)
    }
  }, [abierto])

  const actual = IDIOMAS.find((idioma) => idioma.codigo === i18n.resolvedLanguage) ?? IDIOMAS[0]

  function elegir(codigo) {
    i18n.changeLanguage(codigo)
    setAbierto(false)
  }

  return (
    <div className="relative shrink-0" ref={caja}>
      {/* La etiqueta va en los tres idiomas a proposito, no traducida:
          tiene que entenderse sin importar en cual este la pantalla. */}
      <button
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label="Idioma · Language · Ngôn ngữ"
        className="flex min-h-12 items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-2.5 text-base font-semibold text-white transition hover:border-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60 sm:min-h-14 sm:px-3"
        onClick={() => setAbierto((estaba) => !estaba)}
        type="button"
      >
        <LuGlobe aria-hidden="true" className="h-5 w-5 shrink-0" />
        {/* En el celular no cabe junto al nombre del programa: ahi
            queda el globo, y el menu si dice los tres nombres completos. */}
        <span className="hidden sm:inline" lang={actual.codigo}>
          {actual.nombre}
        </span>
        <LuChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {abierto && (
        <ul
          aria-label="Idioma · Language · Ngôn ngữ"
          className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-principal/15 bg-superficie p-1 shadow-lg"
          role="menu"
        >
          {IDIOMAS.map(({ codigo, nombre }) => {
            const activo = codigo === actual.codigo

            return (
              <li key={codigo}>
                <button
                  aria-checked={activo}
                  className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-base transition ${
                    activo ? 'bg-principal/10 font-bold text-principal' : 'font-semibold text-principal hover:bg-principal/5'
                  }`}
                  lang={codigo}
                  onClick={() => elegir(codigo)}
                  role="menuitemradio"
                  type="button"
                >
                  {nombre}
                  {activo && <LuCheck aria-hidden="true" className="h-5 w-5 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
