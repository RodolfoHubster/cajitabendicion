import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuClock, LuScanLine, LuUsers } from 'react-icons/lu'
import { useOutletContext } from 'react-router-dom'
import EntradaSalidaVoluntarios from '../../componentes/EntradaSalidaVoluntarios'
import HorasVoluntarios from '../../componentes/HorasVoluntarios'
import ListaVoluntarios from '../../componentes/ListaVoluntarios'
import Tarjeta from '../../componentes/Tarjeta'
import { AJUSTES_DE_ANTES, ajustesVoluntarios, listarVoluntarios, voluntariosAlDia } from '../../datos/voluntarios'

const PESTANAS = [
  { clave: 'entrada', Icono: LuScanLine },
  { clave: 'lista', Icono: LuUsers },
  { clave: 'horas', Icono: LuClock },
]

/**
 * Voluntarios (seccion 48, solo administradores): su entrada con la
 * credencial, la lista para registrarlos y darles su credencial, y sus
 * horas. Tres pestanas de un toque: el dia de la entrega casi todo es la
 * primera.
 *
 * Seccion 49: quien "atiende voluntarios" sin ser administrador ve
 * Escanear y Lista (registrar, corregir, mandar credenciales); las Horas,
 * dar de baja y cambiar el QR son del administrador.
 *
 * Seccion 52: al abrir, se ponen las salidas que ya tocan (modo solo la
 * entrada) y se pide como se anota la asistencia. Si la actualizacion de la
 * seccion 52 todavia no se corre, todo sigue como antes (entrada y salida).
 */
export default function Voluntarios() {
  const { t } = useTranslation()
  const { rol } = useOutletContext() ?? {}
  const esAdmin = rol === 'admin'
  const pestanas = PESTANAS.filter(({ clave }) => esAdmin || clave !== 'horas')
  const [pestana, setPestana] = useState('entrada')
  //  La lista se comparte: el escaner la usa para buscar a quien no trae su credencial.
  const [voluntarios, setVoluntarios] = useState(null)
  const [ajustes, setAjustes] = useState(null)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)
  const recargar = useCallback(() => setVersion((n) => n + 1), [])

  useEffect(() => {
    let vigente = true
    //  Primero las salidas que ya tocan, para que la lista salga al dia.
    voluntariosAlDia()
      .catch(() => {})
      .then(() => listarVoluntarios())
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

  useEffect(() => {
    let vigente = true
    ajustesVoluntarios()
      .then((leidos) => {
        if (vigente) setAjustes(leidos)
      })
      .catch(() => {
        if (vigente) setAjustes(AJUSTES_DE_ANTES)
      })
    return () => {
      vigente = false
    }
  }, [])

  const listos = ajustes ?? AJUSTES_DE_ANTES

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="text-2xl font-bold">{t('voluntarios.titulo')}</h1>
        <p className="text-base text-principal/70">{t('voluntarios.ayuda')}</p>

        <div
          aria-label={t('voluntarios.titulo')}
          className={`mt-3 grid ${esAdmin ? 'grid-cols-3' : 'grid-cols-2'} gap-1 rounded-2xl bg-principal/5 p-1 ring-1 ring-principal/10`}
          role="tablist"
        >
          {pestanas.map(({ clave, Icono }) => {
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

      {pestana === 'entrada' && (
        <EntradaSalidaVoluntarios
          ajustes={listos}
          alCambiar={recargar}
          alCambiarAjustes={setAjustes}
          esAdmin={esAdmin}
          voluntarios={voluntarios}
        />
      )}
      {pestana === 'lista' && (
        <ListaVoluntarios
          alCambiar={recargar}
          esAdmin={esAdmin}
          soloEntrada={listos.modo === 'solo_entrada'}
          voluntarios={voluntarios}
        />
      )}
      {pestana === 'horas' && esAdmin && (
        <HorasVoluntarios alCambiar={recargar} horaSalida={listos.hora_salida} voluntarios={voluntarios} />
      )}
    </div>
  )
}
