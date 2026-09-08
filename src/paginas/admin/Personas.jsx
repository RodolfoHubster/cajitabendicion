import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'

export default function Personas() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="mb-2 text-2xl font-bold">{t('pages.adminPersonas')}</h1>
      <p className="text-sm">{t('common.todo')}</p>
      {/* TODO: buscar y editar registros de personas */}
    </Tarjeta>
  )
}
