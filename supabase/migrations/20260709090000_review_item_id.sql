-- Extraction reviews ("did we understand this message?") reference the source
-- item. Add an item_id link so listPendingReviews can rebuild the message +
-- its extracted facts. (entity_merge / fact_conflict reviews leave it null.)
alter table public.knowledge_reviews
  add column if not exists item_id uuid references public.items (id) on delete cascade;
create index if not exists knowledge_reviews_item_idx on public.knowledge_reviews (item_id);
