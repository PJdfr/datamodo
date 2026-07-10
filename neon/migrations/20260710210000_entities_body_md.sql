-- Thick nodes: an entity can carry a generated markdown BODY, not just a label
-- and facts. First user: documents — extraction now writes a compact markdown
-- summary of each indexed attachment here, and the UI renders the node as a
-- readable page (its "natural shape") instead of a metadata card.
-- Idempotent; safe to re-run.

alter table public.entities add column if not exists body_md text;
