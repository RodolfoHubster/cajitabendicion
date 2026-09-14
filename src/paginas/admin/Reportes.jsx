import { useTranslation } from 'react-i18next'
import EnConstruccion from '../../componentes/EnConstruccion'

export default function Reportes() {
  const { t } = useTranslation()
  return <EnConstruccion titulo={t('pages.adminReportes')} />
}
