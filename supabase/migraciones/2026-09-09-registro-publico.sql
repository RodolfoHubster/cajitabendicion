-- ============================================================
--  Cajita de Bendicion - Registro publico
--  Correr sobre una base que YA tiene las tablas.
--  Se puede correr dos veces sin romper nada.
-- ============================================================

-- ============================================================
--  13. CONSULTAR DISPONIBILIDAD
-- ============================================================
--  Alimenta /calendario y /horarios/:fecha.
--
--  Es una funcion y no una politica de lectura sobre citas a
--  proposito: devuelve unicamente numeros agregados. Nunca sale de
--  aqui quien reservo, ni su nombre, ni su telefono. Parte de la
--  comunidad atendida tiene estatus migratorio delicado; una funcion
--  estrecha no puede filtrar de mas, una politica mal escrita si.
--
--  No se filtra por lunes y jueves. El calendario muestra las fechas
--  que TIENEN bloques, y el administrador decide cuales crear. Asi una
--  entrega especial en miercoles funciona sin tocar el codigo.

create or replace function consultar_disponibilidad(
  p_desde date default null,
  p_hasta date default null
)
returns table (
  bloque_id uuid,
  fecha     date,
  hora      time,
  capacidad int,
  ocupados  int,
  libres    int
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select b.id,
         b.fecha,
         b.hora,
         b.capacidad,
         count(c.id) filter (where c.estado <> 'cancelada')::int,
         greatest(
           b.capacidad - count(c.id) filter (where c.estado <> 'cancelada'),
           0
         )::int
    from bloques b
    left join citas c on c.bloque_id = b.id
   where b.cerrado = false
     -- Nunca se ofrecen fechas pasadas: reservar_cita() las rechazaria
     -- con FECHA_PASADA y el usuario no entenderia por que.
     and b.fecha >= greatest(coalesce(p_desde, current_date), current_date)
     and b.fecha <= coalesce(p_hasta, current_date + 60)
   group by b.id, b.fecha, b.hora, b.capacidad
   order by b.fecha, b.hora;
$$;

revoke execute on function consultar_disponibilidad(date, date) from public;
grant  execute on function consultar_disponibilidad(date, date) to anon, authenticated;


-- ============================================================
--  14. CONFIGURACION
-- ============================================================
--  Ajustes que el administrador cambia sin tocar codigo.

create table if not exists configuracion (
  clave text primary key,
  valor text not null,
  nota  text
);

insert into configuracion (clave, valor, nota) values
  ('limite_citas_por_dispositivo', '1',
   'Cuantas citas puede crear un mismo telefono por semana. Es un tope, ' ||
   'no un muro: una ventana privada o borrar datos del navegador cuenta ' ||
   'como dispositivo nuevo. Se sube cuando llega una familia que comparte ' ||
   'un solo telefono.')
on conflict (clave) do nothing;


-- ============================================================
--  15. REGISTRO PUBLICO
-- ============================================================

--  De que dispositivo salio cada cita. Es una senal, no una identidad:
--  sirve para topar el abuso obvio y para que el panel muestre patrones.
alter table citas add column if not exists dispositivo_id text;

create index if not exists idx_citas_dispositivo
  on citas (dispositivo_id, semana)
  where estado <> 'cancelada';


--  Crea la persona y aparta su lugar, todo en una sola transaccion.
--  Si algo falla a la mitad, no queda una persona sin cita.
--
--  Se borra antes de crearla porque una version previa tenia p_email con
--  valor por defecto. Postgres no deja quitar defaults con "create or
--  replace" (42P13); hay que tirar la funcion y volverla a hacer. Borrar
--  una funcion no toca ningun dato.
drop function if exists registrar_y_reservar(text, text, uuid, text, text, text);

create or replace function registrar_y_reservar(
  p_nombre      text,
  p_telefono    text,
  p_bloque_id   uuid,
  p_email       text,
  p_ciudad      text default null,
  p_dispositivo text default null
)
returns table (
  codigo_corto text,
  token_qr     text,
  fecha        date,
  hora         time
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_bloque   bloques;
  v_semana   date;
  v_limite   int;
  v_usadas   int;
  v_persona  personas;
  v_cita     citas;
  v_codigo   text;
  v_intentos int := 0;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  if coalesce(trim(p_telefono), '') = '' then
    raise exception 'TELEFONO_REQUERIDO';
  end if;

  --  El correo es obligatorio en el registro publico. La columna sigue
  --  aceptando nulos a proposito: el registro manual que hace un
  --  voluntario para un adulto mayor tiene que poder guardarse sin
  --  correo. La regla vive aqui, en la puerta publica, no en la tabla.
  if coalesce(trim(p_email), '') = '' then
    raise exception 'EMAIL_REQUERIDO';
  end if;

  --  Comprobacion minima de forma. No se intenta adivinar si el correo
  --  existe: eso solo se sabe mandandole algo. Solo se atajan dedazos.
  if trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'EMAIL_INVALIDO';
  end if;

  select * into v_bloque from bloques where id = p_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  v_semana := date_trunc('week', v_bloque.fecha)::date;

  -- ----------------------------------------------------------
  --  Tope por dispositivo
  -- ----------------------------------------------------------
  --  El candado serializa los registros de un mismo telefono. Sin el,
  --  tres pestanas mandando al mismo tiempo pasarian las tres el
  --  "cuantas lleva" antes de que ninguna hubiera insertado: es el
  --  mismo patron ingenuo que reproduce el bug del Google Form.
  if p_dispositivo is not null then
    perform pg_advisory_xact_lock(hashtext(p_dispositivo));

    select valor::int into v_limite
      from configuracion
     where clave = 'limite_citas_por_dispositivo';

    v_limite := coalesce(v_limite, 1);

    select count(*) into v_usadas
      from citas
     where dispositivo_id = p_dispositivo
       and semana = v_semana
       and estado <> 'cancelada';

    if v_usadas >= v_limite then
      raise exception 'LIMITE_DISPOSITIVO';
    end if;
  end if;

  -- ----------------------------------------------------------
  --  Codigo corto tipo CB-4871
  -- ----------------------------------------------------------
  --  Se reintenta porque dos registros simultaneos pueden sacar el
  --  mismo numero al azar. El indice unico los separa; aqui solo se
  --  vuelve a intentar. Son 10,000 codigos para unas 2,000 personas.
  loop
    v_codigo := 'CB-' || lpad((floor(random() * 10000))::int::text, 4, '0');

    begin
      insert into personas (codigo_corto, nombre, telefono, email, ciudad)
      values (v_codigo,
              trim(p_nombre),
              nullif(trim(p_telefono), ''),
              nullif(trim(p_email), ''),
              nullif(trim(p_ciudad), ''))
      returning * into v_persona;
      exit;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 50 then
        raise exception 'SIN_CODIGOS_DISPONIBLES';
      end if;
    end;
  end loop;

  --  reservar_cita hace el bloqueo de fila que impide el sobrecupo y
  --  aplica la regla de una cita por semana. No se duplica aqui.
  v_cita := reservar_cita(v_persona.id, p_bloque_id);

  update citas set dispositivo_id = p_dispositivo where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;
end;
$$;

revoke execute on function registrar_y_reservar(text, text, uuid, text, text, text) from public;
grant  execute on function registrar_y_reservar(text, text, uuid, text, text, text) to anon, authenticated;


-- ============================================================
--  16. CONSULTAR LA PROPIA CITA
-- ============================================================
--  Alimenta /confirmacion/:token. Permite recargar la pagina o volver
--  al enlace despues, sin perder el codigo.
--
--  Devuelve el nombre porque el mockup lo muestra ("A nombre de...") y
--  porque el voluntario lo necesita para cotejar. No expone telefono,
--  correo ni direccion: quien tiene el token ve su cita, nada mas.
--
--  El token son 24 bytes aleatorios, no se adivina.

create or replace function consultar_cita(p_token text)
returns table (
  codigo_corto text,
  nombre       text,
  fecha        date,
  hora         time,
  estado       text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.codigo_corto, p.nombre, b.fecha, b.hora, c.estado
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where c.token_qr = p_token;
$$;

revoke execute on function consultar_cita(text) from public;
grant  execute on function consultar_cita(text) to anon, authenticated;


