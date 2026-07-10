-- Extraction-loop hardening: track when an item was claimed by a tick and how
-- many extraction attempts it has had, so crashed ticks can be recovered
-- (analyzing → stored requeue) and transient failures retried with a cap.
-- Apply to BOTH Neon branches (dev now, prod at promote); idempotent.

alter table public.items add column if not exists claimed_at timestamp with time zone;
alter table public.items add column if not exists attempts integer default 0 not null;
