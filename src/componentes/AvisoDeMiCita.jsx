import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuTriangleAlert } from 'react-icons/lu'
import { formatearHora } from '../datos/disponibilidad'
import { fechaLarga, horaConRetraso, incidenciaDeCita } from '../datos/incidencias'

/**
 * En la pagina de una cita (/confirmacion/:token): si su dia va con
 * retraso (con su hora nueva), si su cita se movio de otra fecha, o si la
 * entrega se cancelo.
 */
export default function AvisoDeMiCita({ token, hora, estado, className = '' }) {
  const { t, i18n } = useTranslation()
  const [lista, setLista] = useState([])

  useEffect(() => {
    let vivo = true
    incidenciaDeCita(token).then((l) => vivo && setLista(l))
    return () => {
      vivo = false
    }
  }, [token])

  //  El retraso solo le importa a quien todavia no pasa.
  const visibles = lista.filter((i) => i.tipo !== 'retraso' || estado === 'reservada' || estado === 'llego')
  if (visibles.length === 0) return null

  return (
    <div className={`space-y-2 ${className}`}>
      {visibles.map((i) => (
        <div
          className="flex items-start gap-3 rounded-xl border-2 border-accion bg-accion/10 p-3 text-principal"
          key={`${i.tipo}-${i.fecha}`}
          role="status"
        >
          <LuTriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
          <div>
            <p className="text-base font-bold">
              {t(`incidencias.miCita.${i.tipo}`, {
                minutos: i.minutos,
                hora: hora && i.minutos ? formatearHora(horaConRetraso(hora, i.minutos)) : '',
                fecha: fechaLarga(i.fecha, i18n.language),
                fechaNueva: i.fecha_nueva ? fechaLarga(i.fecha_nueva, i18n.language) : '',
              })}
            </p>
            {i.mensaje && <p className="mt-1 text-base">{i.mensaje}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
