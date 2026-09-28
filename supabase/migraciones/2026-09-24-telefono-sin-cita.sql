-- ============================================================
--  Cajita de Bendicion - "Entro sin cita" con telefono
--
--  Decision del pastor, 24 de septiembre de 2026: a quien pasa sin cita se
--  le pide tambien el telefono (opcional), para mandarle despues su
--  comprobante o avisos por WhatsApp o mensaje. Ese envio todavia no existe:
--  falta que el pastor decida el canal.
--
--  * Columna entradas_sin_cita.telefono.
--  * registrar_entrada_sin_cita() recibe p_telefono (opcional), lo valida
--    (+lada y numero) y avisa si ese telefono ya se anoto hoy
--    (TELEFONO_YA_ANOTADO_HOY, se confirma igual que el nombre repetido).
--  * entradas_sin_cita_del_dia() devuelve el telefono.
--
--  Requiere 2026-09-24-errores-humanos.sql. Se puede repetir. La app de antes
--  sigue funcionando con esta base (no manda telefono).
-- ============================================================

begin;

--  El telefono de quien paso sin cita (decision del pastor, 24 de septiembre
--  de 2026): para mandarle despues su comprobante o avisos, cuando se decida
--  el canal (WhatsApp o mensaje). Opcional: quien no lo tiene o no lo quiere
--  dar, pasa igual.
alter table entradas_sin_cita add column if not exists telefono text;

--  "Entro sin cita": anota a una persona que paso sin cita. Devuelve su
--  codigo de comprobante y cuantas van hoy.
--
--  Nunca al alcance del publico: pide la palomita anotar_sin_cita (el admin
--  siempre puede). El nombre, y el telefono si lo da (en formato
--  internacional, +lada y numero).
drop function if exists registrar_entrada_sin_cita(text);

drop function if exists registrar_entrada_sin_cita(text, text);

drop function if exists registrar_entrada_sin_cita(text, text, boolean);

create or replace function registrar_entrada_sin_cita(
  p_nombre             text,
  p_fila               text    default null,
  p_confirmar_repetido boolean default false,
  p_telefono           text    default null
)
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
  --  Sin espacios: "+1 619 555 0123" se guarda "+16195550123". Vacio = sin telefono.
  v_telefono text := nullif(regexp_replace(coalesce(p_telefono, ''), '\s', '', 'g'), '');
  v_codigo   text;
  v_intentos int := 0;
  --  Sin fila, la de quien la anota (seccion 32).
  v_fila     text := coalesce(p_fila, fila_de_entrega());
  v_repetido text;
begin
  perform exigir_permiso('anotar_sin_cita');

  if v_fila not in ('carro', 'a_pie') then
    raise exception 'FILA_INVALIDA';
  end if;

  if not puede_escanear_fila(v_fila) then
    raise exception 'OTRA_FILA';
  end if;

  if v_nombre = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if v_nombre ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  --  El mismo formato que el registro: la pantalla ya lo convierte asi.
  if v_telefono is not null and v_telefono !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  --  La misma persona anotada dos veces hoy (seccion 33): dos voluntarios
  --  en la puerta, o el mismo que toco dos veces. Cada anotacion es una caja
  --  que se reporta al banco de alimentos; una de mas descuadra la cuenta.
  --  Se avisa con el comprobante que ya tiene, y si de verdad es otra
  --  persona (mismo nombre, o una familia que comparte telefono), se
  --  confirma y pasa.
  --
  --  Los candados hacen que dos anotaciones iguales al mismo tiempo esperen
  --  su turno: la segunda ya ve la primera. Siempre en el mismo orden
  --  (nombre, luego telefono) para que dos no se esperen entre si.
  if not coalesce(p_confirmar_repetido, false) then
    perform pg_advisory_xact_lock(hashtext('sin-cita:' || current_date::text || ':' || normalizar_texto(v_nombre)));
    if v_telefono is not null then
      perform pg_advisory_xact_lock(hashtext('sin-cita-tel:' || current_date::text || ':' || v_telefono));
    end if;

    select s.codigo into v_repetido
      from entradas_sin_cita s
     where s.fecha = current_date
       and s.anulada_en is null
       and normalizar_texto(s.nombre) = normalizar_texto(v_nombre)
     order by s.registrado_en desc
     limit 1;

    if v_repetido is not null then
      raise exception 'NOMBRE_YA_ANOTADO_HOY:%', v_repetido;
    end if;

    if v_telefono is not null then
      select s.codigo into v_repetido
        from entradas_sin_cita s
       where s.fecha = current_date
         and s.anulada_en is null
         and s.telefono = v_telefono
       order by s.registrado_en desc
       limit 1;

      if v_repetido is not null then
        raise exception 'TELEFONO_YA_ANOTADO_HOY:%', v_repetido;
      end if;
    end if;
  end if;

  --  Se reintenta si dos anotaciones del mismo dia sacan el mismo numero.
  loop
    v_codigo := 'SC-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into entradas_sin_cita (fecha, nombre, telefono, codigo, registrado_por, fila)
      values (current_date, v_nombre, v_telefono, v_codigo, v_usuario, v_fila);
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
             where s.fecha = current_date and s.anulada_en is null and s.fila = v_fila);
end;
$$;


revoke execute on function registrar_entrada_sin_cita(text, text, boolean, text) from public, anon;
grant  execute on function registrar_entrada_sin_cita(text, text, boolean, text) to authenticated;


--  La lista del dia: quien paso sin cita, su telefono si lo dio, quien lo
--  anoto y a que hora. De quien anoto se muestra su correo, que es como el
--  pastor reconoce a su equipo. Con la palomita anotar_sin_cita.
drop function if exists entradas_sin_cita_del_dia(date);

create or replace function entradas_sin_cita_del_dia(p_fecha date default null)
returns table (
  codigo        text,
  nombre        text,
  telefono      text,
  registrado_en timestamptz,
  anotado_por   text,
  anulada       boolean,
  anulada_en    timestamptz,
  anulada_por   text,
  fila          text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('anotar_sin_cita');

  return query
  select s.codigo,
         s.nombre,
         s.telefono,
         s.registrado_en,
         u.email::text,
         s.anulada_en is not null,
         s.anulada_en,
         ua.email::text,
         s.fila
    from entradas_sin_cita s
    left join auth.users u  on u.id  = s.registrado_por
    left join auth.users ua on ua.id = s.anulada_por
   where s.fecha = coalesce(p_fecha, current_date)
   order by s.registrado_en desc;
end;
$$;


revoke execute on function entradas_sin_cita_del_dia(date) from public, anon;
grant  execute on function entradas_sin_cita_del_dia(date) to authenticated;

commit;
