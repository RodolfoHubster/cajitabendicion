import { useTranslation } from 'react-i18next'
import { LuMail, LuMessageCircle, LuTriangleAlert } from 'react-icons/lu'
import Campo from './Campo'
import { separarContacto, telefonoBonito } from '../datos/voluntarios'

/**
 * "Telefono o correo" de un voluntario, en un solo campo (seccion 49).
 * Mientras se escribe, dice que entendio: el telefono (para WhatsApp, con
 * su lada) y el correo, o que no se ve completo. Se pueden poner los dos
 * ("619 555 0101, juana@gmail.com").
 */
export default function CampoContactoVoluntario({ id, valor, alCambiar }) {
  const { t } = useTranslation()
  const separado = separarContacto(valor)
  const correoBien = separado.correo && separado.error !== 'CORREO_INVALIDO'

  return (
    <div className="space-y-2">
      <Campo
        autoComplete="off"
        etiqueta={t('voluntarios.registrar.contacto')}
        id={id}
        maxLength={160}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={t('voluntarios.registrar.contactoEjemplo')}
        value={valor}
      />
      <div aria-live="polite" className="flex flex-wrap gap-2">
        {separado.telefono && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-puede-pasar/15 px-3 py-1 text-base font-semibold text-puede-pasar">
            <LuMessageCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t('voluntarios.contacto.whatsapp', { telefono: telefonoBonito(separado.telefono) })}
            {separado.pais && (
              <span className="font-normal">
                {t(`voluntarios.contacto.pais.${separado.pais}`, { defaultValue: '' })}
              </span>
            )}
          </span>
        )}
        {correoBien && (
          <span className="inline-flex min-w-0 items-center gap-1.5 break-all rounded-full bg-principal/10 px-3 py-1 text-base font-semibold text-principal">
            <LuMail aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t('voluntarios.contacto.correo', { correo: separado.correo })}
          </span>
        )}
        {separado.error && (
          <span className="inline-flex items-center gap-1.5 text-base font-semibold text-ya-recibio">
            <LuTriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            {t(`voluntarios.errores.${separado.error}`)}
          </span>
        )}
      </div>
      {!String(valor ?? '').trim() && <p className="text-base text-principal/70">{t('voluntarios.registrar.contactoAyuda')}</p>}
    </div>
  )
}
