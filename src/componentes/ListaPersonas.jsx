import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuFileSpreadsheet, LuFileText, LuLock, LuSheet, LuUsers } from 'react-icons/lu'
import Tarjeta from './Tarjeta'
import { armarCsv, armarExcel, armarPdf, descargarArchivo, logoIglesia } from '../datos/archivosLista'
import { nombreArchivoLista, pedirLista, porDia } from '../datos/listaPersonas'

const FORMATOS = [
  { clave: 'excel', extension: 'xlsx', Icono: LuFileSpreadsheet },
  { clave: 'pdf', extension: 'pdf', Icono: LuFileText },
  { clave: 'csv', extension: 'csv', Icono: LuSheet },
]

/**
 * En Reportes, solo para administradores: la lista de quienes recibieron,
 * de las fechas escogidas arriba, en Excel, PDF o CSV (una hoja por dia).
 * Es la que el pastor le ensena al banco de alimentos y a quienes apoyan.
 *
 * "Recibieron" viene palomeado; lo demas es opcional. La version "para
 * compartir" sale sin telefono, correo ni domicilio: el aviso de privacidad
 * promete no compartir los datos.
 */
export default function ListaPersonas({ desde, hasta, deshabilitada = false }) {
  const { t, i18n } = useTranslation()
  const [incluye, setIncluye] = useState({ recibieron: true, noVinieron: false, aPie: false })
  const [version, setVersion] = useState('completa')
  const [haciendo, setHaciendo] = useState(null)
  const [aviso, setAviso] = useState(null)

  const nada = !incluye.recibieron && !incluye.noVinieron

  async function bajar(formato) {
    setHaciendo(formato.clave)
    setAviso(null)
    try {
      const filas = await pedirLista({ desde, hasta, ...incluye, version })
      if (filas.length === 0) {
        setAviso({ tipo: 'vacio' })
        return
      }
      //  El PDF lleva la letra de siempre, que no tiene los acentos del
      //  vietnamita: en ese caso sale en ingles.
      const idioma = formato.clave === 'pdf' && i18n.language === 'vi' ? 'en' : i18n.language
      const tArchivo = idioma === i18n.language ? t : i18n.getFixedT(idioma)
      const dias = porDia(filas, tArchivo)
      const datos = { dias, t: tArchivo, idioma, version, desde, hasta, aPie: incluye.aPie, noVinieron: incluye.noVinieron }
      const logo = formato.clave === 'csv' ? null : await logoIglesia()
      const blob =
        formato.clave === 'excel' ? await armarExcel({ ...datos, logo }) : formato.clave === 'pdf' ? await armarPdf({ ...datos, logo }) : armarCsv(datos)
      descargarArchivo(nombreArchivoLista(desde, hasta, version, formato.extension), blob)
      setAviso({ tipo: 'listo', n: filas.length, dias: dias.length })
    } catch (e) {
      setAviso({ tipo: 'error', codigo: e.message })
    } finally {
      setHaciendo(null)
    }
  }

  const casilla = (clave) => (
    <label className="flex min-h-12 items-center gap-3 text-base font-semibold text-principal" key={clave}>
      <input
        checked={incluye[clave]}
        className="h-6 w-6 shrink-0 accent-principal"
        onChange={(e) => setIncluye((antes) => ({ ...antes, [clave]: e.target.checked }))}
        type="checkbox"
      />
      <span>
        {t(`listaPersonas.incluye.${clave}`)}
        <span className="block text-chica font-normal text-principal/80">{t(`listaPersonas.incluye.${clave}Ayuda`)}</span>
      </span>
    </label>
  )

  return (
    <Tarjeta className="border-t-8 border-accion">
      <h2 className="flex items-center gap-2 text-xl font-bold text-principal">
        <LuUsers aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
        <span className="min-w-0">{t('listaPersonas.titulo')}</span>
      </h2>
      <p className="mt-1 text-base text-principal/80">{t('listaPersonas.ayuda')}</p>

      <fieldset className="mt-3">
        <legend className="text-base font-bold text-principal">{t('listaPersonas.incluye.titulo')}</legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-3">{['recibieron', 'noVinieron', 'aPie'].map(casilla)}</div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-base font-bold text-principal">{t('listaPersonas.version.titulo')}</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {['completa', 'compartir'].map((v) => (
            <label
              className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-base text-principal ${
                version === v ? 'border-marca bg-marca/5' : 'border-principal/20'
              }`}
              key={v}
            >
              <input
                checked={version === v}
                className="mt-1 h-5 w-5 shrink-0 accent-principal"
                name="version-lista"
                onChange={() => setVersion(v)}
                type="radio"
                value={v}
              />
              <span>
                <span className="block font-bold">{t(`listaPersonas.version.${v}`)}</span>
                <span className="block text-chica text-principal/80">{t(`listaPersonas.version.${v}Ayuda`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="mt-3 flex items-start gap-2 rounded-xl bg-accion/15 p-3 text-base text-principal">
        <LuLock aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-accion" />
        <span className="min-w-0">{t('listaPersonas.privacidad')}</span>
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {FORMATOS.map((formato) => (
          <button
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-marca px-4 text-base font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
            disabled={deshabilitada || nada || haciendo !== null}
            key={formato.clave}
            onClick={() => bajar(formato)}
            type="button"
          >
            <formato.Icono aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
            <span className="min-w-0">{haciendo === formato.clave ? t('listaPersonas.preparando') : t(`listaPersonas.formatos.${formato.clave}`)}</span>
          </button>
        ))}
      </div>
      {nada && <p className="mt-2 text-base text-principal/80">{t('listaPersonas.escogeAlgo')}</p>}

      <div aria-live="polite">
        {aviso?.tipo === 'listo' && (
          <p className="mt-3 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar">
            {t('listaPersonas.listo', { count: aviso.n, dias: aviso.dias })}
          </p>
        )}
        {aviso?.tipo === 'vacio' && <p className="mt-3 rounded-xl bg-principal/5 p-3 text-base text-principal">{t('listaPersonas.vacio')}</p>}
        {aviso?.tipo === 'error' && (
          <p className="mt-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`listaPersonas.errores.${aviso.codigo}`, { defaultValue: t('listaPersonas.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}
      </div>
    </Tarjeta>
  )
}
