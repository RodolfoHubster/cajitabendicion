-- ============================================================
--  Suscriptores de Facebook: el interruptor general (seccion 60)
-- ============================================================
--  SQL Editor de Supabase -> pegar completo -> Run. Primero en la base de
--  pruebas y luego en la real, ANTES de subir el panel nuevo.
--
--  Al correrla, el registro para suscriptores queda APAGADO: las fechas de
--  hoy en adelante pierden su acceso anticipado y la pagina deja de ensenar
--  el boton de Facebook. Se vuelve a prender en Horarios y cupos.
--
--  Se puede correr dos veces sin romper nada. No toca registrar_y_reservar(),
--  reservar_cita() ni registrar_entrega(), ni los cupos.
--
--  Pedido del pastor, 23 de noviembre de 2026: ya no quiere el registro
--  anticipado con el codigo de Facebook; todos hacen su cita directo. No se
--  borra (la seccion 21 sigue igual): se apaga con un interruptor del panel,
--  en Horarios y cupos, y se puede volver a prender.
--
--  Apagado:
--  * Ninguna fecha guarda hora de acceso anticipado. Al apagarlo se les
--    quita a las fechas de hoy en adelante, y despues el disparador de abajo
--    la deja vacia aunque alguien la mande. Con eso registrar_y_reservar() y
--    validar_codigo_anticipado() ya no dejan entrar a nadie antes de la
--    apertura, sin tocarlas: las dos exigen esa hora.
--  * La pagina ya no ensena el boton de suscriptores: solo sale cuando la
--    fecha tiene acceso anticipado (consultar_disponibilidad lo dice).
--  Prendido: todo como antes; en cada fecha se activa por su lado.
--
--  Sin el renglon en configuracion cuenta como apagado: asi lo decidio el
--  pastor. Las fechas que ya pasaron no se tocan: son historia.

--  La tabla de ajustes no tenia RLS (seccion 14): con la llave publica se
--  podia cambiar por la API. Nadie la lee directo; todo pasa por funciones.
--  Sin politicas, como las demas: "no pasa nadie".
alter table configuracion enable row level security;
revoke all on configuracion from anon, authenticated;

insert into configuracion (clave, valor, nota) values
  ('acceso_suscriptores', 'no',
   'si: cada fecha puede tener registro anticipado con el codigo de Facebook ' ||
   '(se activa en la fecha). no: nadie se registra antes de la apertura y la ' ||
   'pagina no ensena el boton de suscriptores. Se cambia en Horarios y cupos.')
on conflict (clave) do nothing;


--  Si el registro para suscriptores esta prendido.
create or replace function acceso_suscriptores_activo()
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce((select c.valor = 'si' from configuracion c where c.clave = 'acceso_suscriptores'), false);
$$;

revoke execute on function acceso_suscriptores_activo() from public, anon;
grant  execute on function acceso_suscriptores_activo() to authenticated;


--  Prenderlo o apagarlo: solo el administrador. Al apagarlo, las fechas de
--  hoy en adelante se quedan sin acceso anticipado (su codigo se guarda: si
--  se vuelve a prender y se activa en la fecha, es el mismo). Devuelve como
--  quedo.
create or replace function cambiar_acceso_suscriptores(p_activo boolean)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set timezone    = 'America/Los_Angeles'
as $$
begin
  perform exigir_rol(array['admin']);

  if p_activo is null then
    raise exception 'VALOR_INVALIDO';
  end if;

  insert into configuracion (clave, valor)
  values ('acceso_suscriptores', case when p_activo then 'si' else 'no' end)
  on conflict (clave) do update set valor = excluded.valor;

  if not p_activo then
    update dias_entrega d
       set abre_anticipado_en = null,
           actualizado_en     = now()
     where d.fecha >= current_date
       and d.abre_anticipado_en is not null;
  end if;

  return p_activo;
end;
$$;

revoke execute on function cambiar_acceso_suscriptores(boolean) from public, anon;
grant  execute on function cambiar_acceso_suscriptores(boolean) to authenticated;


--  Apagado, ninguna fecha guarda hora de acceso anticipado: ni al crearla,
--  ni al editarla, ni al mover la entrega a otro dia (que copia la de la
--  fecha original). Se deja vacia en vez de dar error: el panel ya no la
--  manda, y esto es solo el candado de la base.
create or replace function sin_anticipado_si_esta_apagado()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.abre_anticipado_en is not null and not acceso_suscriptores_activo() then
    new.abre_anticipado_en := null;
  end if;
  return new;
end;
$$;

revoke execute on function sin_anticipado_si_esta_apagado() from public, anon, authenticated;

drop trigger if exists dias_entrega_sin_anticipado on dias_entrega;
create trigger dias_entrega_sin_anticipado
  before insert or update of abre_anticipado_en on dias_entrega
  for each row execute function sin_anticipado_si_esta_apagado();


--  Al instalarlo queda apagado: las fechas que vienen pierden su acceso
--  anticipado de una vez (si ya estaba prendido, no se toca nada).
update dias_entrega d
   set abre_anticipado_en = null,
       actualizado_en     = now()
 where not acceso_suscriptores_activo()
   and d.fecha >= (now() at time zone 'America/Los_Angeles')::date
   and d.abre_anticipado_en is not null;
