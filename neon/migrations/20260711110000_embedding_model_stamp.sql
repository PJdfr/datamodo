-- ONE EMBEDDING SPACE PER DEPLOYMENT (MEMORY decision, 2026-07-11): vectors
-- from different models are not comparable even at the same dimension, and we
-- STORE them — so every stored vector is stamped with the model that produced
-- it. ANN recall filters to the current space; rows from another space fall
-- out of semantic matching (degrading to the trigram path) instead of
-- poisoning it. POST /api/jobs/embed-requeue re-embeds stale/missing rows.
-- Idempotent (safe to re-run).

alter table public.entities   add column if not exists embedding_model text;
alter table public.doc_chunks add column if not exists embedding_model text;

-- Backfill: every vector written before the stamp existed came from the
-- deployment's only-ever space (the client's default, text-embedding-3-small).
update public.entities   set embedding_model = 'text-embedding-3-small'
 where embedding is not null and embedding_model is null;
update public.doc_chunks set embedding_model = 'text-embedding-3-small'
 where embedding is not null and embedding_model is null;
