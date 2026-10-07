import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide } from 'react-icons/fa6'
import { LuChevronDown, LuCircleCheck } from 'react-icons/lu'
import Boton from './Boton'
import { Hueso } from './Esqueleto'
import useCadaRato from './useCadaRato'
import { buscarParecidos } from '../datos/buscarParecido'
import { formatearHora } from '../datos/disponibilidad'
import { cuentaDeLista, listaParaEscaneo, yaRecibio } from '../datos/escaneo'

/** Cada cuanto se vuelve a pedir: otros voluntarios tambien estan entregando. */
const CADA_MS_LISTA = 30_000

/** Sin escribir nada no se pintan cientos de renglones: con escribir se encuentra. */
const MAXIMO_SIN_BUSCAR = 60

/**
 * La gente de hoy de la fila de carros, ahi mismo en el escaner: nombre,
 * codigo, hora y si ya recibio. Sin telefono ni direccion. Se busca
 * mientras se escribe y "como suena" (Javier encuentra a Xavier, Maria a
 * Mario), lo mas parecido primero. Al tocar a alguien: Ver cita o
 * Registrar entrega.
 *
 * texto: lo escrito en el buscador. version: cambia despues de entregar,
 * para pedir la lista otra vez. alVer / alEntregar(persona). Si la base
 * todavia no tiene la lista, no se pinta nada: queda la busqueda de antes.
 */
export default function ListaDelDia({ texto, version = 0, ocupado, alVer, alEntregar }) {
  const { t } = useTranslation()
  const [lista, setLista] = useState(undefined)
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(null)

  useCadaRato(
    async () => {
      try {
        setLista(await listaParaEscaneo())
        setError(null)
      } catch (e) {
        setError(e.message)
        setLista((antes) => (antes === undefined ? null : antes))
      }
    },
    CADA_MS_LISTA,
    { clave: version },
  )

  if (lista === undefined) {
    return (
      <div className="mt-4 space-y-2" role="status">
        <span className="sr-only">{t('escaneo.lista.cargando')}</span>
        <Hueso className="h-16 w-full" />
        <Hueso className="h-16 w-full" />
        <Hueso className="h-16 w-full" />
      </div>
    )
  }

  //  Sin la lista (la base no la tiene, o es de la otra fila): queda la busqueda.
  if (lista === null) {
    return error === 'OTRA_FILA' ? (
      <p className="mt-4 rounded-xl bg-accion/15 p-3 text-base text-principal">{t('escaneo.lista.otraFila')}</p>
    ) : error === 'SIN_CONEXION' ? (
      <p className="mt-4 rounded-xl bg-accion/15 p-3 text-base text-principal">{t('escaneo.lista.sinConexion')}</p>
    ) : null
  }

  const cuenta = cuentaDeLista(lista)
  const buscando = texto.trim() !== ''
  const encontrados = buscarParecidos(lista, texto)
  const visibles = buscando ? encontrados : encontrados.slice(0, MAXIMO_SIN_BUSCAR)

  if (cuenta.total === 0) {
    return <p className="mt-4 rounded-xl bg-principal/5 p-3 text-base text-principal">{t('escaneo.lista.vacia')}</p>
  }

  return (
    <div className="mt-4">
      <p className="flex flex-wrap items-center gap-x-2 text-base font-semibold text-principal">
        <FaCarSide aria-hidden="true" className="h-4 w-4 text-accion" />
        {t('escaneo.lista.cuenta', { total: cuenta.total, faltan: cuenta.faltan })}
      </p>
      {error === 'SIN_CONEXION' && (
        <p className="mt-1 text-chica text-principal/70" role="status">
          {t('escaneo.lista.sinConexion')}
        </p>
      )}

      {buscando && visibles.length === 0 && (
        <p className="mt-3 rounded-xl bg-accion/15 p-3 text-base text-principal" role="status">
          {t('escaneo.lista.noEsta')}
        </p>
      )}

      <ul className="mt-2 space-y-2" aria-live="polite">
        {visibles.map((persona) => {
          const recibio = yaRecibio(persona)
          const clave = persona.codigo_corto
          const estaAbierto = abierto === clave

          return (
            <li
              className={`rounded-xl border ${estaAbierto ? 'border-principal' : 'border-principal/20'} ${
                recibio ? 'bg-ya-recibio/5' : 'bg-superficie'
              }`}
              key={clave}
            >
              <button
                aria-expanded={estaAbierto}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                onClick={() => setAbierto(estaAbierto ? null : clave)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold text-principal">{persona.nombre}</span>
                  <span className="block text-base text-principal/70">
                    {persona.codigo_corto} · {formatearHora(persona.hora)}
                    {persona.en_carro_de && ` · ${t('escaneo.lista.enCarroDe', { codigo: persona.en_carro_de })}`}
                  </span>
                </span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-chica font-bold ${
                    recibio ? 'bg-ya-recibio/15 text-ya-recibio' : 'bg-puede-pasar/15 text-puede-pasar'
                  }`}
                >
                  {recibio && <LuCircleCheck aria-hidden="true" className="h-4 w-4" />}
                  {recibio ? t('escaneo.lista.yaRecibio') : t('escaneo.lista.falta')}
                </span>
                <LuChevronDown
                  aria-hidden="true"
                  className={`h-5 w-5 shrink-0 text-principal/70 transition-transform ${estaAbierto ? 'rotate-180' : ''}`}
                />
              </button>

              {estaAbierto && (
                <div className="aparecer grid gap-2 border-t border-principal/10 p-3 sm:grid-cols-2">
                  <Boton onClick={() => alVer(persona)} variant="secondary">
                    {t('escaneo.verCita')}
                  </Boton>
                  {/* Ya recibio: no se ofrece entregar otra vez (la base tampoco lo deja). */}
                  {!recibio && (
                    <Boton disabled={ocupado} onClick={() => alEntregar(persona)}>
                      {ocupado ? t('escaneo.registrando') : t('escaneo.registrarEntrega')}
                    </Boton>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {!buscando && encontrados.length > visibles.length && (
        <p className="mt-2 text-base text-principal/70">
          {t('escaneo.lista.masDe', { n: visibles.length, total: encontrados.length })}
        </p>
      )}
    </div>
  )
}
