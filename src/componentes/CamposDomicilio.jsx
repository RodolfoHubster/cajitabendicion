import { useTranslation } from 'react-i18next'
import { LuCircleCheck } from 'react-icons/lu'
import Campo from './Campo'
import Selector from './Selector'
import { PAISES_DOMICILIO, coloniasDe } from '../datos/domicilio'

/**
 * Domicilio en Mexico o Estados Unidos (California y Baja California).
 *
 * Con el codigo postal se llenan solos la ciudad y el estado; en Mexico la
 * colonia se elige de la lista de ese codigo, asi no se escribe cualquier
 * cosa. En Estados Unidos el domicilio va en un solo renglon, como se
 * acostumbra ("7855 Lansing Dr"); en Mexico, calle y numero por separado.
 * La pagina guarda el valor, busca el codigo (useCodigoPostal) y valida.
 */
export default function CamposDomicilio({ valor, alCambiar, busqueda, errorDe, tocar, panel = false }) {
  const { t } = useTranslation()
  const { pais, codigoPostal, colonia, calle, numero, interior, sinDomicilio } = valor

  const colonias = coloniasDe(busqueda)
  const lugar = busqueda.estado === 'listo' ? (busqueda.filas[0] ?? null) : null
  const errorCodigo = errorDe('codigoPostal')

  const cambiar = (campo, dato) => alCambiar({ ...valor, [campo]: dato })

  function elegirPais(nuevo) {
    // Otro pais, otro catalogo: el codigo postal y la colonia de antes ya no aplican.
    if (nuevo !== pais) alCambiar({ ...valor, pais: nuevo, codigoPostal: '', colonia: '' })
  }

  return (
    <fieldset className="space-y-4 rounded-2xl border border-principal/15 p-4">
      <legend className="px-1 text-lg font-bold text-principal">
        {t(panel ? 'domicilio.tituloPanel' : 'domicilio.titulo')}
      </legend>
      <p className="text-base text-principal/70">{t('domicilio.zona')}</p>

      <div aria-label={t('domicilio.pais')} className="grid grid-cols-2 gap-2" role="radiogroup">
        {PAISES_DOMICILIO.map((codigo) => (
          <button
            aria-checked={pais === codigo}
            className={`min-h-14 rounded-xl border px-3 text-base font-semibold transition ${
              pais === codigo
                ? 'border-principal bg-principal text-white'
                : 'border-principal/25 bg-white text-principal hover:border-principal'
            }`}
            key={codigo}
            onClick={() => elegirPais(codigo)}
            role="radio"
            type="button"
          >
            {t(`domicilio.paises.${codigo}`)}
          </button>
        ))}
      </div>

      <div>
        <Campo
          autoComplete="postal-code"
          error={errorCodigo}
          etiqueta={t(`domicilio.codigoPostal.${pais}`)}
          id="codigoPostal"
          inputMode="numeric"
          maxLength={10}
          onBlur={() => tocar('codigoPostal')}
          onChange={(e) => alCambiar({ ...valor, codigoPostal: e.target.value, colonia: '' })}
          placeholder={pais === 'MX' ? '22000' : '92105'}
          value={codigoPostal}
        />
        {!errorCodigo && busqueda.estado === 'buscando' && (
          <p className="mt-1 text-base text-principal/60" role="status">
            {t('domicilio.buscando')}
          </p>
        )}
        {lugar && (
          <p className="mt-1 flex items-center gap-2 text-base font-semibold text-puede-pasar" role="status">
            <LuCircleCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
            {t('domicilio.encontrado', { ciudad: lugar.ciudad, estado: lugar.estado })}
          </p>
        )}
      </div>

      {pais === 'MX' && colonias.length > 0 && (
        <Selector
          error={errorDe('colonia')}
          etiqueta={t(sinDomicilio ? 'domicilio.coloniaOpcional' : 'domicilio.colonia')}
          id="colonia"
          onBlur={() => tocar('colonia')}
          onChange={(e) => cambiar('colonia', e.target.value)}
          value={colonia}
        >
          <option value="">{t('domicilio.elegirColonia')}</option>
          {colonias.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </Selector>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-principal/5 p-3" htmlFor="sinDomicilio">
        <input
          checked={sinDomicilio}
          className="mt-1 h-5 w-5 shrink-0 accent-principal"
          id="sinDomicilio"
          onChange={(e) => cambiar('sinDomicilio', e.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block text-base font-semibold text-principal">{t('domicilio.sinDomicilio')}</span>
          <span className="block text-base text-principal/70">{t('domicilio.sinDomicilioAyuda')}</span>
        </span>
      </label>

      {!sinDomicilio && (
        <div
          className={`grid items-start gap-4 ${
            pais === 'US'
              ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]'
              : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,10rem)]'
          }`}
        >
          <Campo
            autoComplete="address-line1"
            error={errorDe('calle')}
            etiqueta={t(`domicilio.calle.${pais}`)}
            id="calle"
            maxLength={120}
            onBlur={() => tocar('calle')}
            onChange={(e) => cambiar('calle', e.target.value)}
            placeholder={pais === 'US' ? '4250 El Cajon Blvd' : undefined}
            value={calle}
          />

          {/* En Estados Unidos el numero va dentro del domicilio. */}
          {pais === 'MX' && (
            <Campo
              autoComplete="off"
              error={errorDe('numero')}
              etiqueta={t('domicilio.numero.MX')}
              id="numero"
              maxLength={12}
              onBlur={() => tocar('numero')}
              onChange={(e) => cambiar('numero', e.target.value)}
              value={numero}
            />
          )}

          <Campo
            autoComplete="address-line2"
            error={errorDe('interior')}
            etiqueta={t(`domicilio.interior.${pais}`)}
            id="interior"
            maxLength={10}
            onBlur={() => tocar('interior')}
            onChange={(e) => cambiar('interior', e.target.value)}
            value={interior}
          />
        </div>
      )}
    </fieldset>
  )
}
