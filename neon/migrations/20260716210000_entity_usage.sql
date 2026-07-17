-- USAGE-WEIGHTED RETENTION (2026-07-16, GRAPH_PIPELINE.md §10b adoption):
-- retrieval stamps the entities it actually surfaces (grounded-answer
-- citations + graph seeds, entity page opens), so the consolidation worker's
-- orphan pass never flags — and orphan-accept never deletes — something the
-- user still reads. `support` counts writes; this is the read-side signal
-- the agent-memory literature calls usage-frequency reweighting.
-- NULL = never touched by retrieval (or the stamp predates this column).
-- All readers access the column via to_jsonb(...) so they fail soft until
-- this migration is applied. Idempotent DDL.

alter table public.entities
  add column if not exists last_used_at timestamp with time zone;
