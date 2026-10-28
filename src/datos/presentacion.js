/**
 * El video de Cajita de Bendicion (componentes/PresentacionCajita.jsx): las
 * escenas, en orden, y cuanto dura cada una.
 */
export const ESCENAS = ['portada', 'comoVienes', 'cita', 'codigo', 'despensa', 'privado']

export const MS_ESCENA = 5500

/**
 * Lo que sigue despues de "paso" milisegundos: la misma escena un poco mas
 * avanzada, o la siguiente. Despues de la ultima, ESCENAS.length: el final
 * ("Haz tu cita"), donde se queda.
 */
export function avanzar({ escena, transcurrido }, paso) {
  if (escena >= ESCENAS.length) return { escena: ESCENAS.length, transcurrido: 0 }
  const nuevo = transcurrido + paso
  if (nuevo >= MS_ESCENA) return { escena: escena + 1, transcurrido: 0 }
  return { escena, transcurrido: nuevo }
}
