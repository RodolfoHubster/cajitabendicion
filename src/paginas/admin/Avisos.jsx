import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuChevronUp, LuPlus, LuTrash2 } from 'react-icons/lu'
import Boton from '../../componentes/Boton'
import Tarjeta from '../../componentes/Tarjeta'
import { eliminarAviso, guardarAviso, listarAvisos, moverAviso } from '../../datos/avisos'
import { EsqueletoTexto } from '../../componentes/Esqueleto'

const SECCIONES = ['inicio', 'registro', 'preguntas', 'quienes']

//  Donde el titulo es la pregunta y sin el no se entiende nada.
const CON_TITULO = ['preguntas', 'quienes']

const ESTILO_TEXTO =
  'min-h-24 w-full rounded-xl border border-principal/25 bg-superficie p-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

const BOTON_ICONO =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-principal transition hover:bg-principal/10 disabled:opacity-30'

const VACIO = {
  id: null,
  seccion: 'registro',
  textoEs: '',
  textoEn: '',
  textoVi: '',
  tituloEs: '',
  tituloEn: '',
  tituloVi: '',
  activo: true,
}

/**
 * Los textos que lee la gente, editables sin tocar codigo.
 *
 * Aqui no se cambia ninguna regla del sistema: se cambia lo que se le
 * explica a la gente. Si alguien borra "una caja por codigo", el sistema
 * lo sigue cumpliendo igual; nada mas deja de decirlo.
 */
export default function Avisos() {
  const { t } = useTranslation()

  const [avisos, setAvisos] = useState(null)
  const [error, setError] = useState(null)
  const [recarga, setRecarga] = useState(0)

  const [edicion, setEdicion] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(null)

  useEffect(() => {
    let vigente = true

    listarAvisos()
      .then((lista) => {
        if (!vigente) return
        setAvisos(lista)
        setError(null)
      })
      .catch((e) => {
        if (vigente) setError(e.message)
      })

    return () => {
      vigente = false
    }
  }, [recarga])

  const refrescar = () => setRecarga((n) => n + 1)

  async function guardar() {
    setGuardando(true)
    setError(null)

    try {
      await guardarAviso(edicion)
      setEdicion(null)
      refrescar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function correr(accion) {
    setError(null)

    try {
      await accion()
      refrescar()
    } catch (e) {
      setError(e.message)
    }
  }

  const deSeccion = (seccion) => (avisos ?? []).filter((aviso) => aviso.seccion === seccion)

  return (
    <Tarjeta>
      <h1 className="mb-1 text-2xl font-bold">{t('avisos.titulo')}</h1>
      <p className="mb-4 text-base text-principal/70">{t('avisos.ayuda')}</p>

      {error && (
        <p className="mb-4 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`avisos.errores.${error}`, {
            defaultValue: t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') }),
          })}
        </p>
      )}

      {avisos === null && <EsqueletoTexto texto={t('avisos.cargando')} />}

      {avisos !== null &&
        SECCIONES.map((seccion) => (
          <section className="mb-6" key={seccion}>
            <h2 className="text-lg font-bold">{t(`avisos.seccion.${seccion}`)}</h2>
            <p className="mb-3 text-base text-principal/70">{t(`avisos.donde.${seccion}`)}</p>

            <ul className="space-y-2">
              {deSeccion(seccion).map((aviso, indice, lista) => (
                <li
                  className={`flex items-start gap-2 rounded-xl border p-3 ${
                    aviso.activo ? 'border-principal/20' : 'border-dashed border-principal/25 bg-principal/5'
                  }`}
                  key={aviso.id}
                >
                  <div className="flex shrink-0 flex-col">
                    <button
                      aria-label={t('avisos.subir')}
                      className={BOTON_ICONO}
                      disabled={indice === 0}
                      onClick={() => correr(() => moverAviso(aviso.id, 'arriba'))}
                      type="button"
                    >
                      <LuChevronUp aria-hidden="true" className="h-5 w-5" />
                    </button>
                    <button
                      aria-label={t('avisos.bajar')}
                      className={BOTON_ICONO}
                      disabled={indice === lista.length - 1}
                      onClick={() => correr(() => moverAviso(aviso.id, 'abajo'))}
                      type="button"
                    >
                      <LuChevronDown aria-hidden="true" className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    {aviso.titulo_es && (
                      <p className={`text-base font-bold ${aviso.activo ? 'text-principal' : 'text-principal/70'}`}>
                        {aviso.titulo_es}
                      </p>
                    )}
                    <p className={`text-base ${aviso.activo ? 'text-principal' : 'text-principal/70'}`}>
                      {aviso.texto_es}
                    </p>
                    <p className="mt-1 text-base text-principal/70">
                      {!aviso.activo && `${t('avisos.apagado')} · `}
                      {[aviso.texto_en ? 'EN' : null, aviso.texto_vi ? 'VI' : null].filter(Boolean).join(' · ') ||
                        t('avisos.soloEspanol')}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        className="min-h-10 text-base font-semibold text-principal underline underline-offset-4"
                        onClick={() =>
                          setEdicion({
                            id: aviso.id,
                            seccion: aviso.seccion,
                            textoEs: aviso.texto_es,
                            textoEn: aviso.texto_en ?? '',
                            textoVi: aviso.texto_vi ?? '',
                            tituloEs: aviso.titulo_es ?? '',
                            tituloEn: aviso.titulo_en ?? '',
                            tituloVi: aviso.titulo_vi ?? '',
                            activo: aviso.activo,
                          })
                        }
                        type="button"
                      >
                        {t('avisos.editar')}
                      </button>
                      <button
                        className="min-h-10 text-base font-semibold text-principal underline underline-offset-4"
                        onClick={() =>
                          correr(() =>
                            guardarAviso({
                              id: aviso.id,
                              seccion: aviso.seccion,
                              textoEs: aviso.texto_es,
                              textoEn: aviso.texto_en ?? '',
                              textoVi: aviso.texto_vi ?? '',
                              tituloEs: aviso.titulo_es ?? '',
                              tituloEn: aviso.titulo_en ?? '',
                              tituloVi: aviso.titulo_vi ?? '',
                              activo: !aviso.activo,
                            }),
                          )
                        }
                        type="button"
                      >
                        {aviso.activo ? t('avisos.apagar') : t('avisos.prender')}
                      </button>
                      <button
                        className="min-h-10 text-base font-semibold text-ya-recibio underline underline-offset-4"
                        onClick={() => setBorrando(aviso)}
                        type="button"
                      >
                        {t('avisos.quitar')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <button
              className="mt-3 inline-flex min-h-12 items-center gap-2 text-base font-semibold text-principal underline underline-offset-4"
              onClick={() => setEdicion({ ...VACIO, seccion })}
              type="button"
            >
              <LuPlus aria-hidden="true" className="h-5 w-5" />
              {t('avisos.agregar')}
            </button>
          </section>
        ))}

      {borrando && (
        <div className="mt-4 rounded-xl border border-ya-recibio/30 bg-ya-recibio/5 p-4" role="alertdialog">
          <p className="flex items-start gap-2 text-base font-semibold text-principal">
            <LuTrash2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />
            {t('avisos.confirmarQuitar', { texto: borrando.texto_es })}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Boton
              onClick={() =>
                correr(async () => {
                  await eliminarAviso(borrando.id)
                  setBorrando(null)
                })
              }
            >
              {t('avisos.siQuitar')}
            </Boton>
            <Boton onClick={() => setBorrando(null)} variant="secondary">
              {t('avisos.no')}
            </Boton>
          </div>
        </div>
      )}

      {edicion && (
        <div className="mt-4 rounded-xl border-2 border-principal/25 p-4">
          <h3 className="mb-3 text-lg font-bold">
            {edicion.id ? t('avisos.editando') : t('avisos.nuevo')} · {t(`avisos.seccion.${edicion.seccion}`)}
          </h3>

          {CON_TITULO.includes(edicion.seccion) && (
            <>
              <label className="block text-base font-semibold text-principal" htmlFor="titulo-es">
                {t(`avisos.tituloCampo.${edicion.seccion}`)}
              </label>
              <input
                className="min-h-14 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
                id="titulo-es"
                onChange={(e) => setEdicion({ ...edicion, tituloEs: e.target.value })}
                type="text"
                value={edicion.tituloEs}
              />

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <input
                  aria-label={t('avisos.enIngles')}
                  className="min-h-14 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
                  onChange={(e) => setEdicion({ ...edicion, tituloEn: e.target.value })}
                  placeholder={t('avisos.enIngles')}
                  type="text"
                  value={edicion.tituloEn}
                />
                <input
                  aria-label={t('avisos.enVietnamita')}
                  className="min-h-14 w-full rounded-xl border border-principal/25 bg-superficie px-3 text-base text-principal shadow-sm outline-none focus:border-principal focus:ring-4 focus:ring-principal/15"
                  onChange={(e) => setEdicion({ ...edicion, tituloVi: e.target.value })}
                  placeholder={t('avisos.enVietnamita')}
                  type="text"
                  value={edicion.tituloVi}
                />
              </div>

              <p className="mb-3 mt-1 text-base text-principal/70">{t('avisos.tituloAyuda')}</p>
            </>
          )}

          <label className="block text-base font-semibold text-principal" htmlFor="texto-es">
            {t(`avisos.cuerpo.${edicion.seccion}`, { defaultValue: t('avisos.enEspanol') })}
          </label>
          <textarea
            autoFocus
            className={ESTILO_TEXTO}
            id="texto-es"
            onChange={(e) => setEdicion({ ...edicion, textoEs: e.target.value })}
            value={edicion.textoEs}
          />

          <label className="mt-3 block text-base font-semibold text-principal" htmlFor="texto-en">
            {t('avisos.enIngles')}
          </label>
          <textarea
            className={ESTILO_TEXTO}
            id="texto-en"
            onChange={(e) => setEdicion({ ...edicion, textoEn: e.target.value })}
            placeholder={t('avisos.opcional')}
            value={edicion.textoEn}
          />

          <label className="mt-3 block text-base font-semibold text-principal" htmlFor="texto-vi">
            {t('avisos.enVietnamita')}
          </label>
          <textarea
            className={ESTILO_TEXTO}
            id="texto-vi"
            onChange={(e) => setEdicion({ ...edicion, textoVi: e.target.value })}
            placeholder={t('avisos.opcional')}
            value={edicion.textoVi}
          />

          <p className="mt-2 text-base text-principal/70">{t('avisos.sinTraduccion')}</p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Boton disabled={guardando || !edicion.textoEs.trim()} onClick={guardar}>
              {guardando ? t('avisos.guardando') : t('avisos.guardar')}
            </Boton>
            <Boton onClick={() => setEdicion(null)} variant="secondary">
              {t('avisos.cancelar')}
            </Boton>
          </div>
        </div>
      )}
    </Tarjeta>
  )
}
