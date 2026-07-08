-- Content-retention lifecycle for captured items.
--
-- An item's heavy content (body + attachment blobs) is kept while any proposal
-- derived from it is still pending review, so the reviewer sees the source chunk.
-- Once the last proposal is resolved (accepted OR rejected), items on a channel
-- whose original is *re-fetchable from the provider* are "dereferenced": their
-- blobs are dropped and only a lightweight source_ref (ids + deep link) is kept,
-- to be re-fetched on demand. Channels that can't be re-fetched (WhatsApp,
-- Cloudflare-forwarded email, Teams-via-bot) always retain their content — the
-- capability check lives in code (lib/ingest/retention.ts), never here.

alter table public.items
  add column if not exists source_ref jsonb not null default '{}'::jsonb;

-- 'hydrated'    = full content stored (body_hash / attachments present)
-- 'dereferenced'= content dropped; source_ref is the pointer to re-fetch by
alter table public.items
  add column if not exists content_state text not null default 'hydrated';

-- ---------------------------------------------------------------------------
-- Ref-counting must also react to UPDATEs now: dereferencing nulls an item's
-- body_hash / raw_hash in place, and that has to decrement the blob so it can be
-- garbage-collected. The original trigger only fired on INSERT/DELETE.
-- ---------------------------------------------------------------------------
create or replace function private.items_refcount()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.body_hash is not null then perform private.blob_ref(new.org_id, new.body_hash, 1); end if;
    if new.raw_hash  is not null then perform private.blob_ref(new.org_id, new.raw_hash,  1); end if;
  elsif tg_op = 'UPDATE' then
    if new.body_hash is distinct from old.body_hash then
      if old.body_hash is not null then perform private.blob_ref(old.org_id, old.body_hash, -1); end if;
      if new.body_hash is not null then perform private.blob_ref(new.org_id, new.body_hash,  1); end if;
    end if;
    if new.raw_hash is distinct from old.raw_hash then
      if old.raw_hash is not null then perform private.blob_ref(old.org_id, old.raw_hash, -1); end if;
      if new.raw_hash is not null then perform private.blob_ref(new.org_id, new.raw_hash,  1); end if;
    end if;
  elsif tg_op = 'DELETE' then
    if old.body_hash is not null then perform private.blob_ref(old.org_id, old.body_hash, -1); end if;
    if old.raw_hash  is not null then perform private.blob_ref(old.org_id, old.raw_hash,  -1); end if;
  end if;
  return null;
end
$$;

drop trigger if exists items_refcount_trg on public.items;
create trigger items_refcount_trg
  after insert or update or delete on public.items
  for each row execute function private.items_refcount();

-- Find dereferenced/dehydrated items quickly (retention sweeps, source lookups).
create index if not exists items_content_state_idx
  on public.items (content_state) where content_state <> 'hydrated';
