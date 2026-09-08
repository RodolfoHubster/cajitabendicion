import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'

export default function HorariosAdmin() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="mb-2 text-2xl font-bold">{t('pages.adminHorarios')}</h1>
      <p className="text-sm">{t('common.todo')}</p>
      {/* TODO: administrar bloques disponibles */}
    </Tarjeta>
  )
}
