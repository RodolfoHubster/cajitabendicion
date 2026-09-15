import { useTranslation } from 'react-i18next'
import { FaFacebook, FaInstagram, FaPaypal, FaTiktok } from 'react-icons/fa6'
import { LuClock, LuGlobe, LuMapPin, LuPhone } from 'react-icons/lu'
import { SiGofundme } from 'react-icons/si'
import { Link, useLocation } from 'react-router-dom'
import { ORGANIZACION } from '../datos/organizacion'
import { anchoPagina } from '../rutas/anchoPagina'
import { LogoIglesia } from './Logo'

const EXTERNO = { rel: 'noopener noreferrer', target: '_blank' }

export default function Pie() {
  const { t } = useTranslation()
  const { pathname } = useLocation()

  // Dentro del panel el pie completo solo estorba: el voluntario necesita la
  // pantalla para escanear, no los horarios de la iglesia.
  const enPanel = pathname.startsWith('/admin') || pathname.startsWith('/escanear')

  if (enPanel) {
    return (
      <footer className={`mx-auto w-full ${anchoPagina(pathname)} px-4 pb-8 pt-2 text-center`}>
        <Link
          className="inline-flex min-h-14 items-center text-base text-principal/70 underline underline-offset-4 hover:text-principal"
          to="/"
        >
          {t('navegacion.verSitio')}
        </Link>
      </footer>
    )
  }

  const redes = [
    { href: ORGANIZACION.redes.facebookDespensa, etiqueta: t('pie.redes.facebookDespensa'), Icono: FaFacebook },
    { href: ORGANIZACION.redes.facebookIglesia, etiqueta: t('pie.redes.facebookIglesia'), Icono: FaFacebook },
    { href: ORGANIZACION.redes.instagram, etiqueta: 'Instagram', Icono: FaInstagram },
    { href: ORGANIZACION.redes.tiktok, etiqueta: 'TikTok', Icono: FaTiktok },
  ].filter((red) => red.href)

  const apoyos = [
    { href: ORGANIZACION.apoyo.paypal, texto: t('donar.paypal'), Icono: FaPaypal },
    { href: ORGANIZACION.apoyo.gofundme, texto: t('donar.gofundme'), Icono: SiGofundme },
    { href: ORGANIZACION.apoyo.suscripcionFacebook, texto: t('donar.suscribirse'), Icono: FaFacebook },
  ].filter((apoyo) => apoyo.href)

  const enlaceClaro =
    'inline-flex min-h-14 items-center gap-2 rounded-xl bg-white/10 px-4 text-base font-semibold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60'

  return (
    <footer className="mt-10 bg-principal text-white">
      <div className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-10 sm:grid-cols-2">
        <section>
          <div className="flex items-center gap-3">
            <LogoIglesia className="h-16 w-auto shrink-0" />
            <div>
              <p className="text-base text-white/70">{t('pie.bienvenidos')}</p>
              <p className="font-titulo text-xl font-bold leading-tight">{ORGANIZACION.iglesia}</p>
              <p className="text-base text-accion">{t('pie.comunidad')}</p>
            </div>
          </div>

          <ul className="mt-6 space-y-5 text-base">
            <li className="flex gap-3">
              <LuMapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-accion" />
              <div>
                <p>{ORGANIZACION.direccion}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className={enlaceClaro} href={ORGANIZACION.mapas.google} {...EXTERNO}>
                    Google Maps
                  </a>
                  <a className={enlaceClaro} href={ORGANIZACION.mapas.apple} {...EXTERNO}>
                    Apple Maps
                  </a>
                </div>
              </div>
            </li>

            {/* Son los servicios de la iglesia, no la entrega de despensas:
                se rotula para que nadie llegue el domingo por su caja. */}
            <li className="flex gap-3">
              <LuClock aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-accion" />
              <div>
                <p className="font-semibold">{t('pie.servicios')}</p>
                <p className="text-white/85">{t('pie.horarioServicios')}</p>
              </div>
            </li>

            <li className="flex items-center gap-3">
              <LuPhone aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
              <a
                className="inline-flex min-h-14 items-center font-semibold underline-offset-4 hover:underline"
                href={ORGANIZACION.telefonoEnlace}
              >
                {ORGANIZACION.telefono}
              </a>
            </li>

            <li className="flex items-center gap-3">
              <LuGlobe aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
              <a
                className="inline-flex min-h-14 items-center font-semibold underline-offset-4 hover:underline"
                href={ORGANIZACION.sitioIglesia}
                {...EXTERNO}
              >
                {t('pie.sitioIglesia')}
              </a>
            </li>
          </ul>
        </section>

        <section>
          {redes.length > 0 && (
            <>
              <h2 className="font-titulo text-lg font-bold">{t('pie.siguenos')}</h2>
              <ul className="mt-3 flex flex-wrap gap-3">
                {redes.map(({ href, etiqueta, Icono }) => (
                  <li key={href}>
                    <a
                      aria-label={etiqueta}
                      className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition hover:bg-accion hover:text-principal focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/60"
                      href={href}
                      title={etiqueta}
                      {...EXTERNO}
                    >
                      <Icono aria-hidden="true" className="h-6 w-6" />
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2 className="mt-8 font-titulo text-lg font-bold">{t('pie.apoya')}</h2>
          <p className="mt-1 text-base text-white/80">{t('donar.aclaracion')}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {apoyos.map(({ href, texto, Icono }) => (
              <li key={href}>
                <a className={`${enlaceClaro} w-full`} href={href} {...EXTERNO}>
                  <Icono aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
                  {texto}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-1 px-4 py-3 text-base text-white/70 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {ORGANIZACION.iglesia}
          </p>
          <Link
            className="inline-flex min-h-14 items-center underline underline-offset-4 hover:text-white"
            to="/admin/login"
          >
            {t('navegacion.accesoPersonal')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
