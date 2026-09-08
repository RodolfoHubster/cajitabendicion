import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import Tarjeta from '../../componentes/Tarjeta'

export default function Confirmacion() {
  const { t } = useTranslation()
  const { id } = useParams()

  return (
    <Tarjeta>
      <h1 className="mb-2 text-2xl font-bold">{t('pages.confirmacion')}</h1>
      <p className="mb-2 text-sm">ID: {id}</p>
      <p className="text-sm">{t('common.todo')}</p>
      {/* TODO: generar y mostrar QR */}
    </Tarjeta>
  )
}
