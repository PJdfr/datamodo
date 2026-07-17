# datamodo — memory (durable truths)

> **Maintained doc — update when a durable decision is made or reversed.**
> This is the stuff that must survive any context loss: what the product is,
> how we work, what we decided and why. Siblings: [STATE.md](STATE.md) ·
> [FLOW.md](FLOW.md) · [ROADMAP.md](ROADMAP.md).
>
> Last updated: 2026-07-16

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
- Heavy demo account `demo@datamodo.dev` (`neon/seed-heavy.sql` — ~5 weeks of
  volume for eyeballing every view) is seeded on prod + dev. Discovered
  2026-07-12: Better Auth users live IN the branch DB (`neon_auth` schema), so
  an auth user CAN be created via SQL — generate the scrypt hash with the
  SDK's own `hashPassword` (better-auth `crypto/password.mjs`); app signup is
  the normal path, SQL is the agent/bootstrap path.

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
- ~~**The WOW is the graph engine: REPLAY + COSMOS**~~ **DROPPED 2026-07-14**
  (user call: remove the Cosmos/WOW feature). There is NO separate canvas/WebGL
  showpiece — the Explorer walk + its continuous zoom-out IS the graph surface,
  and the landing hero uses that live Explorer over demo data. The old
  `constellation.ts` LOD/cluster core (kept "for the Cosmos seam") now has no
  consumer → dormant, delete after a quiet month;
  `design/briefs/wow-graph-engine-brief.md` is retired. (Ring grouping, which
  had shipped as build-order step 1, stays — it earns its keep in the walk.)

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
  Templates steer, never block — REVISED for fields 2026-07-16 (user call):
  **template FIELDS are a guarantee** — every node of a templated kind
  carries at least its template fields, null-filled when unknown
  (`ensureTemplateSlots`; a filled null is completion, not a conflict), and
  extra metadata beyond the template stays welcome. Tables then just read
  the metadata. Placeholder facts never count as links (orphan pass),
  telemetry usage, or adjudication context.
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
- **Applied 2026-07-11, revised 2026-07-14 (IA shape — keep it this way):**
  the Data tab is **ONE FLAT toggle** — ▦ Tables · ◍ Explore · ⊛ Graph ·
  Files · Insights. NO toggles inside toggles.
  (⊛ Graph added 2026-07-14: the sigma.js whole-vault experiment runs as a
  PEER of Explore — one is "stand on a node", the other "see everything" —
  pending the roadmap's keep/kill call. Timeline MOVED under Review the same
  day — user call: **Review owns ALL change, pending and past** — where it
  sits in Review's own flat toggle: ✓ Pending · ⎇ Commits · ◷ Timeline.)
  - **Tables, Cards and Concepts are ONE feature and ONE object** (user
    decision): a category IS a table IS a concept-form. The Tables surface is
    a Supabase-style schema diagram (kind cards = columns + FK relation rows,
    lines between them); clicking a card browses its rows as cards; creating
    a "table" creates the category AND its dataset together (schema-view's
    "+ new table"). Since 2026-07-11 the binding is STRUCTURAL:
    `datasets.kind_id` → `kinds.id` (plural-name match is only a fallback for
    pre-migration rows).
  - **The Map is REMOVED, not merged** (user decision: useless next to the
    walk). `entities.graph_pin` and its PATCH endpoint remain dormant.
    **Revised 2026-07-13: the walk gained a ZOOM-OUT, but as LAYERS, not a
    separate map** — after two discarded physics/force-graph iterations the
    standing rule is: graph zoom is ONE dial from the Explorer (scroll out =
    more BFS rings around the same center), every node keeps a permanent
    bearing (pure deterministic layout), NO physics, NO free camera — motion
    that can wiggle is out. A separate map surface stays rejected.
    **Revised 2026-07-14: clicking a card while zoomed out RECENTERS in place
    at the SAME zoom level** (blooms the new center's rings) instead of snapping
    back to the fully-zoomed-in walk — zoom is a property of the view, not reset
    by navigation. Also: the ring "N hops"/"not linked yet" text badges are gone
    (the concentric card rings carry the depth on their own), and the layered
    edges are soft arcs bowing toward the center (bundled look) rather than grey
    straight chords — and CLICKABLE at every zoom level (open the same fact
    inspector as the walk). NO predicate labels are drawn on edges at ANY zoom
    level (user call 2026-07-14, revised from "base keeps them"): the name lives
    only in the fact inspector you get on click.
    **Revised 2026-07-14 (reverses the "zoom is DISCRETE" call): the zoom-out is
    CONTINUOUS.** Scroll maps directly to a FLOAT ring count and HOLDS wherever
    you stop (no notches, no auto-snap): `floor` rings landed, the fraction
    emerges the next ring from the center (blurred, edges drawing outward) while
    the old blurred frontier sharpens + grows. Still deterministic (fixed
    bearings, layout = LERP of the two integer-ring wheels) — this is a
    scroll-attached tween between discrete states, NOT physics; the "no wiggle,
    fixed positions" rule holds. The walk↔layered boundary (below 2 rings) stays
    a swap (3D vs 2D).
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
- **Embeddings are infrastructure, not BYOK** (decided 2026-07-11): vectors are
  STORED, and vectors from different models are incomparable even at the same
  dimension — so there is ONE embedding space per deployment, never a per-user
  choice. Every stored vector carries an `embedding_model` stamp; ANN recall
  filters to the current space (stale rows degrade to trigram, never poison
  matching); changing `EMBEDDINGS_MODEL` means running
  `POST /api/jobs/embed-requeue` until `remaining` hits 0.
  - **Cloud (hosted) product → embeddings run cloud-side** (our configured
    model/API), NEVER on the user's machine — the one-space rule makes them
    non-BYOK, background extraction can't depend on a user's PC being awake,
    and quality matters for GraphRAG recall. This is the default.
  - **Local (self-hosted) edition → embeddings run LOCAL** (decided
    2026-07-14, **shipped 2026-07-15**): the whole deployment IS one user, so
    the one-space rule is satisfied automatically, and privacy/no-key/offline
    are the point. `serve` defaults embeddings to a local Ollama server
    (`http://localhost:11434/v1`, `nomic-embed-text`, 768-dim) **only when no
    cloud embeddings key/URL is set** — an OpenAI-key user keeps their 1536
    provider untouched. The dimension is no longer hardcoded: `serve` passes
    `embeddingDim` to the embedded DB's `ensureSchema`, which resizes the
    `entities`/`doc_chunks` vector columns to match on the fresh build (default
    1536; 768 for the Ollama default) — so a 768-dim model is no longer
    rejected at store time. Space is still stamped once + requeue-on-change.
    All fail-soft: no Ollama/model → embeddings return null → keyword fallback.
- **Local edition compute (decided 2026-07-15, packaging brief):** the local
  default is a **host Ollama** (`serve` sets `LLM_PROVIDER=ollama`; macOS can
  never run GPU inference in a container, so Ollama lives on the host
  everywhere and only a Linux/NVIDIA compose profile may containerize it).
  **LOCAL ↔ BYOK is a Settings toggle, never a reinstall** — stored
  `computeMode` keeps its cloud meaning ("cloud" = platform default, which
  locally IS the machine's Ollama). First-run sizing (RAM → tier → pull) only
  SEEDS `llm.json`; the dashboard stays the owner of model choice.
  **Locally, "byok" without a saved credential is not a real state** — work
  falls back to the machine's Ollama, so `getSettings` reports the mode
  actually in effect (2026-07-16): a fresh vault opens Settings on the
  "Local — on this machine" card. Rely on the reported mode, not the DB
  column (whose default stays cloud-shaped 'byok').
  **The local LLM panel is dashboard-only by design (2026-07-16, user ask):**
  every setup/debug step a non-dev needs — is Ollama running, which models
  are installed (dropdowns), download the recommended ones, does my key
  work + which models can it use, does the model actually answer — must
  stay doable in Settings without a terminal (`/api/local/llm-probe`,
  `/api/local/ollama-pull`). Don't add local LLM features that require CLI.
- **Code separation is MECHANICAL, not conventional (shipped 2026-07-16):**
  the OSS-eligible CORE must never import the closed cloud layer — enforced by
  `.dependency-cruiser.cjs` in CI, with exactly 5 seam files allowed to cross
  (`lib/prisma.ts`, `lib/storage/blob.ts`, `lib/auth/session.ts`,
  `app/auth/actions.ts`, `proxy.ts`). The published local artifact is a
  build-time PRUNE (`scripts/build-local-package.mjs`) that swaps those seams
  for local implementations and proves cloud absence before packing. Adding a
  cloud dependency to core code = CI failure by design; route it through a
  seam. **MCP auth is three credentials, one resolver (2026-07-16):**
  `lib/datamodo/mcp-auth.ts` is the only place that answers "who is calling
  MCP" — local tokenless (127.0.0.1 boundary) · `dmk_` HMAC (stateless,
  Claude Code) · `dmo_` OAuth (DB-backed, claude.ai, per-user revocable).
  Add credentials THERE, never in the route. OAuth tokens are stored
  sha256-hashed; codes and refresh tokens are consumed DELETE-first so
  replays fail closed. **The release tarball ships the PREBUILT `.next`
  (2026-07-16)** —
  pack with `--build`; deps are pinned EXACT so the user's `next` matches the
  shipped build; `bin/link-externals.mjs` restores what npm can't pack
  (externalized-package symlinks, per-install `required-server-files`).
  Never delete `required-server-files.{json,js}` from a build `next start`
  will run — Next 16 reads them at boot. **MCP ships in BOTH editions (FINAL, user call 2026-07-16 after two
  same-day reversals):** same server code, each instance bound to the vault of
  the app that hosts it — cloud MCP reads/writes the hosted Neon org, local
  MCP the machine's own Postgres; the two vaults never sync. Local token
  secret = the random per-install ingest secret (never the constant cookie
  placeholder). Local MCP is for Claude Desktop/Code on the same machine
  (claude.ai web cannot reach localhost). **Local MCP is TOKENLESS (user call
  2026-07-16)**: one user, bound to 127.0.0.1 — the port is the auth
  boundary; cloud keeps per-user bearer tokens. Exposing the local port
  beyond localhost opens the vault — don't, or put auth back first.
- **Per-message costs must be ZERO for plumbing (decided 2026-07-16):**
  routing/classification that runs on EVERY item (e.g. which agent steers an
  unaddressed message in auto mode) must never call an LLM — auto mode
  becomes unaffordable otherwise. The agent router is a deterministic lexical
  classifier (`agent-router.ts`); LLM spend stays reserved for extraction
  itself and on-demand user asks.
- **`neon/schema.sql` must stay loadable into an EMPTY database** (fixed
  2026-07-15: FKs of hand-added tables live in the end-of-file FK section, no
  psql-only meta-commands). It is the ONE faithful schema source: cloud
  branches, the embedded pglite fresh build, and Docker initdb all consume it —
  don't reintroduce inline REFERENCES on tables created before their targets'
  PKs exist.
