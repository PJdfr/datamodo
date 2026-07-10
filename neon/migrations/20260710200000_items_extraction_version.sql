-- Delta reprocessing (the CocoIndex lesson): stamp which pipeline version
-- analyzed each item, so a prompt/model/ontology upgrade can requeue ONLY
-- stale items (extraction_version < current) instead of everything or
-- nothing. Apply to BOTH Neon branches; idempotent.

alter table public.items add column if not exists extraction_version integer;
