import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuTriangleAlert } from 'react-icons/lu'
import { fechaLarga, incidenciasPublicas } from '../datos/incidencias'

/**
 * El aviso de la portada y del calendario: retraso, entrega movida o
 * cancelada, de hoy en adelante.
 *
 * Aparece cuando llega (no lleva esqueleto): casi nunca hay nada que
 * avisar, y un hueco reservado para un aviso que no existe estorbaria mas.
 */
export default function AvisoIncidencias({ className = '' }) {
  const { t, i18n } = useTranslation()
  const [lista, setLista] = useState([])

  useEffect(() => {
    let vivo = true
    incidenciasPublicas().then((l) => vivo && setLista(l))
    return () => {
      vivo = false
    }
  }, [])

  if (lista.length === 0) return null

  return (
    <div className={`space-y-2 ${className}`}>
      {lista.map((i) => (
        <div
          className="flex items-start gap-3 rounded-2xl border-2 border-accion bg-accion/10 p-4 text-principal"
          key={`${i.fecha}-${i.tipo}`}
          role="status"
        >
          <LuTriangleAlert aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-accion" />
          <div>
            <p className="text-base font-bold">
              {t(`incidencias.publico.${i.tipo}`, {
                fecha: fechaLarga(i.fecha, i18n.language),
                fechaNueva: i.fecha_nueva ? fechaLarga(i.fecha_nueva, i18n.language) : '',
                minutos: i.minutos,
              })}
            </p>
            {i.mensaje && <p className="mt-1 text-base">{i.mensaje}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
