import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'
import { IDIOMAS, RESPALDO } from './idiomas'
import vi from './vi.json'

//  La lista vive en idiomas.js: la usan tambien los datos (avisos, fechas)
//  sin arrancar i18next.
export { IDIOMAS }

//  Los siete idiomas nuevos no van dentro de la pagina: cada uno se baja
//  (unos 11 KB) solo cuando alguien lo escoge. Asi la pagina no pesa mas
//  para todos los demas, que casi siempre entran con datos del celular.
//  Mientras llega, la pantalla espera en vez de mostrar otro idioma.
const APARTE = {
  zh: () => import('./zh.json'),
  tl: () => import('./tl.json'),
  ko: () => import('./ko.json'),
  ht: () => import('./ht.json'),
  ru: () => import('./ru.json'),
  so: () => import('./so.json'),
  fr: () => import('./fr.json'),
}

const idiomasAparte = {
  type: 'backend',
  read(idioma, _espacio, listo) {
    const cargar = APARTE[idioma]

    if (!cargar) {
      listo(null, {})
      return
    }

    //  Si no se pudo bajar (sin senal), se queda en ingles (RESPALDO).
    cargar().then(
      (modulo) => listo(null, modulo.default),
      (error) => listo(error, null),
    )
  },
}

i18n
  .use(idiomasAparte)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      en: { translation: en },
      vi: { translation: vi },
    },
    //  Los de arriba ya vienen; los de APARTE, con idiomasAparte.
    partialBundledLanguages: true,
    // Si falta un texto, los idiomas nuevos lo muestran en ingles (ver
    // RESPALDO en idiomas.js).
    fallbackLng: RESPALDO,
    supportedLngs: IDIOMAS.map((idioma) => idioma.codigo),
    // Un telefono en 'vi-VN' o 'es-MX' carga 'vi' o 'es'.
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      // Los telefonos en filipino dicen 'fil-PH'; los textos estan como 'tl'.
      convertDetectedLanguage: (idioma) => idioma.replace(/^fil(?=-|$)/i, 'tl'),
    },
  })

// El atributo lang del documento sigue al idioma elegido. Asi los lectores
// de pantalla pronuncian bien y el navegador escoge una fuente con los
// acentos del vietnamita, o con letras chinas, coreanas o cirilicas.
function actualizarLang(idioma) {
  document.documentElement.lang = idioma?.split('-')[0] ?? 'es'
}

actualizarLang(i18n.resolvedLanguage)
i18n.on('languageChanged', actualizarLang)

export default i18n
