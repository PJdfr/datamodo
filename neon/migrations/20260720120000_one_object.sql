-- ONE OBJECT (model unification phase 3, user decision 2026-07-20): a category
-- IS a table IS its template. `datasets` folds INTO `kinds` and is dropped.
--
--   · kinds gains the table facet: agent_id + columns (presentation cache of
--     fields+relations; kept in sync by app code from here on).
--   · table-only datasets (kind_id null — imports, derived tables) AUTO-PROMOTE
--     to real kinds (builtin=false, fields derived from their columns) — every
--     table IS a category.
--   · dataset_rows / dataset_snapshots / dataset_relations / sheet_links
--     re-point their dataset_id at the kind's id (column names unchanged; the
--     FK target becomes kinds). Several datasets bound to one kind merge their
--     rows into that kind — one table per category, by definition.
--   · every kind materializes columns (name + template fields + relation verbs)
--     so every category IS a table.
--
-- Idempotent: the whole body no-ops once `datasets` is gone. Fresh databases
-- never run this — neon/schema.sql ships the merged shape.

do $$
declare
  d record;
  v_kind uuid;
  v_slug text;
  v_base text;
  n int;
begin
  if to_regclass('public.datasets') is null then return; end if;

  -- 1. The table facet lands on kinds.
  alter table public.kinds add column if not exists agent_id uuid;
  alter table public.kinds add column if not exists columns jsonb not null default '[]'::jsonb;

  -- 2. AUTO-PROMOTE unbound datasets to kinds (fields derived from columns;
  --    'name' column stays a column but not a template field; unknown column
  --    types collapse to text). Loop for slug-collision handling.
  for d in select * from public.datasets where kind_id is null order by created_at loop
    v_base := coalesce(nullif(regexp_replace(regexp_replace(lower(d.name), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), ''), 'table');
    v_slug := v_base; n := 2;
    while exists (select 1 from public.kinds k where k.org_id = d.org_id and k.kind = v_slug) loop
      v_slug := v_base || '_' || n; n := n + 1;
    end loop;
    insert into public.kinds (org_id, owner_user_id, kind, label, plural, description, builtin,
                              fields, columns, agent_id, created_at, updated_at)
    values (
      d.org_id, d.created_by, v_slug, d.name, d.name, d.description, false,
      coalesce((select jsonb_agg(jsonb_build_object(
                  'key', c->>'key', 'label', c->>'label',
                  'type', case when c->>'type' in ('number','date') then c->>'type' else 'text' end))
                from jsonb_array_elements(d.columns) c
                where c->>'key' is not null and c->>'key' <> 'name'), '[]'::jsonb),
      coalesce(d.columns, '[]'::jsonb),
      d.agent_id, d.created_at, now())
    returning id into v_kind;
    update public.datasets set kind_id = v_kind where id = d.id;
  end loop;

  -- 3. Copy the table facet onto bound kinds. Where several datasets bound the
  --    same kind, the OLDEST wins for columns/agent/description.
  -- (alias must not shadow the plpgsql loop variable `d`)
  update public.kinds k
     set columns     = src.columns,
         agent_id    = coalesce(src.agent_id, k.agent_id),
         description = coalesce(k.description, src.description),
         updated_at  = now()
    from (select distinct on (kind_id) kind_id, columns, agent_id, description
            from public.datasets order by kind_id, created_at) src
   where src.kind_id = k.id;

  -- 4. Re-point the children at the kind. The old FKs (→ datasets.id) must
  --    drop FIRST — a kind id is not a dataset id while both exist. The block
  --    is one transaction, so a failure rolls everything back. sheet_links is
  --    UNIQUE(dataset_id): if a many→one merge would collide, keep the newest.
  alter table public.dataset_rows      drop constraint if exists dataset_rows_dataset_id_fkey;
  alter table public.dataset_snapshots drop constraint if exists dataset_snapshots_dataset_id_fkey;
  alter table public.dataset_relations drop constraint if exists dataset_relations_from_dataset_id_fkey;
  alter table public.dataset_relations drop constraint if exists dataset_relations_to_dataset_id_fkey;
  alter table public.sheet_links       drop constraint if exists sheet_links_dataset_id_fkey;
  update public.dataset_rows r set dataset_id = ds.kind_id
    from public.datasets ds where r.dataset_id = ds.id;
  update public.dataset_snapshots s set dataset_id = ds.kind_id
    from public.datasets ds where s.dataset_id = ds.id;
  update public.dataset_relations rel set from_dataset_id = ds.kind_id
    from public.datasets ds where rel.from_dataset_id = ds.id;
  update public.dataset_relations rel set to_dataset_id = ds.kind_id
    from public.datasets ds where rel.to_dataset_id = ds.id;
  delete from public.sheet_links sl
   using public.datasets ds
   where sl.dataset_id = ds.id
     and exists (select 1 from public.sheet_links sl2 join public.datasets ds2 on ds2.id = sl2.dataset_id
                  where ds2.kind_id = ds.kind_id and sl2.created_at > sl.created_at);
  update public.sheet_links sl set dataset_id = ds.kind_id
    from public.datasets ds where sl.dataset_id = ds.id;

  -- 5. Drop datasets and add the new FKs (same constraint names, new target).
  drop table public.datasets;
  alter table public.dataset_rows
    add constraint dataset_rows_dataset_id_fkey foreign key (dataset_id) references public.kinds(id) on delete cascade;
  alter table public.dataset_snapshots
    add constraint dataset_snapshots_dataset_id_fkey foreign key (dataset_id) references public.kinds(id) on delete cascade;
  alter table public.dataset_relations
    add constraint dataset_relations_from_dataset_id_fkey foreign key (from_dataset_id) references public.kinds(id) on delete cascade;
  alter table public.dataset_relations
    add constraint dataset_relations_to_dataset_id_fkey foreign key (to_dataset_id) references public.kinds(id) on delete cascade;
  alter table public.sheet_links
    add constraint sheet_links_dataset_id_fkey foreign key (dataset_id) references public.kinds(id) on delete cascade;
  alter table public.kinds
    add constraint kinds_agent_id_fkey foreign key (agent_id) references public.agents(id) on delete set null;
  create index if not exists kinds_agent_idx on public.kinds using btree (agent_id);
  -- datasets had a touch trigger; the unified row keeps the behavior.
  drop trigger if exists kinds_touch_updated_at on public.kinds;
  create trigger kinds_touch_updated_at before update on public.kinds
    for each row execute function private.touch_updated_at();

  -- 6. Every category IS a table: materialize columns for kinds that have none
  --    (name column + template fields, bookkeeping keys skipped + relation verbs).
  update public.kinds k
     set columns =
       jsonb_build_array(jsonb_build_object('key', 'name', 'label', k.label, 'type', 'text'))
       || coalesce((select jsonb_agg(jsonb_build_object(
                      'key', f->>'key', 'label', f->>'label',
                      'type', case when f->>'type' = 'entity' then 'text' else coalesce(f->>'type', 'text') end))
                    from jsonb_array_elements(k.fields) f
                    where f->>'key' not in ('file_type', 'file_size', 'indexed')), '[]'::jsonb)
       || coalesce((select jsonb_agg(jsonb_build_object(
                      'key', r2->>'predicate', 'label', r2->>'label', 'type', 'text'))
                    from jsonb_array_elements(k.relations) r2), '[]'::jsonb),
         updated_at = now()
   where k.columns = '[]'::jsonb;
end
$$;
