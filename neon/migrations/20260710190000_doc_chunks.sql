-- Evidence layer: chunk-level passages from documents. After extraction pulls
-- FACTS out of an attachment, the document's actual text was discarded — so
-- its content was unsearchable. Chunks keep the passages (with page lineage
-- and optional embeddings), letting search + grounded answers cite from
-- INSIDE documents. Apply to BOTH Neon branches; idempotent.

create table if not exists public.doc_chunks (
    id uuid default gen_random_uuid() not null primary key,
    org_id uuid not null references public.organizations(id) on delete cascade,
    entity_id uuid not null references public.entities(id) on delete cascade,
    item_id uuid,
    seq integer not null,
    page integer,
    text text not null,
    embedding public.vector(1536),
    created_at timestamp with time zone default now() not null
);

create index if not exists doc_chunks_org_idx on public.doc_chunks (org_id);
create index if not exists doc_chunks_entity_idx on public.doc_chunks (entity_id, seq);
create index if not exists doc_chunks_embedding_idx on public.doc_chunks using hnsw (embedding public.vector_cosine_ops);
