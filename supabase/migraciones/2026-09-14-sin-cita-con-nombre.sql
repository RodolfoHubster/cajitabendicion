-- ============================================================
--  Cajita de Bendicion - "Entro sin cita" con nombre, codigo de
--  comprobante y lista de quien lo anoto; se anula en vez de borrar
--
--  Requiere haber corrido antes 2026-09-14-cancelar-sin-cita-excepcion.sql.
--  Se puede repetir.
--
--  Las entradas anotadas antes de esta migracion se quedan sin nombre ni
--  codigo; siguen contando.
-- ============================================================

--  Cambian los parametros y lo que devuelven: Postgres obliga a borrarlas
--  antes. Borrar una funcion no toca ningun dato.
drop function if exists registrar_entrada_sin_cita();
drop function if exists deshacer_entrada_sin_cita();

--  "Entro sin cita" guarda el nombre (sin telefono) y un codigo de
--  comprobante que se le da a la persona, por si hay que aclarar un error
--  despues. No se borra: se anula, y queda quien lo anulo y cuando.
alter table entradas_sin_cita add column if not exists nombre      text;
alter table entradas_sin_cita add column if not exists codigo      text;
alter table entradas_sin_cita add column if not exists anulada_en  timestamptz;
alter table entradas_sin_cita add column if not exists anulada_por uuid;

--  El codigo SC-1234 no se repite en un mismo dia.
create unique index if not exists entradas_sin_cita_codigo_por_dia
  on entradas_sin_cita (fecha, codigo)
  where codigo is not null;


--  "Entro sin cita": anota a una persona que paso sin cita. Devuelve su
--  codigo de comprobante y cuantas van hoy.
--
--  Solo admin: CLAUDE.md pide que nunca este al alcance del publico ni de los
--  voluntarios. Solo el nombre, sin telefono.
create or replace function registrar_entrada_sin_cita(p_nombre text)
returns table (
  codigo text,
  total  int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario  uuid := auth.uid();
  v_nombre   text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_codigo   text;
  v_intentos int := 0;
begin
  perform exigir_rol(array['admin']);

  if v_nombre = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if v_nombre ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  --  Se reintenta si dos anotaciones del mismo dia sacan el mismo numero.
  loop
    v_codigo := 'SC-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into entradas_sin_cita (fecha, nombre, codigo, registrado_por)
      values (current_date, v_nombre, v_codigo, v_usuario);
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  return query
    select v_codigo,
           (select count(*)::int from entradas_sin_cita s
             where s.fecha = current_date and s.anulada_en is null);
end;
$$;

revoke execute on function registrar_entrada_sin_cita(text) from public;
grant  execute on function registrar_entrada_sin_cita(text) to authenticated;


--  Anula una entrada sin cita anotada por error. No la borra: deja de contar
--  y queda quien la anulo y cuando. Devuelve cuantas cuentan ese dia.
create or replace function anular_entrada_sin_cita(p_codigo text, p_fecha date default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_fecha   date := coalesce(p_fecha, current_date);
  v_id      uuid;
  v_anulada timestamptz;
begin
  perform exigir_rol(array['admin']);

  select s.id, s.anulada_en into v_id, v_anulada
    from entradas_sin_cita s
   where s.fecha = v_fecha
     and upper(s.codigo) = upper(trim(coalesce(p_codigo, '')))
     for update;

  if v_id is null then
    raise exception 'ENTRADA_NO_EXISTE';
  end if;

  if v_anulada is not null then
    raise exception 'ENTRADA_YA_ANULADA';
  end if;

  update entradas_sin_cita
     set anulada_en  = now(),
         anulada_por = v_usuario
   where id = v_id;

  return (select count(*)::int from entradas_sin_cita s
           where s.fecha = v_fecha and s.anulada_en is null);
end;
$$;

revoke execute on function anular_entrada_sin_cita(text, date) from public;
grant  execute on function anular_entrada_sin_cita(text, date) to authenticated;


--  La lista del dia: quien paso sin cita, quien lo anoto y a que hora.
--  De quien anoto se muestra su correo, que es como el pastor reconoce
--  a su equipo. Solo admin.
create or replace function entradas_sin_cita_del_dia(p_fecha date default null)
returns table (
  codigo        text,
  nombre        text,
  registrado_en timestamptz,
  anotado_por   text,
  anulada       boolean,
  anulada_en    timestamptz,
  anulada_por   text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  return query
  select s.codigo,
         s.nombre,
         s.registrado_en,
         u.email::text,
         s.anulada_en is not null,
         s.anulada_en,
         ua.email::text
    from entradas_sin_cita s
    left join auth.users u  on u.id  = s.registrado_por
    left join auth.users ua on ua.id = s.anulada_por
   where s.fecha = coalesce(p_fecha, current_date)
   order by s.registrado_en desc;
end;
$$;

revoke execute on function entradas_sin_cita_del_dia(date) from public;
grant  execute on function entradas_sin_cita_del_dia(date) to authenticated;


--  El resumen del dia deja de contar las entradas anuladas.
create or replace function resumen_del_dia(p_fecha date default null)
returns table (
  fecha              date,
  con_cita           int,
  ya_recibieron      int,
  faltan_por_llegar  int,
  sin_cita           int,
  intentos_repetidos int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_fecha date := coalesce(p_fecha, current_date);
begin
  -- Las estadisticas son solo del administrador.
  perform exigir_rol(array['admin']);

  return query
  select
    v_fecha,
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha
        and c.estado in ('reservada','llego','entregada')),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and c.estado = 'entregada'),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and c.estado = 'reservada'),
    --  Las anotadas por error se anulan y ya no cuentan (seccion 22).
    (select count(*)::int from entradas_sin_cita s where s.fecha = v_fecha and s.anulada_en is null),
    --  Intentos repetidos: alguien trato de usar dos veces el mismo
    --  codigo. Es la senal de que el corte esta funcionando y de que
    --  hay quien lo esta intentando.
    (select count(*)::int from escaneos e
       join citas   c on c.id = e.cita_id
       join bloques b on b.id = c.bloque_id
      where b.fecha = v_fecha and e.resultado = 'YA_USADO');
end;
$$;

revoke execute on function resumen_del_dia(date) from public;
grant  execute on function resumen_del_dia(date) to authenticated;
