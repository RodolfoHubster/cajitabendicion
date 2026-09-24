import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuLock } from 'react-icons/lu'
import Tarjeta from '../../componentes/Tarjeta'
import { horaSanDiego } from '../../datos/disponibilidad'
import { CLAVES_PERMISOS, guardarPermiso, listarPermisos } from '../../datos/permisos'
import { EsqueletoLista } from '../../componentes/Esqueleto'

const NUNCA = ['equipo', 'horarios', 'excepciones']

const mensajeError = (t, codigo) =>
  t(`permisos.errores.${codigo}`, { defaultValue: t('permisos.errores.ERROR_DESCONOCIDO') })

/** '2026-09-23T21:05:00Z' -> '23 de septiembre, 2:05 PM' (en San Diego). */
function fechaHora(marca, idioma) {
  const dia = new Intl.DateTimeFormat(idioma, {
    timeZone: 'America/Los_Angeles',
    day: 'numeric',
    month: 'long',
  }).format(new Date(marca))

  return `${dia}, ${horaSanDiego(marca)}`
}

/** Una palomita: lo que dice, quien la movio, y si se esta guardando. */
function Palomita({ permiso, alCambiar }) {
  const { t, i18n } = useTranslation()

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  async function cambiar(activo) {
    setGuardando(true)
    setError(null)

    try {
      await guardarPermiso(permiso.clave, activo)
      alCambiar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <li className="py-1">
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
          permiso.activo ? 'border-principal bg-principal/5' : 'border-principal/20'
        }`}
      >
        <input
          checked={permiso.activo}
          className="mt-1 h-6 w-6 shrink-0 accent-principal"
          disabled={guardando}
          onChange={(e) => cambiar(e.target.checked)}
          type="checkbox"
        />
        <span className="min-w-0">
          <span className="block text-base font-semibold text-principal">
            {t(`permisos.claves.${permiso.clave}.nombre`)}
          </span>
          <span className="block text-base text-principal/70">{t(`permisos.claves.${permiso.clave}.ayuda`)}</span>

          {guardando && <span className="block text-base text-principal/70">{t('permisos.guardando')}</span>}

          {/* Quien la movio y cuando: si manana alguien pregunta por que un
              voluntario ve los reportes, aqui esta la respuesta. */}
          {!guardando && permiso.actualizado_por && (
            <span className="block text-base text-principal/70">
              {t('permisos.cambiadoPor', {
                correo: permiso.actualizado_por,
                cuando: fechaHora(permiso.actualizado_en, i18n.language),
              })}
            </span>
          )}
        </span>
      </label>

      {error && (
        <p className="mt-1 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {mensajeError(t, error)}
        </p>
      )}
    </li>
  )
}

/**
 * Permisos: que puede hacer un voluntario, en palomitas.
 *
 * Solo admin, y a proposito no aparece aqui nada que sirva para darse
 * permisos a uno mismo. La base aplica la misma regla: esta pantalla es
 * la comodidad, no el candado.
 */
export default function Permisos() {
  const { t } = useTranslation()

  const [permisos, setPermisos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let vigente = true

    listarPermisos()
      .then((lista) => {
        if (!vigente) return
        setPermisos(lista)
        setErrorCarga(null)
      })
      .catch((e) => {
        if (vigente) setErrorCarga(e.message)
      })

    return () => {
      vigente = false
    }
  }, [recarga])

  // El orden de la pantalla lo manda el codigo, no la base: van del uso
  // mas comun al mas delicado, no en orden alfabetico.
  const enOrden = CLAVES_PERMISOS.map((clave) => (permisos ?? []).find((fila) => fila.clave === clave)).filter(Boolean)

  const prendidos = enOrden.filter((permiso) => permiso.activo).length

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h1 className="mb-1 text-2xl font-bold">{t('permisos.titulo')}</h1>
        <p className="text-base text-principal/70">{t('permisos.ayuda')}</p>
      </Tarjeta>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Tarjeta>
          <h2 className="text-xl font-bold">{t('permisos.lista')}</h2>
          <p className="mb-3 text-base text-principal/70">
            {permisos ? t('permisos.prendidos', { prendidos, total: enOrden.length }) : ''}
          </p>

          {errorCarga && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
              {mensajeError(t, errorCarga)}
            </p>
          )}
          {!errorCarga && permisos === null && <EsqueletoLista filas={6} texto={t('permisos.cargando')} />}

          {enOrden.length > 0 && (
            <ul className="space-y-1">
              {enOrden.map((permiso) => (
                <Palomita alCambiar={() => setRecarga((n) => n + 1)} key={permiso.clave} permiso={permiso} />
              ))}
            </ul>
          )}

          {/* La sesion del voluntario ya abierta trae su lista de antes. */}
          {permisos && <p className="mt-3 text-base text-principal/70">{t('permisos.avisoSesion')}</p>}
        </Tarjeta>

        <Tarjeta>
          <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
            <LuLock aria-hidden="true" className="h-6 w-6 shrink-0 text-ya-recibio" />
            {t('permisos.nunca.titulo')}
          </h2>
          <p className="mb-3 text-base text-principal/70">{t('permisos.nunca.ayuda')}</p>

          <ul className="space-y-3">
            {NUNCA.map((clave) => (
              <li className="rounded-xl border border-ya-recibio/30 bg-ya-recibio/5 p-3" key={clave}>
                <p className="text-base font-semibold text-principal">{t(`permisos.nunca.${clave}.nombre`)}</p>
                <p className="text-base text-principal/70">{t(`permisos.nunca.${clave}.porque`)}</p>
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </div>
  )
}
