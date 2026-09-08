import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import Boton from '../../componentes/Boton'
import Tarjeta from '../../componentes/Tarjeta'

export default function Inicio() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('publico.tituloInicio')}</h1>
      <p className="mt-2 text-slate-700">{t('publico.subtituloInicio')}</p>
      <div className="mt-4">
        <Link to="/calendario">
          <Boton>{t('acciones.continuar')}</Boton>
        </Link>
      </div>
    </Tarjeta>
  )
}
