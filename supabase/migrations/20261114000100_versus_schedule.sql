-- Versus: clear away matches more than a day old, every night at 03:17 UTC.

create extension if not exists pg_cron;

select cron.schedule('outlier-versus-cleanup', '17 3 * * *', $job$ select public.versus_cleanup() $job$);
