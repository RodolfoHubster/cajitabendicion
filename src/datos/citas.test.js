import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import es from '../i18n/es.json'
import { supabase } from '../lib/supabase'
import {
  CODIGOS,
  anularEntradaSinCita,
  cancelarCitaPanel,
  cambiosRestantes,
  cancelarMiCita,
  entradasSinCitaDelDia,
  moverCitaPanel,
  moverMiCita,
  registrarEntradaSinCita,
  reservarConExcepcion,
} from './citas'

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('cancelar', () => {
  it('la persona cancela con el token de su QR', async () => {
    supabase.rpc.mockResolvedValue({ data: 'CANCELADA', error: null })

    await expect(cancelarMiCita('token-123')).resolves.toBe('CANCELADA')
    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_mi_cita', { p_token: 'token-123' })
  })

  it('el pastor cancela por codigo, fecha y hora; el motivo vacio va como null', async () => {
    supabase.rpc.mockResolvedValue({ data: 'CANCELADA', error: null })

    await cancelarCitaPanel({ codigo: 'CB-4871', fecha: '2026-09-14', hora: '14:00:00', motivo: '   ' })
    expect(supabase.rpc).toHaveBeenCalledWith('cancelar_cita_panel', {
      p_codigo: 'CB-4871',
      p_fecha: '2026-09-14',
      p_hora: '14:00:00',
      p_motivo: null,
    })
  })

  it('el motivo se manda sin espacios de mas', async () => {
    supabase.rpc.mockResolvedValue({ data: 'CANCELADA', error: null })

    await cancelarCitaPanel({ codigo: 'CB-4871', fecha: '2026-09-14', hora: '14:00:00', motivo: ' Avisó que no puede ' })
    expect(supabase.rpc.mock.calls[0][1].p_motivo).toBe('Avisó que no puede')
  })
})

describe('entro sin cita', () => {
  it('manda el nombre y devuelve el codigo de comprobante y cuantas van hoy', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo: 'SC-0427', total: 3 }], error: null })

    await expect(registrarEntradaSinCita('José Ramírez')).resolves.toEqual({ codigo: 'SC-0427', total: 3 })
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_entrada_sin_cita', { p_nombre: 'José Ramírez' })
  })

  it('acepta la respuesta como objeto suelto; sin respuesta, codigo null y 0', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { codigo: 'SC-1', total: 1 }, error: null })
    await expect(registrarEntradaSinCita('Ana')).resolves.toEqual({ codigo: 'SC-1', total: 1 })

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(registrarEntradaSinCita('Ana')).resolves.toEqual({ codigo: null, total: 0 })
  })

  it('anular manda el codigo y la fecha (hoy si no se dice) y devuelve cuantas cuentan', async () => {
    supabase.rpc.mockResolvedValue({ data: 2, error: null })

    await expect(anularEntradaSinCita('SC-0427')).resolves.toBe(2)
    expect(supabase.rpc).toHaveBeenCalledWith('anular_entrada_sin_cita', { p_codigo: 'SC-0427', p_fecha: null })

    await anularEntradaSinCita('SC-0427', '2026-09-14')
    expect(supabase.rpc).toHaveBeenLastCalledWith('anular_entrada_sin_cita', { p_codigo: 'SC-0427', p_fecha: '2026-09-14' })
  })

  it('la lista del dia; sin datos, vacia', async () => {
    const fila = { codigo: 'SC-0427', nombre: 'José', anotado_por: 'pastor@correo.com', anulada: false }
    supabase.rpc.mockResolvedValueOnce({ data: [fila], error: null })
    await expect(entradasSinCitaDelDia('2026-09-14')).resolves.toEqual([fila])
    expect(supabase.rpc).toHaveBeenCalledWith('entradas_sin_cita_del_dia', { p_fecha: '2026-09-14' })

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(entradasSinCitaDelDia()).resolves.toEqual([])
    expect(supabase.rpc).toHaveBeenLastCalledWith('entradas_sin_cita_del_dia', { p_fecha: null })
  })

  it('un voluntario que lo intenta recibe SIN_PERMISO', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'SIN_PERMISO' } })
    await expect(registrarEntradaSinCita('Ana')).rejects.toThrow('SIN_PERMISO')
  })
})

describe('excepcion de segunda cita', () => {
  it('manda codigo, horario y motivo y devuelve la cita', async () => {
    const cita = { codigo_corto: 'CB-4871', token_qr: 't', fecha: '2026-09-17', hora: '14:00:00' }
    supabase.rpc.mockResolvedValue({ data: [cita], error: null })

    await expect(
      reservarConExcepcion({ codigo: 'CB-4871', bloqueId: 'b1', motivo: 'Enfermedad' }),
    ).resolves.toEqual(cita)
    expect(supabase.rpc).toHaveBeenCalledWith('reservar_con_excepcion', {
      p_codigo: 'CB-4871',
      p_bloque_id: 'b1',
      p_motivo: 'Enfermedad',
    })
  })

  it('sin respuesta devuelve null', async () => {
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(reservarConExcepcion({ codigo: 'CB-1', bloqueId: 'b1', motivo: 'Motivo' })).resolves.toBeNull()
  })
})

describe('cambiar de horario', () => {
  it('manda el token del QR y el horario nuevo', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ fecha: '2026-09-24', hora: '15:15:00', codigo_corto: 'CB-4871', cambios_restantes: 0 }],
      error: null,
    })

    await expect(moverMiCita('token-123', 'bloque-9')).resolves.toEqual({
      fecha: '2026-09-24',
      hora: '15:15:00',
      codigo_corto: 'CB-4871',
      cambios_restantes: 0,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('mover_mi_cita', {
      p_token: 'token-123',
      p_bloque_id: 'bloque-9',
    })
  })

  it('acepta la respuesta como objeto suelto; sin respuesta, null', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { fecha: '2026-09-24' }, error: null })
    await expect(moverMiCita('t', 'b')).resolves.toEqual({ fecha: '2026-09-24' })

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(moverMiCita('t', 'b')).resolves.toBeNull()
  })

  it('dice cuantos cambios le quedan; sin respuesta, ninguno', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 1, error: null })
    await expect(cambiosRestantes('token-123')).resolves.toBe(1)
    expect(supabase.rpc).toHaveBeenCalledWith('cambios_restantes', { p_token: 'token-123' })

    supabase.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(cambiosRestantes('t')).resolves.toBe(0)
  })

  it('desde el panel se mueve por el id de la cita', async () => {
    supabase.rpc.mockResolvedValue({
      data: [{ fecha: '2026-09-24', hora: '14:00:00', codigo_corto: 'CB-4871' }],
      error: null,
    })

    await expect(moverCitaPanel('cita-1', 'bloque-9')).resolves.toEqual({
      fecha: '2026-09-24',
      hora: '14:00:00',
      codigo_corto: 'CB-4871',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('mover_cita_panel', {
      p_cita_id: 'cita-1',
      p_bloque_id: 'bloque-9',
    })
  })

  it('el horario lleno deja la cita como estaba: el error llega tal cual', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: BLOQUE_LLENO' } })
    await expect(moverMiCita('t', 'b')).rejects.toThrow('BLOQUE_LLENO')
  })
})

describe('errores', () => {
  it.each(CODIGOS)('traduce %s de la base', async (codigo) => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: `P0001: ${codigo}` } })
    await expect(cancelarMiCita('t')).rejects.toThrow(new RegExp(`^${codigo}$`))
  })

  it.each([
    [{ code: 'PGRST202', message: 'no existe' }, 'FUNCION_NO_INSTALADA'],
    [{ message: 'Failed to fetch' }, 'SIN_CONEXION'],
    [{ message: 'raro' }, 'ERROR_DESCONOCIDO'],
  ])('lo que no es de negocio se clasifica: %o', async (error, esperado) => {
    supabase.rpc.mockResolvedValue({ data: null, error })
    await expect(cancelarMiCita('t')).rejects.toThrow(esperado)
  })

  it.each([...CODIGOS, 'FUNCION_NO_INSTALADA', 'SIN_PERMISO', 'SIN_CONEXION', 'ERROR_DESCONOCIDO'])(
    '%s tiene su mensaje en pantalla',
    (codigo) => {
      expect(es.citas.errores[codigo]).toBeTruthy()
    },
  )
})

describe('la misma persona anotada dos veces hoy', () => {
  it('la base avisa con el comprobante que ya tiene; no se anota otra', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'P0001: NOMBRE_YA_ANOTADO_HOY:SC-0427' } })

    const error = await registrarEntradaSinCita('José Ramírez').catch((e) => e)
    expect(error.message).toBe('NOMBRE_YA_ANOTADO_HOY')
    expect(error.codigoPrevio).toBe('SC-0427')
  })

  it('si es otra persona con el mismo nombre, se confirma', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo: 'SC-0500', total: 4 }], error: null })

    await registrarEntradaSinCita('José Ramírez', { confirmarRepetido: true })
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_entrada_sin_cita', {
      p_nombre: 'José Ramírez',
      p_confirmar_repetido: true,
    })
  })

  it('sin confirmar, la llamada es la de siempre (sirve aunque la base no tenga la migración)', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ codigo: 'SC-0501', total: 5 }], error: null })
    await registrarEntradaSinCita('Ana')
    expect(supabase.rpc).toHaveBeenCalledWith('registrar_entrada_sin_cita', { p_nombre: 'Ana' })
  })
})
