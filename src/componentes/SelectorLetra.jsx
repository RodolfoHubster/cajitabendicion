import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TAMANOS_LETRA, aplicarLetra, guardarLetra, leerLetra } from '../datos/letra'

//  Cada boton se dibuja con el tamano que va a poner: se entiende sin leer.
const MUESTRA = { normal: 'text-base', grande: 'text-lg', muy_grande: 'text-xl' }
const ETIQUETA = { normal: 'A', grande: 'A+', muy_grande: 'A++' }

const ESTILOS = {
  // Sobre el azul del pie.
  claro: {
    caja: 'bg-white/10 ring-1 ring-white/15',
    activa: 'bg-accion text-sobre-accion',
    inactiva: 'text-white hover:bg-white/15',
    titulo: 'text-white/80',
  },
  // Sobre el fondo de la pagina, en el pie corto del panel.
  borde: {
    caja: 'bg-superficie ring-1 ring-principal/20',
    activa: 'bg-marca text-white',
    inactiva: 'text-principal hover:bg-principal/10',
    titulo: 'text-principal/70',
  },
}

/** "Tamaño de letra: A · A+ · A++". */
export default function SelectorLetra({ variante = 'claro', className = '' }) {
  const { t } = useTranslation()
  const [tamano, setTamano] = useState(() => leerLetra())
  const estilo = ESTILOS[variante] ?? ESTILOS.claro

  function cambiar(nuevo) {
    aplicarLetra(nuevo)
    guardarLetra(nuevo)
    setTamano(nuevo)
  }

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      <span className={`text-base font-semibold ${estilo.titulo}`} id="titulo-letra">
        {t('letra.titulo')}
      </span>
      <div aria-labelledby="titulo-letra" className={`inline-flex gap-1 rounded-full p-1 ${estilo.caja}`} role="radiogroup">
        {TAMANOS_LETRA.map((opcion) => (
          <button
            aria-checked={opcion === tamano}
            aria-label={t(`letra.${opcion}`)}
            className={`flex min-h-12 min-w-12 items-center justify-center rounded-full px-3 font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60 ${
              MUESTRA[opcion]
            } ${opcion === tamano ? estilo.activa : estilo.inactiva}`}
            key={opcion}
            onClick={() => cambiar(opcion)}
            role="radio"
            title={t(`letra.${opcion}`)}
            type="button"
          >
            {ETIQUETA[opcion]}
          </button>
        ))}
      </div>
    </div>
  )
}
