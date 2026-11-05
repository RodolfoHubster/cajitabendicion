/**
 * Idiomas de la interfaz.
 *
 * Viven aparte de config.js para que los datos (avisos, fechas) y sus
 * pruebas los puedan usar sin arrancar i18next.
 *
 * El nombre va escrito en su propio idioma: quien quedo atrapado en uno
 * que no entiende tiene que poder reconocer el suyo en el selector.
 *
 * `enDesarrollo` muestra un aviso de que la traduccion puede tener errores.
 * Quitarlo solo cuando un hablante nativo la haya revisado.
 *
 * Espanol, ingles y vietnamita llevan todos los textos. Los otros siete
 * (noviembre de 2026) solo traen lo que ve el publico: el panel y el
 * escaner les salen en ingles.
 */
export const IDIOMAS = [
  { codigo: 'es', nombre: 'Español' },
  { codigo: 'en', nombre: 'English' },
  { codigo: 'vi', nombre: 'Tiếng Việt', enDesarrollo: true },
  { codigo: 'zh', nombre: '中文', enDesarrollo: true },
  { codigo: 'tl', nombre: 'Tagalog', enDesarrollo: true },
  { codigo: 'ko', nombre: '한국어', enDesarrollo: true },
  { codigo: 'ht', nombre: 'Kreyòl ayisyen', enDesarrollo: true },
  { codigo: 'ru', nombre: 'Русский', enDesarrollo: true },
  { codigo: 'so', nombre: 'Soomaali', enDesarrollo: true },
  { codigo: 'fr', nombre: 'Français', enDesarrollo: true },
]

/**
 * A donde cae un texto que falta (fallbackLng de i18next). Todos menos el
 * espanol y el ingles caen al ingles: a quien escogio coreano o ruso le
 * sirve mas que el espanol, y en San Diego es lo que mas se lee despues de
 * su idioma. El ingles, y lo que no sea ninguno de estos, al espanol.
 */
export const RESPALDO = {
  ...Object.fromEntries(
    IDIOMAS.filter(({ codigo }) => codigo !== 'es' && codigo !== 'en').map(({ codigo }) => [codigo, ['en']]),
  ),
  default: ['es'],
}

/** 'ko-KR' -> 'ko'. Sin idioma, 'es'. */
export function idiomaCorto(idioma) {
  return String(idioma ?? 'es').split('-')[0].toLowerCase()
}

/**
 * El idioma para las fechas (Intl.DateTimeFormat). Los navegadores no
 * traen el criollo haitiano: sin esto, la fecha saldria en el idioma del
 * telefono. Se le da el frances, que quien lee criollo tambien lee.
 */
export function idiomaDeFechas(idioma) {
  return idiomaCorto(idioma) === 'ht' ? ['ht', 'fr'] : idioma
}
