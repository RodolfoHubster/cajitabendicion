import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPrinter } from 'react-icons/lu'
import { useParams, useSearchParams } from 'react-router-dom'
import EnlaceVolver from '../../componentes/EnlaceVolver'
import Tarjeta from '../../componentes/Tarjeta'
import { EsqueletoTexto } from '../../componentes/Esqueleto'
import { horaDeMarca } from '../../datos/filaAPie'
import { ORGANIZACION } from '../../datos/organizacion'
import { hoyLocal } from '../../datos/panel'
import { asistenciasDeVoluntario, listarVoluntarios, rangoDelMes, textoDuracion } from '../../datos/voluntarios'

/** '2026-10-21' -> '21 de octubre de 2026' (o en ingles). */
function fechaCompleta(fecha, idioma) {
  return new Intl.DateTimeFormat(idioma, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
}

/** '2026-10-21' -> 'mié 21 oct'. */
function fechaCorta(fecha, idioma) {
  return new Intl.DateTimeFormat(idioma, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  )
}

/**
 * Constancia de horas de servicio de un voluntario entre dos fechas
 * (seccion 49): lo que piden las escuelas para el servicio comunitario.
 * Una hoja carta con el nombre de la iglesia, las visitas completas, el
 * total y la linea para la firma. Se imprime o se guarda como PDF desde el
 * navegador; al imprimir solo sale la hoja (ver index.css, .solo-imprimir).
 * Solo administradores.
 */
export default function ConstanciaHoras() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const [busqueda] = useSearchParams()
  const hoy = hoyLocal()
  const desde = busqueda.get('desde') || rangoDelMes(hoy).desde
  const hasta = busqueda.get('hasta') || hoy
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    Promise.all([listarVoluntarios(), asistenciasDeVoluntario(id, desde, hasta)])
      .then(([lista, asistencias]) => {
        if (!vigente) return
        const voluntario = lista.find((v) => v.id === id)
        if (!voluntario) {
          setError('VOLUNTARIO_NO_EXISTE')
          return
        }
        const completas = asistencias.filter((a) => a.estado === 'salio').sort((a, b) => a.entrada.localeCompare(b.entrada))
        setDatos({
          nombre: voluntario.nombre,
          completas,
          dias: new Set(completas.map((a) => a.fecha)).size,
          minutos: completas.reduce((suma, a) => suma + (a.minutos ?? 0), 0),
        })
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })
    return () => {
      vigente = false
    }
  }, [id, desde, hasta])

  if (error) {
    return (
      <Tarjeta>
        <p className="rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
        </p>
        <div className="mt-4">
          <EnlaceVolver a="/admin/voluntarios">{t('constancia.volver')}</EnlaceVolver>
        </div>
      </Tarjeta>
    )
  }

  if (!datos) return <EsqueletoTexto texto={t('constancia.cargando')} />

  return (
    <div className="solo-imprimir space-y-4">
      <div className="space-y-3 print:hidden">
        <EnlaceVolver a="/admin/voluntarios">{t('constancia.volver')}</EnlaceVolver>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accion px-5 text-base font-bold text-sobre-accion shadow-sm transition hover:brightness-95"
            onClick={() => window.print()}
            type="button"
          >
            <LuPrinter aria-hidden="true" className="h-5 w-5" />
            {t('constancia.imprimir')}
          </button>
          <p className="max-w-md text-base text-principal/80">{t('constancia.ayuda')}</p>
        </div>
      </div>

      {/* La hoja: siempre blanca y con tinta azul, aunque la pantalla este en modo oscuro. */}
      <article className="mx-auto max-w-[8.5in] rounded-xl bg-white p-8 text-[#1B3A6B] shadow-lg sm:p-12 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="border-b-4 border-[#F5A03C] pb-4">
          <p className="font-titulo text-2xl font-bold">{ORGANIZACION.programa}</p>
          <p className="text-base font-semibold">{ORGANIZACION.iglesia}</p>
          <p className="text-base">
            {ORGANIZACION.direccion} · {ORGANIZACION.telefono}
          </p>
        </header>

        <h1 className="mt-8 text-center font-titulo text-2xl font-bold uppercase tracking-wide">{t('constancia.titulo')}</h1>

        <p className="mt-6 text-lg leading-relaxed">
          {t('constancia.haceConstar')} <strong>{datos.nombre}</strong>{' '}
          {t('constancia.sirvio', {
            programa: ORGANIZACION.programa,
            iglesia: ORGANIZACION.iglesia,
            desde: fechaCompleta(desde, i18n.language),
            hasta: fechaCompleta(hasta, i18n.language),
          })}{' '}
          <strong>
            {t('constancia.total', {
              duracion: textoDuracion(t, datos.minutos),
              horas: (datos.minutos / 60).toFixed(2),
              count: datos.dias,
            })}
          </strong>
        </p>

        {datos.completas.length > 0 && (
          <table className="mt-6 w-full border-collapse text-left text-base tabular-nums">
            <thead>
              <tr className="border-b-2 border-[#1B3A6B]">
                <th className="py-1.5 pr-2">{t('constancia.col.fecha')}</th>
                <th className="py-1.5 pr-2">{t('constancia.col.entrada')}</th>
                <th className="py-1.5 pr-2">{t('constancia.col.salida')}</th>
                <th className="py-1.5 text-right">{t('constancia.col.tiempo')}</th>
              </tr>
            </thead>
            <tbody>
              {datos.completas.map((a) => (
                <tr className="border-b border-[#1B3A6B]/20" key={a.id}>
                  <td className="py-1.5 pr-2">{fechaCorta(a.fecha, i18n.language)}</td>
                  <td className="py-1.5 pr-2">{horaDeMarca(a.entrada)}</td>
                  <td className="py-1.5 pr-2">{horaDeMarca(a.salida)}</td>
                  <td className="py-1.5 text-right">{textoDuracion(t, a.minutos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="pt-2" colSpan={3}>
                  {t('constancia.col.total')}
                </td>
                <td className="pt-2 text-right">{textoDuracion(t, datos.minutos)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <p className="mt-8 text-base">{t('constancia.expedida', { fecha: fechaCompleta(hoy, i18n.language) })}</p>

        <div className="mt-20 w-72 max-w-full border-t-2 border-[#1B3A6B] pt-2">
          <p className="text-base font-semibold">{t('constancia.firma')}</p>
          <p className="text-base">{t('constancia.cargo')}</p>
        </div>
      </article>
    </div>
  )
}
