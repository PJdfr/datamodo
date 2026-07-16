-- EFFICIENCY TRACK (2026-07-16): partial indexes for the two hottest fact
-- access paths. Every knowledge read filters `valid_to IS NULL` (current
-- claims); as history accumulates through supersession, the full-table
-- indexes drag superseded rows along. Partial indexes keep the hot set
-- tight: listKnowledge/search scan by org, upsert/template-slots/GraphRAG
-- probe by subject. Idempotent DDL.

create index if not exists facts_org_current_idx
  on public.facts (org_id) where valid_to is null;

create index if not exists facts_subject_current_idx
  on public.facts (subject_entity_id) where valid_to is null;
