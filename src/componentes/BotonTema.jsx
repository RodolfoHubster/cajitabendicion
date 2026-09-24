import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuMoon, LuSun } from 'react-icons/lu'
import {
  aplicarTema,
  guardarTema,
  leerTemaGuardado,
  sistemaEnOscuro,
  temaContrario,
  temaEfectivo,
} from '../datos/tema'

const ESTILOS = {
  // Sobre el azul del pie.
  claro:
    'bg-white/10 text-white hover:bg-white/20 focus-visible:ring-accion/60',
  // Sobre el fondo de la pagina, en el pie corto del panel.
  borde:
    'border border-principal/25 bg-superficie text-principal hover:border-principal focus-visible:ring-principal/20',
}

/**
 * El boton de modo claro / oscuro.
 *
 * Dice a que modo se cambia ("Modo oscuro" mientras se ve claro), con su
 * icono: una luna o un sol se entienden sin leer.
 */
export default function BotonTema({ variante = 'claro', className = '' }) {
  const { t } = useTranslation()

  // index.html ya lo puso antes de cargar; aqui solo se lee.
  const [tema, setTema] = useState(() => temaEfectivo(leerTemaGuardado(), sistemaEnOscuro()))

  // Mientras la persona no escoja, si cambia su telefono (muchos pasan a
  // oscuro solos al anochecer), la pagina lo sigue.
  useEffect(() => {
    const consulta = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!consulta?.addEventListener) return undefined

    const alCambiar = (evento) => {
      if (leerTemaGuardado()) return
      const nuevo = evento.matches ? 'oscuro' : 'claro'
      aplicarTema(nuevo, { suave: true })
      setTema(nuevo)
    }

    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])

  function cambiar() {
    const nuevo = temaContrario(tema)
    aplicarTema(nuevo, { suave: true })
    guardarTema(nuevo)
    setTema(nuevo)
  }

  const aOscuro = tema === 'claro'
  const Icono = aOscuro ? LuMoon : LuSun

  return (
    <button
      aria-label={aOscuro ? t('tema.cambiarAOscuro') : t('tema.cambiarAClaro')}
      className={`group inline-flex min-h-14 items-center gap-2 rounded-full px-5 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-4 ${ESTILOS[variante] ?? ESTILOS.claro} ${className}`}
      onClick={cambiar}
      type="button"
    >
      <Icono
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-accion transition-transform duration-500 group-hover:rotate-12"
      />
      {aOscuro ? t('tema.aOscuro') : t('tema.aClaro')}
    </button>
  )
}
