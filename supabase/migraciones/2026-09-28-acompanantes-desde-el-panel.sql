-- ============================================================
--  Cajita de Bendicion - Acompanantes desde el panel
--
--  "Registrar persona" en el panel tambien pregunta como viene: con su
--  carro (aparta un lugar) o en el carro de alguien que ya tiene cita,
--  con el codigo CB de quien maneja (no ocupa otro lugar). Es la misma
--  regla del registro publico (seccion 39): la busqueda de la cita de quien
--  maneja y el tope por carro de reservar_cita().
--
--  Solo cambia registrar_desde_panel() (le crecen p_codigo_acompanante y
--  p_fecha). La pagina publicada sigue funcionando con esta migracion: los
--  parametros nuevos son opcionales.
--  Requiere 2026-09-28-acompanantes.sql. Se puede repetir.
-- ============================================================

begin;

drop function if exists registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean);

--  Le crecieron p_codigo_acompanante y p_fecha, como al registro publico
--  (seccion 39).
drop function if exists registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, date);

create or replace function registrar_desde_panel(
  p_nombre            text,
  p_apellidos         text,
  p_telefono          text,
  p_bloque_id         uuid,
  p_email             text    default null,
  p_pais              text    default null,
  p_codigo_postal     text    default null,
  p_colonia           text    default null,
  p_calle             text    default null,
  p_numero            text    default null,
  p_numero_interior   text    default null,
  p_sin_domicilio     boolean default false,
  p_acepto_privacidad boolean default false,
  --  Viene en el carro de alguien que ya tiene cita (seccion 39): el codigo
  --  CB de quien maneja. Va a su horario; con p_fecha basta.
  p_codigo_acompanante text   default null,
  p_fecha             date    default null
)
returns table (
  codigo_corto text,
  token_qr     text,
  fecha        date,
  hora         time,
  --  true: ya tenia su cita ese dia y se le devuelve esa (seccion 33).
  ya_existia   boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario   uuid := auth.uid();
  v_bloque_id uuid := p_bloque_id;
  v_dia       date;
  v_duenio    citas;
  v_nombres   text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_apellidos text := regexp_replace(trim(coalesce(p_apellidos, '')), '\s+', ' ', 'g');
  v_telefono  text := trim(coalesce(p_telefono, ''));
  v_domicilio record;
  v_bloque    bloques;
  v_persona   personas;
  v_cita      citas;
  v_codigo    text;
  v_intentos  int := 0;
  v_previa    citas;
begin
  perform exigir_permiso('registrar_personas');

  if v_nombres = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if v_apellidos = '' then
    raise exception 'APELLIDOS_REQUERIDOS';
  end if;

  if v_nombres ~ '[0-9]' or v_apellidos ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  if v_telefono = '' then
    raise exception 'TELEFONO_REQUERIDO';
  end if;

  if v_telefono !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  if coalesce(trim(p_email), '') <> ''
     and trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'EMAIL_INVALIDO';
  end if;

  select * into v_domicilio
    from validar_domicilio(p_pais, p_codigo_postal, p_colonia, p_calle,
                           p_numero, p_numero_interior, p_sin_domicilio);

  if not coalesce(p_acepto_privacidad, false) then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
  end if;

  --  Acompanante: la cita de carro propio de ese codigo ese dia, igual que
  --  en el registro publico. Queda en ese horario y no ocupa otro lugar; el
  --  tope por carro lo revisa reservar_cita().
  if nullif(trim(coalesce(p_codigo_acompanante, '')), '') is not null then
    select b.fecha into v_dia from bloques b where b.id = p_bloque_id;
    v_dia := coalesce(v_dia, p_fecha);

    select c.* into v_duenio
      from citas c
      join personas p on p.id = c.persona_id
      join bloques  b on b.id = c.bloque_id
     where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo_acompanante)
       and b.fecha = v_dia
       and b.fila = 'carro'
       and c.estado in ('reservada', 'llego')
       and c.acompana_a is null
     order by c.creada_en
     limit 1;

    if v_duenio.id is null then
      raise exception 'ACOMPANANTE_SIN_CITA';
    end if;

    v_bloque_id := v_duenio.bloque_id;
  end if;

  --  Sin horario se da de alta a la persona y ya: es lo que hace falta
  --  para darle un pase permanente (seccion 29), que no aparta lugar.
  if v_bloque_id is not null then
    select * into v_bloque from bloques where id = v_bloque_id;
    if not found then
      raise exception 'BLOQUE_NO_EXISTE';
    end if;

    --  La fila a pie no recibe citas hasta que el administrador la arme con
    --  su hora de apertura (seccion 38). El equipo si registra antes de esa
    --  hora, igual que en carro.
    if v_bloque.fila = 'a_pie'
       and not exists (select 1 from dias_entrega d
                        where d.fecha = v_bloque.fecha and d.a_pie_abre_en is not null) then
      raise exception 'A_PIE_CERRADO';
    end if;

    --  El admin puede registrar aunque el dia no se haya abierto al publico,
    --  pero no en un dia cerrado (dia festivo, entrega cancelada).
    --  "d.fecha" calificado: sin prefijo chocaria con la columna "fecha" que
    --  devuelve esta funcion.
    if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
      raise exception 'DIA_CERRADO';
    end if;

    --  La misma persona ya tiene cita ese dia (seccion 33): se devuelve la
    --  suya, que el personal puede ver, en vez de darle una segunda.
    v_previa := cita_de_la_misma_persona(v_bloque.fecha, v_telefono, v_nombres || ' ' || v_apellidos);

    if v_previa.id is not null then
      return query
        select p.codigo_corto, v_previa.token_qr, b.fecha, b.hora, true
          from personas p, bloques b
         where p.id = v_previa.persona_id
           and b.id = v_previa.bloque_id;
      return;
    end if;
  end if;

  loop
    v_codigo := 'CB-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, email,
                            pais, codigo_postal, ciudad, colonia, municipio, estado,
                            calle, numero_exterior, numero_interior, direccion,
                            sin_domicilio, acepto_privacidad_en)
      values (v_codigo,
              v_nombres || ' ' || v_apellidos,
              v_nombres,
              v_apellidos,
              v_telefono,
              nullif(trim(p_email), ''),
              v_domicilio.o_pais,
              v_domicilio.o_codigo_postal,
              v_domicilio.o_ciudad,
              v_domicilio.o_colonia,
              v_domicilio.o_municipio,
              v_domicilio.o_estado,
              v_domicilio.o_calle,
              v_domicilio.o_numero,
              v_domicilio.o_numero_interior,
              v_domicilio.o_direccion,
              coalesce(p_sin_domicilio, false),
              now())
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  if v_bloque_id is null then
    return query select v_persona.codigo_corto, null::text, null::date, null::time, false;
    return;
  end if;

  v_cita := reservar_cita(v_persona.id, v_bloque_id, v_duenio.id);

  update citas set registrado_por = v_usuario where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, date) from public, anon;
grant  execute on function registrar_desde_panel(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, date) to authenticated;

commit;
