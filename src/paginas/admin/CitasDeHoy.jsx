import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'

export default function CitasDeHoy() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('admin.citasHoy')}</h1>
      <p className="mt-2 text-slate-700">TODO: listar citas del día para voluntarios.</p>
    </Tarjeta>
  )
}
