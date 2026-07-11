-- Model unification, phase 2: bind a dataset to the kind it materializes
-- ("category = table" becomes STRUCTURAL, not a plural-name convention).
-- The category→table endpoint sets kind_id on creation/adoption; the UI's
-- datasetForKind matches on it first and only falls back to the name rule
-- for datasets that predate the column. Idempotent (safe to re-run).

alter table public.datasets
  add column if not exists kind_id uuid references public.kinds(id) on delete set null;

create index if not exists datasets_kind_idx on public.datasets (kind_id);

-- Backfill by the historical convention (plural, else label+"s";
-- case-insensitive) so existing category-built tables become structural too.
update public.datasets d
   set kind_id = k.id
  from public.kinds k
 where d.kind_id is null
   and k.org_id = d.org_id
   and lower(d.name) = lower(coalesce(nullif(trim(k.plural), ''), k.label || 's'));
