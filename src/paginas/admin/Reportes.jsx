import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'

export default function Reportes() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('admin.reportes')}</h1>
      <p className="mt-2 text-slate-700">TODO: mostrar métricas y reportes del sistema.</p>
    </Tarjeta>
  )
}
