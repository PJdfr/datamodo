# datamodo — memory (durable truths)

> **Maintained doc — update when a durable decision is made or reversed.**
> This is the stuff that must survive any context loss: what the product is,
> how we work, what we decided and why. Siblings: [STATE.md](STATE.md) ·
> [FLOW.md](FLOW.md) · [ROADMAP.md](ROADMAP.md).
>
> Last updated: 2026-07-11

## What datamodo is (the aim)
Turn unstructured personal communications into **structured, reviewable,
queryable data**. The user forwards messages/files from any channel; we keep
the original, extract meaning into a canonical knowledge vault, and derive
every useful shape from it — tables, graph, timeline, answers with citations.
The trust story is central: every claim has provenance, every inference is
reviewable, nothing is ever silently lost or merged.

## Product model
- **Individual-only.** No teams, orgs, sharing — ever, without an explicit
  decision. Each user gets one invisible "personal org" at signup purely as a
  data boundary (`org_id` on every table). Never shown in UI.
- **Gesture-based capture** — the user forwards/labels/messages the bot;
  we never slurp whole accounts.
- **The vault is the product; views are projections** (see FLOW.md invariants).
- **BYOK supported** — a user can run extraction on their own LLM key.

## Branch & environment model (IMPORTANT)
- **`dev` is the main branch — the latest truth.** All feature branches PR
  into `dev` first. **`prod` only ever receives PRs from `dev`.**
- GitHub's *default* branch is `prod` — when opening PRs, ALWAYS set base to
  `dev` explicitly (GitHub pre-selects prod). Scheduled workflows run from
  `prod`, so cron changes only take effect after promotion.
- Mirrored triple: GitHub branch ↔ Vercel env ↔ Neon branch.
  `prod` = Vercel Production = Neon `prod` (ep-falling-sound…);
  `dev` = Vercel Preview (www.datamodo.dev) = Neon `dev` (ep-wispy-river…).
  Env vars (`DATABASE_URL`, `NEON_AUTH_BASE_URL`) are scoped per environment —
  a shared value once caused auth/data split-brain; never share them again.
- **Neon branches don't git-merge DDL**: apply every migration SQL to each
  branch (dev, prod, previews) — via Neon MCP in agent sessions — and record
  it in PROJECT_STATE. Migrations must be idempotent (`if not exists`).
- Demo account `user@example.com` must stay seeded (`neon/seed.sql`, run after
  signing the user up; idempotent). Update the seed when the schema changes.

## North star (decided 2026-07-10)
- **Free graph exploration is the product's destination**: stand on a node,
  walk edge to edge (Obsidian-style wandering), and at every hop see the node
  in its NATURAL SHAPE — a record as a table, a document as its page, an image
  as the image, a URL as a bookmark, audio as player+transcript (shapes grow
  over time; a node can be anything).
- **An edge is more than a link**: it is a fact, and the UI must expose what
  the fact already carries — semantics (predicate), time (valid_from/to),
  confidence, strength (corroboration count), and the exact source messages.
- **A node's body reads like Obsidian** (decided 2026-07-11): `body_md`
  renders full-flavor markdown — tables, images, tasks, quotes, code, math,
  `[[wikilinks]]` resolving to real nodes, `![[embeds]]` rendering media nodes
  inline — but stays INJECTION-PROOF: a pure parser produces an AST the
  renderer maps to React elements; text never becomes HTML (KaTeX's own
  MathML is the sole, library-generated exception). Structure still lives in
  the graph: wikilinks are a reading convenience, edges remain facts.
- **Generation is ON-DEMAND only** — syntheses (e.g. a concept's cross-document
  note) are produced when the user asks (a button or a question), never by a
  background trigger. LLM spend maps 1:1 to user curiosity; no stale-synthesis
  bookkeeping.

## Architecture decisions (and why)
- **Neon + Prisma + Neon Auth** (migrated off Supabase 2026-07-09; zero users
  → schema-only port). Authz is app-layer `org_id` scoping; RLS is gone.
- **NOT a graph database.** Canonical = append-only bitemporal facts in
  Postgres; the graph is a derived index; numbers are relational aggregation
  (DuckDB is the documented scale path); pgvector for semantic. "Graphs are
  bad at numbers" — validated by research 2026-07-08.
- **Two systems joined by content hashes** (Postgres + R2) — evaluated the
  Lance one-store thesis; our writes are OLTP-shaped, so Postgres stays home.
  lance-graph is the designated later sidecar for multi-hop/columnar.
- **Ontology = vocabulary layer, not storage change.** One node shape
  (`entities`), verbs as facts; the `kinds` registry steers + canonicalizes.
  Templates steer, never block.
- **Entity resolution never trusts similarity alone** — cosine/trigram only
  RECALL candidates; merging needs deterministic keys, high trigram, or LLM
  adjudication with confidence policy; uncertain merges become proposals.
- **Everything fails soft** in the pipeline: missing key/bucket/vision model
  degrades the item, never fails it.
- **Modified Next.js** — APIs may differ from training data; read
  `node_modules/next/dist/docs/` before writing framework-touching code.

## Product simplicity rule (decided 2026-07-10)
The dashboard must stay SUPER CLEAR — the user must never feel lost. Prefer
progressive disclosure over adding parallel options: before adding a toggle,
button, or view, ask what it replaces or where it nests. Views multiply only
when each answers a genuinely different question; controls the user rarely
needs live behind pages/disclosures, not in the chrome. When in doubt, cut.
- **Applied 2026-07-11, final same-day revision (IA shape — keep it this
  way):** the Data tab is **ONE FLAT toggle** — ▦ Tables · ◍ Explore ·
  Timeline · Files · Insights. NO toggles inside toggles.
  - **Tables, Cards and Concepts are ONE feature and ONE object** (user
    decision): a category IS a table IS a concept-form. The Tables surface is
    a Supabase-style schema diagram (kind cards = columns + FK relation rows,
    lines between them); clicking a card browses its rows as cards; creating
    a "table" creates the category AND its dataset together (schema-view's
    "+ new table"). Since 2026-07-11 the binding is STRUCTURAL:
    `datasets.kind_id` → `kinds.id` (plural-name match is only a fallback for
    pre-migration rows).
  - **The Map is REMOVED, not merged** (user decision: useless next to the
    walk). Explore = the ego walk only; no zoom-out. `entities.graph_pin` and
    its PATCH endpoint remain dormant.
  - Rare build actions live behind one "✦ Build ▾" menu. Review owns the
    words "pending changes"; Timeline owns "what we learned".

## Design system (brand)
- Brand name always lowercase **datamodo**. Cream `#F6F2E9` canvas, warm ink
  `#211E18`, ONE accent: coral `#E4593B`. Data/ids/kickers in Geist Mono;
  display type Bricolage Grotesque; Caveat only for the wordmark's "data".
- No emoji in UI chrome (unicode glyphs ✦ ▦ ✓ ↓); wordmark is live text via
  `Logo`, never an image; respect `prefers-reduced-motion`.
- Source of truth: `design/system/` (+ repo skill `.claude/skills/datamodo-design`).
  Landing tokens scoped `.lp-landing`; app styles in `app/globals.css`.

## Working conventions
- **Docs discipline (every commit):** update `docs/STATE.md` (inventory/env),
  `docs/FLOW.md` (if the pipeline changed), `docs/ROADMAP.md` (move shipped
  items, add discovered work), this file (if a durable decision changed) — and
  add a dated line to `PROJECT_STATE.md` Recent changes.
- Verification bar: unit tests on pure cores + tsc + lint==baseline +
  `next build` + SSR/screenshot for UI; flag honestly what wasn't verifiable
  in-sandbox (no LLM key, no browser login).
- Pure cores live import-free so `node:test --experimental-strip-types` can
  load them; DB/LLM shells live beside them (`ontology.ts` vs `kinds.ts`).
- Commit style: `feat(scope): …` with a body that explains the WHY; a PR to
  dev per feature batch.

## Costs & keys context
- OpenRouter free tier is the dev default (`cohere/north-mini-code:free`) —
  unreliable, no vision; ~$10 credit unlocks reliable paid models
  (recommendation standing since the extractor shipped).
- Vision + embeddings + transcription are dormant until their env keys are set
  (fail-soft; transcription rides `TRANSCRIPTION_API_KEY` → `OPENAI_API_KEY`).
