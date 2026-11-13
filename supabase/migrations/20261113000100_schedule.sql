-- Outlier: scheduled jobs.
--
-- pg_cron runs in UTC and knows nothing about British Summer Time, so each job
-- fires at both UTC hours that could be the right London time, and the code it
-- calls works out which one is.
--
-- Before running this migration, store three secrets in Supabase Vault
-- (SQL editor, once per project):
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'outlier_functions_url');
--   select vault.create_secret('<anon key>', 'outlier_anon_key');
--   select vault.create_secret('<same value as the CRON_SECRET function secret>', 'outlier_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 23:30 UK time: choose tomorrow's prompts and generate its ghosts.
-- (22:30 UTC is 23:30 BST; 23:30 UTC is 23:30 GMT. The function skips the wrong one.)
select cron.schedule(
  'outlier-prepare-day',
  '30 22,23 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'outlier_functions_url') || '/prepare-day',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'outlier_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'outlier_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
  $job$
);

-- Midnight UK time: lock the finished day's scores.
-- finalise_due_days() only touches days that are over in London, so running it
-- at 23:00 UTC in winter (an hour early) does nothing, and the 00:00 run picks it up.
-- The :05 runs are a retry in case the first is missed.
select cron.schedule(
  'outlier-finalise',
  '0,5 23,0 * * *',
  $job$ select public.finalise_due_days(); $job$
);
