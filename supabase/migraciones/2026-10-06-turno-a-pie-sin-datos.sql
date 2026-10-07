-- ============================================================
--  Cajita de Bendicion - Turno a pie sin datos, el codigo del dia y la
--  lista del escaner
--
--  * Un solo QR impreso en la entrada lleva a /turno: la persona toca
--    "Sacar mi turno" y recibe su numero y su QR, sin dar ningun dato
--    (sacar_turno_a_pie). Un turno vivo por telefono por dia.
--  * El codigo del dia (si se prende en la Fila a pie de esa fecha): sin el
--    no se saca turno; 5 codigos mal en 5 minutos frenan ese telefono.
--  * Quien no tiene telefono recibe turno de la voluntaria, con una sena
--    opcional (dar_turno_sin_telefono).
--  * "No se presento" PIERDE el turno: su QR ya no entrega (TURNO_PERDIDO)
--    y se puede deshacer solo en 2 minutos.
--  * De carro a pie: la cita de carro se cancela (si es el dueno, tambien
--    las de sus acompanantes) y se cuenta en Reportes (cambios_a_pie).
--  * Terminar la fila a pie (terminar_fila_a_pie): quien todavia espera
--    ve "La fila de hoy ya termino" (turno_de_cita). Cerrar los turnos no
--    cuenta: quien ya tiene turno lo conserva.
--  * El panel de la voluntaria no muestra los codigos de los turnos sin
--    datos (fila_de_turnos).
--  * El escaner de carros trae la lista de hoy (lista_para_escaneo).
--  * Buscar en el escaner no muestra los codigos de los turnos sin datos:
--    a esos solo se les encuentra con el codigo exacto.
--
--  Cambia registrar_entrega() (una revision mas antes de entregar; el
--  candado es el mismo), saltar_turno(), fila_de_turnos(), turno_de_cita(),
--  buscar_personas(), buscar_para_escaneo() y reporte_por_dias(). Correrla FUERA del horario de
--  entrega y ANTES de subir las pantallas nuevas. Requiere
--  2026-09-30-acompanantes-en-la-lista.sql. Se puede repetir.
-- ============================================================

begin;

alter table personas     add column if not exists anonima boolean not null default false;
alter table citas        add column if not exists se_cambio_a_pie boolean not null default false;
alter table dias_entrega add column if not exists a_pie_codigo text;
alter table bloques      add column if not exists terminada_en timestamptz;

create or replace function registrar_entrega(p_token text)
returns table (
  resultado    text,
  nombre       text,
  codigo_corto text,
  hora         time
)
language plpgsql
-- Los atributos van aqui explicitos: "create or replace" sin ellos
-- regresaria la funcion a security invoker y a la zona UTC.
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita    citas;
  v_persona personas;
  v_bloque  bloques;
  -- El voluntario sale de la sesion, no de un parametro. Si viniera
  -- como argumento, cualquiera podria firmar un escaneo con el id de
  -- otro y la bitacora de auditoria dejaria de servir para responder
  -- "quien entrego esta caja".
  v_usuario uuid := auth.uid();

  --  Los datos del pase se guardan sueltos y no como fila de "pases" a
  --  proposito: asi esta funcion se puede crear aunque esa tabla llegue
  --  mas abajo en el archivo. Las consultas se resuelven al ejecutarse.
  v_pase_id      uuid;
  v_pase_activo  boolean;
  v_pase_persona uuid;
begin
  if v_usuario is null then
    raise exception 'SIN_SESION';
  end if;

  -- Escanean voluntarios y administradores. Una cuenta sin rol no entrega.
  perform exigir_rol(array['admin', 'voluntario']);

  -- ----------------------------------------------------------
  --  Pase permanente (seccion 29)
  -- ----------------------------------------------------------
  --  El codigo de un pase no es de una cita sino de la persona, y no se
  --  quema: vale todos los dias de entrega hasta que se revoque. Lo que
  --  se quema es el dia: una caja por pase por fecha. Si alguien le saca
  --  copia al codigo, la copia no consigue una segunda caja.
  --
  --  El candado sobre la fila serializa dos escaneos del mismo pase, y
  --  el indice unico de entregas_pase es la red por debajo.
  select pa.id, pa.activo, pa.persona_id
    into v_pase_id, v_pase_activo, v_pase_persona
    from pases pa
   where pa.token = p_token
     for update;

  if found then
    select * into v_persona from personas where id = v_pase_persona;

    if not v_pase_activo then
      return query select 'PASE_REVOCADO'::text, v_persona.nombre,
                          v_persona.codigo_corto, null::time;
      return;
    end if;

    --  Un pase no sirve un martes: solo en dia de entrega abierto.
    if not exists (select 1 from dias_entrega d
                    where d.fecha = current_date and not d.cerrado) then
      return query select 'NO_ES_DIA_DE_ENTREGA'::text, v_persona.nombre,
                          v_persona.codigo_corto, null::time;
      return;
    end if;

    if exists (select 1 from entregas_pase e
                where e.pase_id = v_pase_id and e.fecha = current_date) then
      return query select 'YA_USADO'::text, v_persona.nombre,
                          v_persona.codigo_corto, null::time;
      return;
    end if;

    insert into entregas_pase (pase_id, fecha, usuario_id, fila)
    values (v_pase_id, current_date, v_usuario, fila_de_entrega());

    return query select 'VALIDO_PASE'::text, v_persona.nombre,
                        v_persona.codigo_corto, null::time;
    return;
  end if;

  select * into v_cita
    from citas
   where token_qr = p_token
     for update;

  if not found then
    return query select 'NO_EXISTE'::text, null::text, null::text, null::time;
    return;
  end if;

  select * into v_persona from personas where id = v_cita.persona_id;
  select * into v_bloque  from bloques  where id = v_cita.bloque_id;

  if v_bloque.fecha <> current_date then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'OTRA_FECHA');

    return query select 'OTRA_FECHA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  --  Cada fila tiene su gente (seccion 32). Quien escanea en la fila de
  --  carros no entrega un codigo de la fila a pie: se le dice a donde
  --  mandarlo y el codigo NO se quema, para que en su fila si pase.
  if not puede_escanear_fila(v_bloque.fila) then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'OTRA_FILA');

    return query select 'OTRA_FILA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  if v_cita.estado = 'entregada' then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'YA_USADO');

    return query select 'YA_USADO'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  if v_cita.estado = 'cancelada' then
    return query select 'CANCELADA'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  --  Fila a pie: "no se presento" pierde el turno (seccion 42). Su QR ya
  --  no entrega; la persona vuelve a sacar turno con el QR general.
  if v_bloque.fila = 'a_pie' and v_cita.turno_saltado_en is not null then
    insert into escaneos (cita_id, usuario_id, resultado)
    values (v_cita.id, v_usuario, 'TURNO_PERDIDO');

    return query select 'TURNO_PERDIDO'::text, v_persona.nombre,
                        v_persona.codigo_corto, v_bloque.hora;
    return;
  end if;

  update citas
     set estado   = 'entregada',
         usado_en = now()
   where id = v_cita.id;

  insert into escaneos (cita_id, usuario_id, resultado)
  values (v_cita.id, v_usuario, 'VALIDO');

  return query select 'VALIDO'::text, v_persona.nombre,
                      v_persona.codigo_corto, v_bloque.hora;
end;
$$;

revoke execute on function registrar_entrega(text) from public;
grant  execute on function registrar_entrega(text) to authenticated;

--  "No se presento": la fila pasa al siguiente y ese turno se pierde (su
--  QR ya no entrega, seccion 42). Con p_saltado = false se deshace: la
--  persona regresa a la fila en su mismo turno, pero solo en los 2 minutos
--  siguientes (por si se marco al equivocado); el administrador, siempre.
--  Por NUMERO de turno y no "el que va": si dos voluntarias lo tocan al
--  mismo tiempo, se salta uno solo. Solo en la fila a pie de hoy.
create or replace function saltar_turno(p_turno int, p_saltado boolean default true)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_id  uuid;
  v_rol text;
begin
  v_rol := exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  if not coalesce(p_saltado, true) and v_rol <> 'admin'
     and exists (select 1 from citas c join bloques b on b.id = c.bloque_id
                  where b.fecha = current_date and b.fila = 'a_pie' and c.turno = p_turno
                    and c.turno_saltado_en < now() - interval '2 minutes') then
    raise exception 'FUERA_DE_PLAZO';
  end if;

  update citas c
     set turno_saltado_en = case when coalesce(p_saltado, true) then coalesce(c.turno_saltado_en, now()) end
    from bloques b
   where b.id = c.bloque_id
     and b.fecha = current_date
     and b.fila = 'a_pie'
     and c.turno = p_turno
     and c.estado in ('reservada', 'llego')
  returning c.id into v_id;

  if v_id is null then
    raise exception 'TURNO_NO_EXISTE';
  end if;

  return p_turno;
end;
$$;

revoke execute on function saltar_turno(int, boolean) from public, anon;
grant  execute on function saltar_turno(int, boolean) to authenticated;

create or replace function fila_de_turnos(p_fecha date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_fecha  date := coalesce(p_fecha, current_date);
  v_rol    text;
  v_bloque bloques;
  v_abre   timestamptz;
  v_codigo text;
  v_json   jsonb;
begin
  v_rol := exigir_rol(array['admin', 'voluntario']);

  if v_rol <> 'admin' then
    if v_fecha <> current_date then
      raise exception 'SOLO_HOY';
    end if;
    if not puede_escanear_fila('a_pie') then
      raise exception 'OTRA_FILA';
    end if;
  end if;

  select * into v_bloque from bloques b where b.fecha = v_fecha and b.fila = 'a_pie';
  if not found then
    return null;
  end if;

  select d.a_pie_abre_en, d.a_pie_codigo into v_abre, v_codigo from dias_entrega d where d.fecha = v_fecha;

  with turnos as (
    --  El codigo de un turno sin datos no se manda: es lo unico que prueba
    --  de quien es el turno (seccion 43). Se comprueba buscandolo.
    select c.turno, c.estado, c.turno_saltado_en, c.usado_en, p.nombre,
           case when p.anonima then null else p.codigo_corto end as codigo_corto
      from citas c
      join personas p on p.id = c.persona_id
     where c.bloque_id = v_bloque.id
       and c.estado <> 'cancelada'
  ),
  esperando as (
    select * from turnos t where t.estado in ('reservada', 'llego') and t.turno_saltado_en is null
  )
  select jsonb_build_object(
    'bloque_id',  v_bloque.id,
    'fecha',      v_bloque.fecha,
    'hora',       v_bloque.hora,
    'capacidad',  v_bloque.capacidad,
    'sin_limite', v_bloque.capacidad >= cupo_sin_limite(),
    'cerrado',    v_bloque.cerrado,
    'terminada',  v_bloque.terminada_en is not null,
    'abre_en',    v_abre at time zone 'America/Los_Angeles',
    --  El codigo del dia (seccion 43), si se pide: para decirlo en la entrada.
    'codigo_dia', v_codigo,
    'actual',     (select jsonb_build_object('turno', e.turno, 'nombre', e.nombre, 'codigo_corto', e.codigo_corto)
                     from esperando e order by e.turno limit 1),
    'siguientes', coalesce((select jsonb_agg(jsonb_build_object('turno', s.turno, 'nombre', s.nombre,
                                                                'codigo_corto', s.codigo_corto) order by s.turno)
                              from (select * from esperando e order by e.turno offset 1 limit 5) s), '[]'::jsonb),
    'saltados',   coalesce((select jsonb_agg(jsonb_build_object('turno', t.turno, 'nombre', t.nombre,
                                                                'codigo_corto', t.codigo_corto,
                                                                'saltado_en', t.turno_saltado_en) order by t.turno)
                              from turnos t
                             where t.estado in ('reservada', 'llego') and t.turno_saltado_en is not null), '[]'::jsonb),
    'ultimo',     (select jsonb_build_object('turno', t.turno, 'nombre', t.nombre, 'codigo_corto', t.codigo_corto)
                     from turnos t where t.estado = 'entregada' order by t.usado_en desc nulls last, t.turno desc limit 1),
    'atendidos',  (select count(*) from turnos t where t.estado = 'entregada'),
    'en_espera',  (select count(*) from esperando),
    'total',      (select count(*) from turnos)
  ) into v_json;

  return v_json;
end;
$$;

revoke execute on function fila_de_turnos(date) from public, anon;
grant  execute on function fila_de_turnos(date) to authenticated;

drop function if exists turno_de_cita(text);

create or replace function turno_de_cita(p_token text)
returns table (
  turno     int,
  estado    text,
  saltado   boolean,
  actual    int,
  antes     int,
  atendidos int,
  en_espera int,
  fecha     date,
  hora      time,
  --  La fila se termino (o el dia se cancelo): "la fila de hoy ya
  --  termino". Cerrar los turnos NO cuenta: quien ya tiene turno lo
  --  conserva.
  cerrada   boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita   citas;
  v_bloque bloques;
begin
  select * into v_cita from citas c where c.token_qr = p_token;
  if not found or v_cita.turno is null then
    return;
  end if;

  select * into v_bloque from bloques b where b.id = v_cita.bloque_id;

  return query
  with esperando as (
    select c.turno
      from citas c
     where c.bloque_id = v_bloque.id
       and c.estado in ('reservada', 'llego')
       and c.turno_saltado_en is null
  )
  select v_cita.turno,
         v_cita.estado,
         v_cita.turno_saltado_en is not null,
         (select min(e.turno) from esperando e)::int,
         (select count(*) from esperando e where e.turno < v_cita.turno)::int,
         (select count(*) from citas c where c.bloque_id = v_bloque.id and c.estado = 'entregada')::int,
         (select count(*) from esperando e)::int,
         v_bloque.fecha,
         v_bloque.hora,
         v_bloque.terminada_en is not null
           or exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and d.cerrado);
end;
$$;

revoke execute on function turno_de_cita(text) from public;
grant  execute on function turno_de_cita(text) to anon, authenticated;

create or replace function buscar_personas(p_texto text)
returns table (
  codigo_corto   text,
  nombre         text,
  --  El nombre sin acentos ni mayusculas: dos grupos con el mismo son
  --  "mismo nombre, otro telefono".
  nombre_clave   text,
  --  Mismo nombre y mismo telefono = mismo grupo. Va cifrado: no expone
  --  el telefono completo.
  grupo          text,
  telefono_final text,
  ciudad         text,
  registrada_en  timestamptz,
  citas          int,
  --  Con cita y con pase permanente.
  cajas          int,
  ultima_fecha   date,
  pase_activo    boolean,
  vip            boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_texto    text   := trim(coalesce(p_texto, ''));
  --  "cb 4871" o "4871" se buscan como CB-4871 (seccion 33).
  v_codigo   text   := normalizar_codigo_corto(p_texto);
  --  Sin acentos y en cualquier orden: "chavez oscar" encuentra a
  --  "Óscar A. Chávez".
  v_palabras text[] := array_remove(string_to_array(normalizar_texto(p_texto), ' '), '');
  --  Solo numeros (y espacios o guiones): se busca por telefono.
  v_digitos  text   := regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g');
  v_es_telefono boolean;
begin
  perform exigir_permiso('ver_personas');

  if char_length(v_texto) < 2 then
    return;
  end if;

  v_es_telefono := v_texto !~ '[[:alpha:]]' and char_length(v_digitos) >= 4;

  --  Las citas y las cajas con pase se cuentan de una vez para todas las
  --  encontradas (con el indice de citas por persona), no persona por
  --  persona: asi tardaba en cuanto habia cientos de registros.
  return query
  with encontradas as (
    select p.*
      from personas p
     where upper(p.codigo_corto) = v_codigo
        --  Los turnos sin datos (seccion 42) no salen al buscar por nombre:
        --  "Turno 23" no es una persona del padron. Por su codigo, si.
        or (not p.anonima and v_es_telefono
            and regexp_replace(coalesce(p.telefono, ''), '[^0-9]', '', 'g') like '%' || v_digitos || '%')
        or (not p.anonima and not v_es_telefono
            and cardinality(v_palabras) > 0
            and not exists (select 1 from unnest(v_palabras) w
                             where normalizar_texto(p.nombre) not like '%' || w || '%'))
     order by p.creado_en desc
     limit 150
  ),
  de_citas as (
    select c.persona_id,
           count(*) filter (where c.estado <> 'cancelada')::int as n_citas,
           count(*) filter (where c.estado = 'entregada')::int  as n_entregadas,
           max(b.fecha) filter (where c.estado <> 'cancelada')  as ultima
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.persona_id in (select e2.id from encontradas e2)
     group by c.persona_id
  ),
  de_pases as (
    select pa2.persona_id,
           pa2.activo,
           pa2.vip,
           (select count(*)::int from entregas_pase ep where ep.pase_id = pa2.id) as n_cajas,
           (select max(ep.fecha) from entregas_pase ep where ep.pase_id = pa2.id) as ultima
      from pases pa2
     where pa2.persona_id in (select e3.id from encontradas e3)
  )
  select e.codigo_corto,
         e.nombre,
         normalizar_texto(e.nombre),
         md5(normalizar_texto(e.nombre) || '|' || coalesce(e.telefono, '')),
         right(regexp_replace(coalesce(e.telefono, ''), '[^0-9]', '', 'g'), 4),
         coalesce(nullif(trim(e.ciudad), ''), nullif(trim(e.municipio), '')),
         e.creado_en,
         coalesce(dc.n_citas, 0),
         coalesce(dc.n_entregadas, 0) + coalesce(dp.n_cajas, 0),
         greatest(dc.ultima, dp.ultima),
         coalesce(dp.activo, false),
         coalesce(dp.activo and dp.vip, false)
    from encontradas e
    left join de_citas dc on dc.persona_id = e.id
    left join de_pases dp on dp.persona_id = e.id
   order by normalizar_texto(e.nombre), e.creado_en desc;
end;
$$;

revoke execute on function buscar_personas(text) from public, anon;
grant  execute on function buscar_personas(text) to authenticated;

drop function if exists reporte_por_dias(date, date, text);

create or replace function reporte_por_dias(p_desde date, p_hasta date, p_fila text default null)
returns table (
  fecha              date,
  capacidad          int,
  con_cita           int,
  recibieron         int,
  no_asistieron      int,
  pendientes         int,
  canceladas         int,
  con_excepcion      int,
  sin_cita           int,
  con_pase           int,
  cajas              int,
  intentos_repetidos int,
  --  Citas de carro que se cancelaron porque la persona se paso a la fila a
  --  pie (seccion 42): cuantos prefirieron no esperar en carro.
  cambios_a_pie      int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('ver_reportes');

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'RANGO_INVALIDO';
  end if;

  if p_hasta - p_desde > 366 then
    raise exception 'RANGO_MUY_LARGO';
  end if;

  if p_fila is not null and p_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  --  Con la zona de San Diego puesta, usado_en::date es la fecha de San Diego.
  return query
  with dias as (
    select b.fecha as dia from bloques b where b.fecha between p_desde and p_hasta and (p_fila is null or b.fila = p_fila)
    union
    select s.fecha from entradas_sin_cita s where s.fecha between p_desde and p_hasta and (p_fila is null or s.fila = p_fila)
    union
    select c.usado_en::date from citas c
      join bloques b on b.id = c.bloque_id
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
    union
    select e.fecha from entregas_pase e where e.fecha between p_desde and p_hasta and (p_fila is null or e.fila = p_fila)
  ),
  cupos as (
    --  Una fila a pie "sin limite" (seccion 38) no suma cupo: no lo tiene.
    select b.fecha as dia,
           sum(case when b.capacidad >= cupo_sin_limite() then 0 else b.capacidad end)::int as n
      from bloques b
     where b.fecha between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
     group by b.fecha
  ),
  agenda as (
    select b.fecha as dia,
           count(*) filter (where c.estado <> 'cancelada')::int as n_con_cita,
           count(*) filter (where c.estado = 'no_asistio'
                              or (c.estado in ('reservada', 'llego') and b.fecha < current_date))::int as n_no_asistieron,
           count(*) filter (where c.estado in ('reservada', 'llego') and b.fecha >= current_date)::int as n_pendientes,
           count(*) filter (where c.estado = 'cancelada')::int as n_canceladas,
           count(*) filter (where c.estado <> 'cancelada' and c.excepcion_id is not null)::int as n_excepcion
      from citas c
      join bloques b on b.id = c.bloque_id
     where b.fecha between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
     group by b.fecha
  ),
  entregas as (
    select c.usado_en::date as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.estado = 'entregada' and c.usado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
     group by c.usado_en::date
  ),
  sin_cita_dia as (
    select s.fecha as dia, count(*)::int as n
      from entradas_sin_cita s
     where s.fecha between p_desde and p_hasta and s.anulada_en is null and (p_fila is null or s.fila = p_fila)
     group by s.fecha
  ),
  pases_dia as (
    select e.fecha as dia, count(*)::int as n
      from entregas_pase e
     where e.fecha between p_desde and p_hasta and (p_fila is null or e.fila = p_fila)
     group by e.fecha
  ),
  repetidos as (
    select e.escaneado_en::date as dia, count(*)::int as n
      from escaneos e
      join citas   c on c.id = e.cita_id
      join bloques b on b.id = c.bloque_id
     where e.resultado = 'YA_USADO' and e.escaneado_en::date between p_desde and p_hasta
       and (p_fila is null or b.fila = p_fila)
     group by e.escaneado_en::date
  ),
  cambios as (
    select b.fecha as dia, count(*)::int as n
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.se_cambio_a_pie and b.fecha between p_desde and p_hasta
       and (p_fila is null or p_fila = 'carro')
     group by b.fecha
  )
  select d.dia,
         coalesce(cu.n, 0),
         coalesce(ag.n_con_cita, 0),
         coalesce(en.n, 0),
         coalesce(ag.n_no_asistieron, 0),
         coalesce(ag.n_pendientes, 0),
         coalesce(ag.n_canceladas, 0),
         coalesce(ag.n_excepcion, 0),
         coalesce(sc.n, 0),
         coalesce(pa.n, 0),
         --  Cajas del dia: las de cita, las de "entro sin cita" y las de
         --  los pases permanentes. Es el numero que se le reporta al
         --  banco de alimentos.
         coalesce(en.n, 0) + coalesce(sc.n, 0) + coalesce(pa.n, 0),
         coalesce(re.n, 0),
         coalesce(ca.n, 0)
    from dias d
    left join cupos        cu on cu.dia = d.dia
    left join agenda       ag on ag.dia = d.dia
    left join entregas     en on en.dia = d.dia
    left join sin_cita_dia sc on sc.dia = d.dia
    left join pases_dia    pa on pa.dia = d.dia
    left join repetidos    re on re.dia = d.dia
    left join cambios      ca on ca.dia = d.dia
   order by d.dia;
end;
$$;

revoke execute on function reporte_por_dias(date, date, text) from public;
grant  execute on function reporte_por_dias(date, date, text) to authenticated;

-- ============================================================
--  42. TURNO A PIE SIN DATOS (EL QR GENERAL)
-- ============================================================
--  Decidido con el Pastor David el 6 de octubre de 2026. En la fila a pie la
--  gente no quiere dar ni su nombre (el ambiente con migracion esta muy
--  feo). Un solo QR impreso en la entrada lleva a /turno: la persona toca
--  "Sacar mi turno" y recibe su numero y su QR, SIN dar ningun dato. Los
--  datos se iran pidiendo poco a poco, cuando la gente ya conozca el sistema.
--
--    * La "persona" del turno es anonima (personas.anonima): se llama
--      "Turno 23" y tiene su codigo CB, que es el que dice si el QR no se
--      lee. No guarda nombre, telefono ni domicilio.
--    * Un turno vivo por telefono por dia (citas.dispositivo_id, el mismo
--      identificador del registro publico). Si ya tiene, se le devuelve el
--      suyo. Si "no se presento", ese turno se pierde y el telefono puede
--      volver a escanear el QR general para formarse hasta atras.
--    * "No se presento" = el turno se pierde: su QR ya no entrega
--      (TURNO_PERDIDO). Se puede deshacer en los 2 minutos siguientes, por
--      si se marco al equivocado (el administrador, siempre).
--    * Quien no tiene telefono: una voluntaria le da turno desde el escaner
--      (dar_turno_sin_telefono) y le dice su numero y su codigo.
--    * Cambio de carro a pie: si ese telefono tiene cita de carro hoy, se le
--      advierte; si acepta, su cita de carro se cancela (su QR ya no sirve,
--      no hay doble despensa) y queda marcada para los reportes. No hay
--      regreso. Si ya recibio en carro, no saca turno a pie.
--    * Si es el DUENO del carro, el carro sale de la fila: tambien se cancelan
--      las citas de sus acompanantes (de cualquier telefono), y se le avisa
--      antes cuantos son. Cada acompanante saca su propio turno (con su
--      telefono o con la voluntaria). Un acompanante que se cambia solo no
--      afecta al dueno. (Decidido con Rodolfo el 6 de octubre de 2026.)
--    * El turno lo pone dar_turno() bajo el candado de reservar_cita(), como
--      siempre: cincuenta al mismo tiempo reciben 1 a 50 sin repetir.
--
--  Sin datos no se puede impedir del todo que alguien saque dos turnos (con
--  dos telefonos, o borrando el navegador). La regla de fondo sigue: un QR
--  da una sola caja.

alter table personas add column if not exists anonima boolean not null default false;

--  En la cita de CARRO que se cancelo porque la persona se cambio a pie.
alter table citas add column if not exists se_cambio_a_pie boolean not null default false;

--  Crea el turno anonimo en la fila a pie de hoy. Interna: la llaman
--  sacar_turno_a_pie() (el publico) y dar_turno_sin_telefono() (el equipo).
create or replace function crear_turno_anonimo(p_bloque_id uuid, p_dispositivo text, p_registrado_por uuid)
returns citas
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_persona  personas;
  v_cita     citas;
  v_codigo   text;
  v_intentos int := 0;
begin
  --  El codigo CB, como en el registro: si sale repetido se vuelve a sacar.
  loop
    v_codigo := 'CB-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    begin
      insert into personas (codigo_corto, nombre, anonima)
      values (v_codigo, 'Turno', true)
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  --  El mismo candado y el mismo cupo de siempre; el turno lo pone dar_turno().
  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas
     set dispositivo_id = p_dispositivo,
         registrado_por = p_registrado_por
   where id = v_cita.id
  returning * into v_cita;

  --  Su nombre es su turno: asi lo ve la voluntaria que lo llama.
  update personas set nombre = 'Turno ' || v_cita.turno where id = v_persona.id;

  return v_cita;
end;
$$;

revoke execute on function crear_turno_anonimo(uuid, text, uuid) from public, anon, authenticated;


--  El publico, desde el QR general. Responde con un resultado en vez de
--  lanzar error, para que la pagina sepa que decir:
--    NUEVO                turno recien sacado
--    YA_TENIA             ese telefono ya tiene turno hoy: se le devuelve
--    TIENE_CITA_EN_CARRO  tiene cita de carro hoy: se le pregunta si se cambia
--    YA_RECIBIO_EN_CARRO  ya recibio en carro hoy: no hay segunda despensa
--    AUN_NO_ABRE          todavia no es la hora (abre_en dice cuando)
--    NO_HAY_FILA          hoy no hay fila a pie
--    CERRADA              el dia o la fila se cerraron
--    FALTA_CODIGO         ese dia se pide el codigo del dia (seccion 43)
--    CODIGO_INCORRECTO    el codigo no es el del dia
--    DEMASIADOS_INTENTOS  5 codigos mal en 5 minutos: espera (segundos)
drop function if exists sacar_turno_a_pie(text, boolean);
drop function if exists sacar_turno_a_pie(text, boolean, text);

create or replace function sacar_turno_a_pie(
  p_dispositivo   text,
  p_cambiar_carro boolean default false,
  --  El codigo del dia, si ese dia se pide (seccion 43).
  p_codigo        text    default null
)
returns table (
  resultado  text,
  token_qr   text,
  codigo     text,
  turno      int,
  fecha      date,
  hora       time,
  abre_en    timestamp,
  citas_carro int,
  hora_carro time,
  --  Si es el dueno del carro: cuantos acompanantes se le cancelan tambien.
  acompanantes int,
  --  Con DEMASIADOS_INTENTOS: cuantos segundos faltan para volver a probar.
  espera     int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_disp     text := nullif(trim(coalesce(p_dispositivo, '')), '');
  v_bloque   bloques;
  v_abre     timestamptz;
  v_cerrado  boolean;
  v_cita     citas;
  v_carros   int;
  v_hora     time;
  v_duenos   uuid[];
  v_acomp    int := 0;
  v_codigo_dia text;
  v_fallos   int;
  v_primero  timestamptz;
begin
  if v_disp is null or char_length(v_disp) > 100 then
    raise exception 'DISPOSITIVO_INVALIDO';
  end if;

  select * into v_bloque from bloques b where b.fecha = current_date and b.fila = 'a_pie';
  select d.a_pie_abre_en, d.cerrado, d.a_pie_codigo into v_abre, v_cerrado, v_codigo_dia
    from dias_entrega d where d.fecha = current_date;

  if v_bloque.id is null or v_abre is null then
    return query select 'NO_HAY_FILA'::text, null::text, null::text, null::int, current_date, null::time,
                        null::timestamp, 0, null::time, 0, 0;
    return;
  end if;

  if coalesce(v_cerrado, false) or v_bloque.cerrado then
    return query select 'CERRADA'::text, null::text, null::text, null::int, current_date, v_bloque.hora,
                        null::timestamp, 0, null::time, 0, 0;
    return;
  end if;

  if now() < v_abre then
    return query select 'AUN_NO_ABRE'::text, null::text, null::text, null::int, current_date, v_bloque.hora,
                        (v_abre at time zone 'America/Los_Angeles'), 0, null::time, 0, 0;
    return;
  end if;

  --  Un telefono a la vez: dos toques seguidos no sacan dos turnos.
  perform pg_advisory_xact_lock(hashtext('turno-a-pie:' || v_disp || ':' || current_date::text));

  --  Ya tiene turno hoy (esperando o ya recibido): se le devuelve el suyo.
  --  Uno que "no se presento" ya no cuenta: puede sacar otro.
  select c.* into v_cita
    from citas c
   where c.bloque_id = v_bloque.id
     and c.dispositivo_id = v_disp
     and c.estado in ('reservada', 'llego', 'entregada')
     and c.turno_saltado_en is null
   order by c.creada_en desc
   limit 1;

  if v_cita.id is not null then
    return query select 'YA_TENIA'::text, v_cita.token_qr, p.codigo_corto, v_cita.turno, current_date,
                        v_bloque.hora, null::timestamp, 0, null::time, 0, 0
                   from personas p where p.id = v_cita.persona_id;
    return;
  end if;

  --  El codigo del dia (seccion 43): sin el no hay turno, asi no se saca
  --  desde la casa con el enlace. Cinco codigos mal desde un telefono lo
  --  frenan 5 minutos: no se puede adivinar probando.
  if v_codigo_dia is not null then
    select count(*)::int, min(i.creado_en) into v_fallos, v_primero
      from intentos_turno i
     where i.dispositivo = v_disp and i.creado_en > now() - interval '5 minutes';

    if v_fallos >= 5 then
      return query select 'DEMASIADOS_INTENTOS'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0,
                          greatest(1, ceil(extract(epoch from (v_primero + interval '5 minutes' - now())))::int);
      return;
    end if;

    if nullif(trim(coalesce(p_codigo, '')), '') is null then
      return query select 'FALTA_CODIGO'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0, 0;
      return;
    end if;

    --  Se registra y se RESPONDE (no se lanza error): un error desharia el
    --  registro del intento y el freno nunca se activaria.
    if trim(p_codigo) <> v_codigo_dia then
      insert into intentos_turno (dispositivo) values (v_disp);
      return query select 'CODIGO_INCORRECTO'::text, null::text, null::text, null::int, current_date,
                          null::time, null::timestamp, 0, null::time, 0, 0;
      return;
    end if;
  end if;

  --  Ya recibio en carro hoy desde este telefono: no hay segunda despensa.
  if exists (select 1 from citas c join bloques b on b.id = c.bloque_id
              where c.dispositivo_id = v_disp and b.fecha = current_date and b.fila = 'carro'
                and c.estado = 'entregada') then
    return query select 'YA_RECIBIO_EN_CARRO'::text, null::text, null::text, null::int, current_date,
                        null::time, null::timestamp, 0, null::time, 0, 0;
    return;
  end if;

  --  Tiene cita de carro hoy: primero se le pregunta.
  select count(*)::int, min(b.hora) into v_carros, v_hora
    from citas c join bloques b on b.id = c.bloque_id
   where c.dispositivo_id = v_disp and b.fecha = current_date and b.fila = 'carro'
     and c.estado in ('reservada', 'llego');

  --  Si es el dueno del carro: sus acompanantes, de cualquier telefono.
  select coalesce(array_agg(c.id), '{}') into v_duenos
    from citas c join bloques b on b.id = c.bloque_id
   where c.dispositivo_id = v_disp and b.fecha = current_date and b.fila = 'carro'
     and c.estado in ('reservada', 'llego') and c.acompana_a is null;

  select count(*)::int into v_acomp
    from citas c
   where c.acompana_a = any (v_duenos) and c.estado in ('reservada', 'llego');

  if v_carros > 0 and not coalesce(p_cambiar_carro, false) then
    return query select 'TIENE_CITA_EN_CARRO'::text, null::text, null::text, null::int, current_date,
                        null::time, null::timestamp, v_carros, v_hora, v_acomp, 0;
    return;
  end if;

  --  Se cambia a pie: sus citas de carro de hoy se cancelan (su QR ya no
  --  entrega) y quedan marcadas para los reportes. No hay regreso. Si es el
  --  dueno, el carro sale de la fila: tambien las de sus acompanantes.
  if v_carros > 0 then
    update citas c
       set estado             = 'cancelada',
           cancelada_en       = now(),
           motivo_cancelacion = case when c.dispositivo_id = v_disp then 'Se cambió a la fila a pie'
                                     else 'Su carro se cambió a la fila a pie' end,
           se_cambio_a_pie    = true
      from bloques b
     where b.id = c.bloque_id
       and (c.dispositivo_id = v_disp or c.acompana_a = any (v_duenos))
       and b.fecha = current_date
       and b.fila = 'carro'
       and c.estado in ('reservada', 'llego');
  end if;

  v_cita := crear_turno_anonimo(v_bloque.id, v_disp, null);

  return query select 'NUEVO'::text, v_cita.token_qr, p.codigo_corto, v_cita.turno, current_date,
                      v_bloque.hora, null::timestamp, v_carros, v_hora, v_acomp, 0
                 from personas p where p.id = v_cita.persona_id;
end;
$$;

revoke execute on function sacar_turno_a_pie(text, boolean, text) from public;
grant  execute on function sacar_turno_a_pie(text, boolean, text) to anon, authenticated;


--  Quien no tiene telefono: la voluntaria de la fila a pie le da turno y le
--  dice su numero y su codigo (CB-....). Queda quien lo dio. Tambien antes
--  de la hora de apertura, como el registro desde el panel, y sin el codigo
--  del dia (la voluntaria esta ahi). p_sena, opcional: un nombre o una sena
--  ("Maria, chamarra roja") para reconocerla si dos dicen el mismo turno;
--  de todos modos, el turno es de quien sabe el codigo.
drop function if exists dar_turno_sin_telefono();
drop function if exists dar_turno_sin_telefono(text);

create or replace function dar_turno_sin_telefono(p_sena text default null)
returns table (
  token_qr text,
  codigo   text,
  turno    int,
  nombre   text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_bloque bloques;
  v_cita   citas;
  v_sena   text;
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  select * into v_bloque from bloques b where b.fecha = current_date and b.fila = 'a_pie';
  if not found then
    raise exception 'FILA_A_PIE_NO_EXISTE';
  end if;

  if v_bloque.cerrado or exists (select 1 from dias_entrega d where d.fecha = current_date and d.cerrado) then
    raise exception 'DIA_CERRADO';
  end if;

  v_cita := crear_turno_anonimo(v_bloque.id, null, auth.uid());

  v_sena := left(regexp_replace(trim(coalesce(p_sena, '')), '\s+', ' ', 'g'), 40);
  if v_sena <> '' then
    update personas pe set nombre = pe.nombre || ' · ' || v_sena where pe.id = v_cita.persona_id;
  end if;

  return query select v_cita.token_qr, p.codigo_corto, v_cita.turno, p.nombre
                 from personas p where p.id = v_cita.persona_id;
end;
$$;

revoke execute on function dar_turno_sin_telefono(text) from public, anon;
grant  execute on function dar_turno_sin_telefono(text) to authenticated;


-- ============================================================
--  43. EL CODIGO DEL DIA Y LA LISTA DEL ESCANER
-- ============================================================
--  Pedido del 6 de octubre de 2026.
--
--  * El codigo del dia (fila a pie): con el enlace del QR general cualquiera
--    sacaria turno desde su casa mientras otros hacen fila desde las 9. Si
--    el administrador lo prende en la Fila a pie de ese dia, se genera un
--    codigo de 4 numeros al azar (distinto cada dia) que se escribe en la
--    entrada; sin el, sacar_turno_a_pie() no da turno. Cinco intentos
--    fallidos desde un telefono lo frenan 5 minutos. Los turnos que da la
--    voluntaria no lo piden.
--  * La lista del escaner de carros: el voluntario ve ahi mismo la gente de
--    hoy de la fila de carros (nombre, codigo, hora y estado; sin telefono
--    ni direccion) para buscarla por nombre sin ir a Citas de hoy.

alter table dias_entrega add column if not exists a_pie_codigo text;

--  Los intentos fallidos del codigo del dia, por telefono (el freno).
create table if not exists intentos_turno (
  id          bigint generated always as identity primary key,
  dispositivo text not null,
  creado_en   timestamptz not null default now()
);

create index if not exists idx_intentos_turno on intentos_turno (dispositivo, creado_en);
alter table intentos_turno enable row level security;

--  Prender, apagar o cambiar el codigo del dia de una fecha. Con p_activo
--  nulo solo lo lee. Devuelve el codigo (o nulo si no se pide).
create or replace function codigo_turno_a_pie(p_fecha date, p_activo boolean default null, p_nuevo boolean default false)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_codigo text;
begin
  perform exigir_rol(array['admin']);

  if not exists (select 1 from bloques b where b.fecha = p_fecha and b.fila = 'a_pie') then
    raise exception 'FILA_A_PIE_NO_EXISTE';
  end if;

  if p_activo is null then
    select d.a_pie_codigo into v_codigo from dias_entrega d where d.fecha = p_fecha;
    return v_codigo;
  end if;

  update dias_entrega d
     set a_pie_codigo = case
                          when not p_activo then null
                          when coalesce(p_nuevo, false) or d.a_pie_codigo is null
                            then lpad((floor(random() * 10000))::int::text, 4, '0')
                          else d.a_pie_codigo
                        end
   where d.fecha = p_fecha
  returning d.a_pie_codigo into v_codigo;

  return v_codigo;
end;
$$;

revoke execute on function codigo_turno_a_pie(date, boolean, boolean) from public, anon;
grant  execute on function codigo_turno_a_pie(date, boolean, boolean) to authenticated;


--  La fila a pie de hoy, para la pagina /turno: si hay, si ya abrio y si
--  pide el codigo del dia (nunca el codigo). Sin fila, ningun renglon.
--  "cerrada": ya no se dan turnos. "terminada": ademas, la fila acabo.
drop function if exists fila_a_pie_hoy();

create or replace function fila_a_pie_hoy()
returns table (
  hora        time,
  abre_en     timestamp,
  abierta     boolean,
  cerrada     boolean,
  pide_codigo boolean,
  terminada   boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select b.hora,
         d.a_pie_abre_en at time zone 'America/Los_Angeles',
         now() >= d.a_pie_abre_en,
         b.cerrado or d.cerrado or b.terminada_en is not null,
         d.a_pie_codigo is not null,
         d.cerrado or b.terminada_en is not null
    from bloques b
    join dias_entrega d on d.fecha = b.fecha
   where b.fecha = current_date
     and b.fila = 'a_pie'
     and d.a_pie_abre_en is not null;
$$;

revoke execute on function fila_a_pie_hoy() from public;
grant  execute on function fila_a_pie_hoy() to anon, authenticated;


--  La gente de hoy de la fila de carros, para el escaner: nombre, codigo,
--  hora y estado. Sin telefono ni direccion. Solo quien escanea en carros.
create or replace function lista_para_escaneo()
returns table (
  nombre       text,
  codigo_corto text,
  fecha        date,
  hora         time,
  estado       text,
  --  Si va de acompanante: el codigo de quien maneja.
  en_carro_de  text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('carro') then
    raise exception 'OTRA_FILA';
  end if;

  return query
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado, pd.codigo_corto
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
    left join citas    cd on cd.id = c.acompana_a
    left join personas pd on pd.id = cd.persona_id
   where b.fecha = current_date
     and b.fila = 'carro'
     and c.estado <> 'cancelada'
   order by b.hora, p.nombre;
end;
$$;

revoke execute on function lista_para_escaneo() from public, anon;
grant  execute on function lista_para_escaneo() to authenticated;


--  Terminar la fila a pie de hoy, al acabar: ya no se dan turnos y quien
--  todavia espera ve "La fila de hoy ya termino". La voluntaria de la fila
--  a pie o el administrador. Con p_terminada = false se deshace (si se toco
--  por error): la fila sigue y se vuelven a dar turnos.
create or replace function terminar_fila_a_pie(p_terminada boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_terminada boolean := coalesce(p_terminada, true);
  v_id        uuid;
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if not puede_escanear_fila('a_pie') then
    raise exception 'OTRA_FILA';
  end if;

  update bloques b
     set terminada_en = case when v_terminada then coalesce(b.terminada_en, now()) end,
         cerrado      = v_terminada
   where b.fecha = current_date
     and b.fila = 'a_pie'
  returning b.id into v_id;

  if v_id is null then
    raise exception 'FILA_A_PIE_NO_EXISTE';
  end if;

  return v_terminada;
end;
$$;

revoke execute on function terminar_fila_a_pie(boolean) from public, anon;
grant  execute on function terminar_fila_a_pie(boolean) to authenticated;


--  La busqueda del escaner: los turnos sin datos, solo con el codigo exacto.
create or replace function buscar_para_escaneo(p_texto text)
returns table (
  nombre       text,
  codigo_corto text,
  fecha        date,
  hora         time,
  estado       text,
  --  true: no hubo coincidencia exacta y este codigo se parece al
  --  tecleado (un digito distinto o dos al reves). Solo citas de hoy.
  parecido     boolean
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_texto    text   := trim(coalesce(p_texto, ''));
  --  "cb 4871", "4871" o "CB487l" se buscan como CB-4871 (seccion 33).
  v_codigo   text   := normalizar_codigo_corto(p_texto);
  --  Sin acentos y en cualquier orden: "garcia maria" encuentra a
  --  "María García". En el telefono casi nadie escribe acentos.
  v_palabras text[] := array_remove(string_to_array(normalizar_texto(p_texto), ' '), '');
begin
  perform exigir_rol(array['admin', 'voluntario']);

  if v_texto = '' then
    return;
  end if;

  return query
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado, false
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and (
       --  Los turnos sin datos (personas.anonima) solo salen con el codigo
       --  EXACTO: su codigo es lo unico que prueba de quien es el turno. Si
       --  dos dicen "yo soy el 50", gana quien sabe el codigo (seccion 43).
       (b.fecha = current_date
        and not p.anonima
        and (p.codigo_corto ilike '%' || v_texto || '%'
             or (cardinality(v_palabras) > 0
                 and not exists (select 1 from unnest(v_palabras) w
                                  where normalizar_texto(p.nombre) not like '%' || w || '%'))))
       or
       (upper(p.codigo_corto) = v_codigo
        and b.fecha between current_date - 7 and current_date + 14)
     )
   order by (b.fecha = current_date) desc,
            abs(b.fecha - current_date),
            p.nombre
   limit 20;

  --  Nada con ese codigo: casi siempre es un digito mal tecleado. Se
  --  ofrecen los de HOY que se le parecen, y el voluntario confirma con
  --  el nombre. No abre el padron: son las mismas citas que ya salen al
  --  buscar por nombre.
  if found or v_codigo !~ '^CB-[0-9]{4}$' then
    return;
  end if;

  return query
  select p.nombre, p.codigo_corto, b.fecha, b.hora, c.estado, true
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.estado <> 'cancelada'
     and b.fecha = current_date
     and not p.anonima
     and codigos_parecidos(upper(p.codigo_corto), v_codigo)
   order by p.nombre
   limit 5;
end;
$$;


revoke execute on function buscar_para_escaneo(text) from public;
grant  execute on function buscar_para_escaneo(text) to authenticated;

commit;
