-- ============================================================
--  Correos: confirmacion de la cita, aviso si la entrega se cancela o se
--  mueve, y el boletin solo con permiso (seccion 54 de schema.sql)
-- ============================================================
--  Que trae:
--    * personas.idioma acepta vietnamita.
--    * Tabla correos: lo que falta mandar. Cada cita nueva con correo anota
--      su confirmacion; cancelar_entrega() y mover_entrega() anotan el aviso
--      de cada cita que tocan. La funcion enviar-correos los manda por
--      Amazon SES.
--    * Tabla boletin: solo quien palomea la casilla del registro.
--    * registrar_y_reservar() recibe p_idioma y p_boletin.
--
--  Cuando: ANTES de subir el codigo que manda p_idioma y p_boletin (la
--  pagina de registro). Mientras Amazon SES no este listo, los correos se
--  quedan pendientes sin estorbar; los de fechas que ya pasaron no salen.
--  Se puede correr dos veces.
--
--  Pasos de Amazon SES y de la funcion: docs/correos.md
-- ============================================================

-- ============================================================
--  54. CORREOS: CONFIRMACION, ENTREGA CANCELADA O MOVIDA, Y BOLETIN
-- ============================================================
--  Decision del 28 de octubre de 2026 (el pastor autorizo el gasto de
--  Amazon SES):
--
--    * Cada cita nueva con correo deja anotada su confirmacion, que lleva
--      su QR dentro. Cuando la iglesia cancela o mueve la entrega de un dia
--      (seccion 36), cancelar_entrega() y mover_entrega() anotan el aviso de
--      cada cita que tocaron, ahi mismo.
--    * Se anota en la misma operacion que la cita, en la tabla correos. La
--      funcion enviar-correos (supabase/functions) los toma cada minuto y
--      los manda por Amazon SES. Si Amazon falla, la cita no se pierde ni
--      se traba: el correo se queda pendiente y se reintenta.
--    * Nadie los contesta: el correo dice que no se responda y da el
--      telefono de la iglesia.
--    * El boletin (informacion general) es aparte y solo con permiso: la
--      casilla del registro va sin marcar. Se guarda el correo, el idioma y
--      cuando dio el permiso. Sin la casilla no se anota nada.
--
--  Ni el navegador ni el panel leen estas tablas: solo la funcion que manda
--  los correos (service_role). Guia: docs/correos.md

--  Vietnamita tambien: el correo sale en el idioma en que se registro.
alter table personas drop constraint if exists personas_idioma_check;
alter table personas add constraint personas_idioma_check check (idioma in ('es', 'en', 'vi'));

create table if not exists correos (
  id          uuid primary key default gen_random_uuid(),
  cita_id     uuid not null references citas(id) on delete cascade,
  tipo        text not null check (tipo in ('confirmacion', 'entrega_cancelada', 'entrega_movida')),
  --  pendiente -> enviando -> enviado. fallo: ya no se reintenta. omitido:
  --  ya no tocaba (la cita se cancelo antes de salir, o su fecha ya paso).
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'enviando', 'enviado', 'fallo', 'omitido')),
  intentos    int not null default 0,
  creado_en   timestamptz not null default now(),
  tomado_en   timestamptz,
  enviado_en  timestamptz,
  id_mensaje  text,
  error       text,
  --  Un correo de cada tipo por cita: repetir el registro no manda dos.
  unique (cita_id, tipo)
);

create index if not exists idx_correos_por_enviar on correos (creado_en)
  where estado in ('pendiente', 'enviando');

alter table correos enable row level security;
revoke all on correos from anon, authenticated;

create table if not exists boletin (
  id          uuid primary key default gen_random_uuid(),
  --  En minusculas: el mismo correo escrito distinto es la misma persona.
  email       text not null unique,
  idioma      text not null default 'es' check (idioma in ('es', 'en', 'vi')),
  persona_id  uuid references personas(id) on delete set null,
  aceptado_en timestamptz not null default now(),
  baja_en     timestamptz,
  --  Para el enlace "darme de baja" que llevara cada boletin.
  token_baja  text not null unique default encode(extensions.gen_random_bytes(18), 'hex')
);

alter table boletin enable row level security;
revoke all on boletin from anon, authenticated;


--  La casilla del registro (registrar_y_reservar). Quien se habia dado de
--  baja y vuelve a palomear, da su permiso otra vez.
create or replace function anotar_en_boletin(p_email text, p_idioma text, p_persona uuid)
returns void
language sql
security definer
set search_path = public, extensions, pg_temp
as $$
  insert into boletin (email, idioma, persona_id)
  values (lower(trim(p_email)),
          case when p_idioma in ('es', 'en', 'vi') then p_idioma else 'es' end,
          p_persona)
  on conflict (email) do update
     set idioma      = excluded.idioma,
         persona_id  = excluded.persona_id,
         aceptado_en = case when boletin.baja_en is not null then now() else boletin.aceptado_en end,
         baja_en     = null;
$$;

revoke execute on function anotar_en_boletin(text, text, uuid) from public, anon, authenticated;


--  Cada cita nueva con correo: su confirmacion. Cubre el registro publico,
--  el del panel y los acompanantes; el turno a pie sin datos no tiene correo.
create or replace function anotar_confirmacion()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.estado = 'reservada'
     and exists (select 1 from personas p
                  where p.id = new.persona_id and nullif(trim(p.email), '') is not null) then
    insert into correos (cita_id, tipo) values (new.id, 'confirmacion')
    on conflict (cita_id, tipo) do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function anotar_confirmacion() from public, anon, authenticated;

drop trigger if exists citas_anotar_confirmacion on citas;
create trigger citas_anotar_confirmacion
  after insert on citas
  for each row execute function anotar_confirmacion();


--  Para la funcion que los manda: toma hasta p_limite pendientes, los marca
--  "enviando" y devuelve lo necesario para armar cada correo. Dos vueltas
--  al mismo tiempo no toman el mismo (skip locked). Uno que se quedo
--  "enviando" mas de 10 minutos (la funcion se cayo) se vuelve a tomar.
create or replace function correos_por_enviar(p_limite int default 50)
returns table (
  id             uuid,
  tipo           text,
  email          text,
  idioma         text,
  nombre         text,
  fecha          date,
  hora           time,
  fila           text,
  turno          int,
  codigo_corto   text,
  token_qr       text,
  fecha_anterior date,
  mensaje        text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
#variable_conflict use_column
begin
  --  Lo que ya no toca: la confirmacion de una cita que se cancelo antes de
  --  salir, cualquier aviso de una fecha que ya paso (si SES tardo en estar
  --  listo, no salen correos viejos) o una persona que ya no tiene correo.
  update correos co
     set estado = 'omitido'
    from citas c, personas p, bloques b
   where c.id = co.cita_id
     and p.id = c.persona_id
     and b.id = c.bloque_id
     and co.estado = 'pendiente'
     and ((co.tipo = 'confirmacion' and c.estado not in ('reservada', 'llego'))
          or b.fecha < current_date
          or nullif(trim(p.email), '') is null);

  --  Se quedo "enviando" en su quinto intento: ya no se reintenta.
  update correos co
     set estado = 'fallo',
         error  = coalesce(co.error, 'Sin respuesta de la funcion que los manda')
   where co.estado = 'enviando'
     and co.tomado_en < now() - interval '10 minutes'
     and co.intentos >= 5;

  return query
  with tomados as (
    update correos co
       set estado    = 'enviando',
           intentos  = co.intentos + 1,
           tomado_en = now()
     where co.id in (
             select x.id
               from correos x
              where (x.estado = 'pendiente'
                     or (x.estado = 'enviando' and x.tomado_en < now() - interval '10 minutes'))
                and x.intentos < 5
              order by x.creado_en
              limit greatest(coalesce(p_limite, 50), 1)
                for update skip locked)
    returning co.id, co.cita_id, co.tipo
  )
  select t.id, t.tipo, trim(p.email), p.idioma, coalesce(nullif(p.nombres, ''), p.nombre),
         b.fecha, b.hora, b.fila, c.turno, p.codigo_corto, c.token_qr,
         --  Si se movio: de que fecha venia.
         (select bo.fecha
            from movimientos_cita m
            join bloques bo on bo.id = m.de_bloque_id
           where m.cita_id = c.id and m.origen = 'incidencia'
           order by m.creado_en desc
           limit 1),
         --  Lo que escribio el pastor al cancelar o mover, si escribio algo.
         (select i.mensaje
            from incidencias i
           where i.retirada_en is null
             and ((t.tipo = 'entrega_cancelada' and i.tipo = 'cancelada' and i.fecha = b.fecha)
               or (t.tipo = 'entrega_movida' and i.tipo = 'movida' and i.fecha_nueva = b.fecha))
           order by i.creada_en desc
           limit 1)
    from tomados t
    join citas    c on c.id = t.cita_id
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id;
end;
$$;

revoke execute on function correos_por_enviar(int) from public, anon, authenticated;
grant  execute on function correos_por_enviar(int) to service_role;


--  Lo que paso con un correo que se tomo. Si Amazon fallo, vuelve a
--  pendiente; al quinto intento, o si Amazon lo rechaza (correo mal
--  escrito), queda en fallo y ya no se reintenta.
create or replace function marcar_correo(
  p_id         uuid,
  p_enviado    boolean,
  p_id_mensaje text    default null,
  p_error      text    default null,
  p_definitivo boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_estado text;
begin
  update correos co
     set estado     = case
                        when p_enviado then 'enviado'
                        when coalesce(p_definitivo, false) or co.intentos >= 5 then 'fallo'
                        else 'pendiente'
                      end,
         enviado_en = case when p_enviado then now() else co.enviado_en end,
         id_mensaje = case when p_enviado then p_id_mensaje else co.id_mensaje end,
         error      = case when p_enviado then null else left(p_error, 500) end
   where co.id = p_id
     and co.estado = 'enviando'
  returning co.estado into v_estado;

  return coalesce(v_estado, 'NO_SE_ESTABA_ENVIANDO');
end;
$$;

revoke execute on function marcar_correo(uuid, boolean, text, text, boolean) from public, anon, authenticated;
grant  execute on function marcar_correo(uuid, boolean, text, text, boolean) to service_role;


-- ------------------------------------------------------------
--  El registro publico: idioma y boletin
-- ------------------------------------------------------------

--  Le crecieron p_codigo_acompanante y p_fecha (seccion 39), y p_idioma y
--  p_boletin (seccion 54): se borra la anterior y se vuelve a crear.
drop function if exists registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date);

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
  p_fecha             date    default null,
  --  El idioma de la pantalla al registrarse (es, en, vi): el de sus
  --  correos (seccion 54).
  p_idioma            text    default null,
  --  La casilla del boletin, que va sin marcar (seccion 54).
  p_boletin           boolean default false
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
      --  Si esta vez si palomeo el boletin, se anota (seccion 54).
      if coalesce(p_boletin, false) then
        perform anotar_en_boletin(p_email, p_idioma, v_previa.persona_id);
      end if;

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
  --  vuelve a intentar. Desde el 10 de octubre de 2026 los nuevos son de
  --  5 numeros (CB-10000 a CB-99999, seccion 45): con 4 se iban a acabar.
  --  Los de 4 que ya existen siguen valiendo.
  loop
    v_codigo := 'CB-' || (10000 + floor(random() * 90000))::int::text;

    begin
      --  "nombre" guarda el nombre completo: es el que se muestra al
      --  escanear y en la confirmacion.
      insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, email,
                            pais, codigo_postal, ciudad, colonia, municipio, estado,
                            calle, numero_exterior, numero_interior, direccion,
                            sin_domicilio, acepto_privacidad_en, idioma)
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
              now(),
              case when p_idioma in ('es', 'en', 'vi') then p_idioma else 'es' end)
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

  --  Solo con la casilla marcada (seccion 54).
  if coalesce(p_boletin, false) then
    perform anotar_en_boletin(p_email, p_idioma, v_persona.id);
  end if;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date, text, boolean) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date, text, boolean) to anon, authenticated;


-- ------------------------------------------------------------
--  Cancelar o mover la entrega: anotan el aviso de cada cita
-- ------------------------------------------------------------

--  Cancelar la entrega: las citas pendientes se cancelan con el motivo y el
--  lugar queda libre. Devuelve cuantas se cancelaron.
create or replace function cancelar_entrega(p_fecha date, p_mensaje text default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario uuid := auth.uid();
  v_motivo  text := nullif(regexp_replace(trim(coalesce(p_mensaje, '')), '\s+', ' ', 'g'), '');
  v_n       int;
begin
  perform exigir_rol(array['admin']);

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  perform 1 from dias_entrega d where d.fecha = p_fecha for update;
  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  if dia_ya_resuelto(p_fecha) then
    raise exception 'DIA_YA_RESUELTO';
  end if;

  --  Mismo candado que reservar_cita(), y el dia se cierra antes de soltarlo.
  perform 1 from bloques b where b.fecha = p_fecha for update;
  update bloques set cerrado = true where fecha = p_fecha;
  update dias_entrega set cerrado = true, actualizado_en = now() where fecha = p_fecha;

  --  Cada cita cancelada con correo deja anotado su aviso (seccion 54).
  with canceladas as (
    update citas c
       set estado             = 'cancelada',
           cancelada_en       = now(),
           cancelada_por      = v_usuario,
           motivo_cancelacion = coalesce(v_motivo, 'Se cancelo la entrega de este dia')
      from bloques b
     where b.id = c.bloque_id
       and b.fecha = p_fecha
       and c.estado in ('reservada', 'llego')
    returning c.id, c.persona_id
  ), avisos as (
    insert into correos (cita_id, tipo)
    select ca.id, 'entrega_cancelada'
      from canceladas ca
      join personas p on p.id = ca.persona_id
     where nullif(trim(p.email), '') is not null
    on conflict (cita_id, tipo) do nothing
  )
  select count(*)::int into v_n from canceladas;

  update incidencias
     set retirada_en  = now(),
         retirada_por = v_usuario
   where fecha = p_fecha and tipo = 'retraso' and retirada_en is null;

  insert into incidencias (fecha, tipo, mensaje, afectadas, creada_por)
  values (p_fecha, 'cancelada', v_motivo, v_n, v_usuario);

  return v_n;
end;
$$;

revoke execute on function cancelar_entrega(date, text) from public, anon;
grant  execute on function cancelar_entrega(date, text) to authenticated;


--  Mover la entrega completa a otra fecha. Cada cita conserva su QR, su
--  codigo y su hora. La fecha nueva no debe tener entrega: juntar dos dias
--  en uno pasaria del cupo. Si alguien ya tiene su cita de esa semana (la
--  regla de una por semana), esa se queda y se cuenta en sin_mover.
create or replace function mover_entrega(p_fecha date, p_fecha_nueva date, p_mensaje text default null)
returns table (
  movidas   int,
  sin_mover int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
declare
  v_usuario   uuid := auth.uid();
  v_dia       dias_entrega;
  v_bloque    bloques;
  v_nuevo     uuid;
  v_cita      citas;
  v_movidas   int := 0;
  v_sin_mover int := 0;
begin
  perform exigir_rol(array['admin']);

  if p_fecha < current_date then
    raise exception 'FECHA_PASADA';
  end if;

  if p_fecha_nueva is null or p_fecha_nueva <= current_date or p_fecha_nueva = p_fecha then
    raise exception 'FECHA_NUEVA_INVALIDA';
  end if;

  select * into v_dia from dias_entrega d where d.fecha = p_fecha for update;
  if not found then
    raise exception 'DIA_NO_EXISTE';
  end if;

  if dia_ya_resuelto(p_fecha) then
    raise exception 'DIA_YA_RESUELTO';
  end if;

  if exists (select 1 from dias_entrega d where d.fecha = p_fecha_nueva) then
    raise exception 'FECHA_YA_TIENE_ENTREGA';
  end if;

  --  Mismo candado que reservar_cita(): quien estuviera reservando en este
  --  momento espera, y al seguir encuentra el horario cerrado.
  perform 1 from bloques b where b.fecha = p_fecha for update;

  --  La fecha nueva abre como la original, con el mismo codigo de
  --  suscriptores (el que ya se publico en Facebook sigue sirviendo). La
  --  fila a pie abre a la misma hora, pero del dia nuevo (seccion 38); cada
  --  quien toma alla su turno en el mismo orden.
  insert into dias_entrega (fecha, abre_en, abre_anticipado_en, codigo_anticipado, a_pie_abre_en)
  values (p_fecha_nueva, v_dia.abre_en, v_dia.abre_anticipado_en, v_dia.codigo_anticipado,
          v_dia.a_pie_abre_en + (p_fecha_nueva - p_fecha) * interval '1 day');

  for v_bloque in
    select * from bloques b where b.fecha = p_fecha order by b.hora, b.fila
  loop
    insert into bloques (fecha, hora, capacidad, fila, cerrado)
    values (p_fecha_nueva, v_bloque.hora, v_bloque.capacidad, v_bloque.fila, v_bloque.cerrado)
    returning id into v_nuevo;

    for v_cita in
      select * from citas c
       where c.bloque_id = v_bloque.id and c.estado in ('reservada', 'llego')
       order by c.creada_en
         for update
    loop
      begin
        update citas
           set bloque_id = v_nuevo,
               semana    = date_trunc('week', p_fecha_nueva)::date
         where id = v_cita.id;

        insert into movimientos_cita (cita_id, de_bloque_id, a_bloque_id, origen, usuario_id)
        values (v_cita.id, v_bloque.id, v_nuevo, 'incidencia', v_usuario);

        --  Su aviso por correo, si tiene (seccion 54).
        insert into correos (cita_id, tipo)
        select v_cita.id, 'entrega_movida'
          from personas p
         where p.id = v_cita.persona_id and nullif(trim(p.email), '') is not null
        on conflict (cita_id, tipo) do nothing;

        v_movidas := v_movidas + 1;
      exception when unique_violation then
        --  Ya tiene su cita de esa semana: se queda y se avisa aparte.
        v_sin_mover := v_sin_mover + 1;
      end;
    end loop;
  end loop;

  update bloques set cerrado = true where fecha = p_fecha;
  update dias_entrega set cerrado = true, actualizado_en = now() where fecha = p_fecha;

  --  El retraso que hubiera ya no aplica.
  update incidencias
     set retirada_en  = now(),
         retirada_por = v_usuario
   where fecha = p_fecha and tipo = 'retraso' and retirada_en is null;

  insert into incidencias (fecha, tipo, fecha_nueva, mensaje, afectadas, creada_por)
  values (p_fecha, 'movida', p_fecha_nueva, nullif(regexp_replace(trim(coalesce(p_mensaje, '')), '\s+', ' ', 'g'), ''), v_movidas, v_usuario);

  return query select v_movidas, v_sin_mover;
end;
$$;

revoke execute on function mover_entrega(date, date, text) from public, anon;
grant  execute on function mover_entrega(date, date, text) to authenticated;
