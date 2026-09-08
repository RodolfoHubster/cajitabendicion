import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'

export default function CitasDeHoy() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="mb-2 text-2xl font-bold">{t('pages.adminCitasHoy')}</h1>
      <p className="text-sm">{t('common.todo')}</p>
      {/* TODO: listar citas confirmadas del día */}
    </Tarjeta>
  )
}
