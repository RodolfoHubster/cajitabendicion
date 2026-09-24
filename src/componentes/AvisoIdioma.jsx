import { useTranslation } from 'react-i18next'
import { IDIOMAS } from '../i18n/config'
import { useAnchoPagina } from '../rutas/anchoPagina'

/**
 * Aviso para los idiomas cuya traduccion todavia no revisa un hablante
 * nativo. Hoy aplica al vietnamita.
 *
 * Lleva una segunda linea en ingles porque, si la traduccion salio mal,
 * justo el aviso de que puede estar mal seria lo que no se entiende.
 */
export default function AvisoIdioma() {
  const { t, i18n } = useTranslation()
  const ancho = useAnchoPagina()
  const idioma = IDIOMAS.find((i) => i.codigo === i18n.resolvedLanguage)

  if (!idioma?.enDesarrollo) return null

  return (
    <div className="border-b border-accion/40 bg-accion/15" role="status">
      <div className={`mx-auto w-full ${ancho} px-4 py-3`}>
        <p className="text-base font-semibold text-principal">{t('avisoIdioma.titulo')}</p>
        <p className="text-base text-principal/80">{t('avisoIdioma.detalle')}</p>
        <p className="mt-1 text-base text-principal/70" lang="en">
          {t('avisoIdioma.ingles')}
        </p>
      </div>
    </div>
  )
}
