-- Performance indexes matching the dashboard's hot read paths. All are additive
-- and safe. Composite/partial indexes so the common list/order/filter queries
-- hit an index instead of scanning + sorting.

-- listDatasets / listAgents: per-org, ordered by created_at.
create index if not exists datasets_org_created_idx on public.datasets (org_id, created_at);
create index if not exists agents_org_created_idx on public.agents (org_id, created_at);

-- dataset_rows: the biggest table. Three access shapes:
--  1) load an org's rows ordered by created_at (listDatasets)
create index if not exists dataset_rows_org_created_idx on public.dataset_rows (org_id, created_at);
--  2) a table's accepted rows, oldest first (the live/exportable rows)
create index if not exists dataset_rows_dataset_status_created_idx on public.dataset_rows (dataset_id, status, created_at);
--  3) an org's pending proposals (the Versioning surface) — partial, tiny
create index if not exists dataset_rows_org_proposed_idx on public.dataset_rows (org_id, created_at desc) where status = 'proposed';

-- dataset_snapshots: agent activity reads per-org newest-first.
create index if not exists dataset_snapshots_org_created_idx on public.dataset_snapshots (org_id, created_at desc);

-- forwarding_addresses: inbox lookup by owner.
create index if not exists forwarding_addresses_owner_idx on public.forwarding_addresses (owner_user_id);
