import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function Encabezado() {
  const { t, i18n } = useTranslation()
  const idiomaActual = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'es'

  const cambiarIdioma = () => {
    const siguiente = idiomaActual === 'es' ? 'en' : 'es'
    i18n.changeLanguage(siguiente)
  }

  return (
    <header className="bg-azul-principal px-4 py-3 text-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <Link to="/" className="text-lg font-bold">
          {t('appNombre')}
        </Link>
        <button
          type="button"
          onClick={cambiarIdioma}
          className="min-h-14 rounded-lg border border-white px-4 text-sm font-semibold"
          aria-label={t('cambiarIdioma')}
        >
          {t('idioma')}: {idiomaActual.toUpperCase()}
        </button>
      </div>
    </header>
  )
}
