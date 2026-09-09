-- ============================================================
--  Cajita de Bendicion - Panel: citas de hoy
--  Correr sobre la base que ya existe. Se puede repetir.
-- ============================================================

-- ============================================================
--  17. PANEL: CITAS DE HOY
-- ============================================================
--  Alimenta /admin. Todo aqui es solo para personal con sesion: nada
--  se otorga a anon.
--
--  PENDIENTE DE ROLES: CLAUDE.md define cuatro roles (administrador,
--  coordinador, voluntario, consulta) y pide que un voluntario no pueda
--  leer el padron completo. Esos roles todavia no existen en la base,
--  asi que hoy cualquier cuenta con sesion ve lo mismo. Cuando se creen,
--  la restriccion va aqui dentro, no en la pantalla: una pantalla se
--  esquiva, una funcion no.

--  Los cuatro numeros del encabezado del panel.
create or replace function resumen_del_dia(p_fecha date default null)
returns table (
  fecha              date,
  con_cita           int,
  ya_recibieron      int,
  faltan_por_llegar  int,
  sin_cita           int,
  intentos_repetidos int
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  with dia as (select coalesce(p_fecha, current_date) as f)
  select
    dia.f,
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = dia.f
        and c.estado in ('reservada','llego','entregada')),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = dia.f and c.estado = 'entregada'),
    (select count(*)::int from citas c
       join bloques b on b.id = c.bloque_id
      where b.fecha = dia.f and c.estado = 'reservada'),
    (select count(*)::int from entradas_sin_cita s where s.fecha = dia.f),
    --  Intentos repetidos: alguien trato de usar dos veces el mismo
    --  codigo. Es la senal de que el corte esta funcionando y de que
    --  hay quien lo esta intentando.
    (select count(*)::int from escaneos e
       join citas   c on c.id = e.cita_id
       join bloques b on b.id = c.bloque_id
      where b.fecha = dia.f and e.resultado = 'YA_USADO')
  from dia;
$$;

revoke execute on function resumen_del_dia(date) from public;
grant  execute on function resumen_del_dia(date) to authenticated;


--  La lista de llegadas del mockup 8.
--
--  Devuelve solo las cinco columnas que la pantalla muestra. NO salen
--  telefono, correo ni direccion: un voluntario en la entrada no los
--  necesita para dejar pasar a alguien, y parte de la comunidad tiene
--  estatus migratorio delicado.
create or replace function citas_del_dia(p_fecha date default null)
returns table (
  nombre       text,
  codigo_corto text,
  ciudad       text,
  hora         time,
  estado       text,
  usado_en     timestamptz
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select p.nombre, p.codigo_corto, p.ciudad, b.hora, c.estado, c.usado_en
    from citas c
    join personas p on p.id = c.persona_id
    join bloques  b on b.id = c.bloque_id
   where b.fecha = coalesce(p_fecha, current_date)
     and c.estado <> 'cancelada'
   order by b.hora, p.nombre;
$$;

revoke execute on function citas_del_dia(date) from public;
grant  execute on function citas_del_dia(date) to authenticated;


--  Los cupos por horario, para el bloque "Cupo de cada horario".
--
--  Distinta de consultar_disponibilidad(): esa es para el publico y
--  esconde los horarios cerrados. El administrador necesita verlos,
--  justamente para poder reabrirlos.
create or replace function bloques_del_dia(p_fecha date default null)
returns table (
  bloque_id uuid,
  hora      time,
  capacidad int,
  ocupados  int,
  libres    int,
  cerrado   boolean
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
  select b.id,
         b.hora,
         b.capacidad,
         count(c.id) filter (where c.estado <> 'cancelada')::int,
         greatest(b.capacidad - count(c.id) filter (where c.estado <> 'cancelada'), 0)::int,
         b.cerrado
    from bloques b
    left join citas c on c.bloque_id = b.id
   where b.fecha = coalesce(p_fecha, current_date)
   group by b.id, b.hora, b.capacidad, b.cerrado
   order by b.hora;
$$;

revoke execute on function bloques_del_dia(date) from public;
grant  execute on function bloques_del_dia(date) to authenticated;


