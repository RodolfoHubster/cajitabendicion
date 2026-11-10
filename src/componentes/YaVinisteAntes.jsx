import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuUserCheck } from 'react-icons/lu'
import Boton from './Boton'
import CampoCodigo from './CampoCodigo'
import CampoTelefono from './CampoTelefono'
import { mensajeTelefono } from './mensajesValidacion'
import { leerMisCitas } from '../datos/misCitas'
import { abrirMisDatos } from '../datos/registro'
import { normalizarTelefono } from '../datos/telefono'

//  El codigo de su ultima cita en este telefono, si la hay: ya va escrito.
function codigoGuardado() {
  const conCodigo = leerMisCitas().filter((cita) => cita.codigo)
  const ultima = conCodigo[conCodigo.length - 1]
  return ultima ? ultima.codigo.replace(/\D/g, '').slice(0, 5) : ''
}

/**
 * "¿Ya viniste antes?" (seccion 56): con su codigo CB y su telefono no vuelve
 * a escribir sus datos. Sus datos NO llegan a la pantalla: la base solo dice
 * su nombre y una inicial ("Maria P.") para que confirme que es ella, y da
 * una llave de 15 minutos para apartar el lugar.
 *
 * alAbrir({ llave, nombre }) cuando la reconoce.
 */
export default function YaVinisteAntes({ alAbrir }) {
  const { t, i18n } = useTranslation()
  const [abierto, setAbierto] = useState(false)
  const [numeros, setNumeros] = useState(codigoGuardado)
  const [pais, setPais] = useState('US')
  const [telefono, setTelefono] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [intento, setIntento] = useState(false)

  const telefonoRevisado = normalizarTelefono(pais, telefono)
  const errorTelefono = intento ? mensajeTelefono(t, telefonoRevisado, i18n.language) : undefined
  const faltaCodigo = intento && numeros.length < 4

  async function buscar(evento) {
    evento.preventDefault()
    setIntento(true)
    setAviso(null)
    if (numeros.length < 4 || !telefonoRevisado.valido) return

    setBuscando(true)
    try {
      const respuesta = await abrirMisDatos(`CB-${numeros}`, telefonoRevisado.e164)
      if (respuesta.resultado === 'LISTO') {
        alAbrir({ llave: respuesta.llave, nombre: respuesta.nombre })
        return
      }
      setAviso({ codigo: respuesta.resultado, minutos: Math.max(1, Math.ceil((respuesta.segundos ?? 900) / 60)) })
    } catch (e) {
      setAviso({ codigo: e.message === 'SIN_CONEXION' ? 'SIN_CONEXION' : 'ERROR_DESCONOCIDO' })
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="mb-4 rounded-2xl border-2 border-accion bg-accion/10 p-4">
      <p className="flex items-center gap-2 text-lg font-bold text-principal">
        <LuUserCheck aria-hidden="true" className="h-6 w-6 shrink-0 text-accion" />
        <span className="min-w-0">{t('registro.yaViniste.titulo')}</span>
      </p>
      <p className="mt-1 text-base text-principal">{t('registro.yaViniste.ayuda')}</p>

      {!abierto ? (
        <Boton className="mt-3" onClick={() => setAbierto(true)} type="button">
          {t('registro.yaViniste.abrir')}
        </Boton>
      ) : (
        <form className="mt-3 space-y-3" noValidate onSubmit={buscar}>
          <div>
            <CampoCodigo
              alCambiar={(nuevos) => {
                setNumeros(nuevos)
                setAviso(null)
              }}
              ayuda={t('registro.yaViniste.codigoAyuda')}
              etiqueta={t('registro.yaViniste.codigo')}
              id="mi-codigo"
              valor={numeros}
            />
            {faltaCodigo && (
              <p className="mt-1 text-base font-semibold text-ya-recibio">{t('registro.yaViniste.faltaCodigo')}</p>
            )}
          </div>

          <CampoTelefono
            alCambiarPais={setPais}
            alCambiarValor={(valor) => {
              setTelefono(valor)
              setAviso(null)
            }}
            error={errorTelefono}
            etiqueta={t('registro.yaViniste.telefono')}
            id="mi-telefono"
            pais={pais}
            valor={telefono}
          />

          {aviso && (
            <p className="rounded-xl bg-ya-recibio/10 p-3 text-base font-semibold text-ya-recibio" role="alert">
              {aviso.codigo === 'NO_COINCIDE' || aviso.codigo === 'DEMASIADOS_INTENTOS'
                ? t(`registro.yaViniste.${aviso.codigo}`, { minutos: aviso.minutos })
                : t(`registro.errores.${aviso.codigo}`)}
            </p>
          )}

          <Boton disabled={buscando} type="submit">
            {buscando ? t('registro.yaViniste.buscando') : t('registro.yaViniste.buscar')}
          </Boton>
          <button
            className="inline-flex min-h-12 w-full items-center justify-center text-base font-semibold text-principal underline underline-offset-4"
            onClick={() => {
              setAbierto(false)
              setAviso(null)
              setIntento(false)
            }}
            type="button"
          >
            {t('registro.yaViniste.cerrar')}
          </button>
        </form>
      )}
    </div>
  )
}
