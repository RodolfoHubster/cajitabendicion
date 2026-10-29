-- ============================================================
--  Que la base mande los correos cada minuto (docs/correos.md, paso 6)
-- ============================================================
--  Se corre UNA vez en el SQL Editor de Supabase, despues de publicar la
--  funcion enviar-correos y de ponerle sus secretos. Antes de correrlo,
--  cambia las dos cosas marcadas con <<< >>>. No se guarda en el repo con
--  los valores puestos.
--
--  Lo que hace: cada minuto, pg_cron le pide a la funcion que mande lo
--  pendiente (pg_net hace la llamada). La direccion y el secreto quedan
--  guardados en el Vault de Supabase, no en el texto del cron.
--
--  Para apagarlo:  select cron.unschedule('enviar-correos');
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

--  La direccion de la funcion: Supabase -> Edge Functions -> enviar-correos.
select vault.create_secret(
  'https://<<<ID-DEL-PROYECTO>>>.supabase.co/functions/v1/enviar-correos',
  'correos_url',
  'Direccion de la funcion que manda los correos'
);

--  El mismo valor que el secreto CORREOS_SECRETO de la funcion.
select vault.create_secret(
  '<<<EL-MISMO-CORREOS_SECRETO>>>',
  'correos_secreto',
  'Lo que la base manda en x-cajita-secreto'
);

select cron.schedule(
  'enviar-correos',
  '* * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'correos_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cajita-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'correos_secreto')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
