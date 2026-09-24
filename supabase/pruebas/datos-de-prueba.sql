-- ============================================================
--  Cajita de Bendicion - Datos para la BASE DE PRUEBAS
-- ============================================================
--  SOLO para el proyecto de pruebas de Supabase, NUNCA para el real.
--  Si lo corres en una base que ya tiene gente y no esta marcada como de
--  pruebas, se niega solo y no hace nada.
--
--  Que deja listo:
--    * Fechas de entrega abiertas: HOY y las proximas dos (lunes y jueves),
--      con horarios de 2:45 a 6:30 PM, 20 lugares cada uno.
--    * Siete personas inventadas (CB-9001 a CB-9007), cinco con cita HOY
--      para escanear, una con cita otro dia (para ver "otra fecha") y una
--      con pase permanente.
--    * Un horario VACIO de 2 lugares para scripts/prueba-concurrencia.mjs.
--
--  Se puede correr cuantas veces quieras: borra lo de prueba anterior y lo
--  vuelve a crear. Al final muestra una tabla con los codigos y los tokens.
--
--  Antes, en esta misma base de pruebas:
--    1. supabase/schema.sql completo.
--    2. supabase/migraciones/2026-09-15-codigos-postales-datos.sql (para que
--       el registro publico pueda revisar domicilios).
--    3. Tu usuario: Authentication > Add user (con "Auto Confirm User"), y
--       aqui en el SQL Editor:  select definir_personal('tu@correo.com', 'admin');
-- ============================================================

do $datos$
declare
  v_marcada   boolean := exists (select 1 from configuracion where clave = 'es_base_de_pruebas');
  v_personas  int     := (select count(*) from personas);
  v_codigos   text[]  := array['CB-9001', 'CB-9002', 'CB-9003', 'CB-9004', 'CB-9005', 'CB-9006', 'CB-9007'];
  v_hoy       date    := current_date;
  v_fechas    date[];
  v_fecha     date;
  v_otra      date;
  v_bloque    uuid;
  v_otro      uuid;
  v_persona   uuid;
  i           int;
begin
  --  El candado: una base con gente y sin la marca es la real.
  if not v_marcada and v_personas > 0 then
    raise exception 'ALTO: esta base ya tiene % personas y no esta marcada como de pruebas. Parece la base REAL. No se hizo nada.', v_personas;
  end if;

  insert into configuracion (clave, valor, nota) values
    ('es_base_de_pruebas', 'si',
     'Marca de la base de PRUEBAS. supabase/pruebas/datos-de-prueba.sql solo corre donde esta.')
  on conflict (clave) do nothing;

  -- ----------------------------------------------------------
  --  Borrar lo de prueba anterior (solo CB-9001 a CB-9007)
  -- ----------------------------------------------------------
  delete from anulaciones_entrega a
   using citas c, personas p
   where a.cita_id = c.id and c.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from anulaciones_entrega a
   using pases pa, personas p
   where a.pase_id = pa.id and pa.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from escaneos e
   using citas c, personas p
   where e.cita_id = c.id and c.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from movimientos_cita m
   using citas c, personas p
   where m.cita_id = c.id and c.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from entregas_pase e
   using pases pa, personas p
   where e.pase_id = pa.id and pa.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from pases pa using personas p where pa.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from citas c using personas p where c.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from excepciones x using personas p where x.persona_id = p.id and p.codigo_corto = any (v_codigos);
  delete from personas p where p.codigo_corto = any (v_codigos);

  -- ----------------------------------------------------------
  --  Fechas: hoy y los proximos dos lunes/jueves
  -- ----------------------------------------------------------
  select array_agg(d order by d) into v_fechas
    from (
      select v_hoy as d
      union
      (select g::date
         from generate_series(v_hoy + 1, v_hoy + 14, interval '1 day') g
        where extract(isodow from g) in (1, 4)
        order by g
        limit 2)
    ) x;

  foreach v_fecha in array v_fechas loop
    insert into dias_entrega (fecha, abre_en, codigo_anticipado)
    values (v_fecha, now() - interval '1 day', generar_codigo_anticipado())
    on conflict (fecha) do update set cerrado = false, abre_en = least(dias_entrega.abre_en, now() - interval '1 day');

    insert into bloques (fecha, hora, capacidad)
    select v_fecha, t::time, 20
      from generate_series(v_fecha + time '14:45', v_fecha + time '18:30', interval '15 minutes') t
    on conflict (fecha, hora, fila) do update set cerrado = false;
  end loop;

  v_otra := v_fechas[2];

  -- ----------------------------------------------------------
  --  Personas inventadas y sus citas
  -- ----------------------------------------------------------
  select id into v_bloque from bloques where fecha = v_hoy and hora = '14:45' and fila = 'carro';
  select id into v_otro   from bloques where fecha = v_otra and hora = '15:00' and fila = 'carro';

  for i in 1 .. 7 loop
    insert into personas (codigo_corto, nombre, nombres, apellidos, telefono, ciudad, acepto_privacidad_en)
    values (v_codigos[i],
            (array['Prueba Uno Escaneo', 'Prueba Dos Escaneo', 'Prueba Tres Escaneo', 'Prueba Cuatro Escaneo',
                   'María Prueba Acentos', 'Prueba Otra Fecha', 'Prueba Pase Permanente'])[i],
            (array['Prueba', 'Prueba', 'Prueba', 'Prueba', 'María', 'Prueba', 'Prueba'])[i],
            (array['Uno Escaneo', 'Dos Escaneo', 'Tres Escaneo', 'Cuatro Escaneo',
                   'Prueba Acentos', 'Otra Fecha', 'Pase Permanente'])[i],
            '+1619555' || lpad((9000 + i)::text, 4, '0'),
            'San Diego',
            now())
    returning id into v_persona;

    if i <= 5 then
      perform reservar_cita(v_persona, v_bloque);
    elsif i = 6 then
      perform reservar_cita(v_persona, v_otro);
    else
      insert into pases (persona_id, token, motivo)
      values (v_persona, encode(gen_random_bytes(24), 'hex'), 'Prueba');
    end if;
  end loop;

  -- ----------------------------------------------------------
  --  El horario vacio de 2 lugares para la prueba de concurrencia
  -- ----------------------------------------------------------
  delete from citas c using bloques b
   where c.bloque_id = b.id and b.fecha = v_otra and b.hora = '23:45' and b.fila = 'carro';
  insert into bloques (fecha, hora, capacidad)
  values (v_otra, '23:45', 2)
  on conflict (fecha, hora, fila) do update set capacidad = 2, cerrado = false;
end
$datos$;


--  Lo que quedo, para copiar tokens y codigos.
select p.codigo_corto                                   as codigo,
       p.nombre,
       coalesce(b.fecha::text, 'pase permanente')       as fecha,
       coalesce(to_char(b.hora, 'HH12:MI AM'), '-')     as hora,
       coalesce(c.token_qr, pa.token)                   as token,
       case when pa.id is not null then '/pase/' || pa.token
            else '/confirmacion/' || c.token_qr end     as enlace
  from personas p
  left join citas   c  on c.persona_id = p.id
  left join bloques b  on b.id = c.bloque_id
  left join pases   pa on pa.persona_id = p.id
 where p.codigo_corto like 'CB-900_'
union all
select 'CONCURRENCIA', 'Horario vacio de 2 lugares', b.fecha::text, to_char(b.hora, 'HH12:MI AM'),
       b.id::text, 'node scripts/prueba-concurrencia.mjs --pruebas ' || b.id
  from bloques b
 where b.hora = '23:45' and b.capacidad = 2 and b.fecha > current_date and b.fila = 'carro'
 order by 1;
