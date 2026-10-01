import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCarSide, FaUserGroup } from 'react-icons/fa6'
import { LuCircleHelp } from 'react-icons/lu'
import Campo from './Campo'

const OPCIONES = [
  { valor: 'propio', Icono: FaCarSide },
  { valor: 'acompanante', Icono: FaUserGroup },
]

/**
 * "¿Cómo vienes?" en el registro de carros: con tu carro (apartas un lugar)
 * o en el carro de alguien que ya tiene cita (no ocupas otro lugar: pones
 * el codigo de quien maneja). Un lugar es un carro (seccion 39 de la base).
 *
 * El "?" explica para que sirve, sin llenar la pantalla de texto.
 *
 * En el panel (panel) lo lee el personal, que registra a otra persona: los
 * textos hablan de ella ("Trae su carro") y no de quien lee.
 */
export default function ComoVienes({ valor, alCambiar, codigo, alCambiarCodigo, alSalirCodigo, error, panel = false }) {
  const { t } = useTranslation()
  const [explicando, setExplicando] = useState(false)
  const texto = (clave) => t(panel ? `acompanante.panel.${clave}` : `acompanante.${clave}`)

  return (
    <fieldset className="rounded-2xl border border-principal/20 p-4">
      <legend className="flex items-center gap-2 px-1 text-base font-bold text-principal">
        {texto('titulo')}
        <button
          aria-expanded={explicando}
          aria-label={t('acompanante.queEs')}
          className="flex h-9 w-9 items-center justify-center rounded-full text-accion transition hover:bg-accion/15"
          onClick={() => setExplicando((abierto) => !abierto)}
          title={t('acompanante.queEs')}
          type="button"
        >
          <LuCircleHelp aria-hidden="true" className="h-6 w-6" />
        </button>
      </legend>

      {explicando && (
        <p className="mb-3 rounded-xl bg-accion/10 p-3 text-base text-principal">{texto('explicacion')}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {OPCIONES.map(({ valor: opcion, Icono }) => (
          <label
            className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition ${
              valor === opcion ? 'border-accion bg-accion/10' : 'border-principal/20 hover:border-principal/50'
            }`}
            key={opcion}
          >
            <input
              checked={valor === opcion}
              className="mt-1 h-5 w-5 shrink-0"
              name="como-vienes"
              onChange={() => alCambiar(opcion)}
              type="radio"
            />
            <Icono aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accion" />
            <span>
              <span className="block text-base font-semibold text-principal">{texto(opcion)}</span>
              <span className="block text-chica text-principal/70">{texto(`${opcion}Ayuda`)}</span>
            </span>
          </label>
        ))}
      </div>

      {valor === 'acompanante' && (
        <div className="mt-3">
          <Campo
            autoCapitalize="characters"
            error={error}
            etiqueta={t('acompanante.codigo')}
            id="codigoDuenio"
            onBlur={alSalirCodigo}
            onChange={(e) => alCambiarCodigo(e.target.value)}
            placeholder="CB-4871"
            value={codigo}
          />
          <p className="mt-1 text-chica text-principal/70">{texto('codigoAyuda')}</p>
        </div>
      )}
    </fieldset>
  )
}
