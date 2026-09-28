import { useTranslation } from 'react-i18next'
import { FaCarSide, FaPersonWalking } from 'react-icons/fa6'
import {
  LuCalendarClock,
  LuCalendarDays,
  LuCircleCheck,
  LuCircleX,
  LuClock,
  LuMenu,
  LuPencilLine,
  LuQrCode,
  LuSearch,
  LuTriangleAlert,
  LuUndo2,
  LuUserX,
  LuUsers,
} from 'react-icons/lu'
import { TechoSvg } from '../Logo'

/**
 * Las escenas animadas de la guia del panel: dibujos chicos de lo que pasa
 * en cada pantalla.
 *
 * Hechas con CSS (index.css, las clases .guia-*) y no con GIF: pesan casi
 * nada, se ven nitidas en cualquier pantalla, siguen el modo oscuro y se
 * quedan quietas para quien pidio menos movimiento. Son decoracion: el texto
 * del paso explica todo (la guia las pone con aria-hidden). Los nombres y
 * codigos son de ejemplo.
 */

//  Los modulos de un QR de mentiras: el de verdad no hace falta aqui.
const MODULOS = [
  [9, 1], [11, 1], [9, 3], [10, 4], [12, 4], [9, 6], [11, 6],
  [1, 9], [3, 9], [5, 10], [7, 9], [2, 11], [4, 12], [6, 11],
  [9, 9], [10, 10], [12, 9], [14, 9], [16, 10], [18, 9], [19, 11],
  [9, 12], [11, 13], [13, 11], [15, 12], [17, 13], [19, 14], [10, 15],
  [12, 16], [14, 15], [16, 17], [18, 16], [9, 18], [11, 19], [13, 18],
  [15, 19], [17, 19], [19, 18], [20, 20],
]

function QrDibujo({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 23 23">
      <rect className="fill-superficie" height="23" rx="2" width="23" />
      {[
        [1, 1],
        [15, 1],
        [1, 15],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect className="fill-principal" height="7" width="7" x={x} y={y} />
          <rect className="fill-superficie" height="5" width="5" x={x + 1} y={y + 1} />
          <rect className="fill-principal" height="3" width="3" x={x + 2} y={y + 2} />
        </g>
      ))}
      {MODULOS.map(([x, y]) => (
        <rect className="fill-principal" height="1.4" key={`${x}-${y}`} width="1.4" x={x} y={y} />
      ))}
    </svg>
  )
}

function Telefono({ children }) {
  return (
    <div className="relative h-48 w-28 shrink-0 rounded-[1.6rem] border-[5px] border-marca bg-marca shadow-elevada">
      <div className="relative h-full w-full overflow-hidden rounded-[1.2rem] bg-superficie">{children}</div>
    </div>
  )
}

/** Las cuatro esquinas del cuadro guia, como en el escaner de verdad. */
function Esquinas() {
  const base = 'absolute h-5 w-5 border-white'
  return (
    <>
      <span className={`${base} left-0 top-0 rounded-tl-lg border-l-[3px] border-t-[3px]`} />
      <span className={`${base} right-0 top-0 rounded-tr-lg border-r-[3px] border-t-[3px]`} />
      <span className={`${base} bottom-0 left-0 rounded-bl-lg border-b-[3px] border-l-[3px]`} />
      <span className={`${base} bottom-0 right-0 rounded-br-lg border-b-[3px] border-r-[3px]`} />
    </>
  )
}

const CAJA = 'flex h-56 flex-col items-center justify-center gap-2 px-4'
const TARJETA = 'w-full max-w-[16rem] rounded-xl bg-superficie shadow-tarjeta'

function Bienvenida() {
  const iconos = [
    { Icono: LuQrCode, lugar: 'left-5 top-6', retraso: '0s' },
    { Icono: LuCalendarDays, lugar: 'right-6 top-9', retraso: '-1s' },
    { Icono: LuUsers, lugar: 'bottom-6 left-9', retraso: '-2s' },
    { Icono: FaCarSide, lugar: 'bottom-8 right-8', retraso: '-1.5s' },
  ]

  return (
    <div className="relative flex h-56 items-center justify-center">
      <div className="guia-anim guia-latido flex h-28 w-28 items-center justify-center rounded-full bg-superficie shadow-elevada ring-4 ring-accion/60">
        <TechoSvg className="h-12 w-20" />
      </div>
      {iconos.map(({ Icono, lugar, retraso }) => (
        <span
          className={`guia-anim guia-flotar absolute ${lugar} flex h-11 w-11 items-center justify-center rounded-2xl bg-superficie text-principal shadow-tarjeta`}
          key={lugar}
          style={{ animationDelay: retraso }}
        >
          <Icono className="h-6 w-6" />
        </span>
      ))}
    </div>
  )
}

function Menu() {
  const { t } = useTranslation()
  const opciones = ['nav.citasHoy', 'nav.escanear', 'nav.horarios', 'guia.abrir']

  return (
    <div className="flex h-56 items-center justify-center">
      <Telefono>
        <div className="absolute inset-x-2 top-2 flex items-center gap-1.5 rounded-lg border border-principal/25 bg-superficie px-2 py-1.5">
          <LuMenu className="h-4 w-4 shrink-0 text-principal" />
          <span className="truncate text-[0.6rem] font-bold text-principal">{t('nav.menu')}</span>
        </div>
        {/* El dedo toca el boton y el menu se abre. */}
        <span className="guia-anim guia-dedo absolute left-3 top-2.5 h-7 w-7 rounded-full border-2 border-accion bg-accion/30 opacity-0" />
        <div className="guia-anim guia-menu absolute inset-x-2 top-11 space-y-1 rounded-lg border border-principal/15 bg-superficie p-1.5 shadow-tarjeta">
          {opciones.map((clave, i) => (
            <div
              className={`truncate rounded-md px-1.5 py-1 text-[0.55rem] font-semibold ${
                i === 1 ? 'bg-marca text-white' : 'bg-principal/10 text-principal'
              }`}
              key={clave}
            >
              {t(clave)}
            </div>
          ))}
        </div>
      </Telefono>
    </div>
  )
}

function Escanear() {
  const { t } = useTranslation()

  return (
    <div className="flex h-56 items-center justify-center gap-3 px-3">
      <Telefono>
        {/* La camara, con el cuadro donde va el QR. */}
        <div className="absolute inset-0 bg-marca/80" />
        <div className="guia-anim guia-cuadro absolute inset-x-3 top-6 aspect-square">
          <Esquinas />
        </div>
        <div className="guia-anim guia-qr-entra absolute inset-x-5 top-8 aspect-square overflow-hidden rounded-md shadow-tarjeta">
          <QrDibujo className="h-full w-full" />
        </div>
        {/* Y sale solo: puede pasar. */}
        <div className="guia-anim guia-sube absolute inset-x-1.5 bottom-1.5 overflow-hidden rounded-xl border-2 border-puede-pasar bg-superficie">
          <div className="bg-puede-pasar/15 px-1 py-1.5 text-center">
            <p className="flex items-center justify-center gap-1 text-[0.65rem] font-bold text-puede-pasar">
              <LuCircleCheck className="h-3.5 w-3.5 shrink-0" />
              {t('escaneo.resultado.VALIDO')}
            </p>
            <p className="text-[0.55rem] text-principal">Ana · CB-4871</p>
          </div>
        </div>
      </Telefono>
      <p className="guia-anim guia-fase-2 max-w-[7rem] rotate-3 rounded-xl bg-accion/20 px-2 py-1.5 text-center text-sm font-bold text-principal">
        {t('guia.escena.sinTocar')}
      </p>
    </div>
  )
}

function Colores() {
  const { t } = useTranslation()
  //  Uno a la vez, con retrasos negativos sobre el mismo ciclo de 6 s.
  const tarjetas = [
    { clave: 'VALIDO', Icono: LuCircleCheck, borde: 'border-puede-pasar text-puede-pasar', fondo: 'bg-puede-pasar/10', retraso: '0s' },
    { clave: 'YA_USADO', Icono: LuCircleX, borde: 'border-ya-recibio text-ya-recibio', fondo: 'bg-ya-recibio/10', retraso: '-4s' },
    { clave: 'OTRA_FECHA', Icono: LuCalendarClock, borde: 'border-accion text-principal', fondo: 'bg-accion/15', retraso: '-2s' },
  ]

  return (
    <div className={CAJA}>
      {tarjetas.map(({ clave, Icono, borde, fondo, retraso }) => (
        <div
          className={`guia-anim guia-turno w-full max-w-[17rem] overflow-hidden rounded-xl border-2 bg-superficie ${borde}`}
          key={clave}
          style={{ animationDelay: retraso }}
        >
          <div className={`flex items-center gap-2 px-3 py-2 ${fondo}`}>
            <Icono className="h-5 w-5 shrink-0" />
            <span className="text-sm font-bold">{t(`escaneo.resultado.${clave}`)}</span>
            <span className="ml-auto text-right text-xs text-principal/80">{t(`guia.escena.color.${clave}`)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Deshacer() {
  const { t } = useTranslation()

  return (
    <div className={CAJA}>
      <div className="w-full max-w-[16rem] overflow-hidden rounded-xl border-2 border-puede-pasar bg-superficie">
        <div className="bg-puede-pasar/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-puede-pasar">
            <LuCircleCheck className="h-4 w-4 shrink-0" />
            {t('escaneo.resultado.VALIDO')}
          </p>
          <p className="text-xs text-principal">Ana · CB-4871</p>
        </div>
      </div>
      {/* El minuto se acaba y el boton se apaga. */}
      <div className={`guia-anim guia-se-apaga ${TARJETA} border border-principal/25 px-3 py-2`}>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-principal">
          <LuUndo2 className="h-4 w-4 shrink-0" />
          {t('guia.escena.deshacer')}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-principal/10">
          <div className="guia-anim guia-plazo h-full rounded-full bg-accion" />
        </div>
        <p className="mt-1 text-right text-xs text-principal/70">{t('guia.escena.unMinuto')}</p>
      </div>
    </div>
  )
}

function Buscar() {
  const { t } = useTranslation()
  const codigo = 'CB-4871'

  return (
    <div className={CAJA}>
      <div className="flex w-full max-w-[16rem] items-center gap-2 rounded-xl border-2 border-principal/30 bg-superficie px-3 py-2">
        <LuSearch className="h-4 w-4 shrink-0 text-principal/70" />
        <span className="guia-anim guia-escribe font-mono text-sm font-semibold text-principal" style={{ '--letras': String(codigo.length) }}>
          {codigo}
        </span>
        <span className="guia-anim guia-cursor h-4 w-0.5 bg-marca" />
      </div>
      {/* Buscando a mano SI se confirma. */}
      <div className={`guia-anim guia-fase-2 ${TARJETA} flex items-center justify-between gap-2 px-3 py-2`}>
        <span>
          <span className="block text-sm font-bold text-principal">Ana Pérez</span>
          <span className="block text-xs text-principal/70">{codigo} · 2:45 PM</span>
        </span>
        <span className="guia-anim guia-toque rounded-lg bg-marca px-2.5 py-1.5 text-xs font-bold text-white">
          {t('guia.escena.entregar')}
        </span>
      </div>
    </div>
  )
}

function SinCita() {
  const { t } = useTranslation()
  const nombre = 'Rosa García'
  const telefono = '619 555 0101'

  return (
    <div className={CAJA}>
      <div className={`${TARJETA} space-y-1 p-2.5`}>
        <p className="text-xs font-semibold text-principal/70">{t('sinCita.nombre')}</p>
        <p className="rounded-lg border border-principal/25 px-2 py-1 font-mono text-sm text-principal">
          <span className="guia-anim guia-escribe" style={{ '--letras': String(nombre.length) }}>
            {nombre}
          </span>
        </p>
        <p className="text-xs font-semibold text-principal/70">{t('sinCita.telefono')}</p>
        <p className="rounded-lg border border-principal/25 px-2 py-1 font-mono text-sm text-principal">
          <span className="guia-anim guia-escribe-despues" style={{ '--letras': String(telefono.length) }}>
            {telefono}
          </span>
        </p>
      </div>
      <div className="guia-anim guia-fase-3 w-full max-w-[16rem] rounded-xl border-2 border-dashed border-principal/30 bg-superficie px-3 py-1.5 text-center">
        <p className="text-xs text-principal/70">{t('sinCita.comprobante')}</p>
        <p className="font-titulo text-xl font-bold tracking-wide text-principal">SC-0815</p>
      </div>
    </div>
  )
}

function CitasHoy() {
  const { t } = useTranslation()
  const numeros = [
    ['12', 'pasaron', 'text-puede-pasar'],
    ['8', 'faltan', 'text-principal'],
    ['2', 'sinCita', 'text-principal'],
  ]
  const filas = [
    ['2:45', 'Ana Pérez', 'entregada'],
    ['3:00', 'Luis Soto', 'reservada'],
    ['3:15', 'Rosa García', 'reservada'],
  ]

  return (
    <div className={CAJA}>
      <div className="grid w-full max-w-[17rem] grid-cols-3 gap-1.5">
        {numeros.map(([n, clave, color]) => (
          <div className="rounded-lg bg-superficie px-2 py-1.5 shadow-tarjeta" key={clave}>
            <p className={`text-xl font-bold ${color}`}>{n}</p>
            <p className="truncate text-[0.6rem] text-principal/70">{t(`guia.escena.${clave}`)}</p>
          </div>
        ))}
      </div>
      <div className="w-full max-w-[17rem] divide-y divide-principal/10 rounded-lg bg-superficie px-2 shadow-tarjeta">
        {filas.map(([hora, nombre, estado], i) => (
          <div className={`guia-anim guia-fase-${i + 1} flex items-center justify-between gap-2 py-1.5`} key={nombre}>
            <span className="truncate text-xs text-principal">
              <span className="font-semibold">{hora}</span> · {nombre}
            </span>
            {i === 2 ? (
              <span className="guia-anim guia-latido shrink-0 rounded-md bg-marca px-2 py-0.5 text-[0.6rem] font-bold text-white">
                {t('guia.escena.ver')}
              </span>
            ) : (
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[0.6rem] ${
                  estado === 'entregada' ? 'bg-puede-pasar/15 text-puede-pasar' : 'bg-principal/10 text-principal'
                }`}
              >
                {t(`panel.estado.${estado}`)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Registrar() {
  const { t } = useTranslation()

  return (
    <div className={CAJA}>
      <div className="grid w-full max-w-[16rem] grid-cols-2 gap-1.5">
        {['cita', 'pase'].map((clave, i) => (
          <span
            className="guia-anim guia-alterna rounded-lg border-2 border-principal/20 bg-superficie px-2 py-1.5 text-center text-xs font-bold text-principal"
            key={clave}
            style={{ animationDelay: i ? '-2.5s' : '0s' }}
          >
            {t(`guia.escena.${clave}`)}
          </span>
        ))}
      </div>
      <div className={`${TARJETA} space-y-1.5 p-2.5`}>
        {['w-4/5', 'w-3/5', 'w-2/3'].map((ancho) => (
          <div className={`h-2.5 rounded-full bg-principal/15 ${ancho}`} key={ancho} />
        ))}
      </div>
      <div className="guia-anim guia-fase-3 flex items-center gap-2">
        <QrDibujo className="h-12 w-12 rounded-md shadow-tarjeta" />
        <span className="text-sm font-bold text-puede-pasar">{t('guia.escena.suQr')}</span>
      </div>
    </div>
  )
}

function Horarios() {
  const { t } = useTranslation()

  return (
    <div className={CAJA}>
      <div className={`${TARJETA} p-2.5`}>
        <p className="flex items-center gap-1.5 text-sm font-bold text-principal">
          <LuCalendarDays className="h-4 w-4 shrink-0 text-accion" />
          {t('guia.escena.jueves')}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {['2:45', '3:00', '3:15', '3:30'].map((hora) => (
            <span className="rounded-md bg-principal/10 px-1.5 py-0.5 text-[0.6rem] text-principal" key={hora}>
              {hora} · 20
            </span>
          ))}
        </div>
      </div>
      <div className="guia-anim guia-latido flex w-full max-w-[16rem] items-center gap-1.5 rounded-xl border-2 border-accion bg-accion/10 px-2.5 py-1.5 text-xs font-bold text-principal">
        <LuTriangleAlert className="h-4 w-4 shrink-0 text-accion" />
        <span className="truncate">{t('incidencias.boton')}</span>
      </div>
      <div className="grid w-full max-w-[16rem] grid-cols-3 gap-1">
        {['retraso', 'movida', 'cancelada'].map((tipo, i) => (
          <span
            className={`guia-anim guia-fase-${i + 1} truncate rounded-lg border border-principal/20 bg-superficie px-1 py-1 text-center text-[0.65rem] font-semibold text-principal`}
            key={tipo}
          >
            {t(`guia.escena.incidencia.${tipo}`)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Reportes() {
  const alturas = [55, 80, 40, 95, 70]

  return (
    <div className="flex h-56 items-center justify-center px-4">
      <div className="flex h-36 w-full max-w-[15rem] items-end justify-between gap-2 border-b-2 border-principal/25 px-2">
        {alturas.map((alto, i) => (
          <div
            className={`guia-anim guia-barra w-full rounded-t-md ${i === 3 ? 'bg-accion' : 'bg-marca'}`}
            key={alto}
            style={{ animationDelay: `${i * 0.15}s`, height: `${alto}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function Avisos() {
  const { t } = useTranslation()
  const regla = t('guia.escena.reglaEjemplo')

  return (
    <div className={CAJA}>
      <div className={`${TARJETA} p-2.5`}>
        <p className="flex items-center gap-1.5 text-xs font-bold text-principal">
          <LuPencilLine className="h-4 w-4 shrink-0 text-accion" />
          {t('nav.avisos')}
        </p>
        <p className="mt-1.5 overflow-hidden rounded-lg border border-principal/25 px-2 py-1 font-mono text-xs text-principal">
          <span className="guia-anim guia-escribe" style={{ '--letras': String(regla.length) }}>
            {regla}
          </span>
        </p>
      </div>
      <span className="guia-anim guia-toque rounded-lg bg-marca px-3 py-1.5 text-xs font-bold text-white">
        {t('guia.escena.guardar')}
      </span>
      <p className="guia-anim guia-fase-3 flex items-center gap-1.5 text-xs font-semibold text-puede-pasar">
        <LuCircleCheck className="h-4 w-4 shrink-0" />
        {t('guia.escena.enLaPortada')}
      </p>
    </div>
  )
}

function Equipo() {
  const correos = ['ana@gmail.com', 'luis@gmail.com', 'rosa@gmail.com']

  return (
    <div className={CAJA}>
      {correos.map((correo, i) => (
        <div className={`${TARJETA} flex items-center justify-between gap-2 px-3 py-2`} key={correo}>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-principal">
            <LuUsers className="h-4 w-4 shrink-0 text-accion" />
            <span className="truncate">{correo}</span>
          </span>
          {/* La palomita que se prende. Sin animacion, prendida. */}
          <span
            className="guia-anim guia-pista relative h-6 w-11 shrink-0 rounded-full bg-puede-pasar"
            style={{ animationDelay: `${i * 0.6}s` }}
          >
            <span
              className="guia-anim guia-perilla absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-superficie shadow"
              style={{ animationDelay: `${i * 0.6}s` }}
            />
          </span>
        </div>
      ))}
    </div>
  )
}

function Listo() {
  return (
    <div className="flex h-56 items-center justify-center">
      <svg className="h-28 w-28" viewBox="0 0 52 52">
        <circle className="fill-puede-pasar/15 stroke-puede-pasar" cx="26" cy="26" r="24" strokeWidth="2.5" />
        <path
          className="guia-anim guia-palomita stroke-puede-pasar"
          d="M15 27 l7 7 l15 -16"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4.5"
        />
      </svg>
    </div>
  )
}

//  Una escena por paso de la guia (datos/guia.js). La prueba revisa que no
//  falte ninguna.
function ElegirFilaEscena() {
  const { t } = useTranslation()

  return (
    <div className="flex h-56 items-center justify-center">
      <Telefono>
        <div className="absolute inset-x-2 top-3 space-y-1.5">
          <div className="flex items-center justify-center gap-1 rounded-lg bg-marca px-1 py-2 text-[0.6rem] font-bold text-white">
            <FaCarSide className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('filas.nombre.carro')}</span>
          </div>
          <div className="flex items-center justify-center gap-1 rounded-lg bg-accion px-1 py-2 text-[0.6rem] font-bold text-sobre-accion">
            <FaPersonWalking className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('filas.nombre.a_pie')}</span>
          </div>
        </div>
        {/* El dedo escoge la fila a pie... */}
        <span className="guia-anim guia-dedo absolute left-9 top-12 h-7 w-7 rounded-full border-2 border-principal bg-accion/40 opacity-0" />
        {/* ...y la pantalla dice en cual esta. */}
        <div className="guia-anim guia-fase-2 absolute inset-x-2 bottom-3 rounded-lg border-2 border-accion bg-accion/15 px-1.5 py-1.5 text-center text-[0.55rem] font-bold text-principal">
          {t('escaneo.estasEn', { fila: t('filas.nombre.a_pie') })}
        </div>
      </Telefono>
    </div>
  )
}

/** Un QR con su sello en medio, como el de la persona. */
function QrConSello({ Icono, anillo, color, etiqueta, retraso }) {
  return (
    <div className="guia-anim guia-flotar flex flex-col items-center gap-2" style={{ animationDelay: retraso }}>
      <div className="relative">
        <QrDibujo className="h-24 w-24 rounded-lg shadow-tarjeta" />
        <span
          className={`absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] bg-superficie ${anillo}`}
        >
          <Icono className={`h-5 w-5 ${color}`} />
        </span>
      </div>
      <span className="text-xs font-bold text-principal">{etiqueta}</span>
    </div>
  )
}

function DosQr() {
  const { t } = useTranslation()

  return (
    <div className="flex h-56 items-center justify-center gap-6 px-4">
      <QrConSello
        Icono={FaCarSide}
        anillo="border-principal"
        color="text-principal"
        etiqueta={t('filas.nombre.carro')}
        retraso="0s"
      />
      <QrConSello
        Icono={FaPersonWalking}
        anillo="border-accion"
        color="text-accion"
        etiqueta={t('filas.nombre.a_pie')}
        retraso="-1.5s"
      />
    </div>
  )
}

function Turnos() {
  const { t } = useTranslation()
  const siguen = [
    ['13', 'Luis'],
    ['14', 'Rosa'],
    ['15', 'Juan'],
  ]

  return (
    <div className={CAJA}>
      <div className="guia-anim guia-latido w-full max-w-[16rem] rounded-xl border-[3px] border-accion bg-accion/10 px-3 py-2 text-center">
        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-principal/80">{t('filaTurnos.va')}</p>
        <p className="font-titulo text-4xl font-bold leading-none text-principal">12</p>
        <p className="text-xs font-semibold text-principal">Ana · CB-4871</p>
      </div>
      <ol className={`${TARJETA} divide-y divide-principal/10 px-2`}>
        {siguen.map(([turno, nombre], i) => (
          <li
            className={`guia-anim guia-fase-${i + 1} flex items-center gap-2 py-1 text-xs text-principal`}
            key={turno}
          >
            <span className="w-6 font-titulo text-sm font-bold">{turno}</span>
            {nombre}
          </li>
        ))}
      </ol>
      <span className="flex items-center gap-1 text-xs font-semibold text-principal/80">
        <LuUserX className="h-4 w-4 text-ya-recibio" />
        {t('filaTurnos.noSePresento')}
      </span>
    </div>
  )
}

function FilaAPieEscena() {
  const { t } = useTranslation()

  return (
    <div className={CAJA}>
      <div className={`${TARJETA} border-2 border-accion/50 p-2.5`}>
        <p className="flex items-center gap-1.5 text-sm font-bold text-principal">
          <FaPersonWalking className="h-4 w-4 shrink-0 text-accion" />
          {t('filaAPieAdmin.titulo')}
        </p>
        <div className="mt-1.5 space-y-1 text-[0.65rem] text-principal">
          <p className="guia-anim guia-fase-1 flex items-center gap-1 rounded-md bg-principal/10 px-1.5 py-1">
            <LuClock className="h-3.5 w-3.5 shrink-0 text-accion" />
            {t('filaAPieAdmin.hora')} 4:30 PM
          </p>
          <p className="guia-anim guia-fase-2 rounded-md bg-principal/10 px-1.5 py-1">
            {t('filaAPieAdmin.cupo')}: {t('filaAPieAdmin.sinLimite')}
          </p>
          <p className="guia-anim guia-fase-3 rounded-md bg-accion/20 px-1.5 py-1 font-semibold">
            {t('filaAPieAdmin.unaHoraAntes', { hora: '3:30 PM' })}
          </p>
        </div>
      </div>
    </div>
  )
}

const ESCENAS = {
  bienvenida: Bienvenida,
  menu: Menu,
  escanear: Escanear,
  colores: Colores,
  deshacer: Deshacer,
  buscar: Buscar,
  elegirFila: ElegirFilaEscena,
  dosQr: DosQr,
  turnos: Turnos,
  sinCita: SinCita,
  citasHoy: CitasHoy,
  registrar: Registrar,
  horarios: Horarios,
  filaAPie: FilaAPieEscena,
  reportes: Reportes,
  avisos: Avisos,
  equipo: Equipo,
  listo: Listo,
}

export default function Escena({ clave }) {
  const Dibujo = ESCENAS[clave] ?? Bienvenida
  return <Dibujo />
}
