import { useTranslation } from 'react-i18next'

/**
 * Indicador de avance del flujo publico: Fecha -> Horario -> Tus datos.
 * Aparece en los mockups 2, 3 y 4.
 *
 * `actual` es 1, 2 o 3.
 */
export default function Pasos({ actual }) {
  const { t } = useTranslation()
  const pasos = [t('pasos.fecha'), t('pasos.horario'), t('pasos.datos')]

  return (
    <ol className="mb-4 flex items-center gap-2" aria-label={t('pasos.etiqueta')}>
      {pasos.map((nombre, indice) => {
        const numero = indice + 1
        const hecho = numero < actual
        const activo = numero === actual

        return (
          <li className="flex flex-1 items-center gap-2" key={nombre}>
            <span
              aria-current={activo ? 'step' : undefined}
              className={[
                'flex-1 border-b-2 pb-1 text-base',
                activo && 'border-accion font-semibold text-principal',
                hecho && 'border-principal/40 text-principal/70',
                !activo && !hecho && 'border-principal/15 text-principal/40',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {nombre}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
