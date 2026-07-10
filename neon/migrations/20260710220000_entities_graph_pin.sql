-- Graph curation: the user can PIN an entity's node on the knowledge-graph
-- canvas. graph_pin = {"x": 0..1, "y": 0..1} (normalized to the canvas), null =
-- auto layout. Persisting the pins makes the canvas a lived-in space instead of
-- a fresh force layout on every visit.
-- Idempotent; safe to re-run.

alter table public.entities add column if not exists graph_pin jsonb;
