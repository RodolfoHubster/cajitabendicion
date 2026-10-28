-- ============================================================
--  Cajita de Bendicion - Voluntarios de ejemplo para la BASE DE PRUEBAS
-- ============================================================
--  SOLO para el proyecto de pruebas de Supabase, NUNCA para el real: se
--  niega si la base no tiene la marca de pruebas (la pone
--  datos-de-prueba.sql).
--
--  Antes, en esta misma base de pruebas:
--    1. supabase/pruebas/datos-de-prueba.sql
--    2. supabase/migraciones/2026-10-20-voluntarios.sql
--    3. supabase/migraciones/2026-10-23-voluntarios-envio-y-atiende.sql
--
--  Que deja listo (seccion 48), para ver las tres pestanas de Voluntarios:
--    * Juana Perez     adentro desde hace 3 horas: escanearla marca su salida.
--    * Marcos Hernandez  vino hoy y ya se fue (sale en "Hoy" completo).
--    * Pedro Ramirez   sin nada hoy: escanearlo marca su entrada. Vino 3 dias.
--    * Lucia Gomez     se fue sin marcar salida hace 4 dias (para corregir).
--    * Sofia Diaz      una asistencia corregida y una anulada, con motivo.
--    * Ana Torres      recien registrada, sin asistencias.
--
--  Con telefono y correo por separado (seccion 49): Juana y Lucia ya
--  recibieron su credencial (WhatsApp y correo); los demas, no. Marcos
--  tiene un telefono de Tijuana y Sofia, telefono y correo.
--    * Tomas Ruiz      dado de baja: su credencial dice que ya no esta activa.
--
--  Con la de 2026-10-27-voluntarios-solo-entrada.sql (seccion 52), Pedro
--  tambien lleva una nota. Ojo: en modo "solo la
--  entrada", escanear a Juana no la saca (lo dice), y despues de la hora de
--  salida su salida se pone sola al abrir Voluntarios.
--
--  Se puede correr cuantas veces quieras: borra estos siete y los vuelve a
--  crear. Al final muestra sus credenciales: el enlace es
--  /voluntario/<credencial>, y el QR se ve en Voluntarios > Lista > Credencial.
-- ============================================================

do $voluntarios$
declare
  --  Credenciales fijas ("vol" + 48), para reconocerlas y borrarlas.
  v_tokens text[] := array[
    'vol' || repeat('a1', 24), 'vol' || repeat('a2', 24), 'vol' || repeat('a3', 24),
    'vol' || repeat('a4', 24), 'vol' || repeat('a5', 24), 'vol' || repeat('a6', 24),
    'vol' || repeat('a7', 24)];
  v_hoy    date := (now() at time zone 'America/Los_Angeles')::date;
  v_juana  uuid;
  v_marcos uuid;
  v_pedro  uuid;
  v_lucia  uuid;
  v_sofia  uuid;
  v_tomas  uuid;
  v_entra  timestamptz;
begin
  if not exists (select 1 from configuracion where clave = 'es_base_de_pruebas') then
    raise exception 'ALTO: esta base no esta marcada como de pruebas. Parece la base REAL. No se hizo nada. (Corre antes datos-de-prueba.sql en la de pruebas.)';
  end if;

  if to_regclass('public.voluntarios') is null then
    raise exception 'Falta correr supabase/migraciones/2026-10-20-voluntarios.sql en esta base de pruebas.';
  end if;

  if to_regclass('public.credenciales_enviadas') is null then
    raise exception 'Falta correr supabase/migraciones/2026-10-23-voluntarios-envio-y-atiende.sql en esta base de pruebas.';
  end if;

  --  Borrar los de ejemplo anteriores.
  delete from credenciales_enviadas e using voluntarios v
   where e.voluntario_id = v.id and v.token = any (v_tokens);
  delete from asistencias_voluntarios a using voluntarios v
   where a.voluntario_id = v.id and v.token = any (v_tokens);
  delete from voluntarios v where v.token = any (v_tokens);

  insert into voluntarios (nombre, telefono, correo, token, creado_en)
  values ('Juana Pérez', '+16195550101', null, v_tokens[1], now() - interval '30 days') returning id into v_juana;
  insert into voluntarios (nombre, telefono, correo, token, creado_en)
  values ('Marcos Hernández', '+526641234567', null, v_tokens[2], now() - interval '20 days') returning id into v_marcos;
  insert into voluntarios (nombre, telefono, correo, token, creado_en)
  values ('Pedro Ramírez', '+16195550103', null, v_tokens[3], now() - interval '18 days') returning id into v_pedro;
  insert into voluntarios (nombre, telefono, correo, token, creado_en)
  values ('Lucía Gómez', null, 'lucia@ejemplo.com', v_tokens[4], now() - interval '15 days') returning id into v_lucia;
  insert into voluntarios (nombre, telefono, correo, token, creado_en)
  values ('Sofía Díaz', '+16195550105', 'sofia@ejemplo.com', v_tokens[5], now() - interval '10 days') returning id into v_sofia;
  insert into voluntarios (nombre, telefono, correo, token, creado_en)
  values ('Ana Torres', null, null, v_tokens[6], now() - interval '1 day');
  insert into voluntarios (nombre, telefono, correo, token, activo, creado_en)
  values ('Tomás Ruiz', null, null, v_tokens[7], false, now() - interval '40 days') returning id into v_tomas;

  --  Su credencial vale desde que se registraron (si no, lo enviado no contaria).
  update voluntarios v set credencial_desde = v.creado_en where v.token = any (v_tokens);

  --  A quienes ya se les mando su credencial.
  insert into credenciales_enviadas (voluntario_id, medio, enviada_en) values
    (v_juana, 'whatsapp', now() - interval '29 days'),
    (v_lucia, 'correo',   now() - interval '14 days');

  --  Hoy. Sin pasarse a ayer si se corre de madrugada.
  v_entra := greatest(now() - interval '3 hours', (v_hoy + time '00:05') at time zone 'America/Los_Angeles');
  insert into asistencias_voluntarios (voluntario_id, entrada_en, estado)
  values (v_juana, v_entra, 'dentro');

  v_entra := greatest(now() - interval '5 hours', (v_hoy + time '00:05') at time zone 'America/Los_Angeles');
  insert into asistencias_voluntarios (voluntario_id, entrada_en, salida_en, estado)
  values (v_marcos, v_entra, greatest(now() - interval '1 hour', v_entra + interval '10 minutes'), 'salio');

  --  Dias pasados (horas de San Diego).
  insert into asistencias_voluntarios (voluntario_id, entrada_en, salida_en, estado)
  select v.id, (v_hoy - d.dias + d.entra) at time zone 'America/Los_Angeles',
         (v_hoy - d.dias + d.sale) at time zone 'America/Los_Angeles', 'salio'
    from (values
      (v_juana,  4, time '09:00', time '13:30'),
      (v_juana,  7, time '09:15', time '14:00'),
      (v_juana, 11, time '10:00', time '13:00'),
      (v_marcos, 7, time '08:45', time '12:15'),
      (v_pedro,  4, time '09:30', time '12:30'),
      (v_pedro,  7, time '09:00', time '15:10'),
      (v_pedro, 14, time '10:00', time '12:00'),
      (v_lucia,  7, time '09:00', time '11:45'),
      (v_lucia, 11, time '09:00', time '13:20'),
      (v_tomas, 25, time '09:00', time '12:00')
    ) as d(vol, dias, entra, sale)
    join voluntarios v on v.id = d.vol;

  --  Lucia: se fue sin marcar su salida.
  insert into asistencias_voluntarios (voluntario_id, entrada_en, estado)
  values (v_lucia, (v_hoy - 4 + time '09:10') at time zone 'America/Los_Angeles', 'sin_salida');

  --  Sofia: una corregida y una anulada.
  insert into asistencias_voluntarios (voluntario_id, entrada_en, salida_en, estado, corregida_en, motivo)
  values (v_sofia, (v_hoy - 4 + time '09:00') at time zone 'America/Los_Angeles',
          (v_hoy - 4 + time '13:00') at time zone 'America/Los_Angeles', 'salio', now(), 'Se fue sin marcar su salida');
  insert into asistencias_voluntarios (voluntario_id, entrada_en, salida_en, estado, corregida_en, motivo)
  values (v_sofia, (v_hoy - 7 + time '10:00') at time zone 'America/Los_Angeles',
          (v_hoy - 7 + time '11:00') at time zone 'America/Los_Angeles', 'anulada', now(), 'Se escaneó a la persona equivocada');

  --  La nota (seccion 52), si ya se corrio su actualizacion.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'voluntarios' and column_name = 'nota') then
    execute 'update voluntarios set nota = $1 where id = $2' using 'Necesita su constancia de horas para la escuela', v_pedro;
  end if;
end
$voluntarios$;

--  Lo que quedo: sus credenciales (el enlace es /voluntario/<credencial>).
select v.nombre,
       case when v.activo then 'activo' else 'de baja' end as estado,
       v.token                                            as credencial,
       '/voluntario/' || v.token                          as enlace
  from voluntarios v
 where v.token in (select 'vol' || repeat('a' || n, 24) from generate_series(1, 7) n)
 order by v.activo desc, v.nombre;
