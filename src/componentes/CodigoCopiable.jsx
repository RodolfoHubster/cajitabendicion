import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCopy } from 'react-icons/lu'

/**
 * El codigo de suscriptores, grande y con boton de copiar, para pegarlo en
 * la publicacion exclusiva de Facebook. Con autoCopiar intenta copiarlo solo
 * en cuanto aparece; si el navegador no lo permite, queda el boton.
 */
export default function CodigoCopiable({ codigo, autoCopiar = false, children }) {
  const { t } = useTranslation()
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!autoCopiar || !codigo) return

    let vigente = true

    Promise.resolve()
      .then(() => navigator.clipboard.writeText(codigo))
      .then(() => {
        if (!vigente) return
        setCopiado(true)
        setTimeout(() => setCopiado(false), 3000)
      })
      .catch(() => {
        // Sin permiso de portapapeles: el boton Copiar sigue ahi.
      })

    return () => {
      vigente = false
    }
  }, [autoCopiar, codigo])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 3000)
    } catch {
      // Sin portapapeles (http, permisos): el codigo sigue a la vista.
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-accion bg-accion/10 p-3">
      <p className="text-base font-semibold text-principal">{t('diasAdmin.codigoPublicacion')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <span className="font-titulo text-3xl font-bold tracking-[0.2em] text-principal">{codigo}</span>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-principal px-4 text-base font-semibold text-white transition hover:brightness-110"
          onClick={copiar}
          type="button"
        >
          <LuCopy aria-hidden="true" className="h-4 w-4" />
          {copiado ? t('diasAdmin.copiado') : t('diasAdmin.copiar')}
        </button>
        {children}
      </div>
    </div>
  )
}
