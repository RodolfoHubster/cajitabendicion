import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import Tarjeta from '../../componentes/Tarjeta'

export default function Confirmacion() {
  const { t } = useTranslation()
  const { id } = useParams()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('publico.tituloConfirmacion')}</h1>
      <p className="mt-2 text-slate-700">ID: {id}</p>
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-600">
        {t('publico.qrPlaceholder')}
      </div>
      <p className="mt-2 text-slate-700">TODO: renderizar QR real de la cita confirmada.</p>
    </Tarjeta>
  )
}
