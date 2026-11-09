/**
 * La ayuda de la fila a pie, en el escaner (9 de noviembre de 2026): el
 * video de como dar turnos, por partes, un dia normal paso a paso, que
 * hacer en cada caso y que quiere decir cada palabra.
 *
 * A los voluntarios mayores se les complica la fila a pie: el turno que se
 * paso, el que saco dos turnos, el que no trae su QR. La fila de carros es
 * escanear y ya, y no lleva ayuda aparte.
 *
 * El video esta en public/medios y se hizo con las pantallas de verdad y una
 * voz grabada por computadora. Si se vuelve a grabar, aqui se cambia en que
 * segundo empieza cada parte.
 */
export const VIDEO_AYUDA = '/medios/guia-fila-a-pie.mp4'
export const PORTADA_AYUDA = '/medios/guia-fila-a-pie.jpg'

//  Las partes del video, en orden, y el segundo en que empieza cada una.
export const PARTES_VIDEO = [
  { clave: 'bienvenida', inicio: 0 },
  { clave: 'comoFunciona', inicio: 25 },
  { clave: 'tresCosas', inicio: 61 },
  { clave: 'pantalla', inicio: 99 },
  { clave: 'empezar', inicio: 137 },
  { clave: 'entregar', inicio: 172 },
  { clave: 'equivocas', inicio: 211 },
  { clave: 'sinQr', inicio: 231 },
  { clave: 'noEsta', inicio: 267 },
  { clave: 'tarde', inicio: 299 },
  { clave: 'dosTurnos', inicio: 346 },
  { clave: 'mismoNumero', inicio: 402 },
  { clave: 'sinTelefono', inicio: 422 },
  { clave: 'avisos', inicio: 455 },
  { clave: 'terminar', inicio: 493 },
  { clave: 'recordar', inicio: 512 },
]

//  Un dia de entrega normal. `parte`: la del video que lo ensena.
export const PASOS_DEL_DIA = [
  { clave: 'elegir', parte: 'pantalla' },
  { clave: 'empezar', parte: 'empezar' },
  { clave: 'llamar', parte: 'entregar' },
  { clave: 'escanear', parte: 'entregar' },
  { clave: 'color', parte: 'entregar' },
  { clave: 'siguiente', parte: 'noEsta' },
  { clave: 'terminar', parte: 'terminar' },
]

//  ¿Que hago si...? Cada caso: lo que se ve (ves), cuantos pasos tiene
//  (haz1, haz2...), si hay algo que decirle a la persona (dile) y la parte
//  del video. En orden de lo que mas pasa.
export const CASOS = [
  { clave: 'sinQr', haz: 4, parte: 'sinQr' },
  { clave: 'noEsta', haz: 3, parte: 'noEsta' },
  { clave: 'tarde', ves: true, haz: 2, dile: true, parte: 'tarde' },
  { clave: 'dosTurnos', haz: 4, dile: true, parte: 'dosTurnos' },
  { clave: 'mismoNumero', haz: 3, parte: 'mismoNumero' },
  { clave: 'sinTelefono', haz: 4, parte: 'sinTelefono' },
  { clave: 'equivoque', haz: 3, parte: 'equivocas' },
  { clave: 'porError', haz: 2, parte: 'noEsta' },
  { clave: 'antes', ves: true, haz: 1, parte: null },
  { clave: 'yaRecibio', ves: true, haz: 1, parte: 'entregar' },
  { clave: 'anulado', ves: true, haz: 1, dile: true, parte: 'avisos' },
  { clave: 'otraFila', ves: true, haz: 1, parte: 'avisos' },
  { clave: 'cartel', ves: true, haz: 1, parte: 'avisos' },
  { clave: 'sinSenal', ves: true, haz: 2, parte: 'avisos' },
  { clave: 'camara', haz: 2, parte: null },
  { clave: 'noEmpieza', haz: 2, parte: 'empezar' },
  { clave: 'terminar', haz: 3, parte: 'terminar' },
]

//  Las palabras de la fila a pie, en el orden en que se aprenden.
export const PALABRAS = [
  'turno',
  'queVa',
  'qr',
  'cb',
  'empezar',
  'noSePresento',
  'regresar',
  'anular',
  'cancelar',
  'turnoNuevo',
  'terminar',
  'colores',
]

/** 98 -> "1:38". */
export function reloj(segundos) {
  const s = Math.max(0, Math.floor(Number(segundos) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** La parte del video que se esta viendo: la ultima que ya empezo. */
export function parteEn(segundos, partes = PARTES_VIDEO) {
  let actual = partes[0]?.clave ?? null
  for (const parte of partes) {
    if (Number(segundos) >= parte.inicio) actual = parte.clave
  }
  return actual
}

/** En que segundo empieza una parte (null si no existe). */
export function inicioDe(clave, partes = PARTES_VIDEO) {
  return partes.find((parte) => parte.clave === clave)?.inicio ?? null
}
