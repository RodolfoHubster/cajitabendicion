-- ============================================================
--  ¿Ya viniste antes? El mismo codigo, sin llenar todo otra vez
--  (seccion 56 de schema.sql), y los idiomas nuevos
-- ============================================================
--  Que trae:
--    * abrir_mis_datos(codigo, telefono): reconoce a quien ya vino y da una
--      llave de 15 minutos. Solo dice su nombre y la inicial del apellido.
--      5 intentos mal con un telefono lo frenan 15 minutos.
--    * registrar_y_reservar() recibe p_llave_persona: usa la persona que ya
--      existe, con su MISMO codigo CB, sin pedir otra vez sus datos.
--    * Los idiomas de los correos y del boletin: tambien chino (zh), tagalo
--      (tl), coreano (ko), criollo haitiano (ht), ruso (ru), somali (so) y
--      frances (fr).
--
--  No toca reservar_cita() ni registrar_entrega(). Requiere la del 28 de
--  octubre (correos). Correrla ANTES de subir la pagina de registro nueva.
--  Se puede correr dos veces.
-- ============================================================

-- ============================================================
--  56. ¿YA VINISTE ANTES? EL MISMO CODIGO, SIN LLENAR TODO OTRA VEZ
-- ============================================================
--  Pedido del 5 de noviembre de 2026: la gente (muchos adultos mayores)
--  llenaba cada vez nombre, telefono, correo y domicilio completo. Con su
--  codigo CB y su telefono se usa la persona que ya existe: los mismos datos
--  y el MISMO codigo CB (antes cada registro daba uno nuevo). Y la regla de
--  una cita por semana ya la reconoce.
--
--  Privacidad (parte de la comunidad tiene estatus migratorio delicado): sus
--  datos NUNCA llegan a la pantalla. abrir_mis_datos() solo dice su nombre y
--  la inicial del apellido ("Maria P.") para que confirme que es ella, y da
--  una llave de 15 minutos; registrar_y_reservar() usa la persona adentro de
--  la base.
--
--  Adivinar codigos: 5 intentos mal con un mismo telefono lo frenan 15
--  minutos. Se cuentan aqui y no en registrar_y_reservar() porque esa avisa
--  con un error, y un error deshace la cuenta.

create table if not exists llaves_persona (
  llave      text primary key default encode(extensions.gen_random_bytes(24), 'hex'),
  persona_id uuid not null references personas(id) on delete cascade,
  creada_en  timestamptz not null default now(),
  vence_en   timestamptz not null default now() + interval '15 minutes'
);

create index if not exists idx_llaves_persona_vence on llaves_persona (vence_en);

alter table llaves_persona enable row level security;
revoke all on llaves_persona from anon, authenticated;

create table if not exists intentos_mis_datos (
  telefono      text primary key,
  fallidos      int not null default 0,
  primer_fallo  timestamptz,
  frenado_hasta timestamptz
);

alter table intentos_mis_datos enable row level security;
revoke all on intentos_mis_datos from anon, authenticated;


create or replace function abrir_mis_datos(p_codigo text, p_telefono text)
returns table (
  resultado text,   -- LISTO, NO_COINCIDE o DEMASIADOS_INTENTOS
  nombre    text,   -- solo con LISTO: "Maria P."
  llave     text,   -- solo con LISTO: va a registrar_y_reservar()
  segundos  int     -- con DEMASIADOS_INTENTOS: cuanto falta
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  v_tel     text := trim(coalesce(p_telefono, ''));
  v_freno   intentos_mis_datos;
  v_persona personas;
  v_llave   text;
begin
  select * into v_freno from intentos_mis_datos i where i.telefono = v_tel for update;

  if v_freno.frenado_hasta > now() then
    return query select 'DEMASIADOS_INTENTOS'::text, null::text, null::text,
                        ceil(extract(epoch from v_freno.frenado_hasta - now()))::int;
    return;
  end if;

  if v_tel ~ '^\+[1-9][0-9]{6,14}$' then
    select p.* into v_persona
      from personas p
     where upper(p.codigo_corto) = normalizar_codigo_corto(p_codigo)
       and p.telefono = v_tel
       and not p.anonima
     limit 1;
  end if;

  if v_persona.id is null then
    insert into intentos_mis_datos as i (telefono, fallidos, primer_fallo)
    values (v_tel, 1, now())
    on conflict (telefono) do update
       set fallidos     = case when i.primer_fallo is null or i.primer_fallo < now() - interval '15 minutes'
                               then 1 else i.fallidos + 1 end,
           primer_fallo = case when i.primer_fallo is null or i.primer_fallo < now() - interval '15 minutes'
                               then now() else i.primer_fallo end
    returning * into v_freno;

    if v_freno.fallidos >= 5 then
      update intentos_mis_datos i
         set frenado_hasta = now() + interval '15 minutes',
             fallidos      = 0,
             primer_fallo  = null
       where i.telefono = v_tel;
      return query select 'DEMASIADOS_INTENTOS'::text, null::text, null::text, 900;
      return;
    end if;

    return query select 'NO_COINCIDE'::text, null::text, null::text, null::int;
    return;
  end if;

  delete from intentos_mis_datos i where i.telefono = v_tel;
  --  Las llaves viejas no se quedan.
  delete from llaves_persona l where l.vence_en < now() - interval '1 day';

  insert into llaves_persona as l (persona_id) values (v_persona.id) returning l.llave into v_llave;

  return query
    select 'LISTO'::text,
           trim(coalesce(nullif(v_persona.nombres, ''), split_part(v_persona.nombre, ' ', 1))
                || coalesce(' ' || nullif(left(coalesce(v_persona.apellidos, ''), 1), '') || '.', '')),
           v_llave,
           null::int;
end;
$$;

revoke execute on function abrir_mis_datos(text, text) from public;
grant  execute on function abrir_mis_datos(text, text) to anon, authenticated;


-- ------------------------------------------------------------
--  Los idiomas nuevos
-- ------------------------------------------------------------

alter table personas drop constraint if exists personas_idioma_check;
alter table personas add constraint personas_idioma_check check (idioma in ('es', 'en', 'vi', 'zh', 'tl', 'ko', 'ht', 'ru', 'so', 'fr'));

alter table boletin drop constraint if exists boletin_idioma_check;
alter table boletin add constraint boletin_idioma_check check (idioma in ('es', 'en', 'vi', 'zh', 'tl', 'ko', 'ht', 'ru', 'so', 'fr'));

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
          case when p_idioma in ('es', 'en', 'vi', 'zh', 'tl', 'ko', 'ht', 'ru', 'so', 'fr') then p_idioma else 'es' end,
          p_persona)
  on conflict (email) do update
     set idioma      = excluded.idioma,
         persona_id  = excluded.persona_id,
         aceptado_en = case when boletin.baja_en is not null then now() else boletin.aceptado_en end,
         baja_en     = null;
$$;

revoke execute on function anotar_en_boletin(text, text, uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
--  El registro publico: la llave de "¿Ya viniste antes?"
-- ------------------------------------------------------------

--  Le crecieron p_codigo_acompanante y p_fecha (seccion 39), p_idioma y
--  p_boletin (seccion 54) y p_llave_persona (seccion 56): se borran las
--  anteriores y se vuelve a crear.
drop function if exists registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date);
drop function if exists registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date, text, boolean);

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
  --  El idioma de la pantalla al registrarse (es, en, vi...): el de sus
  --  correos (seccion 54).
  p_idioma            text    default null,
  --  La casilla del boletin, que va sin marcar (seccion 54).
  p_boletin           boolean default false,
  --  "¿Ya viniste antes?" (seccion 56): la llave de abrir_mis_datos(). Con
  --  ella no se piden otra vez sus datos: se usa la persona que ya existe,
  --  con su mismo codigo CB. p_nombre, p_apellidos, p_telefono y p_email
  --  pueden ir vacios.
  p_llave_persona     text    default null
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
  v_conocida   personas;
begin
  -- ----------------------------------------------------------
  --  ¿Ya viniste antes? (seccion 56)
  -- ----------------------------------------------------------
  if nullif(trim(coalesce(p_llave_persona, '')), '') is not null then
    select p.* into v_conocida
      from llaves_persona l
      join personas p on p.id = l.persona_id
     where l.llave = trim(p_llave_persona)
       and l.vence_en > now();

    if v_conocida.id is null then
      raise exception 'LLAVE_VENCIDA';
    end if;

    --  Sus datos de siempre: con ellos se reconoce su cita del dia.
    v_nombres   := coalesce(nullif(v_conocida.nombres, ''), v_conocida.nombre);
    v_apellidos := coalesce(v_conocida.apellidos, '');
    v_telefono  := coalesce(v_conocida.telefono, '');
  end if;

  --  Quien ya vino antes no los vuelve a escribir: ya se revisaron (y
  --  acepto el aviso de privacidad) la primera vez.
  if v_conocida.id is null then
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
      if coalesce(p_boletin, false) and coalesce(nullif(trim(p_email), ''), v_conocida.email) is not null then
        perform anotar_en_boletin(coalesce(nullif(trim(p_email), ''), v_conocida.email), p_idioma, v_previa.persona_id);
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
  if v_conocida.id is not null then
    --  Ya vino antes (seccion 56): la misma persona, con su mismo codigo CB.
    --  Su idioma de hoy queda para sus correos.
    v_persona := v_conocida;
    if p_idioma in ('es', 'en', 'vi', 'zh', 'tl', 'ko', 'ht', 'ru', 'so', 'fr') then
      update personas set idioma = p_idioma where id = v_conocida.id;
    end if;
  else
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
                case when p_idioma in ('es', 'en', 'vi', 'zh', 'tl', 'ko', 'ht', 'ru', 'so', 'fr') then p_idioma else 'es' end)
        returning * into v_persona;
        exit;
      exception when unique_violation then
        v_intentos := v_intentos + 1;
        if v_intentos > 50 then
          raise exception 'SIN_CODIGOS_DISPONIBLES';
        end if;
      end;
    end loop;
  end if;

  --  reservar_cita hace el bloqueo de fila que impide el sobrecupo y
  --  aplica la regla de una cita por semana. No se duplica aqui.
  v_cita := reservar_cita(v_persona.id, v_bloque_id, v_duenio.id);

  update citas
     set dispositivo_id        = p_dispositivo,
         con_codigo_anticipado = v_anticipada
   where id = v_cita.id;

  --  Solo con la casilla marcada (seccion 54).
  if coalesce(p_boletin, false) and coalesce(nullif(trim(p_email), ''), v_persona.email) is not null then
    perform anotar_en_boletin(coalesce(nullif(trim(p_email), ''), v_persona.email), p_idioma, v_persona.id);
  end if;

  return query
    select v_persona.codigo_corto, v_cita.token_qr, v_bloque.fecha, v_bloque.hora, false;
end;
$$;


revoke execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date, text, boolean, text) from public;
grant  execute on function registrar_y_reservar(text, text, text, uuid, text, text, text, text, text, text, text, boolean, boolean, text, text, text, date, text, boolean, text) to anon, authenticated;
