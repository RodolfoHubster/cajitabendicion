import { useTranslation } from 'react-i18next'
import { FaFacebook, FaPaypal } from 'react-icons/fa6'
import { LuHeart } from 'react-icons/lu'
import { SiGofundme } from 'react-icons/si'
import { ORGANIZACION } from '../datos/organizacion'

const EXTERNO = { rel: 'noopener noreferrer', target: '_blank' }

/**
 * Invitacion a apoyar, nunca obligatoria.
 *
 * Lo primero que dice, antes de pedir nada, es que la cita no depende de
 * donar. Parte de la comunidad llega con miedo a que le cobren o le pidan
 * algo a cambio; si la invitacion suena a requisito, se pierde la confianza
 * que el resto del sistema intenta ganar.
 */
export default function TarjetaDonar({ titulo }) {
  const { t } = useTranslation()

  const opciones = [
    { href: ORGANIZACION.apoyo.paypal, texto: t('donar.paypal'), Icono: FaPaypal, principal: true },
    { href: ORGANIZACION.apoyo.gofundme, texto: t('donar.gofundme'), Icono: SiGofundme },
    { href: ORGANIZACION.apoyo.suscripcionFacebook, texto: t('donar.suscribirse'), Icono: FaFacebook },
  ].filter((opcion) => opcion.href)

  return (
    <section className="rounded-2xl border border-accion/40 bg-accion/10 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-accion shadow-sm">
          <LuHeart aria-hidden="true" className="h-6 w-6" />
        </span>
        <div>
          <h2 className="font-titulo text-xl font-bold text-principal">{titulo ?? t('donar.titulo')}</h2>
          <p className="mt-1 text-base font-semibold text-principal">{t('donar.aclaracion')}</p>
          <p className="mt-1 text-base text-principal/80">{t('donar.texto')}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {opciones.map(({ href, texto, Icono, principal }) => (
          <a
            className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 text-center text-base font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-principal/30 ${
              principal
                ? 'bg-principal text-white shadow-sm hover:brightness-110'
                : 'border border-principal/30 bg-white text-principal hover:border-principal'
            }`}
            href={href}
            key={href}
            {...EXTERNO}
          >
            <Icono aria-hidden="true" className="h-5 w-5 shrink-0" />
            {texto}
          </a>
        ))}
      </div>
    </section>
  )
}
