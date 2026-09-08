import { useTranslation } from 'react-i18next'
import Boton from '../../componentes/Boton'
import Tarjeta from '../../componentes/Tarjeta'

export default function Inicio() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="mb-2 text-2xl font-bold">{t('pages.inicio')}</h1>
      <p className="mb-4 text-sm">{t('common.comingSoon')}</p>
      <Boton>{t('actions.primary')}</Boton>
      {/* TODO: conectar flujo de reservación */}
    </Tarjeta>
  )
}
