import { useTranslation } from 'react-i18next'
import EnConstruccion from '../../componentes/EnConstruccion'

export default function Personas() {
  const { t } = useTranslation()
  return <EnConstruccion titulo={t('pages.adminPersonas')} />
}
