import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaFacebook } from 'react-icons/fa6'
import { LuX } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import Boton from './Boton'
import Campo from './Campo'
import { guardarCodigoAnticipado, validarCodigoAnticipado } from '../datos/anticipado'
import { formatearFechaHora, segundosHasta } from '../datos/disponibilidad'
import { ORGANIZACION } from '../datos/organizacion'

const AZUL_FACEBOOK =
  'bg-[#1560D4] text-white shadow-sm hover:brightness-110 focus-visible:ring-[#1560D4]/40'

/**
 * Registro con codigo de suscriptor de Facebook.
 *
 * Arriba, el codigo de la publicacion exclusiva. Abajo, para quien todavia
 * no es suscriptor, el enlace directo a la suscripcion en Facebook: es el
 * momento en que la persona ve para que sirve suscribirse.
 */
export default function ModalSuscriptor({ dia, abierta, alCerrar }) {
  const { t, i18n } = useTranslation()
  const navegar = useNavigate()

  const [codigo, setCodigo] = useState('')
  const [validando, setValidando] = useState(false)
  const [rechazado, setRechazado] = useState(false)

  // Escape cierra y la pagina de atras no se desplaza mientras esta abierto.
  useEffect(() => {
    const alTeclear = (evento) => {
      if (evento.key === 'Escape') alCerrar()
    }
    const desplazamiento = document.body.style.overflow

    document.addEventListener('keydown', alTeclear)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = desplazamiento
    }
  }, [alCerrar])

  async function entrar(evento) {
    evento.preventDefault()
    setRechazado(false)
    setValidando(true)

    try {
      if (await validarCodigoAnticipado(dia.fecha, codigo)) {
        guardarCodigoAnticipado(dia.fecha, codigo)
        navegar(`/horarios/${dia.fecha}`)
        return
      }
      setRechazado(true)
    } catch {
      setRechazado(true)
    }

    setValidando(false)
  }

  const conAnticipado = Boolean(dia.abreAnticipadoEn)
  const aunNo = conAnticipado && segundosHasta(dia.abreAnticipadoEn) > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-principal/60 sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        // Tocar el fondo oscuro cierra; tocar dentro del recuadro no.
        if (evento.target === evento.currentTarget) alCerrar()
      }}
    >
      <div
        aria-labelledby="modal-suscriptor-titulo"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 text-principal shadow-xl sm:rounded-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 font-titulo text-xl font-bold" id="modal-suscriptor-titulo">
            <FaFacebook aria-hidden="true" className="h-6 w-6 shrink-0 text-[#1560D4]" />
            {t('modalSuscriptor.titulo')}
          </h2>
          <button
            aria-label={t('modalSuscriptor.cerrar')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition hover:bg-principal/10"
            onClick={alCerrar}
            type="button"
          >
            <LuX aria-hidden="true" className="h-6 w-6" />
          </button>
        </div>

        {abierta ? (
          <div className="mt-3 space-y-3">
            <p className="text-base">{t('modalSuscriptor.yaAbierto')}</p>
            <Boton onClick={() => navegar(`/horarios/${dia.fecha}`)}>{t('modalSuscriptor.irRegistro')}</Boton>
          </div>
        ) : conAnticipado ? (
          <form className="mt-3 space-y-3" noValidate onSubmit={entrar}>
            <p className="text-base text-principal/80">{t('modalSuscriptor.explicacion')}</p>
            <p className="rounded-xl bg-principal/5 p-3 text-base font-semibold">
              {aunNo
                ? t('modalSuscriptor.desde', { cuando: formatearFechaHora(dia.abreAnticipadoEn, i18n.language) })
                : t('modalSuscriptor.ahora')}
            </p>
            <Campo
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              error={rechazado ? t('modalSuscriptor.invalido') : undefined}
              etiqueta={t('modalSuscriptor.codigo')}
              id="codigo-suscriptor"
              onChange={(e) => {
                setCodigo(e.target.value)
                setRechazado(false)
              }}
              value={codigo}
            />
            <button
              className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-bold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${AZUL_FACEBOOK}`}
              disabled={validando || !codigo.trim()}
              type="submit"
            >
              {validando ? t('modalSuscriptor.validando') : t('modalSuscriptor.entrar')}
            </button>
          </form>
        ) : (
          <p className="mt-3 rounded-xl bg-principal/5 p-3 text-base">{t('modalSuscriptor.sinAnticipado')}</p>
        )}

        <div className="mt-5 border-t border-principal/10 pt-4">
          <p className="text-base font-bold">{t('modalSuscriptor.noSuscriptor')}</p>
          <p className="mt-1 text-base text-principal/80">{t('modalSuscriptor.invitacion')}</p>
          <a
            className="mt-3 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#1560D4] bg-white px-4 text-base font-bold text-[#1560D4] transition hover:bg-[#1560D4]/5"
            href={ORGANIZACION.apoyo.suscripcionFacebook}
            rel="noopener noreferrer"
            target="_blank"
          >
            <FaFacebook aria-hidden="true" className="h-5 w-5 shrink-0" />
            {t('modalSuscriptor.suscribirme')}
          </a>
        </div>
      </div>
    </div>
  )
}
