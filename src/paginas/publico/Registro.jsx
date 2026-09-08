import { useTranslation } from 'react-i18next'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Tarjeta from '../../componentes/Tarjeta'

export default function Registro() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('publico.tituloRegistro')}</h1>
      <form className="mt-4 space-y-3">
        <Campo etiqueta={t('placeholders.nombre')} placeholder={t('placeholders.nombre')} />
        <Campo etiqueta={t('placeholders.telefono')} placeholder={t('placeholders.telefono')} />
        <Boton>{t('acciones.guardar')}</Boton>
      </form>
      <p className="mt-2 text-slate-700">TODO: guardar datos y generar cita.</p>
    </Tarjeta>
  )
}
