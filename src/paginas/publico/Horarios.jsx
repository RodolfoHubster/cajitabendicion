import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import Tarjeta from '../../componentes/Tarjeta'

export default function Horarios() {
  const { t } = useTranslation()
  const { fecha } = useParams()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('publico.tituloHorarios')}</h1>
      <p className="mt-2 text-slate-700">Fecha seleccionada: {fecha}</p>
      <p className="mt-2 text-slate-700">TODO: listar bloques de 15 minutos y disponibilidad.</p>
    </Tarjeta>
  )
}
