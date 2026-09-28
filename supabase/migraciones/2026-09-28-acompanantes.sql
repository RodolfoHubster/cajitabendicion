-- ============================================================
--  Cajita de Bendicion - Acompanantes en el carro
--
--  Un lugar es un carro. Quien viene en el carro de alguien que ya tiene
--  cita se registra con el codigo CB de quien maneja: tiene su QR y su
--  caja, pero no ocupa otro lugar. Tope de acompanantes por carro en
--  configuracion (acompanantes_por_carro = 3).
--
--  Cambia reservar_cita() (le crece p_acompana_a; mismo candado de
--  siempre), registrar_y_reservar() (p_codigo_acompanante y p_fecha),
--  consultar_disponibilidad, bloques_del_dia, listar_dias_entrega,
--  reservar_con_excepcion y mover_cita: cuentan carros, no personas.
--
--  Las citas que ya existen son de carro propio: nada cambia para ellas.
--  La pagina publicada sigue funcionando con esta migracion. Correrla
--  FUERA del horario de entrega (toca la funcion que aparta los lugares).
--  Requiere 2026-09-28-reglas-a-pie.sql. Se puede repetir.
-- ============================================================

begin;

-- ============================================================
--  39. ACOMPANANTES EN EL CARRO: UN LUGAR ES UN CARRO
-- ============================================================
--  Pedido del 28 de septiembre de 2026 (opcion A de las que se platicaron
--  el 24): el cupo de cada horario es de CARROS, no de personas. Quien
--  trae su carro aparta un lugar; quien viene en el carro de alguien que
--  ya tiene cita se registra como acompanante con el codigo CB de quien
--  maneja: tiene su propio QR y su propia caja (1 QR = 1 caja), pero no
--  ocupa otro lugar.
--
--  El tope: cuantos acompanantes caben en un carro (configuracion
--  acompanantes_por_carro, 3 de arranque). Sin tope, cualquiera se diria
--  acompanante y el cupo dejaria de existir: el bug del Google Form.
--
--  Lo cuidan reservar_cita() (con el mismo candado de siempre), la
--  disponibilidad y los conteos de Horarios. El acompanante va a la hora de
--  quien maneja: no cambia de horario por su cuenta, y si quien maneja
--  cambia el suyo, se mueven juntos.

alter table citas add column if not exists acompana_a uuid references citas (id) on delete set null;

create index if not exists idx_citas_acompana on citas (acompana_a) where acompana_a is not null;

insert into configuracion (clave, valor, nota) values
  ('acompanantes_por_carro', '3',
   'Cuantas personas pueden registrarse como acompanantes de un mismo carro, ' ||
   'ademas de quien maneja. Los acompanantes no ocupan lugar en el horario.')
on conflict (clave) do nothing;

drop function if exists reservar_cita(uuid, uuid);

create or replace function reservar_cita(
  p_persona_id uuid,
  p_bloque_id  uuid,
  --  La cita de quien maneja, si esta persona viene en su carro (seccion
  --  39). Nulo: trae su propio carro y ocupa un lugar.
  p_acompana_a uuid default null
)
returns citas
language plpgsql
as $$
declare
  v_bloque   bloques;
  v_ocupados int;
  v_semana   date;
  v_cita     citas;
  v_duenio   citas;
  v_limite   int;
begin
  -- Las demás peticiones sobre este mismo bloque esperan aquí.
  select * into v_bloque
    from bloques
   where id = p_bloque_id
     for update;

  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  if v_bloque.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_bloque.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if p_acompana_a is null then
    --  Un lugar es un CARRO (seccion 39): solo cuentan las citas de carro
    --  propio. Quien viene de acompanante no ocupa otro lugar.
    select count(*) into v_ocupados
      from citas
     where bloque_id = p_bloque_id
       and estado <> 'cancelada'
       and acompana_a is null;

    if v_ocupados >= v_bloque.capacidad then
      raise exception 'BLOQUE_LLENO';
    end if;
  else
    --  Viene en el carro de otra cita: la de quien maneja, en este mismo
    --  horario, sin recibir todavia y con carro propio. Con el candado del
    --  bloque de arriba, dos acompanantes al mismo tiempo no pasan del tope.
    select * into v_duenio from citas where id = p_acompana_a;

    if not found
       or v_duenio.bloque_id <> p_bloque_id
       or v_duenio.acompana_a is not null
       or v_duenio.estado not in ('reservada', 'llego') then
      raise exception 'ACOMPANANTE_SIN_CITA';
    end if;

    select case when trim(valor) ~ '^[0-9]+$' then trim(valor)::int end into v_limite
      from configuracion
     where clave = 'acompanantes_por_carro';

    v_limite := coalesce(v_limite, 3);

    select count(*) into v_ocupados
      from citas
     where acompana_a = p_acompana_a
       and estado <> 'cancelada';

    if v_ocupados >= v_limite then
      raise exception 'CARRO_LLENO';
    end if;
  end if;

  -- El lunes de esa semana, en formato fecha.
  v_semana := date_trunc('week', v_bloque.fecha)::date;

  insert into citas (persona_id, bloque_id, semana, token_qr, acompana_a)
  values (
    p_persona_id,
    p_bloque_id,
    v_semana,
    encode(gen_random_bytes(24), 'hex'),
    p_acompana_a
  )
  returning * into v_cita;

  return v_cita;

exception
  -- Lo lanza el índice único parcial de arriba.
  when unique_violation then
    raise exception 'YA_TIENE_CITA_ESTA_SEMANA';
end;
$$;

alter function reservar_cita(uuid, uuid, uuid)
  security definer
  set search_path = public, extensions, pg_temp
  set timezone    = 'America/Los_Angeles';

revoke execute on function reservar_cita(uuid, uuid, uuid) from public, anon, authenticated;

drop function if exists registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text);

create or replace function registrar_y_reservar(
  p_nombre            text,
  p_apellidos         text,
  p_telefono          text,
  p_bloque_id         uuid,
  p_email             text,
  p_pais              text    default null,
  p_codigo_postal     text    default null,
  p_colonia           text    default null,
  p_calle             text    default null,
  p_numero            text    default null,
  p_numero_interior   text    default null,
  p_sin_domicilio     boolean default false,
  p_acepto_privacidad boolean default false,
  p_dispositivo       text    default null,
  p_codigo_anticipado text    default null,
  --  Viene en el carro de alguien que ya tiene cita (seccion 39): el codigo
  --  CB de quien maneja. Su horario es el de esa cita; con p_fecha basta
  --  (cuando ya no quedan lugares no se puede escoger horario).
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
  v_bloque_id  uuid := p_bloque_id;
  v_dia        date;
  v_duenio     citas;
  --  Sin espacios de mas: "  maria   jose " se guarda "maria jose".
  v_nombres    text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_apellidos  text := regexp_replace(trim(coalesce(p_apellidos, '')), '\s+', ' ', 'g');
  v_telefono   text := trim(coalesce(p_telefono, ''));
  v_domicilio  record;
  v_bloque     bloques;
  --  Variables sueltas y no "dias_entrega" como tipo: Postgres revisa los
  --  tipos declarados al crear la funcion, y esa tabla se crea despues
  --  (seccion 21). Las consultas si se resuelven al ejecutarse.
  v_abre_en    timestamptz;
  v_abre_ant   timestamptz;
  v_codigo_dia text;
  v_dia_cerrado boolean;
  v_abre_a_pie timestamptz;
  v_limite     int;
  v_usadas     int;
  v_persona    personas;
  v_cita       citas;
  v_codigo     text;
  v_intentos   int := 0;
  v_anticipada boolean := false;
  v_previa     citas;
begin
  if v_nombres = '' then
    raise exception 'NOMBRE_REQUERIDO';
  end if;

  --  Nombre y apellidos separados: la gente escribe primero uno u otro, y
  --  asi las listas se pueden ordenar por apellido sin adivinar.
  if v_apellidos = '' then
    raise exception 'APELLIDOS_REQUERIDOS';
  end if;

  --  Un nombre con numeros casi siempre es el telefono en la casilla equivocada.
  if v_nombres ~ '[0-9]' or v_apellidos ~ '[0-9]' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  if v_telefono = '' then
    raise exception 'TELEFONO_REQUERIDO';
  end if;

  --  Formato internacional (E.164): "+", la lada y el numero, sin espacios,
  --  de 7 a 15 digitos. La pantalla ya lo convierte asi; esto asegura que
  --  nadie guarde "664 123" llamando a la funcion por fuera.
  if v_telefono !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'TELEFONO_INVALIDO';
  end if;

  --  El correo es obligatorio en el registro publico. La columna sigue
  --  aceptando nulos a proposito: el registro desde el panel para un adulto
  --  mayor tiene que poder guardarse sin correo.
  if coalesce(trim(p_email), '') = '' then
    raise exception 'EMAIL_REQUERIDO';
  end if;

  --  Comprobacion minima de forma. No se intenta adivinar si el correo
  --  existe: eso solo se sabe mandandole algo. Solo se atajan dedazos.
  if trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'EMAIL_INVALIDO';
  end if;

  --  Domicilio real en Mexico o Estados Unidos (seccion 26).
  select * into v_domicilio
    from validar_domicilio(p_pais, p_codigo_postal, p_colonia, p_calle,
                           p_numero, p_numero_interior, p_sin_domicilio);

  --  La casilla "comparto esta informacion por mi voluntad".
  if not coalesce(p_acepto_privacidad, false) then
    raise exception 'CONSENTIMIENTO_REQUERIDO';
  end if;

  -- ----------------------------------------------------------
  --  Acompanante: va en el carro de quien maneja (seccion 39)
  -- ----------------------------------------------------------
  --  Se busca la cita de carro propio de ese codigo ese dia, y la persona
  --  queda en ese mismo horario. No ocupa lugar: el carro ya lo tiene.
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

  select * into v_bloque from bloques where id = v_bloque_id;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  -- ----------------------------------------------------------
  --  Apertura del dia
  -- ----------------------------------------------------------
  select d.abre_en, d.abre_anticipado_en, d.codigo_anticipado, d.cerrado, d.a_pie_abre_en
    into v_abre_en, v_abre_ant, v_codigo_dia, v_dia_cerrado, v_abre_a_pie
    from dias_entrega d
   where d.fecha = v_bloque.fecha;

  if not found or v_dia_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if v_bloque.fila = 'a_pie' then
    --  La fila a pie abre a su propia hora, por lo general una hora antes de
    --  empezar a entregar (seccion 38). Sin hora, esta cerrada. El codigo de
    --  suscriptores no adelanta a nadie: el turno es por orden de llegada.
    if v_abre_a_pie is null then
      raise exception 'A_PIE_CERRADO';
    end if;

    if now() < v_abre_a_pie then
      raise exception 'AUN_NO_ABRE';
    end if;

  --  Antes de la hora de apertura solo entra quien trae el codigo de
  --  suscriptor, y solo dentro de su ventana de acceso anticipado.
  elsif now() < v_abre_en then
    if v_abre_ant is null or now() < v_abre_ant then
      raise exception 'AUN_NO_ABRE';
    end if;

    if coalesce(trim(p_codigo_anticipado), '') = '' then
      raise exception 'AUN_NO_ABRE';
    end if;

    if upper(trim(p_codigo_anticipado)) <> v_codigo_dia then
      raise exception 'CODIGO_ANTICIPADO_INVALIDO';
    end if;

    v_anticipada := true;
  end if;

  -- ----------------------------------------------------------
  --  La misma persona, el mismo dia (seccion 33)
  -- ----------------------------------------------------------
  --  Con mala senal la gente toca "confirmar" otra vez, o regresa y lo
  --  vuelve a llenar. Si ya quedo registrada ese dia, se le devuelve SU
  --  cita en vez de un error que la hace creer que no tiene lugar, o en
  --  vez de una segunda cita y una segunda caja.
  --
  --  Solo se le devuelve si es el mismo telefono del registro o si fue
  --  hace menos de media hora (el reintento). Si no, se dice que ya existe
  --  y nada mas: saber el nombre y el telefono de alguien no debe bastar
  --  para sacar su codigo.
  v_previa := cita_de_la_misma_persona(v_bloque.fecha, v_telefono, v_nombres || ' ' || v_apellidos);

  if v_previa.id is not null then
    if (p_dispositivo is not null and v_previa.dispositivo_id = p_dispositivo)
       or v_previa.creada_en > now() - interval '30 minutes' then
      return query
        select p.codigo_corto, v_previa.token_qr, b.fecha, b.hora, true
          from personas p, bloques b
         where p.id = v_previa.persona_id
           and b.id = v_previa.bloque_id;
      return;
    end if;

    raise exception 'YA_REGISTRADO_ESE_DIA';
  end if;

  -- ----------------------------------------------------------
  --  Tope por dispositivo
  -- ----------------------------------------------------------
  --  Se cuenta por FECHA DE ENTREGA, no por semana: el lunes y el jueves
  --  son dos entregas distintas. Con el tope en 1, un mismo telefono
  --  aparta su lugar el lunes y tambien el jueves, pero nunca dos veces
  --  el mismo dia. Se sube a 2 o 3 cuando llega una familia que comparte
  --  un solo telefono.
  --
  --  El candado serializa los registros de un mismo telefono. Sin el,
  --  tres pestanas mandando al mismo tiempo pasarian las tres el
  --  "cuantas lleva" antes de que ninguna hubiera insertado: es el
  --  mismo patron ingenuo que reproduce el bug del Google Form.
  --  Quien viene de acompanante no cuenta: es comun que la familia se
  --  registre desde el telefono de quien maneja, y ya tiene su tope por carro.
  if p_dispositivo is not null and v_duenio.id is null then
    perform pg_advisory_xact_lock(hashtext(p_dispositivo));

    select valor::int into v_limite
      from configuracion
     where clave = 'limite_citas_por_dispositivo';

    v_limite := coalesce(v_limite, 1);

    select count(*) into v_usadas
      from citas c
      join bloques b on b.id = c.bloque_id
     where c.dispositivo_id = p_dispositivo
       and b.fecha = v_bloque.fecha
       and c.estado <> 'cancelada'
       and c.acompana_a is null;

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
      --  "nombre" guarda el nombre completo: es el que se muestra al
      --  escanear y en la confirmacion.
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

  --  reservar_cita hace el bloqueo de fila que impide el sobrecupo y
  --  aplica la regla de una cita por semana. No se duplica aqui.
  v_cita := reservar_cita(v_persona.id, v_bloque_id, v_duenio.id);

  update citas
     set dispositivo_id        = p_dispositivo,
         con_codigo_anticipado = v_anticipada
   where id = v_cita.id;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date) to anon, authenticated;

create or replace function consultar_disponibilidad(
  p_desde date default null,
  p_hasta date default null,
  p_fila  text default 'carro'
)
returns table (
  bloque_id          uuid,
  fecha              date,
  hora               time,
  capacidad          int,
  ocupados           int,
  libres             int,
  abierto            boolean,
  abre_en            timestamp,
  abre_anticipado_en timestamp
)
-- PL/pgSQL y no SQL: su cuerpo usa dias_entrega (seccion 21), y asi la
-- tabla se resuelve al ejecutarse, no al crearse la funcion.
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  return query
  select b.id,
         b.fecha,
         b.hora,
         b.capacidad,
         --  Carros, no personas: el acompanante no ocupa lugar (seccion 39).
         count(c.id) filter (where c.estado <> 'cancelada' and c.acompana_a is null)::int,
         greatest(
           b.capacidad - count(c.id) filter (where c.estado <> 'cancelada' and c.acompana_a is null),
           0
         )::int,
         -- Las fechas aun no abiertas SI se muestran, con su hora de
         -- apertura: el publico sabe cuando volver. Reservar lo impide
         -- registrar_y_reservar(), no esta consulta. La fila a pie abre a
         -- su propia hora y sin codigo de suscriptores (seccion 38).
         now() >= case when b.fila = 'a_pie' then d.a_pie_abre_en else d.abre_en end,
         (case when b.fila = 'a_pie' then d.a_pie_abre_en else d.abre_en end) at time zone 'America/Los_Angeles',
         case when b.fila = 'a_pie' then null::timestamp
              else d.abre_anticipado_en at time zone 'America/Los_Angeles' end
    from bloques b
    join dias_entrega d on d.fecha = b.fecha and not d.cerrado
    left join citas c on c.bloque_id = b.id
   where b.cerrado = false
     --  Una fila a la vez. La de a pie sale solo cuando ya tiene su hora
     --  de apertura (seccion 38); sin ella esta cerrada.
     and b.fila = coalesce(p_fila, 'carro')
     and (b.fila = 'carro' or d.a_pie_abre_en is not null)
     -- Nunca se ofrecen fechas pasadas: reservar_cita() las rechazaria
     -- con FECHA_PASADA y el usuario no entenderia por que.
     and b.fecha >= greatest(coalesce(p_desde, current_date), current_date)
     and b.fecha <= coalesce(p_hasta, current_date + 60)
   group by b.id, b.fecha, b.hora, b.capacidad, b.fila, d.abre_en, d.abre_anticipado_en, d.a_pie_abre_en
   order by b.fecha, b.hora;
end;
$$;


revoke execute on function consultar_disponibilidad(date, date, text) from public;
grant  execute on function consultar_disponibilidad(date, date, text) to anon, authenticated;

create or replace function bloques_del_dia(p_fecha date default null)
returns table (
  bloque_id uuid,
  hora      time,
  capacidad int,
  ocupados  int,
  libres    int,
  cerrado   boolean,
  fila      text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_permiso('ver_citas_del_dia');

  return query
  select b.id,
         b.hora,
         b.capacidad,
         --  Carros, no personas (seccion 39).
         count(c.id) filter (where c.estado <> 'cancelada' and c.acompana_a is null)::int,
         greatest(b.capacidad - count(c.id) filter (where c.estado <> 'cancelada' and c.acompana_a is null), 0)::int,
         b.cerrado,
         b.fila
    from bloques b
    left join citas c on c.bloque_id = b.id
   where b.fecha = coalesce(p_fecha, current_date)
   group by b.id, b.hora, b.capacidad, b.cerrado, b.fila
   order by b.fila = 'a_pie', b.hora;
end;
$$;


revoke execute on function bloques_del_dia(date) from public;
grant  execute on function bloques_del_dia(date) to authenticated;

create or replace function listar_dias_entrega(p_desde date default null)
returns table (
  fecha              date,
  abre_en            timestamp,
  abre_anticipado_en timestamp,
  codigo_anticipado  text,
  cerrado            boolean,
  abierto            boolean,
  total_bloques      int,
  capacidad_total    int,
  ocupados           int,
  anticipadas        int,
  --  La fila a pie del dia (seccion 38), si la hay. Los de arriba cuentan
  --  solo los horarios de carro: el cupo a pie va aparte y puede ser sin limite.
  a_pie_bloque_id    uuid,
  a_pie_hora         time,
  a_pie_capacidad    int,
  a_pie_cerrado      boolean,
  a_pie_abre_en      timestamp,
  a_pie_ocupados     int
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
  select d.fecha,
         d.abre_en at time zone 'America/Los_Angeles',
         d.abre_anticipado_en at time zone 'America/Los_Angeles',
         d.codigo_anticipado,
         d.cerrado,
         now() >= d.abre_en,
         (select count(*)::int from bloques b where b.fecha = d.fecha and b.fila = 'carro'),
         (select coalesce(sum(b.capacidad), 0)::int from bloques b where b.fecha = d.fecha and b.fila = 'carro'),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and b.fila = 'carro' and c.estado <> 'cancelada' and c.acompana_a is null),
         (select count(*)::int from citas c
            join bloques b on b.id = c.bloque_id
           where b.fecha = d.fecha and c.estado <> 'cancelada' and c.con_codigo_anticipado),
         pie.id,
         pie.hora,
         pie.capacidad,
         pie.cerrado,
         d.a_pie_abre_en at time zone 'America/Los_Angeles',
         (select count(*)::int from citas c where c.bloque_id = pie.id and c.estado <> 'cancelada')
    from dias_entrega d
    left join bloques pie on pie.fecha = d.fecha and pie.fila = 'a_pie'
   where d.fecha >= coalesce(p_desde, current_date)
   order by d.fecha;
end;
$$;

revoke execute on function listar_dias_entrega(date) from public;
grant  execute on function listar_dias_entrega(date) to authenticated;

--  Segunda cita en la misma semana, autorizada por el administrador.
--
--  Para una persona que YA tiene su cita de la semana (se busca por su
--  codigo CB). Guarda el motivo y quien la autorizo en "excepciones".
--
--  No llama a reservar_cita(): esa rechaza, a proposito, una segunda cita
--  en la semana. Repite su candado de fila sobre el bloque ("for update")
--  para que el cupo no se pueda pasar ni con dos excepciones al mismo
--  tiempo. NO usar el patron de "consulto y despues inserto" sin el candado.
create or replace function reservar_con_excepcion(
  p_codigo    text,
  p_bloque_id uuid,
  p_motivo    text
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
  v_usuario   uuid := auth.uid();
  v_persona   personas;
  v_bloque    bloques;
  v_semana    date;
  v_ocupados  int;
  v_excepcion uuid;
  v_cita      citas;
begin
  perform exigir_rol(array['admin']);

  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_persona
    from personas p
   where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo);
  if not found then
    raise exception 'PERSONA_NO_EXISTE';
  end if;

  --  El mismo candado que reservar_cita(): las demas reservas sobre este
  --  horario esperan aqui.
  select * into v_bloque from bloques b where b.id = p_bloque_id for update;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  if v_bloque.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_bloque.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if not exists (select 1 from dias_entrega d where d.fecha = v_bloque.fecha and not d.cerrado) then
    raise exception 'DIA_CERRADO';
  end if;

  v_semana := date_trunc('week', v_bloque.fecha)::date;

  --  La excepcion es para una SEGUNDA cita. Sin cita esa semana no hace falta.
  if not exists (select 1 from citas c
                  where c.persona_id = v_persona.id
                    and c.semana = v_semana
                    and c.estado in ('reservada', 'llego', 'entregada')
                    and c.excepcion_id is null) then
    raise exception 'NO_NECESITA_EXCEPCION';
  end if;

  if exists (select 1 from citas c
              where c.persona_id = v_persona.id
                and c.semana = v_semana
                and c.estado in ('reservada', 'llego', 'entregada')
                and c.excepcion_id is not null) then
    raise exception 'YA_TIENE_EXCEPCION_ESTA_SEMANA';
  end if;

  select count(*) into v_ocupados
    from citas c
   where c.bloque_id = p_bloque_id
     and c.estado <> 'cancelada'
     and c.acompana_a is null;

  if v_ocupados >= v_bloque.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  insert into excepciones (persona_id, semana, motivo, autorizado_por)
  values (v_persona.id, v_semana, trim(p_motivo), v_usuario)
  returning id into v_excepcion;

  insert into citas (persona_id, bloque_id, semana, token_qr, excepcion_id, registrado_por)
  values (v_persona.id, p_bloque_id, v_semana, encode(gen_random_bytes(24), 'hex'), v_excepcion, v_usuario)
  returning * into v_cita;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora;

exception
  --  Lo lanza el indice de una excepcion por semana si dos llegan juntas.
  when unique_violation then
    raise exception 'YA_TIENE_EXCEPCION_ESTA_SEMANA';
end;
$$;


revoke execute on function reservar_con_excepcion(text, uuid, text) from public;
grant  execute on function reservar_con_excepcion(text, uuid, text) to authenticated;

-- ------------------------------------------------------------
--  El movimiento
-- ------------------------------------------------------------
--  El candado va en el mismo orden que reservar_cita: primero la cita,
--  luego el bloque de destino. El conteo de ocupados se hace con el
--  bloque ya bloqueado, que es lo que impide el sobrecupo cuando dos
--  personas se mueven al mismo horario al mismo tiempo.
--
--  Si el horario nuevo se lleno justo antes, se levanta BLOQUE_LLENO y
--  la transaccion se deshace entera: la persona se queda con su cita
--  original. Nunca se queda sin nada.
create or replace function mover_cita(
  p_cita_id   uuid,
  p_bloque_id uuid,
  p_origen    text
)
returns citas
language plpgsql
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_cita     citas;
  v_actual   bloques;
  v_nuevo    bloques;
  v_abre_en  timestamptz;
  v_cerrado  boolean;
  v_ocupados int;
begin
  select * into v_cita from citas where id = p_cita_id for update;
  if not found then
    raise exception 'CITA_NO_EXISTE';
  end if;

  if v_cita.estado = 'cancelada' then
    raise exception 'CITA_YA_CANCELADA';
  end if;

  --  Ya la escanearon: no hay nada que mover.
  if v_cita.estado in ('llego', 'entregada') then
    raise exception 'CITA_YA_ENTREGADA';
  end if;

  --  Quien viene de acompanante va a la hora de quien maneja (seccion 39):
  --  si cambia el horario, lo cambia quien maneja y se mueven juntos.
  if v_cita.acompana_a is not null then
    raise exception 'ACOMPANANTE_SIN_CAMBIO';
  end if;

  select * into v_actual from bloques where id = v_cita.bloque_id;
  if v_actual.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if v_cita.bloque_id = p_bloque_id then
    raise exception 'MISMO_HORARIO';
  end if;

  --  Las demas peticiones sobre el bloque de destino esperan aqui.
  select * into v_nuevo from bloques where id = p_bloque_id for update;
  if not found then
    raise exception 'BLOQUE_NO_EXISTE';
  end if;

  --  Una cita no se cambia de fila: carro y a pie tienen su propio cupo y
  --  su propia gente (seccion 32).
  if v_nuevo.fila <> v_actual.fila then
    raise exception 'OTRA_FILA';
  end if;

  --  En la fila a pie el lugar de cada quien es su turno del dia (seccion
  --  38): en otro dia seria otro turno. Se saca uno nuevo ese dia.
  if v_nuevo.fila = 'a_pie' then
    raise exception 'A_PIE_SIN_CAMBIO';
  end if;

  if v_nuevo.cerrado then
    raise exception 'BLOQUE_CERRADO';
  end if;

  if v_nuevo.fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  --  El dia de destino tiene que estar abierto, igual que para
  --  registrarse. Si no, mover la cita seria la puerta de atras para
  --  apartar lugar en un dia que todavia no abre.
  select d.abre_en, d.cerrado into v_abre_en, v_cerrado
    from dias_entrega d
   where d.fecha = v_nuevo.fecha;

  if not found or v_cerrado then
    raise exception 'DIA_CERRADO';
  end if;

  if now() < v_abre_en then
    raise exception 'AUN_NO_ABRE';
  end if;

  --  La propia cita no cuenta: se esta moviendo, no agregando.
  select count(*) into v_ocupados
    from citas c
   where c.bloque_id = p_bloque_id
     and c.estado <> 'cancelada'
     and c.acompana_a is null
     and c.id <> v_cita.id;

  if v_ocupados >= v_nuevo.capacidad then
    raise exception 'BLOQUE_LLENO';
  end if;

  update citas
     set bloque_id = p_bloque_id,
         semana    = date_trunc('week', v_nuevo.fecha)::date
   where id = v_cita.id
  returning * into v_cita;

  insert into movimientos_cita (cita_id, de_bloque_id, a_bloque_id, origen, usuario_id)
  values (v_cita.id, v_actual.id, v_nuevo.id, p_origen, auth.uid());

  --  Quienes vienen en su carro se mueven con el (seccion 39): mismo carro,
  --  misma hora. No ocupan lugar, asi que no se vuelven a contar.
  insert into movimientos_cita (cita_id, de_bloque_id, a_bloque_id, origen, usuario_id)
  select c.id, v_actual.id, v_nuevo.id, p_origen, auth.uid()
    from citas c
   where c.acompana_a = v_cita.id and c.estado in ('reservada', 'llego');

  update citas
     set bloque_id = p_bloque_id,
         semana    = date_trunc('week', v_nuevo.fecha)::date
   where acompana_a = v_cita.id
     and estado in ('reservada', 'llego');

  return v_cita;

exception
  --  Lo levanta el indice unico parcial: ya tiene otra cita activa en la
  --  semana a la que se quiere mover.
  when unique_violation then
    raise exception 'YA_TIENE_CITA_ESTA_SEMANA';
end;
$$;

commit;
