-- Scheduler for the extraction queue — lives in Supabase, not Vercel.
--
-- Vercel Cron requires a Pro plan for sub-daily schedules, so instead of
-- vercel.json we drive the drain from Postgres: pg_cron fires every minute and
-- pg_net POSTs to the CRON_SECRET-gated consumer (/api/jobs/extract-tick). This
-- is plan-independent, co-located with the queue, and a self-hoster gets it from
-- the migration alone.
--
-- Config (app URL + shared secret) is read from Supabase Vault at run time and is
-- NOT baked into this file. When the secrets are absent (CI, local, a fresh
-- self-host), the tick is a no-op — so `supabase db reset` stays green. Populate
-- them per-environment out of band:
--   select vault.create_secret('https://your-app.example', 'extraction_app_url');
--   select vault.create_secret('<CRON_SECRET>',            'extraction_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reads config from Vault and pings the consumer. Owner-only (revoked from
-- public) so it can't be invoked through PostgREST by app users; pg_cron runs it
-- as the job owner.
create or replace function public.drain_extraction_tick()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'extraction_app_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'extraction_cron_secret' limit 1;

  -- Not configured yet (CI / local / fresh install): do nothing.
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     => v_url || '/api/jobs/extract-tick',
    headers => jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    => '{}'::jsonb
  );
end;
$$;

revoke all on function public.drain_extraction_tick() from public;

-- Every minute. cron.schedule upserts by job name, so this is idempotent.
select cron.schedule('drain-extraction', '* * * * *', $$select public.drain_extraction_tick();$$);
