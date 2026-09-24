import { Component } from 'react'
import { ORGANIZACION } from '../datos/organizacion'
import i18n from '../i18n/config'

/**
 * Si algo de una pantalla falla, se ve esto y no una pagina en blanco.
 *
 * Una pantalla en blanco es lo peor que le puede pasar a alguien que no
 * sabe de tecnologia: no sabe si ya se registro, si se cayo el sitio o si
 * fue su telefono. Aqui se le dice que algo salio mal y que hacer.
 *
 * Tiene que ser una clase: React solo atrapa errores de pintado con
 * componentDidCatch. En App.jsx va con key={ruta}: al cambiar de pagina se
 * reinicia sola.
 */
export default class RedDeSeguridad extends Component {
  constructor(props) {
    super(props)
    this.state = { fallo: false }
  }

  static getDerivedStateFromError() {
    return { fallo: true }
  }

  componentDidCatch(error, info) {
    //  Para quien revise la consola; a la persona no se le muestra jerga.
    console.error('Cajita: una pantalla fallo', error, info?.componentStack)
  }

  render() {
    if (!this.state.fallo) return this.props.children

    const t = i18n.t.bind(i18n)

    return (
      <section className="rounded-2xl bg-superficie p-5 shadow-tarjeta ring-1 ring-principal/10" role="alert">
        <h1 className="text-2xl font-bold">{t('redDeSeguridad.titulo')}</h1>
        <p className="mt-2 text-base text-principal/80">{t('redDeSeguridad.texto')}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex min-h-14 items-center justify-center rounded-xl bg-accion px-4 text-base font-bold text-sobre-accion"
            onClick={() => window.location.reload()}
            type="button"
          >
            {t('redDeSeguridad.recargar')}
          </button>
          {/* Un <a> y no un <Link>: si lo que fallo fue el enrutador, un
              enlace normal sigue funcionando. */}
          <a
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/30 bg-superficie px-4 text-base font-bold text-principal"
            href="/"
          >
            {t('redDeSeguridad.inicio')}
          </a>
        </div>
        <p className="mt-4 text-base text-principal/70">{t('redDeSeguridad.ayuda', { telefono: ORGANIZACION.telefono })}</p>
      </section>
    )
  }
}
