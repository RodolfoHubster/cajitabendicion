/**
 * El codigo corto (CB-4871) como lo teclea la gente.
 *
 *   "cb 4871", "CB4871", "4871", "cb-487l", "CBO871"  ->  "CB-4871" / "CB-0871"
 *
 * La O se lee como cero y la I y la L como uno, solo en los cuatro
 * digitos: en un teclado de telefono, con prisa y con el sol de frente,
 * se confunden. Tiene que haber al menos un digito: "Lili" es un nombre,
 * no un codigo.
 *
 * Es la MISMA regla que normalizar_codigo_corto() en schema.sql (seccion
 * 33). Se repite aqui para que el escaneo la aplique aunque la base todavia
 * no tenga la migracion. Las pruebas de los dos lados usan los mismos
 * ejemplos.
 */
export function normalizarCodigoCorto(texto) {
  const original = String(texto ?? '')
  const compacto = original.toUpperCase().replace(/[^A-Z0-9]/g, '')

  if (/^(CB|C8)?[0-9OIL]{4}$/.test(compacto) && /\d/.test(compacto)) {
    const digitos = compacto.slice(-4).replace(/O/g, '0').replace(/[IL]/g, '1')
    return `CB-${digitos}`
  }

  return original.trim().toUpperCase()
}

/** Si lo tecleado se lee como un codigo corto completo. */
export function pareceCodigoCorto(texto) {
  return /^CB-\d{4}$/.test(normalizarCodigoCorto(texto))
}

/**
 * Lo que se manda a buscar: el codigo ya limpio si parece codigo, o el
 * texto tal cual si es un nombre.
 */
export function textoParaBuscar(texto) {
  return pareceCodigoCorto(texto) ? normalizarCodigoCorto(texto) : String(texto ?? '').trim()
}
