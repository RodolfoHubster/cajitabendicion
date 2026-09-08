import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'

export default function Personas() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('admin.personas')}</h1>
      <p className="mt-2 text-slate-700">TODO: consultar historial de personas atendidas.</p>
    </Tarjeta>
  )
}
