import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaEye } from 'react-icons/fa6'
import { Cargando, Hueso } from './Esqueleto'
import { dibujarQR } from '../datos/cita'
import { qrDeCita } from '../datos/panel'

//  Lo borroso es un QR de adorno, el mismo para todos: NO es el de la
//  persona. Quitarle el blur con las herramientas del navegador no ensena
//  nada. El de verdad se le pide a la base hasta que se toca.
let adorno = null

function qrDeAdorno() {
  adorno ??= dibujarQR('cajita-de-bendicion-muestra')
  return adorno
}

/**
 * El cuadro del QR en la ficha de una persona (Ver), solo para el admin.
 *
 * Arranca borroso. Al tocarlo se pide el token a la base, que revisa que
 * sea admin y anota quien lo vio. Abajo dice de qué cita es, porque cada
 * cita tiene su propio QR.
 *
 * cita: { fecha, hora, estado } de citasDePersona(). cuando: la fecha y la
 * hora ya escritas para leer. hoy: 'AAAA-MM-DD' en San Diego.
 */
export default function QrDeCita({ codigo, cita, cuando, hoy, abiertoAlInicio = false }) {
  const { t } = useTranslation()
  //  oculto -> cargando -> listo | error
  const [estado, setEstado] = useState({ tipo: abiertoAlInicio ? 'cargando' : 'oculto' })
  const [adornoListo, setAdornoListo] = useState(null)

  const pedir = estado.tipo === 'cargando'

  useEffect(() => {
    let vivo = true
    qrDeAdorno()
      .then((url) => vivo && setAdornoListo(url))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    if (!pedir) return
    let vivo = true

    qrDeCita({ codigo, fecha: cita.fecha, hora: cita.hora })
      .then(async (datos) => {
        const imagen = await dibujarQR(datos.token)
        if (vivo) setEstado({ tipo: 'listo', ...datos, imagen })
      })
      .catch((e) => {
        if (vivo) setEstado({ tipo: 'error', error: e.message })
      })

    return () => {
      vivo = false
    }
  }, [pedir, codigo, cita.fecha, cita.hora])

  //  Lo que va a pasar si se escanea, para que nadie se confunda al probar.
  const nota =
    estado.tipo === 'listo' && estado.estado === 'entregada'
      ? t('verQr.entregada')
      : cita.fecha < hoy
        ? t('verQr.pasada')
        : cita.fecha > hoy
          ? t('verQr.otroDia')
          : null

  return (
    <section
      aria-label={t('verQr.titulo')}
      className="rounded-2xl border border-principal/15 bg-principal/5 p-3 text-center"
    >
      <p className="text-base font-bold text-principal">{t('verQr.titulo')}</p>
      <p className="mb-3 text-chica text-principal/70">{t('verQr.deLaCita', { cuando })}</p>

      {estado.tipo === 'oculto' && (
        <button
          aria-label={t('verQr.ver', { cuando })}
          className="group relative mx-auto block aspect-square w-full max-w-[14rem] overflow-hidden rounded-xl border-2 border-principal/20 transition hover:border-principal focus-visible:border-principal"
          onClick={() => setEstado({ tipo: 'cargando' })}
          type="button"
        >
          {adornoListo && <img alt="" className="size-full scale-110 blur-md" src={adornoListo} />}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-superficie/40 transition group-hover:bg-superficie/20">
            <FaEye aria-hidden="true" className="text-3xl text-principal" />
            <span className="rounded-lg bg-superficie px-3 py-1 text-base font-bold text-principal shadow-tarjeta">
              {t('verQr.tocar')}
            </span>
          </span>
        </button>
      )}

      {estado.tipo === 'cargando' && (
        <Cargando texto={t('verQr.cargando')}>
          <Hueso className="mx-auto aspect-square w-full max-w-[14rem] rounded-xl" />
        </Cargando>
      )}

      {estado.tipo === 'error' && (
        <div className="space-y-3">
          <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`citas.errores.${estado.error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') })}
          </p>
          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-marca px-4 text-base font-bold text-white transition hover:brightness-110"
            onClick={() => setEstado({ tipo: 'cargando' })}
            type="button"
          >
            {t('verQr.otraVez')}
          </button>
        </div>
      )}

      {estado.tipo === 'listo' && (
        <>
          <img
            alt={t('verQr.imagen', { nombre: estado.nombre, codigo: estado.codigo_corto, cuando })}
            className="mx-auto w-full max-w-[14rem] rounded-xl border border-principal/20"
            src={estado.imagen}
          />
          <p className="mt-2 font-titulo text-lg font-bold text-principal">{estado.codigo_corto}</p>
        </>
      )}

      {nota && estado.tipo !== 'oculto' && (
        <p className="mt-2 rounded-xl bg-accion/15 p-2 text-chica font-semibold text-principal">{nota}</p>
      )}

      {estado.tipo === 'listo' && (
        <div className="mt-3 grid gap-2">
          <a
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-principal/25 bg-superficie px-3 text-base font-bold text-principal transition hover:border-principal"
            href={`/confirmacion/${estado.token}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('verQr.abrir')}
          </a>
          <button
            className="min-h-12 px-3 text-base font-semibold text-principal underline underline-offset-4"
            onClick={() => setEstado({ tipo: 'oculto' })}
            type="button"
          >
            {t('verQr.ocultar')}
          </button>
        </div>
      )}

      <p className="mt-3 text-chica text-principal/70">{t('verQr.aviso')}</p>
    </section>
  )
}
