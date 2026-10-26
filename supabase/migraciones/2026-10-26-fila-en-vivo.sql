-- ============================================================
--  Cajita de Bendicion - La fila a pie en vivo, para cualquiera (seccion 51)
--
--  fila_a_pie_en_vivo(): que turno va, cuantos esperan, cuantos ya
--  recibieron y el ultimo que paso, sin necesidad de tener turno (la pagina
--  /fila). Solo numeros: nunca nombres, codigos ni senas.
--
--  Solo agrega una funcion de lectura. Se puede correr aunque este la
--  entrega. Correrla ANTES de subir la pantalla nueva. Se puede repetir.
-- ============================================================

begin;

--  Pedido del 26 de octubre de 2026: que cualquiera vea como va la fila a
--  pie de hoy aunque no tenga turno (la pagina /fila, y una tele en la
--  entrada): que turno va, cuantos esperan, cuantos ya recibieron y el
--  ultimo que paso. Solo numeros: nunca nombres, codigos ni senas.

create or replace function fila_a_pie_en_vivo()
returns table (
  hora       time,
  abre_en    timestamp,
  abierta    boolean,
  cerrada    boolean,
  terminada  boolean,
  --  El turno que va (el mas bajo que espera), o nulo si nadie espera.
  actual     int,
  --  El ultimo que recibio su caja.
  ultimo     int,
  atendidos  int,
  en_espera  int,
  --  Cuantos turnos se han dado hoy (sin los cancelados).
  total      int
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  with fila as (
    select b.id, b.hora, b.cerrado, b.terminada_en, d.a_pie_abre_en, d.cerrado as dia_cerrado
      from bloques b
      join dias_entrega d on d.fecha = b.fecha
     where b.fecha = current_date
       and b.fila = 'a_pie'
       and d.a_pie_abre_en is not null
  ),
  turnos as (
    select c.turno, c.estado, c.turno_saltado_en, c.usado_en
      from citas c
      join fila f on f.id = c.bloque_id
     where c.estado <> 'cancelada'
  )
  select f.hora,
         f.a_pie_abre_en at time zone 'America/Los_Angeles',
         now() >= f.a_pie_abre_en,
         f.cerrado or f.dia_cerrado or f.terminada_en is not null,
         f.dia_cerrado or f.terminada_en is not null,
         (select min(t.turno) from turnos t
           where t.estado in ('reservada', 'llego') and t.turno_saltado_en is null)::int,
         (select t.turno from turnos t
           where t.estado = 'entregada' order by t.usado_en desc nulls last, t.turno desc limit 1)::int,
         (select count(*) from turnos t where t.estado = 'entregada')::int,
         (select count(*) from turnos t
           where t.estado in ('reservada', 'llego') and t.turno_saltado_en is null)::int,
         (select count(*) from turnos t)::int
    from fila f;
$$;

revoke execute on function fila_a_pie_en_vivo() from public;
grant  execute on function fila_a_pie_en_vivo() to anon, authenticated;

commit;
