/*
 * Cajita de Bendicion: el video en la pagina de la iglesia
 * (casadealabanzasd.com, hecha en GoDaddy). 27 de octubre de 2026.
 *
 * En GoDaddy, una seccion "HTML" con:
 *
 *   <div id="cajita-de-bendicion"></div>
 *   <script src="https://citas.casadealabanzasd.com/cajita-video.js"></script>
 *
 * - En la seccion: una franja delgada, "¿Que es Cajita de Bendicion? Mira
 *   el video".
 * - En la esquina inferior derecha de la pagina, a los pocos segundos:
 *     * Con el video del pastor (public/medios/entrega.mp4: la entrega, la
 *       gente recibiendo): se reproduce solo, chico y sin sonido. Al tocarlo
 *       crece en la misma esquina, con sonido, y trae "Mas informacion": la
 *       presentacion animada (/video), que termina en "Haz tu cita".
 *     * Sin ese video: una miniatura que, al tocarla, abre la presentacion.
 *   Nunca a pantalla completa. "–" la hace chica otra vez y la X la quita;
 *   quien la quita no la vuelve a ver sola mientras siga en la pagina (la
 *   franja la sigue abriendo).
 * - Para poner o cambiar el video del pastor basta con publicar
 *   public/medios/entrega.mp4 (y su portada, entrega.jpg). En GoDaddy no se
 *   toca nada.
 *
 * GoDaddy pone la seccion "HTML" dentro de un recuadro (iframe), pero con
 * permiso para tocar la pagina (allow-same-origin). Por eso este mismo
 * archivo se carga una vez en la pagina principal: ahi vive la ventanita, en
 * la esquina de toda la pagina. Si un dia GoDaddy quita ese permiso, la
 * franja abre la presentacion en otra pestana.
 *
 * Sin dependencias, sin cookies y sin rastreo. Los textos, en el idioma del
 * telefono: espanol, ingles o vietnamita (espanol si es otro).
 */
;(function () {
  'use strict'

  var ORIGEN = 'https://citas.casadealabanzasd.com'
  try {
    if (document.currentScript && document.currentScript.src) ORIGEN = new URL(document.currentScript.src).origin
  } catch {
    /* se queda el de siempre */
  }

  var TEXTOS = {
    es: {
      titulo: 'Cajita de Bendición',
      pregunta: '¿Qué es Cajita de Bendición?',
      ver: 'Mira el video',
      tocar: 'Toca para ver',
      abrir: 'Ver el video de Cajita de Bendición',
      mas: 'Más información',
      volver: 'Volver al video',
      chiquito: 'Hacer chiquito el video',
      cerrar: 'Cerrar el video',
    },
    en: {
      titulo: 'Cajita de Bendición',
      pregunta: 'What is Cajita de Bendición?',
      ver: 'Watch the video',
      tocar: 'Tap to watch',
      abrir: 'Watch the Cajita de Bendición video',
      mas: 'More information',
      volver: 'Back to the video',
      chiquito: 'Make the video small',
      cerrar: 'Close the video',
    },
    vi: {
      titulo: 'Cajita de Bendición',
      pregunta: 'Cajita de Bendición là gì?',
      ver: 'Xem video',
      tocar: 'Chạm để xem',
      abrir: 'Xem video Cajita de Bendición',
      mas: 'Thêm thông tin',
      volver: 'Quay lại video',
      chiquito: 'Thu nhỏ video',
      cerrar: 'Đóng video',
    },
  }
  var preferido = ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').slice(0, 2).toLowerCase()
  var idioma = TEXTOS[preferido] ? preferido : 'es'
  var T = TEXTOS[idioma]
  var VIDEO = ORIGEN + '/video?lng=' + idioma
  var ENTREGA = ORIGEN + '/medios/entrega.mp4'
  var PORTADA_ENTREGA = ORIGEN + '/medios/entrega.jpg'
  var LOGO = ORIGEN + '/logos/cajita-bendicion.jpg'
  var TRIANGULO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>'
  var LETRA = 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'

  //  Quien pidio menos movimiento, o ahorrar datos: el video no arranca solo.
  var sinArrancar = (function () {
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(navigator.connection && navigator.connection.saveData)
    } catch {
      return false
    }
  })()

  function estilos(doc, id, css) {
    if (doc.getElementById(id)) return
    var e = doc.createElement('style')
    e.id = id
    e.textContent = css
    doc.head.appendChild(e)
  }

  //  La pagina principal, si se deja tocar (la de GoDaddy si).
  function principal() {
    try {
      if (window.top !== window.self && window.top.document && window.top.document.body) return window.top
    } catch {
      /* sin permiso */
    }
    return null
  }

  var enRecuadro = window.top !== window.self
  var arriba = enRecuadro ? principal() : window

  // =================== La esquina (solo en la pagina principal) ===================
  function montarEsquina() {
    if (window.__cajitaVideo) return
    var D = document
    //  'oculto', 'mini' (sin video del pastor), 'flotante', 'video' o 'info'.
    var vista = 'oculto'
    var video = null
    var marco = null

    estilos(
      D,
      'cdb-estilos-esquina',
      '.cdb-esquina,.cdb-esquina *{box-sizing:border-box}' +
        '.cdb-esquina{position:fixed;right:16px;bottom:16px;z-index:2147483000;' + LETRA + '-webkit-tap-highlight-color:transparent}' +
        '.cdb-oculto{display:none!important}' +
        '.cdb-x{position:absolute;top:6px;right:6px;z-index:3;display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0;padding:0;border:0;border-radius:50%;cursor:pointer;background:rgba(0,0,0,.45);color:#fff;font-size:22px;line-height:1}' +
        //  La miniatura (sin video del pastor).
        '.cdb-mini{position:relative;width:150px;border-radius:20px;overflow:hidden;box-shadow:0 12px 32px rgba(9,20,40,.35);' +
        'background:radial-gradient(circle at 85% 0%,rgba(125,211,252,.35),transparent 55%),#1B3A6B;border-top:5px solid #F5A03C}' +
        '.cdb-mini-ver{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;margin:0;padding:16px 10px 14px;border:0;background:none;color:#fff;cursor:pointer;text-align:center}' +
        '.cdb-mini-logo{position:relative;width:76px;height:76px}' +
        '.cdb-mini-logo img{width:76px;height:76px;border-radius:50%;background:#fff;padding:4px;object-fit:contain;box-shadow:0 0 0 3px rgba(245,160,60,.9)}' +
        '.cdb-mini-play{position:absolute;right:-8px;bottom:-4px;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#F5A03C;box-shadow:0 4px 10px rgba(0,0,0,.3)}' +
        '.cdb-mini-play svg{width:16px;height:16px;margin-left:2px;fill:#1B3A6B}' +
        '.cdb-mini-titulo{font-size:15px;font-weight:800;line-height:1.2}' +
        '.cdb-mini-texto{font-size:15px;opacity:.9}' +
        //  El video del pastor, chico y sin sonido.
        '.cdb-flotante{position:relative;width:260px;border-radius:18px;overflow:hidden;background:#000;box-shadow:0 12px 32px rgba(9,20,40,.4);border-top:5px solid #F5A03C}' +
        '.cdb-flotante video{display:block;width:100%;max-height:min(46vh,420px);object-fit:cover;background:#000}' +
        '.cdb-tocar{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;gap:2px;margin:0;padding:10px 12px;border:0;cursor:pointer;text-align:left;color:#fff;' +
        'background:linear-gradient(to bottom,transparent 50%,rgba(9,20,40,.88))}' +
        '.cdb-tocar b{font-size:15px;line-height:1.2}' +
        '.cdb-tocar span{display:flex;align-items:center;gap:6px;font-size:15px;opacity:.92}' +
        '.cdb-tocar svg{width:14px;height:14px;fill:#F5A03C}' +
        //  La ventana.
        '.cdb-ventana{display:flex;flex-direction:column;width:360px;height:min(600px,calc(100vh - 32px));border-radius:20px;overflow:hidden;background:#1B3A6B;box-shadow:0 24px 64px rgba(9,20,40,.45);border-top:5px solid #F5A03C}' +
        '.cdb-barra{display:flex;align-items:center;gap:6px;height:48px;padding:0 6px 0 14px;color:#fff;background:#1B3A6B}' +
        '.cdb-barra span{flex:1;font-size:16px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.cdb-boton{display:flex;align-items:center;justify-content:center;width:40px;height:40px;margin:0;padding:0;border:0;border-radius:50%;cursor:pointer;background:rgba(255,255,255,.12);color:#fff;font-size:24px;line-height:1}' +
        '.cdb-boton:hover,.cdb-x:hover{background:rgba(255,255,255,.25)}' +
        '.cdb-cuerpo{flex:1;min-height:0;display:flex;flex-direction:column;background:#000}' +
        '.cdb-cuerpo video{flex:1;min-height:0;width:100%;object-fit:contain;background:#000}' +
        '.cdb-pie{padding:12px;background:#1B3A6B}' +
        '.cdb-mas{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;margin:0;border:0;border-radius:12px;cursor:pointer;background:#F5A03C;color:#1B3A6B;font-size:17px;font-weight:800}' +
        '.cdb-mas:hover{filter:brightness(.95)}' +
        '.cdb-presentacion{flex:1;display:block;width:100%;border:0;background:#1B3A6B}' +
        '.cdb-esquina button:focus-visible{outline:3px solid #F5A03C;outline-offset:2px}' +
        '@media (max-width:520px){.cdb-esquina{right:12px;bottom:12px}.cdb-ventana{width:calc(100vw - 24px);height:min(72vh,620px)}' +
        '.cdb-mini{width:128px}.cdb-mini-ver{gap:6px;padding:12px 8px 10px}.cdb-mini-logo,.cdb-mini-logo img{width:60px;height:60px}' +
        '.cdb-mini-play{width:28px;height:28px}.cdb-mini-play svg{width:13px;height:13px}' +
        '.cdb-flotante{width:150px}.cdb-flotante video{max-height:34vh}}' +
        '@media (prefers-reduced-motion:no-preference){.cdb-entra{animation:cdb-entra .35s cubic-bezier(.22,1,.36,1) both;transform-origin:bottom right}}' +
        '@keyframes cdb-entra{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}',
    )

    var esquina = D.createElement('div')
    esquina.className = 'cdb-esquina'

    //  La miniatura, para cuando no hay video del pastor.
    var mini = D.createElement('div')
    mini.className = 'cdb-mini cdb-oculto'
    mini.innerHTML =
      '<button type="button" class="cdb-x"></button>' +
      '<button type="button" class="cdb-mini-ver"><span class="cdb-mini-logo"><img alt="" src="' + LOGO + '">' +
      '<span class="cdb-mini-play">' + TRIANGULO + '</span></span>' +
      '<span class="cdb-mini-titulo"></span><span class="cdb-mini-texto"></span></button>'
    mini.querySelector('.cdb-x').setAttribute('aria-label', T.cerrar)
    mini.querySelector('.cdb-x').textContent = '×'
    mini.querySelector('.cdb-mini-ver').setAttribute('aria-label', T.abrir)
    mini.querySelector('.cdb-mini-titulo').textContent = T.titulo
    mini.querySelector('.cdb-mini-texto').textContent = '▶ ' + T.ver

    //  El video del pastor, chico.
    var flotante = D.createElement('div')
    flotante.className = 'cdb-flotante cdb-oculto'
    flotante.innerHTML =
      '<button type="button" class="cdb-x"></button>' +
      '<button type="button" class="cdb-tocar"><b></b><span>' + TRIANGULO + '<i></i></span></button>'
    flotante.querySelector('.cdb-x').setAttribute('aria-label', T.cerrar)
    flotante.querySelector('.cdb-x').textContent = '×'
    flotante.querySelector('.cdb-tocar').setAttribute('aria-label', T.abrir)
    flotante.querySelector('.cdb-tocar b').textContent = T.titulo
    flotante.querySelector('.cdb-tocar i').textContent = T.tocar
    flotante.querySelector('.cdb-tocar i').style.fontStyle = 'normal'

    //  La ventana grande (en la esquina).
    var ventana = D.createElement('div')
    ventana.className = 'cdb-ventana cdb-oculto'
    ventana.setAttribute('role', 'dialog')
    ventana.setAttribute('aria-label', T.titulo)
    ventana.innerHTML =
      '<div class="cdb-barra"><button type="button" class="cdb-boton cdb-volver cdb-oculto">‹</button><span></span>' +
      '<button type="button" class="cdb-boton cdb-chico">–</button>' +
      '<button type="button" class="cdb-boton cdb-cerrar">×</button></div>' +
      '<div class="cdb-cuerpo cdb-con-video cdb-oculto"><div class="cdb-pie"><button type="button" class="cdb-mas"></button></div></div>'
    ventana.querySelector('.cdb-barra span').textContent = T.titulo
    ventana.querySelector('.cdb-volver').setAttribute('aria-label', T.volver)
    ventana.querySelector('.cdb-chico').setAttribute('aria-label', T.chiquito)
    ventana.querySelector('.cdb-cerrar').setAttribute('aria-label', T.cerrar)
    ventana.querySelector('.cdb-mas').textContent = T.mas
    var conVideo = ventana.querySelector('.cdb-con-video')

    esquina.appendChild(mini)
    esquina.appendChild(flotante)
    esquina.appendChild(ventana)
    D.body.appendChild(esquina)

    function mostrar(el) {
      el.classList.remove('cdb-oculto')
      el.classList.remove('cdb-entra')
      void el.offsetWidth
      el.classList.add('cdb-entra')
    }

    function presentacion() {
      if (!marco) {
        marco = D.createElement('iframe')
        marco.className = 'cdb-presentacion'
        marco.src = VIDEO + '&insertado=1&compacto=1'
        marco.title = T.titulo
        ventana.appendChild(marco)
      }
      return marco
    }

    function reproducir(conSonido) {
      if (!video) return
      video.muted = !conSonido
      var p = video.play()
      if (p && p.catch) p.catch(function () {})
    }

    //  Cambia de vista: quien se ve y quien no.
    function ir(nueva) {
      vista = nueva
      mini.classList.add('cdb-oculto')
      flotante.classList.add('cdb-oculto')
      ventana.classList.add('cdb-oculto')
      if (nueva === 'mini') mostrar(mini)
      if (nueva === 'flotante') {
        flotante.insertBefore(video, flotante.firstChild)
        video.controls = false
        mostrar(flotante)
        if (sinArrancar) video.pause()
        else reproducir(false)
      }
      if (nueva === 'video') {
        conVideo.insertBefore(video, conVideo.firstChild)
        video.controls = true
        conVideo.classList.remove('cdb-oculto')
        if (marco) marco.classList.add('cdb-oculto')
        ventana.querySelector('.cdb-volver').classList.add('cdb-oculto')
        mostrar(ventana)
        reproducir(true)
        ventana.querySelector('.cdb-mas').focus()
      }
      if (nueva === 'info') {
        if (video) video.pause()
        conVideo.classList.add('cdb-oculto')
        presentacion().classList.remove('cdb-oculto')
        ventana.querySelector('.cdb-volver').classList.toggle('cdb-oculto', !video)
        mostrar(ventana)
        ventana.querySelector('.cdb-chico').focus()
      }
      if (nueva === 'oculto' && video) video.pause()
    }

    function abrir() {
      ir(video ? 'video' : 'info')
    }

    function achicar() {
      if (vista === 'video' || vista === 'info') ir(video ? 'flotante' : 'mini')
    }

    function cerrar() {
      ir('oculto')
      try {
        sessionStorage.setItem('cdb-cerrado', '1')
      } catch {
        /* sin almacen: igual se cierra */
      }
    }

    mini.querySelector('.cdb-mini-ver').addEventListener('click', abrir)
    mini.querySelector('.cdb-x').addEventListener('click', cerrar)
    flotante.querySelector('.cdb-tocar').addEventListener('click', abrir)
    flotante.querySelector('.cdb-x').addEventListener('click', cerrar)
    ventana.querySelector('.cdb-mas').addEventListener('click', function () {
      ir('info')
    })
    ventana.querySelector('.cdb-volver').addEventListener('click', function () {
      ir('video')
    })
    ventana.querySelector('.cdb-chico').addEventListener('click', achicar)
    ventana.querySelector('.cdb-cerrar').addEventListener('click', cerrar)
    D.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') achicar()
    })
    //  Esc dentro de la presentacion: la pagina /video pide que se cierre.
    window.addEventListener('message', function (evento) {
      if (evento.origin === ORIGEN && evento.data && evento.data.cajita === 'cerrar') achicar()
    })

    //  ¿Ya esta el video del pastor? Si no (o no carga), la miniatura de siempre.
    function buscarVideo(listo) {
      var v = D.createElement('video')
      var hecho = false
      function fin(si) {
        if (hecho) return
        hecho = true
        listo(si ? v : null)
      }
      v.muted = true
      v.loop = true
      v.preload = 'metadata'
      v.setAttribute('muted', '')
      v.setAttribute('playsinline', '')
      v.setAttribute('controlsList', 'nofullscreen nodownload noremoteplayback')
      v.setAttribute('disablePictureInPicture', '')
      v.setAttribute('aria-label', T.titulo)
      v.poster = PORTADA_ENTREGA
      v.addEventListener('loadedmetadata', function () {
        fin(v.videoWidth > 0)
      })
      v.addEventListener('error', function () {
        fin(false)
      })
      setTimeout(function () {
        fin(false)
      }, 10000)
      v.src = ENTREGA
    }

    var cerradoAntes = false
    try {
      cerradoAntes = sessionStorage.getItem('cdb-cerrado') === '1'
    } catch {
      cerradoAntes = false
    }

    buscarVideo(function (encontrado) {
      video = encontrado
      //  Sale sola, despues de que la pagina ya se vio.
      if (!cerradoAntes) {
        setTimeout(function () {
          if (vista === 'oculto') ir(video ? 'flotante' : 'mini')
        }, 2500)
      }
    })

    window.__cajitaVideo = { abrir: abrir }
  }

  // =================== La franja (donde esta el div) ===================
  function montarFranja() {
    var lugar = document.getElementById('cajita-de-bendicion')
    if (!lugar || lugar.querySelector('.cdb-franja')) return

    estilos(
      document,
      'cdb-estilos-franja',
      '.cdb-franja{box-sizing:border-box;display:flex;align-items:center;gap:14px;width:100%;max-width:560px;min-height:72px;margin:8px auto;padding:10px 12px 10px 10px;' +
        'border:0;border-radius:999px;cursor:pointer;text-align:left;color:#fff;background:#1B3A6B;box-shadow:0 8px 22px rgba(27,58,107,.25);' + LETRA +
        'transition:transform .2s ease,box-shadow .2s ease;-webkit-tap-highlight-color:transparent}' +
        '.cdb-franja:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(27,58,107,.35)}' +
        '.cdb-franja:focus-visible{outline:3px solid #F5A03C;outline-offset:3px}' +
        '.cdb-franja img{flex:none;width:52px;height:52px;border-radius:50%;background:#fff;padding:3px;object-fit:contain}' +
        '.cdb-franja-textos{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}' +
        '.cdb-franja-textos b{font-size:17px;line-height:1.2}' +
        '.cdb-franja-textos small{font-size:15px;opacity:.88}' +
        '.cdb-franja-play{flex:none;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:#F5A03C}' +
        '.cdb-franja-play svg{width:20px;height:20px;margin-left:3px;fill:#1B3A6B}',
    )

    var franja = document.createElement('button')
    franja.type = 'button'
    franja.className = 'cdb-franja'
    franja.setAttribute('aria-label', T.abrir)
    franja.innerHTML =
      '<img alt="" src="' + LOGO + '"><span class="cdb-franja-textos"><b></b><small></small></span>' +
      '<span class="cdb-franja-play">' + TRIANGULO + '</span>'
    franja.querySelector('b').textContent = T.pregunta
    franja.querySelector('small').textContent = T.ver
    franja.addEventListener('click', function () {
      var api = arriba && arriba.__cajitaVideo
      if (api) {
        api.abrir()
        return
      }
      //  Sin la pagina principal (GoDaddy quito el permiso): en otra pestana.
      var otra = null
      try {
        otra = window.open(VIDEO, '_blank')
        if (otra) otra.opener = null
      } catch {
        otra = null
      }
      if (!otra) window.location.href = VIDEO
    })
    lugar.appendChild(franja)
  }

  // =================== Arranque ===================
  function arrancar() {
    if (!enRecuadro) {
      //  En la pagina principal (cargado desde la seccion, o pegado directo).
      montarEsquina()
    } else if (arriba && !arriba.__cajitaVideoCargando) {
      //  En el recuadro de GoDaddy: que la pagina principal cargue la esquina.
      arriba.__cajitaVideoCargando = true
      var s = arriba.document.createElement('script')
      s.src = ORIGEN + '/cajita-video.js'
      s.defer = true
      arriba.document.head.appendChild(s)
    }
    montarFranja()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar)
  else arrancar()
})()
