/**
 * Datos de la organizacion, en un solo lugar.
 *
 * Cuando cambie un telefono o se abra otra red social, se edita aqui y
 * no hay que buscarlo pantalla por pantalla. Los enlaces van sin los
 * parametros de rastreo que agregan las apps al compartir (_r, _t, stkn).
 *
 * Un enlace vacio ('') NO se muestra: es preferible no poner el icono a
 * mandar a alguien a una pagina que no existe.
 */

const DIRECCION = '4250 El Cajon Blvd, San Diego, CA 92105'
const IGLESIA = 'Iglesia Casa de Alabanza'

export const ORGANIZACION = {
  // Cajita de Bendicion es un ministerio de la iglesia.
  programa: 'Cajita de Bendición',
  lema: 'Box of Blessings',
  iglesia: IGLESIA,

  telefono: '(619) 734-5886',
  telefonoEnlace: 'tel:+16197345886',

  direccion: DIRECCION,
  // Enlaces que abren la app de mapas del telefono. No usan la API de
  // Google Maps: esa necesita llave, facturacion, y carga rastreadores de
  // Google en cada visita, algo que no conviene con esta comunidad.
  mapas: {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${IGLESIA}, ${DIRECCION}`)}`,
    apple: `https://maps.apple.com/?q=${encodeURIComponent(IGLESIA)}&address=${encodeURIComponent(DIRECCION)}`,
  },

  sitioIglesia: 'https://casadealabanzasd.com/',

  redes: {
    facebookDespensa: 'https://www.facebook.com/DispesasCDA',
    facebookIglesia: 'https://www.facebook.com/iglesia.casa.de.alabanza.2025',
    tiktokCajita: 'https://www.tiktok.com/@cajita.de.bendici',
    instagramIglesia: 'https://www.instagram.com/iglesiacasadealabanzaa',
    tiktokIglesia: 'https://www.tiktok.com/@iglesiacasadealabanzaa',
  },

  apoyo: {
    // PayPal.me de la iglesia: enlace fijo, no caduca. NO pegar el enlace de
    // la pagina a la que PayPal manda al donar (lleva un codigo de una sola
    // sesion): caduca y luego PayPal dice que la pagina no existe.
    paypal: 'https://www.paypal.me/IglesiaCDASD',
    // Sin los parametros de rastreo (utm, attribution_id) del enlace
    // compartido: la campana abre igual.
    gofundme: 'https://www.gofundme.com/f/support-iglesia-casa-de-alabanzas-mission',
    suscripcionFacebook:
      'https://www.facebook.com/DispesasCDA/support/?surface=page_top_cta_button&entrypoint_surface=page_top_cta_button',
  },

  // Ver docs/logos.md. Si un archivo no carga, se dibuja el techo naranja.
  logos: {
    // Circular, con fondo blanco. Portada y favicon.
    cajita: '/logos/cajita-bendicion.jpg',
    // Techo con el nombre en letras BLANCAS: solo sobre fondo azul.
    iglesia: '/logos/casa-alabanza.webp',
  },
}
