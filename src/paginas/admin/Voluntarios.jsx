import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuClock, LuScanLine, LuUsers } from 'react-icons/lu'
import EntradaSalidaVoluntarios from '../../componentes/EntradaSalidaVoluntarios'
import HorasVoluntarios from '../../componentes/HorasVoluntarios'
import ListaVoluntarios from '../../componentes/ListaVoluntarios'
import Tarjeta from '../../componentes/Tarjeta'
import { listarVoluntarios } from '../../datos/voluntarios'

const PESTANAS = [
  { clave: 'entrada', Icono: LuScanLine },
  { clave: 'lista', Icono: LuUsers },
  { clave: 'horas', Icono: LuClock },
]

/**
 * Voluntarios (seccion 48, solo administradores): su entrada y su salida con
 * la credencial, la lista para registrarlos y darles su credencial, y sus
 * horas. Tres pestanas de un toque: el dia de la entrega casi todo es la
 * primera.
 */
export default function Voluntarios() {
  const { t } = useTranslation()
  const [pestana, setPestana] = useState('entrada')
  //  La lista se comparte: el escaner la usa para buscar a quien no trae su credencial.
  const [voluntarios, setVoluntarios] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => setVersion((n) => n + 1), [])

  useEffect(() => {
    let vigente = true
    listarVoluntarios()
      .then((lista) => {
        if (!vigente) return
        setVoluntarios(lista)
        setError(null)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [version])

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="text-2xl font-bold">{t('voluntarios.titulo')}</h1>
        <p className="text-base text-principal/70">{t('voluntarios.ayuda')}</p>

        <div
          aria-label={t('voluntarios.titulo')}
          className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-principal/5 p-1 ring-1 ring-principal/10"
          role="tablist"
        >
          {PESTANAS.map(({ clave, Icono }) => {
            const activa = clave === pestana
            return (
              <button
                aria-selected={activa}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-base font-semibold transition sm:flex-row sm:gap-2 ${
                  activa ? 'bg-marca text-white shadow-sm' : 'text-principal hover:bg-principal/10'
                }`}
                key={clave}
                onClick={() => setPestana(clave)}
                role="tab"
                type="button"
              >
                <Icono aria-hidden="true" className="h-5 w-5 shrink-0" />
                <span className="min-w-0 max-w-full truncate">{t(`voluntarios.pestanas.${clave}`)}</span>
              </button>
            )
          })}
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}
      </Tarjeta>

      {pestana === 'entrada' && <EntradaSalidaVoluntarios alCambiar={recargar} voluntarios={voluntarios} />}
      {pestana === 'lista' && <ListaVoluntarios alCambiar={recargar} voluntarios={voluntarios} />}
      {pestana === 'horas' && <HorasVoluntarios alCambiar={recargar} voluntarios={voluntarios} />}
    </div>
  )
}
