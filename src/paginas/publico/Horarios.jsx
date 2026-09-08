import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import Tarjeta from '../../componentes/Tarjeta'

export default function Horarios() {
  const { t } = useTranslation()
  const { fecha } = useParams()

  return (
    <Tarjeta>
      <h1 className="mb-2 text-2xl font-bold">{t('pages.horarios')}</h1>
      <p className="mb-2 text-sm">{fecha}</p>
      <p className="text-sm">{t('common.todo')}</p>
      {/* TODO: cargar bloques de 15 minutos */}
    </Tarjeta>
  )
}
