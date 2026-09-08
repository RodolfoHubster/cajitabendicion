import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Encabezado() {
  const { t, i18n } = useTranslation()

  const cambiarIdioma = () => {
    const siguiente = i18n.language.startsWith('es') ? 'en' : 'es'
    i18n.changeLanguage(siguiente)
  }

  return (
    <header className="sticky top-0 z-10 border-b border-principal/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 p-4">
        <Link className="text-base font-bold text-principal" to="/">
          {t('app.title')}
        </Link>
        <button
          className="min-h-14 rounded-xl border border-principal px-4 font-semibold text-principal"
          onClick={cambiarIdioma}
          type="button"
        >
          {t('actions.switchLanguage')}
        </button>
      </div>
    </header>
  )
}
