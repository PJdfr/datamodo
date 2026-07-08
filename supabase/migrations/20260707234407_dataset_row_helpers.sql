-- Set-based helpers so the app stops doing per-row loops and full-table loads.
-- All are SECURITY INVOKER (default) so the caller's RLS still applies — a user
-- can only touch rows in datasets their org owns.

-- Add a column to every row in one statement (backfill with a default).
create or replace function public.add_dataset_column(p_dataset_id uuid, p_key text, p_default jsonb)
returns void language sql as $$
  update public.dataset_rows
     set data = jsonb_set(coalesce(data, '{}'::jsonb), array[p_key], coalesce(p_default, 'null'::jsonb), true)
   where dataset_id = p_dataset_id
     and not (coalesce(data, '{}'::jsonb) ? p_key);
$$;

-- Strip a column from every row in one statement.
create or replace function public.remove_dataset_column(p_dataset_id uuid, p_key text)
returns void language sql as $$
  update public.dataset_rows
     set data = data - p_key
   where dataset_id = p_dataset_id
     and data ? p_key;
$$;

-- Accepted-row counts per dataset for an org, so the dashboard cards can show
-- counts without loading every row.
create or replace function public.dataset_accepted_counts(p_org_id uuid)
returns table(dataset_id uuid, n bigint)
language sql stable as $$
  select dataset_id, count(*)::bigint
    from public.dataset_rows
   where org_id = p_org_id and status = 'accepted'
   group by dataset_id;
$$;

grant execute on function public.add_dataset_column(uuid, text, jsonb) to authenticated;
grant execute on function public.remove_dataset_column(uuid, text) to authenticated;
grant execute on function public.dataset_accepted_counts(uuid) to authenticated;
