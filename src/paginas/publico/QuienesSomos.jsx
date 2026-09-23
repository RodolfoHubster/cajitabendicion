import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import { LogoCompleto } from '../../componentes/Logo'
import Tarjeta from '../../componentes/Tarjeta'
import TarjetaDonar from '../../componentes/TarjetaDonar'
import Ubicacion from '../../componentes/Ubicacion'
import { avisosPublicos, textoDeAviso, tituloDeAviso } from '../../datos/avisos'
import { ORGANIZACION } from '../../datos/organizacion'

/**
 * Quienes somos: la iglesia y el ministerio, en corto.
 *
 * El contenido lo edita el pastor desde el panel, cada parrafo con su
 * encabezado. Aqui no se escribe nada de la iglesia a mano: lo que se
 * dice de una organizacion real lo decide ella.
 */
export default function QuienesSomos() {
  const { t, i18n } = useTranslation()
  const [parrafos, setParrafos] = useState(null)

  useEffect(() => {
    let vigente = true

    avisosPublicos('quienes')
      .then((lista) => {
        if (vigente) setParrafos(lista)
      })
      .catch(() => {
        if (vigente) setParrafos([])
      })

    return () => {
      vigente = false
    }
  }, [])

  return (
    <div className="space-y-4">
      <Tarjeta>
        <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>

        <div className="mb-4 flex flex-col items-center gap-3 text-center">
          <LogoCompleto className="h-28 w-28 rounded-full" />
          <h1 className="text-2xl font-bold">{t('quienesSomos.titulo')}</h1>
          <p className="text-base text-principal/70">
            {t('marca.ministerio', { iglesia: ORGANIZACION.iglesia })}
          </p>
        </div>

        {parrafos === null && <p className="text-base">{t('quienesSomos.cargando')}</p>}

        {parrafos !== null && parrafos.length === 0 && (
          <p className="text-base">{t('quienesSomos.sinTexto')}</p>
        )}

        {parrafos !== null &&
          parrafos.map((parrafo) => {
            const titulo = tituloDeAviso(parrafo, i18n.language)

            return (
              <section className="mt-4" key={parrafo.id}>
                {titulo && <h2 className="text-lg font-bold text-principal">{titulo}</h2>}
                <p className="mt-1 text-base text-principal/80">{textoDeAviso(parrafo, i18n.language)}</p>
              </section>
            )
          })}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <a
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/25 bg-white px-4 text-base font-bold text-principal transition hover:border-principal"
            href={ORGANIZACION.sitioIglesia}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('quienesSomos.sitioIglesia')}
          </a>
          <Link
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-principal/25 bg-white px-4 text-base font-bold text-principal transition hover:border-principal"
            to="/preguntas"
          >
            {t('quienesSomos.verPreguntas')}
          </Link>
        </div>
      </Tarjeta>

      <Ubicacion />

      <TarjetaDonar />
    </div>
  )
}
