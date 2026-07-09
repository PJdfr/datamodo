-- Link a projected table row back to the knowledge entity it was derived from,
-- so re-projecting a dataset from the facts updates the same rows instead of
-- duplicating them. Null for manually-added / imported rows.
alter table public.dataset_rows
  add column if not exists subject_entity_id uuid references public.entities (id) on delete set null;
create index if not exists dataset_rows_entity_idx on public.dataset_rows (dataset_id, subject_entity_id);
