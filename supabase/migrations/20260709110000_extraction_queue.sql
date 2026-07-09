-- Extraction job queue (closes the capture -> extraction loop).
--
-- Captured messages land in `items` at status 'stored' (see lib/ingest/store.ts).
-- Nothing consumed them: runExtractionForItem() existed but was called from
-- nowhere. This wires an in-Postgres queue (pgmq) so that every stored item is
-- enqueued for extraction, and a Vercel Cron consumer (/api/jobs/extract-tick)
-- drains it. No external services -- a self-hoster gets the whole loop with just
-- their Supabase + Vercel + an LLM key.
--
-- Access pattern: the pgmq schema is NOT exposed to PostgREST. The app only ever
-- touches the queue through the SECURITY DEFINER wrappers below, which live in
-- `public` and are granted to service_role only.

create extension if not exists pgmq;

-- Idempotent queue creation (pgmq.create errors if it already exists).
do $$
begin
  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'extraction_jobs'
  ) then
    perform pgmq.create('extraction_jobs');
  end if;
end;
$$;

-- --- wrappers (public, security definer, service_role only) -----------------

-- Enqueue one item for extraction.
create or replace function public.extraction_enqueue(p_item_id uuid)
returns bigint
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.send('extraction_jobs', jsonb_build_object('item_id', p_item_id));
$$;

-- Read (and lock, via visibility timeout) a batch of jobs. read_ct lets the
-- consumer give up on poison messages.
create or replace function public.extraction_read_batch(
  p_qty int default 5,
  p_vt  int default 120
)
returns table (msg_id bigint, read_ct int, item_id uuid)
language sql
security definer
set search_path = pgmq, public
as $$
  select msg_id, read_ct, (message->>'item_id')::uuid
  from pgmq.read('extraction_jobs', p_vt, p_qty);
$$;

-- Mark a job done: archive keeps it in pgmq.a_extraction_jobs for audit rather
-- than deleting outright.
create or replace function public.extraction_archive(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.archive('extraction_jobs', p_msg_id);
$$;

revoke all on function public.extraction_enqueue(uuid)     from public;
revoke all on function public.extraction_read_batch(int,int) from public;
revoke all on function public.extraction_archive(bigint)   from public;
grant execute on function public.extraction_enqueue(uuid)      to service_role;
grant execute on function public.extraction_read_batch(int,int) to service_role;
grant execute on function public.extraction_archive(bigint)    to service_role;

-- --- trigger: enqueue whenever an item reaches 'stored' ---------------------

create or replace function public.enqueue_extraction_on_stored()
returns trigger
language plpgsql
security definer
set search_path = pgmq, public
as $$
begin
  if new.status = 'stored'
     and (tg_op = 'INSERT' or old.status is distinct from 'stored') then
    perform pgmq.send('extraction_jobs', jsonb_build_object('item_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_extraction on items;
create trigger trg_enqueue_extraction
after insert or update of status on items
for each row
execute function public.enqueue_extraction_on_stored();
