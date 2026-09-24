import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck } from 'react-icons/lu'
import { Cargando, Hueso } from './Esqueleto'
import { avisosPublicos, textoDeAviso } from '../datos/avisos'

/**
 * Las reglas de una seccion, tal como el pastor las dejo en el panel.
 *
 * Si la base todavia no tiene la tabla, o no responde, se muestran las de
 * respaldo que vienen en `respaldo`. Esta lista es de lo primero que ve la
 * gente: preferible una version vieja que un hueco.
 */
export default function ListaAvisos({ seccion, respaldo = [] }) {
  const { t, i18n } = useTranslation()
  const [avisos, setAvisos] = useState(null)

  useEffect(() => {
    let vigente = true

    avisosPublicos(seccion)
      .then((lista) => {
        if (vigente) setAvisos(lista)
      })
      .catch(() => {
        if (vigente) setAvisos([])
      })

    return () => {
      vigente = false
    }
  }, [seccion])

  //  Mientras carga, la forma de la lista: si no se dibuja nada, la lista
  //  aparece de golpe y empuja todo lo de abajo.
  if (avisos === null) {
    return (
      <Cargando className="space-y-3" texto={t('avisos.cargando')}>
        {['w-11/12', 'w-4/5', 'w-2/3'].map((ancho) => (
          <div className="flex items-center gap-3" key={ancho}>
            <Hueso className="size-5 shrink-0 rounded-full" />
            <Hueso className={`h-4 ${ancho}`} />
          </div>
        ))}
      </Cargando>
    )
  }

  const textos = avisos.length > 0 ? avisos.map((aviso) => textoDeAviso(aviso, i18n.language)) : respaldo

  if (textos.length === 0) return null

  return (
    <ul className="space-y-2">
      {textos.map((texto) => (
        <li className="flex items-start gap-3 text-base" key={texto}>
          <LuCheck aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-puede-pasar" />
          <span>{texto}</span>
        </li>
      ))}
    </ul>
  )
}
