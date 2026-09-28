import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import {
  LuCheck,
  LuCircleHelp,
  LuEye,
  LuEyeOff,
  LuGripVertical,
  LuHeart,
  LuHouse,
  LuLanguages,
  LuListChecks,
  LuPlus,
  LuTrash2,
  LuTriangleAlert,
} from 'react-icons/lu'
import Tarjeta from '../../componentes/Tarjeta'
import { EsqueletoTexto } from '../../componentes/Esqueleto'
import { eliminarAviso, guardarAviso, listarAvisos, moverAviso } from '../../datos/avisos'
import { desplazamiento, indiceDestino, moverEnLista, pasosParaMover } from '../../datos/ordenar'

//  Las pestanas. "Reglas" tiene dos listas: la de carros y la de a pie.
const PESTANAS = [
  { clave: 'reglas', Icono: LuListChecks },
  { clave: 'inicio', Icono: LuHouse },
  { clave: 'preguntas', Icono: LuCircleHelp },
  { clave: 'quienes', Icono: LuHeart },
]

//  Donde el titulo es la pregunta y sin el no se entiende nada.
const CON_TITULO = ['preguntas', 'quienes']

//  Entre renglon y renglon (space-y-2): cuenta al hacerse a un lado.
const SEPARACION = 8

const ESTILO_CAMPO =
  'w-full rounded-xl border border-principal/25 bg-superficie p-3 text-base text-principal outline-none focus:border-principal focus:ring-4 focus:ring-principal/15'

const BOTON_ICONO =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-principal/70 transition hover:bg-principal/10 hover:text-principal disabled:opacity-40'

const aEdicion = (aviso, seccion) => ({
  id: aviso?.id ?? null,
  seccion,
  textoEs: aviso?.texto_es ?? '',
  textoEn: aviso?.texto_en ?? '',
  textoVi: aviso?.texto_vi ?? '',
  tituloEs: aviso?.titulo_es ?? '',
  tituloEn: aviso?.titulo_en ?? '',
  tituloVi: aviso?.titulo_vi ?? '',
  activo: aviso?.activo ?? true,
})

/**
 * Textos y reglas: lo que la gente lee, editable sin tocar el sistema.
 *
 * Cada lista se ve como la ve la gente (las reglas, en el mismo recuadro
 * naranja del registro). Se edita tocando el texto, se ordena arrastrando
 * desde la agarradera, y se oculta o se quita con los iconos de la derecha.
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
  const [pestana, setPestana] = useState('reglas')
  const [fila, setFila] = useState('carro')

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

  async function correr(accion) {
    setError(null)
    try {
      await accion()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      refrescar()
    }
  }

  //  Se ve el orden nuevo al soltar; luego se guarda paso a paso.
  function reordenar(seccion, id, desde, hasta) {
    setAvisos((antes) => {
      const deSeccion = antes.filter((aviso) => aviso.seccion === seccion)
      return [...antes.filter((aviso) => aviso.seccion !== seccion), ...moverEnLista(deSeccion, desde, hasta)]
    })
    const { hacia, veces } = pasosParaMover(desde, hasta)
    correr(async () => {
      for (let i = 0; i < veces; i += 1) await moverAviso(id, hacia)
    })
  }

  const seccion = pestana === 'reglas' ? (fila === 'a_pie' ? 'registro_a_pie' : 'registro') : pestana

  return (
    <Tarjeta>
      <h1 className="text-2xl font-bold">{t('avisos.titulo')}</h1>
      <p className="mb-4 text-base text-principal/70">{t('avisos.ayuda')}</p>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-principal/5 p-1" role="tablist">
        {PESTANAS.map(({ clave, Icono }) => (
          <button
            aria-selected={pestana === clave}
            className={`flex min-h-12 shrink-0 items-center gap-2 rounded-lg px-3 text-base font-semibold transition ${
              pestana === clave ? 'bg-superficie text-principal shadow-tarjeta' : 'text-principal/70 hover:text-principal'
            }`}
            key={clave}
            onClick={() => setPestana(clave)}
            role="tab"
            type="button"
          >
            <Icono aria-hidden="true" className="h-5 w-5 text-accion" />
            {t(`avisos.pestana.${clave}`)}
          </button>
        ))}
      </div>

      {pestana === 'reglas' && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[
            ['carro', FaCarSide],
            ['a_pie', FaPersonWalking],
          ].map(([valor, Icono]) => (
            <button
              aria-pressed={fila === valor}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-3 text-base font-semibold text-principal transition ${
                fila === valor ? 'border-accion bg-accion/15' : 'border-principal/20 hover:border-principal/50'
              }`}
              key={valor}
              onClick={() => setFila(valor)}
              type="button"
            >
              <Icono aria-hidden="true" className="h-5 w-5 text-accion" />
              {t(`filas.nombre.${valor}`)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
          {t(`avisos.errores.${error}`, {
            defaultValue: t(`citas.errores.${error}`, { defaultValue: t('citas.errores.ERROR_DESCONOCIDO') }),
          })}
        </p>
      )}

      {avisos === null ? (
        <EsqueletoTexto texto={t('avisos.cargando')} />
      ) : (
        <EditorSeccion
          alReordenar={(id, desde, hasta) => reordenar(seccion, id, desde, hasta)}
          correr={correr}
          key={seccion}
          lista={avisos.filter((aviso) => aviso.seccion === seccion)}
          seccion={seccion}
        />
      )}

      <p className="mt-3 text-chica text-principal/70">{t('avisos.pista')}</p>
    </Tarjeta>
  )
}

/** Como se ve cada seccion para la gente: su marco y su titulo. */
function Marco({ seccion, children }) {
  const { t } = useTranslation()

  if (seccion === 'registro' || seccion === 'registro_a_pie') {
    return (
      <div className="rounded-2xl border border-accion/40 bg-accion/10 p-2.5 sm:p-4">
        <p className="mb-3 flex items-center gap-2 text-base font-bold text-principal">
          <LuTriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-accion" />
          {seccion === 'registro_a_pie' ? t('reglas.tituloAPie') : t('reglas.titulo')}
        </p>
        {children}
        {/* La casilla que la gente tiene que marcar, de muestra. */}
        <p className="mt-3 flex items-center gap-3 text-base font-semibold text-principal/70">
          <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded border-2 border-principal/40" />
          {t('reglas.casilla')}
        </p>
      </div>
    )
  }

  const titulo = {
    inicio: t('inicio.antesDeEmpezar'),
    preguntas: t('preguntas.titulo'),
    quienes: t('quienesSomos.titulo'),
  }[seccion]

  return (
    <div className="rounded-2xl border border-principal/15 p-2.5 sm:p-4">
      <p className="mb-3 text-lg font-bold text-principal">{titulo}</p>
      {children}
    </div>
  )
}

/** Una lista: sus renglones, arrastrar para ordenar y agregar al final. */
function EditorSeccion({ seccion, lista, correr, alReordenar }) {
  const { t } = useTranslation()
  const filas = useRef(new Map())
  const [arrastre, setArrastre] = useState(null)
  //  El que se esta editando: un id, 'nuevo' o null.
  const [editando, setEditando] = useState(null)

  function empezar(evento, indice, id) {
    if (evento.button !== undefined && evento.button !== 0) return
    evento.preventDefault()
    evento.currentTarget.setPointerCapture?.(evento.pointerId)
    const rects = lista.map((aviso) => filas.current.get(aviso.id)?.getBoundingClientRect())
    if (rects.some((rect) => !rect)) return
    setArrastre({
      id,
      desde: indice,
      sobre: indice,
      inicioY: evento.clientY,
      dy: 0,
      alto: rects[indice].height + SEPARACION,
      centros: rects.map((rect) => rect.top + rect.height / 2),
    })
  }

  function mover(evento) {
    if (!arrastre) return
    const dy = evento.clientY - arrastre.inicioY
    const sobre = indiceDestino(arrastre.centros, arrastre.desde, arrastre.centros[arrastre.desde] + dy)
    setArrastre({ ...arrastre, dy, sobre })
  }

  function soltar() {
    if (!arrastre) return
    const { id, desde, sobre } = arrastre
    setArrastre(null)
    if (desde !== sobre) alReordenar(id, desde, sobre)
  }

  //  Con el teclado: flechas arriba y abajo sobre la agarradera.
  function conTeclas(evento, indice, id) {
    if (evento.key === 'ArrowUp' && indice > 0) {
      evento.preventDefault()
      alReordenar(id, indice, indice - 1)
    }
    if (evento.key === 'ArrowDown' && indice < lista.length - 1) {
      evento.preventDefault()
      alReordenar(id, indice, indice + 1)
    }
  }

  async function guardar(edicion) {
    const listo = await correr(() => guardarAviso(edicion))
    if (listo) setEditando(null)
    return listo
  }

  const conPalomita = seccion === 'inicio' || seccion === 'registro' || seccion === 'registro_a_pie'

  return (
    <Marco seccion={seccion}>
      <ul className="space-y-2">
        {lista.map((aviso, indice) => {
          const corrido = desplazamiento(indice, arrastre)
          const esArrastrado = arrastre?.id === aviso.id

          return (
            <li
              className={`relative ${esArrastrado ? 'z-10' : arrastre ? 'transition-transform duration-150' : ''}`}
              key={aviso.id}
              ref={(el) => {
                if (el) filas.current.set(aviso.id, el)
                else filas.current.delete(aviso.id)
              }}
              style={corrido ? { transform: `translateY(${corrido}px)` } : undefined}
            >
              {editando === aviso.id ? (
                <EditorAviso
                  alCancelar={() => setEditando(null)}
                  alGuardar={guardar}
                  inicial={aEdicion(aviso, seccion)}
                />
              ) : (
                <Renglon
                  arrastrando={esArrastrado}
                  aviso={aviso}
                  conPalomita={conPalomita}
                  correr={correr}
                  manija={{
                    onKeyDown: (e) => conTeclas(e, indice, aviso.id),
                    onPointerCancel: soltar,
                    onPointerDown: (e) => empezar(e, indice, aviso.id),
                    onPointerMove: mover,
                    onPointerUp: soltar,
                  }}
                  alEditar={() => setEditando(aviso.id)}
                  seccion={seccion}
                />
              )}
            </li>
          )
        })}
      </ul>

      {editando === 'nuevo' ? (
        <div className="mt-2">
          <EditorAviso alCancelar={() => setEditando(null)} alGuardar={guardar} inicial={aEdicion(null, seccion)} />
        </div>
      ) : (
        <button
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-principal/30 text-base font-semibold text-principal transition hover:border-principal hover:bg-principal/5"
          onClick={() => setEditando('nuevo')}
          type="button"
        >
          <LuPlus aria-hidden="true" className="h-5 w-5" />
          {t(`avisos.agregarEn.${seccion}`)}
        </button>
      )}
    </Marco>
  )
}

/** Un renglon tal como se lee, con su agarradera y sus iconos. */
function Renglon({ aviso, seccion, conPalomita, arrastrando, manija, alEditar, correr }) {
  const { t } = useTranslation()
  const [borrando, setBorrando] = useState(false)
  const traducido = [aviso.texto_en ? 'EN' : null, aviso.texto_vi ? 'VI' : null].filter(Boolean).join(' · ')

  return (
    <div
      className={`flex items-start gap-1 rounded-xl border bg-superficie py-1 pr-1 ${
        arrastrando ? 'border-accion shadow-elevada' : 'border-principal/15'
      } ${aviso.activo ? '' : 'opacity-60'}`}
    >
      <button
        aria-label={t('avisos.arrastrar')}
        className={`${BOTON_ICONO} cursor-grab touch-none active:cursor-grabbing`}
        type="button"
        {...manija}
      >
        <LuGripVertical aria-hidden="true" className="h-5 w-5" />
      </button>

      {/* Tocar el texto es editarlo. */}
      <button
        className="flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-lg px-1 py-2 text-left transition hover:bg-principal/5"
        onClick={alEditar}
        title={t('avisos.tocarParaEditar')}
        type="button"
      >
        {conPalomita && (
          <LuCheck aria-hidden="true" className="mt-0.5 hidden h-5 w-5 shrink-0 text-puede-pasar sm:block" />
        )}
        <span className="min-w-0 flex-1">
          {CON_TITULO.includes(seccion) && aviso.titulo_es && (
            <span className="block text-base font-bold text-principal">{aviso.titulo_es}</span>
          )}
          <span className="block text-base text-principal">{aviso.texto_es}</span>
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-chica text-principal/70">
            {!aviso.activo && <span className="font-semibold">{t('avisos.oculta')}</span>}
            <span className="inline-flex items-center gap-1">
              <LuLanguages aria-hidden="true" className="h-3.5 w-3.5" />
              {traducido || t('avisos.soloEspanol')}
            </span>
          </span>
        </span>
      </button>

      {borrando ? (
        <div className="flex shrink-0 flex-col gap-1 py-1" role="alertdialog" aria-label={t('avisos.quitarPregunta')}>
          <button
            className="min-h-10 rounded-lg bg-peligro px-3 text-chica font-bold text-white"
            onClick={() => correr(() => eliminarAviso(aviso.id))}
            type="button"
          >
            {t('avisos.siQuitar')}
          </button>
          <button
            className="min-h-10 rounded-lg px-3 text-chica font-semibold text-principal underline"
            onClick={() => setBorrando(false)}
            type="button"
          >
            {t('avisos.no')}
          </button>
        </div>
      ) : (
        //  Uno encima del otro: le deja al texto todo el ancho posible.
        <div className="flex shrink-0 flex-col">
          <button
            aria-label={aviso.activo ? t('avisos.apagar') : t('avisos.prender')}
            className={BOTON_ICONO}
            onClick={() => correr(() => guardarAviso({ ...aEdicion(aviso, seccion), activo: !aviso.activo }))}
            title={aviso.activo ? t('avisos.apagar') : t('avisos.prender')}
            type="button"
          >
            {aviso.activo ? (
              <LuEye aria-hidden="true" className="h-5 w-5" />
            ) : (
              <LuEyeOff aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
          <button
            aria-label={t('avisos.quitar')}
            className={`${BOTON_ICONO} hover:text-ya-recibio`}
            onClick={() => setBorrando(true)}
            title={t('avisos.quitar')}
            type="button"
          >
            <LuTrash2 aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}

/** Editar ahi mismo: el espanol a la vista; ingles y vietnamita, plegados. */
function EditorAviso({ inicial, alGuardar, alCancelar }) {
  const { t } = useTranslation()
  const [edicion, setEdicion] = useState(inicial)
  const [conTraducciones, setConTraducciones] = useState(Boolean(inicial.textoEn || inicial.textoVi))
  const [guardando, setGuardando] = useState(false)
  const conTitulo = CON_TITULO.includes(inicial.seccion)
  const texto = useRef(null)

  //  Al abrirse, el cursor ya esta al final del texto, listo para escribir.
  useEffect(() => {
    const campo = texto.current
    if (!campo) return
    campo.focus()
    campo.setSelectionRange(campo.value.length, campo.value.length)
  }, [])

  const cambiar = (campo) => (e) => setEdicion({ ...edicion, [campo]: e.target.value })

  async function guardar(evento) {
    evento.preventDefault()
    setGuardando(true)
    const listo = await alGuardar(edicion)
    if (!listo) setGuardando(false)
  }

  return (
    <form className="space-y-2 rounded-xl border-2 border-principal bg-superficie p-3" onSubmit={guardar}>
      {conTitulo && (
        <input
          aria-label={t(`avisos.tituloCampo.${inicial.seccion}`)}
          className={`${ESTILO_CAMPO} font-bold`}
          onChange={cambiar('tituloEs')}
          placeholder={t(`avisos.tituloCampo.${inicial.seccion}`)}
          value={edicion.tituloEs}
        />
      )}
      <textarea
        aria-label={t(`avisos.cuerpo.${inicial.seccion}`, { defaultValue: t('avisos.enEspanol') })}
        className={`${ESTILO_CAMPO} min-h-20`}
        onChange={cambiar('textoEs')}
        placeholder={t(`avisos.cuerpo.${inicial.seccion}`, { defaultValue: t('avisos.enEspanol') })}
        ref={texto}
        value={edicion.textoEs}
      />

      <button
        aria-expanded={conTraducciones}
        className="inline-flex min-h-10 items-center gap-1.5 text-base font-semibold text-principal underline underline-offset-4"
        onClick={() => setConTraducciones((abierto) => !abierto)}
        type="button"
      >
        <LuLanguages aria-hidden="true" className="h-4 w-4" />
        {t('avisos.traducciones')}
      </button>

      {conTraducciones && (
        <div className="space-y-2">
          {conTitulo && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                aria-label={t('avisos.enIngles')}
                className={ESTILO_CAMPO}
                onChange={cambiar('tituloEn')}
                placeholder={`${t(`avisos.tituloCampo.${inicial.seccion}`)} · EN`}
                value={edicion.tituloEn}
              />
              <input
                aria-label={t('avisos.enVietnamita')}
                className={ESTILO_CAMPO}
                onChange={cambiar('tituloVi')}
                placeholder={`${t(`avisos.tituloCampo.${inicial.seccion}`)} · VI`}
                value={edicion.tituloVi}
              />
            </div>
          )}
          <textarea
            aria-label={t('avisos.enIngles')}
            className={`${ESTILO_CAMPO} min-h-16`}
            onChange={cambiar('textoEn')}
            placeholder={t('avisos.enIngles')}
            value={edicion.textoEn}
          />
          <textarea
            aria-label={t('avisos.enVietnamita')}
            className={`${ESTILO_CAMPO} min-h-16`}
            onChange={cambiar('textoVi')}
            placeholder={t('avisos.enVietnamita')}
            value={edicion.textoVi}
          />
          <p className="text-chica text-principal/70">{t('avisos.sinTraduccion')}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-12 items-center rounded-xl bg-marca px-5 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          disabled={guardando || !edicion.textoEs.trim() || (inicial.seccion === 'preguntas' && !edicion.tituloEs.trim())}
          type="submit"
        >
          {guardando ? t('avisos.guardando') : t('avisos.guardar')}
        </button>
        <button
          className="inline-flex min-h-12 items-center rounded-xl px-4 text-base font-semibold text-principal underline underline-offset-4"
          onClick={alCancelar}
          type="button"
        >
          {t('avisos.cancelar')}
        </button>
      </div>
    </form>
  )
}
