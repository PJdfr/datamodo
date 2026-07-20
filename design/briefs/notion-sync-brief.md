# Notion link/sync brief — import + push, riding the outbound-writer seam

> Written 2026-07-20 (user ask in the tables-redesign session: "maybe we
> should think about a link / sync with Notion — two ways? importing data,
> and pushing datamodo data into Notion — like we should have with Google
> Sheets and all"). DESIGNED, not built — this is the pickup document. A
> fresh session should be able to execute Phase 1 without re-deriving
> decisions. No storage changes anywhere in this brief: external systems are
> projection targets and capture sources, never a second store.

## Why Notion fits the existing philosophy

- **Outbound**: "the vault is the product; views are projections" — a Notion
  database is just another projection target, exactly like the shipped
  Postgres writer (`OutboundWriter` in `lib/datamodo/sync-outbound.ts`,
  designed 2026-07-14 as the one seam every connector implements; the roadmap
  already lists "Sheets writer" as its next implementation).
- **Inbound**: rows arriving from outside land as **reviewable proposals**,
  exactly like the shipped spreadsheet "⇅ Sync a sheet" path
  (`/api/datasets/import` → `proposeAgentRows` → the proposal/review flow).
  Nothing writes to the vault unreviewed; agents suggest, humans decide.
- The new table page (Notion-grammar redesign, same day) makes this natural
  UI-wise: the "↑ Sync out" panel is already a per-table surface.

## Notion API facts that shape the design (as of 2026)

- Auth: an **internal integration token** (`ntn_`/`secret_…`) is the no-OAuth
  path — the user creates an integration, shares a page/database with it,
  pastes the token. Public OAuth exists but needs an approved app (ops, like
  the Sheets OAuth app — NOT phase 1).
- A **database** has typed properties (title, rich_text, number, date,
  select, relation…); every row IS a page. One property must be `title`.
- Upserts don't exist: you `query` a database with a filter, then `update` or
  `create` the page. Rate limit ~3 req/s — sync must be batched + patient.
- API version header pinned (e.g. `Notion-Version: 2022-06-28`).

## Phase 1 — outbound push: table → Notion database (one-way, idempotent)

Mirror of the Postgres writer, same guarantees:

- Pure core `lib/datamodo/sync-notion.ts` (import-free, unit-tested):
  - `notionPropertySchema(columns)` — DatasetColumn[] → Notion property
    definitions (first column → `title`, text → `rich_text`,
    number → `number`, date → `date`, status → `select`; every row also
    carries a `dm_id` rich_text property — the idempotency key).
  - `rowToProperties(columns, row)` — one row → a properties payload
    (typed coercion, nulls cleared, 2000-char rich_text cap respected).
  - `planNotionSync(columns, rows)` — the full request plan (create-database
    vs use-existing, per-row query-filter + create/update bodies) so the
    shell is a dumb executor and everything interesting is testable.
- Shell `notionWriter` implementing `OutboundWriter`: given `{token,
  parentPageId | databaseId}` — ensure the database exists (create under the
  parent page with the generated schema on first sync), then for each row
  query by `dm_id` → update the hit or create the page. Re-sync converges,
  never duplicates (the Postgres invariant). Throttle to ≤3 req/s; report
  honest counts `{created, updated}`.
- Route `POST /api/sync/notion` (session-authed, org-scoped) + the table
  page's "↑ Sync out" panel grows a **target picker: Postgres · Notion**
  (token + page URL fields; token used per-request, never stored — the
  Postgres precedent. A saved per-org connector table is the follow-up, and
  it must be a deliberate decision because it means storing a credential).
- Fail-soft: no token/unreachable → a readable error in the panel, nothing
  half-written (create the database only after the token check passes).

**Acceptance**: two pushes of the same table → row count in Notion equals the
table's, second push reports updates not creates; typed columns land typed
(number/date/select visible in Notion UI); unit tests on the pure core; the
panel drives it end-to-end. Live-fire needs a real workspace token — flag
honestly if the sandbox has none.

## Phase 2 — inbound import: Notion database → table (review-gated)

- "⇅ Sync a sheet" gets a sibling: **"⇅ Sync a Notion database"** — fetch the
  database schema + rows (paginated), map properties back to columns
  (inverse of `notionPropertySchema`; unknown property types degrade to
  text), and land rows through the SAME `proposeAgentRows` path the sheet
  import uses: adds/updates arrive as one reviewable batch, conflicts with
  human-edited rows surface as conflicts. Zero LLM (deterministic mapping —
  the per-message-cost rule).
- Re-import converges by `dm_id` when present (round-trip of our own push);
  otherwise by the table's first-column identity (the snapshot-diff rule).
- Later, separately: Notion **pages → knowledge** (content import à la the
  Obsidian vault importer — blocks → `body_md`, mentions → edges). That is a
  capture feature, not table sync; it gets its own brief if asked for.

## Google Sheets (the user's "like we should have with Sheets") — same seam

Sheets outbound = a third `OutboundWriter` (values.batchUpdate by `dm_id`
column); Sheets inbound already half-exists (the xlsx import IS the stand-in,
per its own comment). The blocker is ops, not code: a Google OAuth app +
verification. Decision standing: build Notion first (token = zero ops),
reuse the exact same panel/seam shape for Sheets when the OAuth app exists.

## Non-goals (until explicitly decided)

- **No live two-way sync** — push and import stay separate, user-triggered
  actions; a background bidirectional sync needs conflict policy + stored
  credentials + webhooks (Notion has none for integrations at usable scale)
  and is exactly the kind of magic that erodes the trust story.
- **No stored tokens in phase 1** (per-request only, Postgres precedent).
- **No knowledge-graph writes from Notion rows** without the review gate.

## Verification plan (repo bar)

Unit tests on `sync-notion.ts` (schema mapping both directions, plan shapes,
title/dm_id invariants, 2000-char caps); tsc + lint == baseline + build;
mock-fetch integration test of the writer loop (create-then-update
convergence, throttle); live-fire against a real Notion workspace flagged
honestly if no token is available in-session.
