# Tables redesign brief — Notion's grammar on datamodo's fact spine

> Written 2026-07-20 (discussion with the user, same session as the Explorer
> continuous-view merge). This is the pickup document for the ROADMAP item
> "Tables tab UI — a real spreadsheet, not a card wall". A fresh session should
> be able to execute Phase 1 from this brief without re-deriving decisions.
> Load the `datamodo-design` skill before building any of these surfaces.

## The decision (user-aligned)

Adopt **Notion's presentation grammar** for tables — *row = page*, *one
database many views*, *typed grid*, *side peek* — **without** adopting its
storage model. Our spine is already stronger: a kind IS a table IS a template
(one object since 2026-07-20), an entity IS a page (facts + `body_md`), and a
cell is not a value in a box but a **fact with provenance, confidence and
bitemporality**. The redesign is presentation-only: no changes to the ingest
pipeline, reconciliation, or the review model.

Notion recap (what we're borrowing the grammar from): a database is a set of
pages sharing a schema; rows open as full pages (typed properties on top, free
content below); the same database renders through saved, named views (Table /
Board / Gallery / List / Calendar / Timeline), each with its own filters,
sorts, group-by and visible columns; relations link databases and rollups
aggregate through them.

## Current state (code map — verified 2026-07-20)

Two disconnected renderings exist today; the redesign unifies them:

1. **Schema canvas drill-down** (the "card wall" the user dislikes):
   `app/dashboard/schema-view.tsx` (canvas; click a kind card header →
   `onSelectKind`) → `app/dashboard/knowledge-view.tsx` renders the kind's
   rows as `EntityCard`s below the diagram (`view: "schema"`, line ~287).
2. **`TableDetailModal`** (`app/dashboard/control-center.tsx` ~line 1741):
   already a headless **TanStack grid** (`@tanstack/react-table` is a dep) with
   sorting, editable cells, `humanEdited` flags, add/remove column, version
   snapshots (read-only past), `ProposalCard` review flow, "↑ Sync out" panel.
   But: it's a modal, loads ALL rows in one `getDatasetRowsAction` call
   (default `limit: 500` — `lib/datamodo/datasets.ts` ~line 187 already
   supports `{limit, offset}`), no keyboard nav, no virtualization, no link to
   the entity/page world.

Adjacent machinery to reuse, not rebuild:
- `EntityPageBody` (`app/dashboard/entity-page.tsx`) — the natural-shape page
  renderer the Explorer side panel uses; the side peek is THIS component.
- `dataset_rows.subject_entity_id` — links a materialized row to its entity
  (citations already use it). Manual rows may have none.
- Human-edit protection (`lib/datamodo/project.ts`) — human cells are never
  clobbered by extraction; edits at fact level flow through supersession.
- localStorage persistence pattern: schema canvas arrangement uses
  `dm-schema-positions-v1` (`schema-view.tsx`).
- `kinds.columns` — the presentation cache (kept in lockstep by `kinds.ts` /
  `columnsFromTemplate`/`syncFieldsToColumns` in `ontology.ts`).

## Target design

### Surface: a table opens into a PAGE, not a modal

Clicking a table (from the schema canvas header, the dataset list, or
"▦ open table") opens **one full-width table surface** replacing the card wall
AND absorbing `TableDetailModal`'s features. The Data tab rail stays ONE flat
toggle ("Tables" chrome unchanged — MEMORY's simplicity rule); the **view
switcher lives inside the opened table surface**, like Notion's view tabs:

```
◂ Tables   Invoices                    ▦ Grid · ▤ Cards        ⌕ filter…
┌─────────────────────────────────────────────────┬──────────────────────┐
│  grid (virtualized, keyboard-navigable)         │  side peek           │
│  ● number · client · total · due date · status  │  (EntityPageBody of  │
│  ○ INV-901   Acme    1 200 €   Jul 30   unpaid  │   the selected row's │
│  ● INV-902   Bright    640 €   Aug 02   paid    │   entity — facts,    │
│  …                                              │   provenance, body)  │
└─────────────────────────────────────────────────┴──────────────────────┘
   + new row      snapshots ▾ · history · ↑ sync out       N rows
```

### Phase 1 — Grid + side peek + saved config (the core ask)

- **Grid view (default)**: keep TanStack headless; add
  - **virtualized rows** + paged fetch (`getDatasetRows` already takes
    `{limit, offset}` — fetch windows of ~200, keep total count honest). This
    is the "fix open/load speed" ask: never ship all rows at once, first paint
    from the first page.
  - **keyboard nav**: ↑↓←→ move cell focus, `Enter` edits, `Esc` cancels,
    `Tab`/`Shift-Tab` next/prev cell, typing over a focused cell starts an
    edit, `Space`/`Enter` on the row-title cell opens the side peek.
  - **typed cells**: render by column type (text/number/date; `≡ list` fields
    join with ", " as today). NOT Excel: no free cell ranges, no A1 formulas —
    strictly row-entity × typed-column (deliberate; matches the fact spine).
  - **provenance dot per row** (phase 1 honest scope: row-level, using the
    existing `humanEdited` flag + `created_by`): ink dot = human-edited, coral
    dot = extracted/derived; the cell-level fact-source drill-down happens in
    the side peek, where facts already carry their sources.
- **Side peek**: selecting a row slides in `EntityPageBody` for its
  `subject_entity_id` (record table + relationships + markdown body +
  "◍ Walk" hand-off to the Explorer + "Full page ›"). Rows with no entity
  (hand-added) fall back to a plain field editor of the row. This is the
  row-IS-a-node moment — reuse the Explorer side panel's structure verbatim.
- **Cards view**: today's `EntityCard` grid, demoted to a switcher option
  (some kinds — photos, bookmarks — genuinely read better as cards).
- **Saved per-table view config** (view type, sort, visible/ordered columns,
  filter): **localStorage first** (`dm-table-view-v1:<kindId>`), matching the
  schema-canvas precedent. NO schema change in phase 1. Promote to a server
  `kinds` jsonb later only if cross-device demand shows up — and if so,
  remember MEMORY's hard lesson: a new Prisma-model column makes every
  full-row read depend on the migration → apply DDL on dev+prod in the same
  session, or keep it out of the model (raw/`to_jsonb` reads), and bump the
  package version for the local edition's schema-sync.
- **Editing semantics (unchanged, now visible)**: editing a cell writes
  through the existing server actions; human edits keep their protection;
  extraction updates to human-touched rows keep arriving as `ProposalCard`s.
  Absorb the modal's remaining features into the page surface: add row/column,
  remove column, rename/delete table, snapshots (read-only past versions),
  proposals, "↑ Sync out", history.

**Phase 1 acceptance**: card wall gone as the default (cards = a view);
1 000-row table first-paints < 1 s with windowed fetch; full keyboard pass
(navigate → edit → escape → peek) without touching the mouse; `TableDetailModal`
deleted (its features live in the page); shoot harness screenshots the grid +
side peek; pure cores (view-config shape, cell coercion, window math) unit
tested; docs updated per the every-commit rule.

### Phase 2 — Board + rollups (after phase 1 ships and is felt)

- **Board view**: group by any single-valued (`"one"`) field or relation —
  "invoices by status", "contacts by company". Columns = distinct current
  values (+ "empty"). Dragging a card between columns writes that fact through
  the normal path — supersession + review semantics apply (a drag is just an
  edit; if the row is extraction-owned it may raise a proposal, which is
  correct and should be surfaced gently, not fought).
- **Rollup columns**: a derived, read-only column aggregating through a
  relation ("Σ total of linked invoices", "count of documents"). Deterministic
  over facts — zero LLM (MEMORY's per-message-cost rule), computed at read
  time next to `buildDerivedTable`'s machinery (`derive-table.ts` is the
  one-shot precedent; a rollup is the live version). Config lives in the kind
  template (a `rollup` field kind) — that IS a template change, so it rides
  the existing template editor + `columnsFromTemplate` lockstep.

### Non-goals (decided in discussion — don't drift into these)

- **No Calendar/Timeline per-table views** — Timeline is a global surface
  under Review; per-table duplicates violate the simplicity rule.
- **No formula language** — aggregation questions belong to Insights.
- **No linked/embedded views** across surfaces.
- **No storage changes** — relations stay graph facts; the grid is a
  projection. Never introduce a parallel "table store".
- **No true spreadsheet semantics** (cell ranges, drag-fill formulas).

## Verification plan (repo bar)

Unit tests on new pure cores + tsc + lint == baseline + `next build`; a new
shoot harness `scripts/shoot/harnesses/table-grid.tsx` (grid + side peek with
fixture rows, keyboard-focus visible); a Playwright interaction drive like the
Explorer merge used (navigate cells, edit, open peek — zero page errors).
Flag honestly what needs live data.

## Open questions for the user (ask before/while building)

1. Side peek vs. immediate full-page: peek on single click + full page only on
   "Full page ›" (recommended, Notion-like), or click = full page?
2. Filters in phase 1: just a text quick-filter (recommended), or typed
   per-column filters from day one?
3. Board in phase 2: which grouping matters first — status-like FIELDS or
   RELATIONS (by company/client)?
4. Should "＋ new table" land you in the empty grid immediately (Notion does;
   probably yes)?
