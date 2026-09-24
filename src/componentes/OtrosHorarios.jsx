import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { consultarBloquesDeFecha, formatearHora } from '../datos/disponibilidad'

/**
 * Los otros horarios libres del mismo dia, para escoger uno SIN salir del
 * formulario.
 *
 * El caso: la persona tarda en escribir su domicilio, mientras tanto su
 * horario se llena, y al confirmar le sale "ese horario se lleno". Antes
 * tenia que regresar a la lista de horarios y volver a escribir todo;
 * muchos adultos mayores se rendian ahi. Ahora escoge otra hora aqui mismo
 * y lo que escribio se queda.
 */
export default function OtrosHorarios({ fecha, actual, alElegir }) {
  const { t } = useTranslation()
  const [bloques, setBloques] = useState(null)

  useEffect(() => {
    let vigente = true

    consultarBloquesDeFecha(fecha)
      .then((lista) => {
        if (vigente) setBloques(lista)
      })
      .catch(() => {
        if (vigente) setBloques([])
      })

    return () => {
      vigente = false
    }
  }, [fecha, actual])

  if (bloques === null) {
    return <p className="text-base text-principal/70">{t('registro.otrosHorarios.buscando')}</p>
  }

  const libres = bloques.filter((bloque) => bloque.bloque_id !== actual && bloque.libres > 0 && bloque.abierto !== false)

  if (libres.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-base font-semibold">{t('registro.otrosHorarios.ninguno')}</p>
        <Link className="text-base font-semibold text-principal underline underline-offset-4" to="/calendario">
          {t('registro.otrosHorarios.otroDia')}
        </Link>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-2 text-base font-semibold">{t('registro.otrosHorarios.titulo')}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {libres.map((bloque) => (
          <li key={bloque.bloque_id}>
            <button
              className="flex min-h-14 w-full flex-col items-center justify-center rounded-xl border-2 border-principal/20 bg-superficie px-2 py-2 text-center transition hover:border-principal focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accion/40"
              onClick={() => alElegir(bloque)}
              type="button"
            >
              <span className="text-lg font-bold text-principal">{formatearHora(bloque.hora)}</span>
              <span className="text-chica text-puede-pasar">{t('horarios.quedan', { count: bloque.libres })}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-base text-principal/70">{t('registro.otrosHorarios.seQueda')}</p>
    </div>
  )
}
