import { useTranslation } from 'react-i18next'
import Boton from '../../componentes/Boton'
import Campo from '../../componentes/Campo'
import Tarjeta from '../../componentes/Tarjeta'

export default function Login() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold text-azul-principal">{t('admin.login')}</h1>
      <form className="mt-4 space-y-3">
        <Campo etiqueta="Email" placeholder="admin@ejemplo.com" />
        <Campo etiqueta="Contraseña" placeholder="********" />
        <Boton>{t('acciones.ingresar')}</Boton>
      </form>
      <p className="mt-2 text-slate-700">TODO: autenticar sesión de administrador.</p>
    </Tarjeta>
  )
}
