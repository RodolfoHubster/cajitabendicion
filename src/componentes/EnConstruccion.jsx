import { useTranslation } from 'react-i18next'
import Tarjeta from './Tarjeta'

/**
 * Pantalla del panel que todavia no se programa.
 *
 * Sustituye al "TODO" que se le mostraba al usuario: la seccion existe en
 * la navegacion, pero dice con claridad que aun no esta lista y que usar
 * mientras tanto.
 */
export default function EnConstruccion({ titulo }) {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="mb-2 text-2xl font-bold">{titulo}</h1>
      <p className="text-base">{t('construccion.aviso')}</p>
      <p className="mt-2 text-base text-principal/70">{t('construccion.mientras')}</p>
    </Tarjeta>
  )
}
