-- Review changes in meaningful chunks, not cell-by-cell.
--
-- Every proposal produced in one operation — one email/message parsed by an
-- agent, one sheet sync, one simulated run — shares a `batch_id`. That batch is
-- the unit a user accepts or rejects: "Ledger parsed this email → 3 changes:
-- Accept all / Reject all". The other ways to slice review (by agent, by table,
-- by time, by source message) are just groupings over batches — agent =
-- proposed_by, table = dataset_id, time = created_at, message = source_item_id,
-- all of which already live on dataset_rows.

alter table public.dataset_rows
  add column if not exists batch_id uuid;

-- Fast lookup of a batch's proposals when accepting/rejecting the whole chunk.
create index if not exists dataset_rows_batch_idx
  on public.dataset_rows (batch_id) where status = 'proposed';
