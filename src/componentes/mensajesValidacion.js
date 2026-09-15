/**
 * Convierte los codigos de validaciones.js y telefono.js en el mensaje que
 * ve la persona. Lo usan el registro publico y el del panel.
 */

/** campo: 'nombres' o 'apellidos'. */
export function mensajeNombre(t, codigo, campo) {
  return codigo ? t(`validacion.${campo}.${codigo}`) : undefined
}

export function mensajeCorreo(t, codigo) {
  return codigo ? t(`validacion.correo.${codigo}`) : undefined
}

/** "MX" -> "Mexico" en el idioma de la pagina. */
export function nombrePais(codigo, idioma) {
  try {
    return new Intl.DisplayNames([idioma], { type: 'region' }).of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

export function mensajeTelefono(t, resultado, idioma) {
  if (!resultado || resultado.valido) return undefined

  const { error, min, max, llevan, pais } = resultado
  const digitos = min === max ? String(max) : t('validacion.telefono.entre', { min, max })

  return t(`validacion.telefono.${error}`, { pais: nombrePais(pais, idioma), digitos, llevan, max })
}

/** Los codigos de validarDomicilio() -> { campo: mensaje }. */
export function mensajesDomicilio(t, errores) {
  return Object.fromEntries(
    Object.entries(errores).map(([campo, codigo]) => [campo, t(`domicilio.errores.${campo}.${codigo}`)]),
  )
}
