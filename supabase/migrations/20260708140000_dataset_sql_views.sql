-- Typed SQL projection of user datasets.
--
-- The system of record stays the shared, jsonb-backed dataset_rows (that's what
-- makes the agent propose→review→merge→version flow work). But technical users
-- want to hit their tables as a REAL database, not an Excel export. So we PROJECT
-- each dataset into a typed Postgres VIEW inside a per-org schema:
--
--     org_<orgid>.<dataset_slug>  →  select id, <typed columns>, updated_at
--                                     from dataset_rows
--                                     where dataset_id = … and status = 'accepted'
--
-- A connecting user runs `select * from org_x.trips` and sees real columns. The
-- view is `security_invoker`, so the existing RLS on dataset_rows still scopes
-- each caller — isolation holds through the projection. Only merged ('accepted')
-- rows appear; proposals stay invisible until the user accepts them, matching the
-- versioning model. These schemas are NOT the exposed `public` API schema, so they
-- don't clutter PostgREST — they're reached over a direct Postgres connection,
-- which is exactly the technical-user path. Non-technical users never see this;
-- they use the Excel/Sheets sync over the same rows.
--
-- Views are kept in lock-step with the dataset definition by a trigger, so no app
-- code has to remember to rebuild them. All dynamic SQL is built with format()
-- %I/%L, and identifiers pass through private.sql_slug(), so dataset names and
-- column keys can never inject.

-- A safe snake_case SQL identifier from an arbitrary label. Always starts with a
-- letter (prefixes 't_' otherwise) so it is a valid, unquoted-friendly ident.
create or replace function private.sql_slug(p text)
returns text language sql immutable as $$
  select case when s ~ '^[a-z]' then s else 't_' || s end
  from (select trim(both '_' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '_', 'g')) as s) x;
$$;

-- Per-org schema name: 'org_' + the uuid with hyphens stripped (<= 36 chars).
create or replace function private.org_schema(p_org uuid)
returns text language sql immutable as $$
  select 'org_' || replace(p_org::text, '-', '');
$$;

-- (Re)build the typed view for one dataset from its column definitions.
create or replace function private.sync_dataset_view(p_dataset uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org    uuid;
  v_name   text;
  v_cols   jsonb;
  v_schema text;
  v_view   text;
  v_select text;
  c        jsonb;
  v_key    text;
  v_type   text;
  v_seen   text[] := array[]::text[];
begin
  select org_id, name, columns into v_org, v_name, v_cols
    from public.datasets where id = p_dataset;
  if v_org is null then return; end if;

  v_schema := private.org_schema(v_org);
  v_view   := private.sql_slug(v_name);
  execute format('create schema if not exists %I', v_schema);

  -- Row identity + every user column, then the housekeeping timestamp.
  v_select := 'id';
  for c in select value from jsonb_array_elements(coalesce(v_cols, '[]'::jsonb)) as t(value) loop
    v_key  := c->>'key';
    v_type := c->>'type';
    if v_key is null or v_key = '' then continue; end if;
    if v_key = any(v_seen) then continue; end if;         -- dup key → skip (would break the view)
    v_seen := array_append(v_seen, v_key);

    if v_type = 'number' then
      -- Number columns can still hold dirty text (client-side coercion is lenient),
      -- so guard the cast: non-numeric values project as NULL instead of erroring.
      v_select := v_select || format(
        ', case when (data->>%L) ~ %L then (data->>%L)::numeric end as %I',
        v_key, '^-?[0-9]+(\.[0-9]+)?$', v_key, private.sql_slug(v_key));
    else
      v_select := v_select || format(', (data->>%L) as %I', v_key, private.sql_slug(v_key));
    end if;
  end loop;
  v_select := v_select || ', updated_at';

  execute format(
    'create or replace view %I.%I with (security_invoker = true) as '
    || 'select %s from public.dataset_rows where dataset_id = %L and status = ''accepted''',
    v_schema, v_view, v_select, p_dataset);
end
$$;

create or replace function private.drop_dataset_view(p_org uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  execute format('drop view if exists %I.%I', private.org_schema(p_org), private.sql_slug(p_name));
end
$$;

-- Keep the projection in lock-step with the dataset definition.
create or replace function private.datasets_sync_view()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.drop_dataset_view(old.org_id, old.name);
    return old;
  end if;
  -- A rename (or an org move) orphans the old view name — drop it first.
  if tg_op = 'UPDATE' and (old.name is distinct from new.name or old.org_id is distinct from new.org_id) then
    perform private.drop_dataset_view(old.org_id, old.name);
  end if;
  perform private.sync_dataset_view(new.id);
  return new;
end
$$;

drop trigger if exists datasets_sync_view_trg on public.datasets;
create trigger datasets_sync_view_trg
  after insert or update or delete on public.datasets
  for each row execute function private.datasets_sync_view();

-- Backfill views for datasets that already exist (demo seed + any live data).
do $$
declare r record;
begin
  for r in select id from public.datasets loop
    perform private.sync_dataset_view(r.id);
  end loop;
end
$$;
