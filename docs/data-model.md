# Data model, tenancy & versioning

How user data is stored, isolated, exposed, and versioned — and why.

## One database, isolated by `org_id` + RLS

There is **one** Supabase/Postgres database for everyone — not an instance or
database per user. A user's "table" is **not** a Postgres table: it's a row in
`datasets` (its columns live in a `columns` jsonb) plus its data as rows in the
shared `dataset_rows` table (`data` jsonb). Creating a table / adding a column /
adding a row are ordinary `INSERT`/`UPDATE`s — **no runtime DDL, no table
explosion.** jsonb is required because the columns are user-defined and dynamic.

Isolation is two Postgres features, both already in place:

- **`org_id`** on every table. Each user gets one auto-created personal org at
  signup (the invisible per-user boundary), so `org_id` is the tenant key.
- **Row-Level Security** (`private.is_org_member(org_id)`) on every table —
  enforced by the database, not app code. Users can't read across orgs even
  though rows share a table. Cascade delete is already there too, via
  `dataset_rows.dataset_id → datasets` and `… → organizations ON DELETE CASCADE`.

This model is forward-compatible with the planned tenant shapes without
re-architecture: a **business org sharing tables** = one org with N
`organization_members`; an **individual user** = their personal org;
**per-user tables within an org** = add `owner_user_id` + tighten RLS later.
Physical isolation (schema/DB/instance per tenant) is deliberately avoided —
it doesn't scale to many individual users (NxN migrations, catalog bloat) and
would break the agent review model below.

## Two audiences, one system of record

The shared jsonb store is the system of record. Each audience gets a projection:

- **Non-technical → Excel / Google Sheets.** A sync/export layer over the same
  rows. Storage-agnostic (`sheet_links` + the import/export routes).
- **Technical → real SQL.** Each dataset is projected into a typed Postgres
  **view** at `org_<orgid>.<dataset_slug>` (see
  `supabase/migrations/20260708140000_dataset_sql_views.sql` and
  `lib/datamodo/projection.ts`). A connecting user runs `select * from
  org_x.trips` and sees real columns. The view is `security_invoker`, so RLS on
  `dataset_rows` still scopes each caller. Only `accepted` rows appear —
  proposals stay invisible until merged. These `org_*` schemas are not the
  exposed `public` API schema, so they don't clutter PostgREST; they're for
  direct Postgres connections.

  A trigger on `datasets` keeps every view in lock-step with its definition, so
  no app code maintains them. All generated SQL uses `format()` `%I/%L` and
  `private.sql_slug()`, so names/keys can't inject. Number columns project as
  guarded `numeric` (dirty values → NULL, never an error); other types project
  as `text` for now — tighten once writes are validated.

  **Not yet wired:** granting an external, per-user Postgres role access to its
  `org_*` schema, and writable views (`INSTEAD OF` triggers mapping columns back
  to jsonb). Those are the next steps for full "connect your own DB client".

## Versioning: the git *model*, not the git *tool*

The versioning engine is intentionally **not** git-on-disk. Git's data is files;
ours is queryable Postgres rows under RLS with semantic, row-level, agent-attributed
diffs and concurrent web writes — none of which git-the-tool serves (no SQL, no
transactional consistency with the DB, no RLS, textual diffs, single-writer,
millions-of-repos ops). The git *ideas* are already adopted natively: content-
addressed blobs (sha256 dedup), `dataset_snapshots` as commits, proposed rows as
a branch/PR awaiting merge, restore as checkout. If stronger git-like semantics
are wanted, formalize an append-only change log in Postgres (each row change an
event with a parent) — or evaluate a git-for-data engine like Dolt — rather than
shelling out to `git`.
