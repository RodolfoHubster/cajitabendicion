import { useTranslation } from 'react-i18next'
import Campo from '../../componentes/Campo'
import Tarjeta from '../../componentes/Tarjeta'

export default function Login() {
  const { t } = useTranslation()

  return (
    <Tarjeta>
      <h1 className="mb-4 text-2xl font-bold">{t('pages.adminLogin')}</h1>
      <div className="space-y-3">
        <Campo etiqueta="Correo" id="correo" type="email" placeholder="" />
        <Campo etiqueta="Contraseña" id="contrasena" type="password" placeholder="" />
      </div>
      {/* TODO: autenticar personal administrativo */}
    </Tarjeta>
  )
}
