import { useTranslation } from 'react-i18next'
import Tarjeta from '../../componentes/Tarjeta'

export default function Escanear() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('escaneo.titulo')}</h1>
      <p className="mt-2 text-slate-700">TODO: integrar cámara y validar QR de cita.</p>
    </Tarjeta>
  )
}
