import { useTranslation } from 'react-i18next'
import Campo from '../../componentes/Campo'
import Tarjeta from '../../componentes/Tarjeta'

export default function Registro() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="mb-4 text-2xl font-bold">{t('pages.registro')}</h1>
      <div className="space-y-3">
        <Campo etiqueta="Nombre" id="nombre" placeholder="" />
        <Campo etiqueta="Teléfono" id="telefono" placeholder="" />
      </div>
      {/* TODO: guardar datos de la persona */}
    </Tarjeta>
  )
}
