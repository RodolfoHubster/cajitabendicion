import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RETRASO_MS } from '../lib/supabase'

/**
 * Franja amarilla y negra arriba de todo cuando la app esta conectada a la
 * BASE DE PRUEBAS (npm run dev:pruebas, con VITE_ENTORNO=pruebas en
 * .env.pruebas).
 *
 * Existe para que nunca se confundan las dos: registrar, escanear o anotar
 * "sin cita" en la base real cuenta en los reportes al banco de alimentos.
 * Con la base real, esto no se dibuja.
 */
export const EN_PRUEBAS = import.meta.env.VITE_ENTORNO === 'pruebas'

export default function AvisoPruebas() {
  const { t } = useTranslation()
  const franja = useRef(null)

  //  Su alto real, para que el encabezado se pegue justo debajo en vez de
  //  quedar tapado. Se mide: con letra grande ocupa dos renglones.
  useEffect(() => {
    const elemento = franja.current
    if (!elemento || typeof ResizeObserver === 'undefined') return

    const raiz = document.documentElement
    const observador = new ResizeObserver(() => {
      raiz.style.setProperty('--alto-aviso-pruebas', `${elemento.offsetHeight}px`)
    })
    observador.observe(elemento)

    return () => {
      observador.disconnect()
      raiz.style.removeProperty('--alto-aviso-pruebas')
    }
  }, [])

  //  Tambien en la pestana del navegador: se ve aunque la pagina este abajo.
  useEffect(() => {
    if (!EN_PRUEBAS || document.title.startsWith('[PRUEBAS]')) return
    document.title = `[PRUEBAS] ${document.title}`
  }, [])

  if (!EN_PRUEBAS) return null

  return (
    <div
      className="sticky top-0 z-50 bg-[repeating-linear-gradient(45deg,#FACC15_0,#FACC15_14px,#111827_14px,#111827_28px)] px-3 py-1.5 text-center"
      ref={franja}
      role="note"
    >
      <span className="inline-block rounded-md bg-[#FACC15] px-3 py-0.5 text-base font-black uppercase tracking-wide text-[#111827]">
        {t('entornoPruebas.aviso')}
        {RETRASO_MS > 0 && ` · ${t('entornoPruebas.lento', { segundos: RETRASO_MS / 1000 })}`}
      </span>
    </div>
  )
}
