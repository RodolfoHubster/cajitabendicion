import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuCircleHelp } from 'react-icons/lu'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import { avisosPublicos, textoDeAviso, tituloDeAviso } from '../../datos/avisos'
import { ORGANIZACION } from '../../datos/organizacion'

/**
 * Preguntas frecuentes.
 *
 * Las escribe el pastor desde el panel. Van en un acordeon nativo
 * (<details>) y no en uno hecho a mano: asi funcionan con el buscador del
 * navegador, con el lector de pantalla y aunque falle el JavaScript.
 */
export default function Preguntas() {
  const { t, i18n } = useTranslation()
  const [preguntas, setPreguntas] = useState(null)

  useEffect(() => {
    let vigente = true

    avisosPublicos('preguntas')
      .then((lista) => {
        if (vigente) setPreguntas(lista)
      })
      .catch(() => {
        if (vigente) setPreguntas([])
      })

    return () => {
      vigente = false
    }
  }, [])

  return (
    <Tarjeta>
      <EnlaceVolver a="/">{t('navegacion.inicio')}</EnlaceVolver>

      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <LuCircleHelp aria-hidden="true" className="h-6 w-6 text-accion" />
        {t('preguntas.titulo')}
      </h1>
      <p className="mb-4 text-base text-principal/70">{t('preguntas.ayuda')}</p>

      {preguntas === null && <p className="text-base">{t('preguntas.cargando')}</p>}

      {preguntas !== null && preguntas.length === 0 && (
        <p className="text-base">{t('preguntas.sinPreguntas')}</p>
      )}

      {preguntas !== null && preguntas.length > 0 && (
        <ul className="divide-y divide-principal/10 border-y border-principal/10">
          {preguntas.map((pregunta) => (
            <li key={pregunta.id}>
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-base font-semibold text-principal">
                  {tituloDeAviso(pregunta, i18n.language)}
                  <LuChevronDown
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 text-principal/60 transition group-open:rotate-180"
                  />
                </summary>
                <p className="pb-4 text-base text-principal/80">{textoDeAviso(pregunta, i18n.language)}</p>
              </details>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 rounded-xl bg-principal/5 p-3 text-base text-principal/80">
        {t('preguntas.masDudas', { telefono: ORGANIZACION.telefono })}
      </p>
    </Tarjeta>
  )
}
