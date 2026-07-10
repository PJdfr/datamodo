-- Ontology layer: user-editable kind registry ("Categories"). One row per
-- entity kind the user cares about — its display identity, a plain-language
-- description that steers the extraction classifier, a field template
-- (expected attribute predicates + types) and a relation vocabulary (verbs).
-- Builtins are seeded per org on first use and stay editable.
-- Apply to BOTH Neon branches (dev now, prod at promote); idempotent.

create table if not exists public.kinds (
    id uuid default gen_random_uuid() not null primary key,
    org_id uuid not null references public.organizations(id) on delete cascade,
    owner_user_id uuid,
    kind text not null,
    label text not null,
    plural text,
    icon text,
    color text,
    description text,
    aliases text[] default '{}' not null,
    fields jsonb default '[]'::jsonb not null,
    relations jsonb default '[]'::jsonb not null,
    builtin boolean default false not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

create unique index if not exists kinds_org_kind_uq on public.kinds (org_id, kind);
create index if not exists kinds_org_idx on public.kinds (org_id);
