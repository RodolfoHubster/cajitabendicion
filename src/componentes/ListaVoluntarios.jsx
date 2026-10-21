import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuPencil, LuQrCode, LuRefreshCw, LuUserPlus } from 'react-icons/lu'
import Boton from './Boton'
import Campo from './Campo'
import Tarjeta from './Tarjeta'
import VentanaCredencial from './VentanaCredencial'
import { EsqueletoLista } from './Esqueleto'
import { horaDeMarca } from '../datos/filaAPie'
import {
  activarVoluntario,
  buscarVoluntarios,
  editarVoluntario,
  nuevoQrVoluntario,
  registrarVoluntario,
} from '../datos/voluntarios'

const BOTON =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-principal/25 bg-superficie px-3 text-base font-semibold text-principal transition hover:border-principal disabled:cursor-not-allowed disabled:opacity-50'

const BOTON_PELIGRO =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-peligro px-4 text-base font-bold text-white disabled:opacity-50'

/**
 * Los voluntarios (seccion 48): registrarlos (nombre y, si quieren, un
 * telefono o correo), ver y mandar su credencial, cambiarles el nombre,
 * darlos de baja y cambiarles el QR si se perdio.
 */
export default function ListaVoluntarios({ voluntarios, alCambiar }) {
  const { t } = useTranslation()
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [credencial, setCredencial] = useState(null)
  const [filtro, setFiltro] = useState('')
  //  { id, nombre, contacto } mientras se cambia.
  const [editando, setEditando] = useState(null)
  //  { voluntario, accion: 'baja' | 'qr' } mientras se pregunta.
  const [preguntando, setPreguntando] = useState(null)

  async function hacer(accion, avisar) {
    setOcupado(true)
    setError(null)
    setAviso(null)
    try {
      const respuesta = await accion()
      if (avisar) setAviso(avisar)
      alCambiar()
      return respuesta
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setOcupado(false)
    }
  }

  async function registrar(evento) {
    evento.preventDefault()
    const nuevo = await hacer(() => registrarVoluntario(nombre, contacto), 'registrado')
    if (nuevo) {
      setNombre('')
      setContacto('')
      //  Su credencial de una vez, para mandarsela o imprimirla.
      setCredencial({ ...nuevo, activo: true })
    }
  }

  async function guardarEdicion(evento) {
    evento.preventDefault()
    const listo = await hacer(() => editarVoluntario(editando.id, editando.nombre, editando.contacto), 'guardado')
    if (listo) setEditando(null)
  }

  async function confirmar() {
    const { voluntario, accion } = preguntando
    setPreguntando(null)
    if (accion === 'baja') {
      await hacer(() => activarVoluntario(voluntario.id, false), 'baja')
      return
    }
    const token = await hacer(() => nuevoQrVoluntario(voluntario.id), 'nuevoQr')
    if (token) setCredencial({ ...voluntario, token })
  }

  const lista = voluntarios ?? []
  const vistos = filtro.trim() ? buscarVoluntarios(lista, filtro, lista.length) : lista

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <LuUserPlus aria-hidden="true" className="h-6 w-6 text-accion" />
          {t('voluntarios.registrar.titulo')}
        </h2>
        <p className="mb-3 text-base text-principal/70">{t('voluntarios.registrar.ayuda')}</p>
        <form className="space-y-3" onSubmit={registrar}>
          <Campo
            autoComplete="off"
            etiqueta={t('voluntarios.registrar.nombre')}
            id="voluntario-nombre"
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            required
            value={nombre}
          />
          <Campo
            autoComplete="off"
            etiqueta={t('voluntarios.registrar.contacto')}
            id="voluntario-contacto"
            maxLength={120}
            onChange={(e) => setContacto(e.target.value)}
            value={contacto}
          />
          <p className="-mt-1 text-base text-principal/70">{t('voluntarios.registrar.contactoAyuda')}</p>
          <Boton disabled={ocupado || nombre.trim().length < 2} type="submit">
            {t('voluntarios.registrar.boton')}
          </Boton>
        </form>
      </Tarjeta>

      <Tarjeta>
        <h2 className="text-xl font-bold">{t('voluntarios.lista.titulo', { count: lista.filter((v) => v.activo).length })}</h2>

        {aviso && (
          <p className="mt-2 rounded-xl bg-puede-pasar/10 p-3 text-base font-semibold text-puede-pasar" role="status">
            {t(`voluntarios.lista.avisos.${aviso}`)}
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-xl bg-ya-recibio/10 p-3 text-base text-ya-recibio" role="alert">
            {t(`voluntarios.errores.${error}`, { defaultValue: t('voluntarios.errores.ERROR_DESCONOCIDO') })}
          </p>
        )}

        {lista.length > 6 && (
          <div className="mt-3">
            <Campo
              etiqueta={t('voluntarios.lista.buscar')}
              id="filtro-voluntarios"
              onChange={(e) => setFiltro(e.target.value)}
              type="search"
              value={filtro}
            />
          </div>
        )}

        {voluntarios === null ? (
          <div className="mt-3">
            <EsqueletoLista texto={t('voluntarios.cargando')} />
          </div>
        ) : lista.length === 0 ? (
          <p className="mt-2 text-base text-principal/70">{t('voluntarios.lista.vacia')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-principal/10">
            {vistos.map((v) => (
              <li className={`py-3 ${v.activo ? '' : 'opacity-70'}`} key={v.id}>
                {editando?.id === v.id ? (
                  <form className="space-y-3" onSubmit={guardarEdicion}>
                    <Campo
                      etiqueta={t('voluntarios.registrar.nombre')}
                      id={`editar-nombre-${v.id}`}
                      maxLength={80}
                      onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                      required
                      value={editando.nombre}
                    />
                    <Campo
                      etiqueta={t('voluntarios.registrar.contacto')}
                      id={`editar-contacto-${v.id}`}
                      maxLength={120}
                      onChange={(e) => setEditando({ ...editando, contacto: e.target.value })}
                      value={editando.contacto}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button className={BOTON} disabled={ocupado || editando.nombre.trim().length < 2} type="submit">
                        {t('voluntarios.lista.guardar')}
                      </button>
                      <button className={BOTON} onClick={() => setEditando(null)} type="button">
                        {t('voluntarios.lista.cancelar')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-principal">{v.nombre}</p>
                        {v.contacto && <p className="break-all text-base text-principal/70">{v.contacto}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {!v.activo && (
                          <span className="rounded-full bg-ya-recibio/10 px-3 py-1 text-base font-semibold text-ya-recibio">
                            {t('voluntarios.lista.deBaja')}
                          </span>
                        )}
                        {v.dentro_desde && (
                          <span className="rounded-full bg-puede-pasar/15 px-3 py-1 text-base font-semibold text-puede-pasar">
                            {t('voluntarios.adentroDesde', { hora: horaDeMarca(v.dentro_desde) })}
                          </span>
                        )}
                        {v.sin_salida > 0 && (
                          <span className="rounded-full bg-accion/25 px-3 py-1 text-base font-semibold text-principal">
                            {t('voluntarios.lista.sinSalida', { count: v.sin_salida })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className={BOTON} onClick={() => setCredencial(v)} type="button">
                        <LuQrCode aria-hidden="true" className="h-5 w-5 text-accion" />
                        {t('voluntarios.lista.credencial')}
                      </button>
                      <button
                        className={BOTON}
                        onClick={() => setEditando({ id: v.id, nombre: v.nombre, contacto: v.contacto ?? '' })}
                        type="button"
                      >
                        <LuPencil aria-hidden="true" className="h-4 w-4" />
                        {t('voluntarios.lista.editar')}
                      </button>
                      {v.activo ? (
                        <>
                          <button className={BOTON} onClick={() => setPreguntando({ voluntario: v, accion: 'qr' })} type="button">
                            <LuRefreshCw aria-hidden="true" className="h-4 w-4" />
                            {t('voluntarios.lista.nuevoQr')}
                          </button>
                          <button
                            className={`${BOTON} text-ya-recibio`}
                            onClick={() => setPreguntando({ voluntario: v, accion: 'baja' })}
                            type="button"
                          >
                            {t('voluntarios.lista.darDeBaja')}
                          </button>
                        </>
                      ) : (
                        <button
                          className={BOTON}
                          disabled={ocupado}
                          onClick={() => hacer(() => activarVoluntario(v.id, true), 'alta')}
                          type="button"
                        >
                          {t('voluntarios.lista.darDeAlta')}
                        </button>
                      )}
                    </div>

                    {preguntando?.voluntario.id === v.id && (
                      <div
                        aria-labelledby={`pregunta-${v.id}`}
                        className="mt-3 rounded-xl border-2 border-ya-recibio/40 bg-ya-recibio/5 p-3"
                        role="alertdialog"
                      >
                        <p className="text-base font-semibold" id={`pregunta-${v.id}`}>
                          {t(`voluntarios.lista.preguntar.${preguntando.accion}`, { nombre: v.nombre })}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button className={BOTON_PELIGRO} disabled={ocupado} onClick={confirmar} type="button">
                            {t(`voluntarios.lista.preguntar.si_${preguntando.accion}`)}
                          </button>
                          <button className={BOTON} onClick={() => setPreguntando(null)} type="button">
                            {t('voluntarios.lista.cancelar')}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {credencial && <VentanaCredencial alCerrar={() => setCredencial(null)} voluntario={credencial} />}
    </div>
  )
}
