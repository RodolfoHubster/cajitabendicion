import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'
import vi from './vi.json'

/**
 * Idiomas de la interfaz.
 *
 * El nombre va escrito en su propio idioma: quien quedo atrapado en uno
 * que no entiende tiene que poder reconocer el suyo en el selector.
 *
 * `enDesarrollo` muestra un aviso de que la traduccion puede tener errores.
 * Quitarlo solo cuando un hablante nativo la haya revisado.
 */
export const IDIOMAS = [
  { codigo: 'es', nombre: 'Español' },
  { codigo: 'en', nombre: 'English' },
  { codigo: 'vi', nombre: 'Tiếng Việt', enDesarrollo: true },
]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      vi: { translation: vi },
    },
    // Si falta un texto en vietnamita se muestra en ingles: para la
    // comunidad vietnamita de San Diego suele ser mas legible que el espanol.
    fallbackLng: { vi: ['en'], default: ['es'] },
    supportedLngs: IDIOMAS.map((idioma) => idioma.codigo),
    // Un telefono en 'vi-VN' o 'es-MX' carga 'vi' o 'es'.
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  })

// El atributo lang del documento sigue al idioma elegido. Asi los lectores
// de pantalla pronuncian bien y el navegador escoge una fuente con los
// acentos del vietnamita.
function actualizarLang(idioma) {
  document.documentElement.lang = idioma?.split('-')[0] ?? 'es'
}

actualizarLang(i18n.resolvedLanguage)
i18n.on('languageChanged', actualizarLang)

export default i18n
