/*
 * Cajita de Bendicion: el video que se abre ENCIMA de la pagina de la
 * iglesia (casadealabanzasd.com, hecha en GoDaddy). 27 de octubre de 2026.
 *
 * Se pega una sola linea en GoDaddy:
 *
 *   <script src="https://citas.casadealabanzasd.com/cajita-video.js" defer></script>
 *
 * - Si en la pagina hay <div id="cajita-de-bendicion"></div>, ahi pone la
 *   portada del video para tocarla. Si no, un boton que flota abajo.
 * - Al tocarlo, el video (la pagina /video) se abre en grande encima de la
 *   pagina, con "Haz tu cita" y una X para cerrarlo. Tambien se cierra
 *   tocando afuera o con Esc.
 * - Si GoDaddy lo deja dentro de un recuadro (su seccion "HTML"), no puede
 *   salirse de el: intenta la pantalla completa y, si no se puede, abre el
 *   video en otra pestana.
 *
 * Sin dependencias, sin cookies y sin rastreo. Los textos, en el idioma del
 * telefono: espanol, ingles o vietnamita (espanol si es otro).
 */
;(function () {
  'use strict'

  //  Pegado dos veces (en la seccion y en la configuracion): una sola vez.
  if (window.__cajitaVideo) return
  window.__cajitaVideo = true

  var ORIGEN = 'https://citas.casadealabanzasd.com'
  try {
    if (document.currentScript && document.currentScript.src) ORIGEN = new URL(document.currentScript.src).origin
  } catch {
    /* se queda el de siempre */
  }

  var TEXTOS = {
    es: {
      titulo: '¿Qué es Cajita de Bendición?',
      subtitulo: 'Despensa gratuita, lunes y jueves.',
      ver: 'Ver el video',
      boton: 'Cajita de Bendición',
      cerrar: 'Cerrar el video',
    },
    en: {
      titulo: 'What is Cajita de Bendición?',
      subtitulo: 'Free groceries, Mondays and Thursdays.',
      ver: 'Watch the video',
      boton: 'Cajita de Bendición',
      cerrar: 'Close the video',
    },
    vi: {
      titulo: 'Cajita de Bendición là gì?',
      subtitulo: 'Thực phẩm miễn phí, thứ Hai và thứ Năm.',
      ver: 'Xem video',
      boton: 'Cajita de Bendición',
      cerrar: 'Đóng video',
    },
  }
  var preferido = ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').slice(0, 2).toLowerCase()
  var idioma = TEXTOS[preferido] ? preferido : 'es'
  var T = TEXTOS[idioma]
  var VIDEO = ORIGEN + '/video?lng=' + idioma
  var LOGO = ORIGEN + '/logos/cajita-bendicion.jpg'

  var enRecuadro = (function () {
    try {
      return window.self !== window.top
    } catch {
      return true
    }
  })()

  // ---------- Estilos (todos con "cdb-", para no chocar con los de GoDaddy) ----------
  var css =
    '.cdb-portada,.cdb-flotante,.cdb-capa{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-tap-highlight-color:transparent}' +
    '.cdb-portada *,.cdb-flotante *,.cdb-capa *{box-sizing:border-box}' +
    '.cdb-portada{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:560px;margin:0 auto;padding:28px 20px 24px;border:0;border-top:6px solid #F5A03C;border-radius:24px;cursor:pointer;color:#fff;text-align:center;' +
    'background:radial-gradient(circle at 85% 10%,rgba(125,211,252,.28),transparent 45%),radial-gradient(circle at 10% 95%,rgba(186,230,253,.18),transparent 50%),#1B3A6B;box-shadow:0 18px 40px rgba(27,58,107,.35);transition:transform .25s ease,box-shadow .25s ease}' +
    '.cdb-portada:hover{transform:translateY(-3px);box-shadow:0 24px 48px rgba(27,58,107,.45)}' +
    '.cdb-portada:focus-visible,.cdb-flotante:focus-visible,.cdb-cerrar:focus-visible{outline:4px solid #F5A03C;outline-offset:3px}' +
    '.cdb-logo{width:120px;height:120px;border-radius:50%;background:#fff;padding:6px;object-fit:contain;box-shadow:0 0 0 4px rgba(245,160,60,.85)}' +
    '.cdb-play{display:flex;align-items:center;justify-content:center;width:76px;height:76px;margin-top:-34px;margin-left:96px;border-radius:50%;background:#F5A03C;box-shadow:0 8px 20px rgba(0,0,0,.3)}' +
    '.cdb-play svg{width:34px;height:34px;margin-left:5px;fill:#1B3A6B}' +
    '.cdb-titulo{margin:4px 0 0;font-size:24px;font-weight:800;line-height:1.2}' +
    '.cdb-subtitulo{margin:0;font-size:17px;opacity:.88}' +
    '.cdb-ver{display:inline-flex;align-items:center;gap:8px;min-height:48px;margin-top:4px;padding:0 22px;border-radius:999px;background:#F5A03C;color:#1B3A6B;font-size:17px;font-weight:800}' +
    '.cdb-flotante{position:fixed;left:16px;bottom:16px;z-index:2147482000;display:flex;align-items:center;gap:10px;min-height:56px;padding:6px 20px 6px 6px;border:0;border-radius:999px;cursor:pointer;background:#F5A03C;color:#1B3A6B;font-size:16px;font-weight:800;box-shadow:0 10px 28px rgba(0,0,0,.3)}' +
    '.cdb-flotante img{width:44px;height:44px;border-radius:50%;background:#fff;padding:2px;object-fit:contain}' +
    '.cdb-flotante .cdb-mini{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#1B3A6B}' +
    '.cdb-flotante .cdb-mini svg{width:10px;height:10px;margin-left:2px;fill:#fff}' +
    '@media (prefers-reduced-motion:no-preference){.cdb-flotante{animation:cdb-latido 2.6s ease-in-out infinite}}' +
    '@keyframes cdb-latido{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}' +
    '.cdb-capa{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(9,20,40,.82)}' +
    '.cdb-caja{position:relative;width:min(440px,100%);height:min(860px,100%);border-radius:24px;overflow:hidden;background:#1B3A6B;box-shadow:0 30px 80px rgba(0,0,0,.5)}' +
    '.cdb-video{display:block;width:100%;height:100%;border:0}' +
    '.cdb-cerrar{position:absolute;top:10px;right:10px;z-index:2;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border:0;border-radius:50%;cursor:pointer;background:rgba(0,0,0,.4);color:#fff;font-size:30px;line-height:1}' +
    '@media (max-width:520px){.cdb-capa{padding:0}.cdb-caja{width:100%;height:100%;border-radius:0}}' +
    '.cdb-capa:fullscreen{padding:0}.cdb-capa:fullscreen .cdb-caja{width:100%;height:100%;border-radius:0}'

  var estilo = document.createElement('style')
  estilo.textContent = css
  document.head.appendChild(estilo)

  var TRIANGULO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>'

  // ---------- Abrir y cerrar ----------
  var capa = null
  var disparador = null
  var overflowAntes = ''

  function cerrar() {
    if (!capa) return
    if (document.fullscreenElement === capa && document.exitFullscreen) document.exitFullscreen().catch(function () {})
    capa.remove()
    capa = null
    document.documentElement.style.overflow = overflowAntes
    if (disparador && disparador.focus) disparador.focus()
  }

  function crearCapa() {
    capa = document.createElement('div')
    capa.className = 'cdb-capa'
    capa.setAttribute('role', 'dialog')
    capa.setAttribute('aria-modal', 'true')
    capa.setAttribute('aria-label', T.titulo)

    var caja = document.createElement('div')
    caja.className = 'cdb-caja'

    var x = document.createElement('button')
    x.type = 'button'
    x.className = 'cdb-cerrar'
    x.setAttribute('aria-label', T.cerrar)
    x.textContent = '×'
    x.addEventListener('click', cerrar)

    var marco = document.createElement('iframe')
    marco.className = 'cdb-video'
    marco.src = VIDEO + '&insertado=1'
    marco.title = T.titulo
    marco.setAttribute('allow', 'fullscreen')

    caja.appendChild(x)
    caja.appendChild(marco)
    capa.appendChild(caja)
    //  Tocar afuera del video lo cierra.
    capa.addEventListener('click', function (evento) {
      if (evento.target === capa) cerrar()
    })
    document.body.appendChild(capa)
    overflowAntes = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    x.focus()
    return capa
  }

  function abrirAparte() {
    var ventana = null
    try {
      //  Sin "noopener" en la llamada: con el, window.open siempre devuelve
      //  null y no se sabria si se abrio. Se corta despues.
      ventana = window.open(VIDEO, '_blank')
      if (ventana) ventana.opener = null
    } catch {
      ventana = null
    }
    //  Si ni otra pestana se deja, se ve en el mismo recuadro.
    if (!ventana) window.location.href = VIDEO
  }

  function abrir(evento) {
    disparador = evento && evento.currentTarget
    if (capa) return
    if (!enRecuadro) {
      crearCapa()
      return
    }
    //  Dentro del recuadro de GoDaddy: en pantalla completa, o en otra pestana.
    var permitido = document.fullscreenEnabled || document.webkitFullscreenEnabled
    if (!permitido) {
      abrirAparte()
      return
    }
    var nueva = crearCapa()
    var pedir = nueva.requestFullscreen || nueva.webkitRequestFullscreen
    try {
      var promesa = pedir.call(nueva)
      if (promesa && promesa.catch) {
        promesa.catch(function () {
          cerrar()
          abrirAparte()
        })
      }
    } catch {
      cerrar()
      abrirAparte()
    }
  }

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') cerrar()
  })
  //  Salir de la pantalla completa (boton de atras) tambien lo cierra.
  document.addEventListener('fullscreenchange', function () {
    if (capa && !document.fullscreenElement && enRecuadro) cerrar()
  })
  //  Esc dentro del video: la pagina /video pide que se cierre.
  window.addEventListener('message', function (evento) {
    if (evento.origin === ORIGEN && evento.data && evento.data.cajita === 'cerrar') cerrar()
  })

  // ---------- La portada, o el boton flotante ----------
  function poner() {
    var lugar = document.getElementById('cajita-de-bendicion')
    var boton = document.createElement('button')
    boton.type = 'button'
    boton.addEventListener('click', abrir)

    if (lugar) {
      boton.className = 'cdb-portada'
      boton.setAttribute('aria-label', T.titulo + ' ' + T.ver)
      boton.innerHTML =
        '<img class="cdb-logo" alt="" src="' + LOGO + '">' +
        '<span class="cdb-play">' + TRIANGULO + '</span>' +
        '<span class="cdb-titulo"></span><span class="cdb-subtitulo"></span>' +
        '<span class="cdb-ver">' + TRIANGULO.replace('<svg', '<svg width="16" height="16" style="fill:#1B3A6B"') + '<span></span></span>'
      boton.querySelector('.cdb-titulo').textContent = T.titulo
      boton.querySelector('.cdb-subtitulo').textContent = T.subtitulo
      boton.querySelector('.cdb-ver span').textContent = T.ver
      lugar.appendChild(boton)
      return
    }

    boton.className = 'cdb-flotante'
    boton.setAttribute('aria-label', T.titulo + ' ' + T.ver)
    boton.innerHTML = '<img alt="" src="' + LOGO + '"><span></span><span class="cdb-mini">' + TRIANGULO + '</span>'
    boton.querySelector('span').textContent = T.boton
    document.body.appendChild(boton)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner)
  else poner()
})()
