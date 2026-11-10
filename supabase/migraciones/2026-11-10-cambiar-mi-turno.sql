-- ============================================================
--  La fila a pie: la persona cambia o cancela su turno
--  (seccion 59 de schema.sql)
-- ============================================================
--  * Lo llamaron y no estaba, o se lo anularon: desde su telefono saca uno
--    nuevo al final de la fila de un solo toque (cambiar_mi_turno). Si su
--    turno todavia valia, el viejo se cancela en el mismo paso. Respeta un
--    turno por telefono y el limite de dos turnos anulados por dia.
--  * Cancelar su propio turno usa cancelar_mi_cita(), la de siempre.
--  * La busqueda de turnos del escaner ensena tambien los cancelados y a
--    cual se cambio cada uno (turnos_a_pie_de_hoy: dos columnas mas).
--
--  Agrega dos columnas a citas y la funcion cambiar_mi_turno(). Cambia
--  turnos_a_pie_de_hoy(). No toca reservar_cita(), registrar_entrega() ni
--  los cupos. Se puede correr dos veces. Mejor fuera del horario de la
--  fila a pie. Correrla antes de subir las pantallas.
-- ============================================================

alter table citas add column if not exists turno_cambiado_en timestamptz;
alter table citas add column if not exists turno_cambiado_a  int;

--  Los turnos a pie de hoy, para buscar en el escaner mientras se teclea:
--  el turno, su codigo (la pantalla solo lo ensena en el detalle, para
--  compararlo con el que dice la persona), la sena, el estado y las horas.
--  Tambien los anulados, marcados. Solo quien escanea en la fila a pie.
--  Sin telefono, correo ni direccion. Seccion 53: tambien los cancelados
--  por repetidos (repetido_en, se_queda). Seccion 59: todos los
--  cancelados (cancelado_en), tambien los que la persona cancelo o cambio
--  por uno nuevo (cambiado_a): antes no salian y la busqueda decia que ese
--  turno no existia.
drop function if exists turnos_a_pie_de_hoy();

create or replace function turnos_a_pie_de_hoy()
returns table (
  turno        int,
  codigo_corto text,
  nombre       text,
  estado       text,
  sacado_en    timestamp,
  saltado_en   timestamp,
  entregado_en timestamp,
  anulado_en   timestamp,
  --  Si se lo dio una voluntaria (sin telefono): su correo.
  dado_por     text,
  repetido_en  timestamp,
  se_queda     int,
  --  Seccion 59: a que hora se cancelo (por lo que sea) y, si la persona
  --  saco uno nuevo, cual.
  cancelado_en timestamp,
  cambiado_a   int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  return query
  select c.turno,
         p.codigo_corto,
         p.nombre,
         c.estado,
         c.creada_en        at time zone 'America/Los_Angeles',
         c.turno_saltado_en at time zone 'America/Los_Angeles',
         c.usado_en         at time zone 'America/Los_Angeles',
         c.turno_anulado_en at time zone 'America/Los_Angeles',
         u.email::text,
         c.turno_repetido_en at time zone 'America/Los_Angeles',
         c.turno_se_queda,
         case when c.estado = 'cancelada' then c.cancelada_en at time zone 'America/Los_Angeles' end,
         c.turno_cambiado_a
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join auth.users u on u.id = c.registrado_por
   where b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno is not null
   order by c.turno;
end;
$$;

revoke execute on function turnos_a_pie_de_hoy() from public, anon;
grant  execute on function turnos_a_pie_de_hoy() to authenticated;

-- ============================================================
--  59. LA FILA A PIE: LA PERSONA CAMBIA O CANCELA SU TURNO
-- ============================================================
--  Pedido del 10 de noviembre de 2026:
--
--  * Lo llamaron y no estaba, o la voluntaria le anulo el turno: desde su
--    telefono saca uno nuevo, al final de la fila, de un solo toque. Antes
--    eran dos: "Sacar un turno nuevo" lo regresaba al inicio y ahi otra
--    vez "Sacar mi turno" (y, si ese dia se pedia, otra vez el codigo del
--    dia; ya lo habia escrito para su primer turno). Si su turno todavia
--    valia (lo llamaron pero no se ha anulado), el viejo se cancela en el
--    mismo paso: nunca quedan dos turnos vivos. La pagina pregunta antes.
--  * Cancelar su propio turno, como la cita en carro: cancelar_mi_cita()
--    (el token es la prueba de que el turno es suyo). No hace falta otra.
--  * En el escaner, la busqueda de turnos ensena tambien los cancelados y
--    a cual se cambio cada uno (turnos_a_pie_de_hoy, seccion 46), en vez
--    de decir "no hay un turno de hoy con eso".
--
--  Lo de siempre se respeta: un turno vivo por telefono, y si a ese
--  telefono ya se le anularon dos turnos hoy, ya no saca otro (seccion 46).

--  Responde con un resultado, como sacar_turno_a_pie():
--    NUEVO            su turno nuevo, al final (el viejo se cancelo si valia)
--    YA_TENIA         ya tiene otro turno hoy (el doble toque): ese mismo
--    AUN_VALE         todavia no lo llaman: su turno vale, no se cambia
--    YA_RECIBIO       ya recibio con ese turno
--    CANCELADA        el turno se cancelo (lo cancelo la persona, o el dia)
--    TURNO_REPETIDO   se cancelo porque tenia otro turno (seccion 53)
--    TURNOS_ANULADOS  a ese telefono ya se le anularon dos turnos hoy
--    CERRADA          ya no se dan turnos hoy, o la fila termino
--    NO_EXISTE        no es un turno a pie de hoy
create or replace function cambiar_mi_turno(p_token text)
returns table (
  resultado      text,
  token_qr       text,
  codigo         text,
  turno          int,
  turno_anterior int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
declare
  v_vieja    citas;
  v_bloque   bloques;
  v_disp     text;
  v_otra     citas;
  v_nueva    citas;
  v_cerrado  boolean;
  v_anulados int;
begin
  select c.* into v_vieja
    from citas c
    join bloques b on b.id = c.bloque_id
   where c.token_qr = p_token
     and c.turno is not null
     and b.fila = 'a_pie'
     and b.fecha = current_date;

  if v_vieja.id is null then
    return query select 'NO_EXISTE'::text, null::text, null::text, null::int, null::int;
    return;
  end if;

  --  El candado de sacar_turno_a_pie(): dos toques seguidos no sacan dos
  --  turnos. Sin telefono (se lo dio una voluntaria), el de su cita.
  v_disp := coalesce(v_vieja.dispositivo_id, 'cita:' || v_vieja.id::text);
  perform pg_advisory_xact_lock(hashtext('turno-a-pie:' || v_disp || ':' || current_date::text));

  --  Y el de registrar_entrega(): si justo lo estan escaneando, uno espera
  --  al otro. Se vuelve a leer ya con el candado.
  select c.* into v_vieja from citas c where c.id = v_vieja.id for update;
  select b.* into v_bloque from bloques b where b.id = v_vieja.bloque_id;

  --  El doble toque: el primero ya le dio su turno nuevo.
  select c.* into v_otra
    from citas c
   where c.bloque_id = v_bloque.id
     and c.dispositivo_id = v_disp
     and c.id <> v_vieja.id
     and c.estado in ('reservada', 'llego', 'entregada')
   order by c.creada_en desc
   limit 1;

  if v_otra.id is not null then
    return query select 'YA_TENIA'::text, v_otra.token_qr, p.codigo_corto, v_otra.turno, v_vieja.turno
                   from personas p where p.id = v_otra.persona_id;
    return;
  end if;

  if v_vieja.estado = 'entregada' then
    return query select 'YA_RECIBIO'::text, null::text, null::text, null::int, v_vieja.turno;
    return;
  end if;

  if v_vieja.turno_repetido_en is not null then
    return query select 'TURNO_REPETIDO'::text, null::text, null::text, null::int, v_vieja.turno;
    return;
  end if;

  if v_vieja.estado = 'cancelada' and v_vieja.turno_anulado_en is null then
    return query select 'CANCELADA'::text, null::text, null::text, null::int, v_vieja.turno;
    return;
  end if;

  --  Todavia no lo llaman: su turno vale. Cambiarlo seria perder su lugar.
  if v_vieja.estado in ('reservada', 'llego') and v_vieja.turno_saltado_en is null then
    return query select 'AUN_VALE'::text, null::text, null::text, null::int, v_vieja.turno;
    return;
  end if;

  select d.cerrado into v_cerrado from dias_entrega d where d.fecha = current_date;
  if coalesce(v_cerrado, false) or v_bloque.cerrado or v_bloque.terminada_en is not null then
    return query select 'CERRADA'::text, null::text, null::text, null::int, v_vieja.turno;
    return;
  end if;

  --  La regla de la seccion 46: el primer turno anulado se perdona, el segundo no.
  select count(*)::int into v_anulados
    from citas c
   where c.bloque_id = v_bloque.id
     and c.dispositivo_id = v_disp
     and c.turno_anulado_en is not null;

  if v_anulados >= 2 then
    return query select 'TURNOS_ANULADOS'::text, null::text, null::text, null::int, v_vieja.turno;
    return;
  end if;

  --  El viejo se cancela en el mismo paso (si el turno nuevo no se puede
  --  dar, se deshace todo y el viejo sigue como estaba).
  update citas c
     set estado             = 'cancelada',
         cancelada_en       = coalesce(c.cancelada_en, now()),
         motivo_cancelacion = coalesce(c.motivo_cancelacion, 'La persona sacó un turno nuevo al final de la fila'),
         turno_cambiado_en  = now()
   where c.id = v_vieja.id;

  --  El mismo candado y el mismo cupo de siempre; el numero lo pone dar_turno().
  v_nueva := crear_turno_anonimo(v_bloque.id, v_disp, null);

  update citas c set turno_cambiado_a = v_nueva.turno where c.id = v_vieja.id;

  return query select 'NUEVO'::text, v_nueva.token_qr, p.codigo_corto, v_nueva.turno, v_vieja.turno
                 from personas p where p.id = v_nueva.persona_id;
end;
$$;

revoke execute on function cambiar_mi_turno(text) from public;
grant  execute on function cambiar_mi_turno(text) to anon, authenticated;
