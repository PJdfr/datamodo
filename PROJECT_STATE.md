# Project State — datamodo (the journal)

> **This file is the dated JOURNAL** — every state-changing task adds a line to
> "Recent changes" (with its verification details). For orientation, read the
> **living docs first** (they are updated with every commit — rule in
> `AGENTS.md`):
> [docs/MEMORY.md](docs/MEMORY.md) (aim · product model · dev/prod flow ·
> decisions) → [docs/STATE.md](docs/STATE.md) (feature→code map · stack · env
> vars) → [docs/FLOW.md](docs/FLOW.md) (pipeline infographic) →
> [docs/ROADMAP.md](docs/ROADMAP.md) (what's next).
>
> Last updated: 2026-07-11

## Recent changes
- **2026-07-11** — **FLAT IA + Map merged into the Explorer** (user decision:
  merge when possible, disambiguate otherwise, and ONE flat toggle — no
  toggles inside toggles; supersedes the same-day nested shape).
  - **Data tab = one flat toggle:** Tables · ◍ Explore · Cards · Concepts ·
    Timeline · Files · Insights. `KnowledgeView` lost its internal mode row
    (takes `view` + `onSwitch` props); Timeline/Files render directly from the
    tab; per-view subtitles explain each reading.
  - **Map merged into Explore:** the ⌂ button zooms out to the whole graph
    (the old Map, with pins + kind hypernodes intact); every map-inspector
    gains "◍ Walk from here" which dives back into the ego walk centered on
    that node. The "Map"/"Graph" pill no longer exists anywhere.
  - **Cards ↔ Tables disambiguated by a bridge:** every cards-group header
    gets "▦ open as table" (POSTs the existing idempotent category→table
    endpoint, then jumps to Tables) — a table is now visibly "a cards grouping
    with a schema".
  - **Timeline vs Review disambiguated by copy:** Review's subtitle owns
    "pending changes to confirm" (and points to Data → Timeline for the data's
    story); Timeline's subtitle says "your data's story, not table edits".
    (`VersioningTab` in versioning.tsx is unmounted dead code — left in place,
    flagged here for a future cleanup.)
  - Verified: 87/87 tests + tsc + lint == baseline + build green; `npm run
    shoot` green; a Chromium drive of the merge (zoom out → map inspector →
    "◍ Walk from here" → recentered walk) 3/3 with screenshots reviewed.
- **2026-07-11** — **Session-speed fixes** (retro on why PR #42 was slow):
  ① CI now also triggers on `claude/**` pushes — pushes from agent sessions
  don't fire `pull_request` events (GitHub suppresses them for those tokens),
  which had left PRs showing stale checks and cost dead waiting + a manual
  `workflow_dispatch`. ② The ad-hoc browser screenshot harness is now a repo
  tool: `npm run shoot [-- explorer timeline]` (esbuild bundle → local
  Chromium → `.shoot/<name>.png`, fails on page errors; harnesses are small
  fixture mounts under `scripts/shoot/harnesses/`). devDeps: esbuild,
  playwright-core. `.shoot/` is git- and eslint-ignored. Verified: both
  harnesses shoot green; 87/87 tests, tsc, lint == baseline, build green.
- **2026-07-11** — **Dashboard clarity pass + design polish** (user feedback on
  the Explorer v2 port: keep the design's color richness and cleaner panel;
  Timeline "10× cleaner" in the mock; too many tabs/toggles in Data).
  - **IA consolidation (durable — see MEMORY simplicity rule):** Data tab goes
    from 5 views + 3 buttons to **Tables · ◍ Explore · Insights** + one
    "✦ Build ▾" menu (Categories / Spreadsheet→knowledge / Build from
    knowledge). Explore is THE knowledge surface: **Walk (3D explorer) is the
    default**, with Cards / Map (was "Graph") / Concepts / **Timeline** /
    **Files** as modes — the old Data→Knowledge→Explore double-toggle is gone
    (walking is zero clicks), and Timeline/Files stop competing as top-level
    peers.
  - **Explorer polish:** node cards are tinted from the kind REGISTRY color
    (paper-warm `color-mix` wash + colored border/kicker) so every kind reads
    as its color; the side panel got the design's quieter look — bigger title,
    connections/facts sub-line, and a new `variant="flat"` on `EntityPageBody`
    that drops the boxed cards (modal keeps `card`).
  - **Timeline reskin per the handoff** (`DashboardExtras.TimelineView`):
    vertical rail with coral day dots (gold for Upcoming), white cards rising
    in with a 55ms stagger (reduced-motion settles instantly), channel tints,
    entity chips; header becomes "What datamodo learned". Clock toggle and
    entity filter kept.
  - Verified: 87/87 tests + tsc + lint == baseline + build green; Chromium
    screenshots of the colored Explorer and the reskinned Timeline reviewed
    (no page errors).
- **2026-07-11** — **EXPLORER v2 shipped: the 3D graph walk** (Claude Design
  handoff, project "Datamodo Explorer v2" — implemented per its
  `ExplorerGraph3D.jsx` + `MOTION.md`, ported onto the EXISTING pure core as
  the roadmap contract demanded).
  - **Pure core additions** ([explorer.ts](lib/datamodo/explorer.ts)):
    `EgoGraph.parentOf` (who introduced each node — drives sectors AND
    enter-from-parent), `depthLayout` + `DEPTH` (the depth field: center z+150,
    hop-1 datum, hop-2 z−230; elliptical rings scaled to the canvas; sparse
    1–2-node rings fan the upper arc; lone hop-2 children step 14° off their
    parent's bearing). `radialLayout` refactored onto `parentOf`; contract
    unchanged.
  - **The skin** ([explorer-view.tsx](app/dashboard/explorer-view.tsx), same
    public props): DOM cards in real CSS perspective + one SVG overlay whose
    edge endpoints are measured from the live projected cards each frame in a
    900ms settle window; the walk = world reflow around a fixed camera (720ms
    ease-out; new center 760ms spring; entering nodes fly from their parent
    staggered 42ms; leavers recede 300ms); hover lights incident edges coral
    and dims the rest; kind-toned cards (company/dataset ink, concept accent,
    invoice sunk-mono); floating breadcrumb+Back and jump box; redesigned
    **edge inspector** (confidence meter, amber <70% · since · corroboration
    pips · strength label · quoted source evidence with channel tints); side
    panel keeps our real natural shapes (`EntityPageBody`). Reduced motion →
    flat 2D radial (no perspective/blur/fog, ~instant), honored live.
  - Design-handoff leftovers deliberately NOT built: Review-Studio merge
    motion + Timeline polish (lower-priority extras) and the dashboard IA
    restructure (a product decision) — recorded in ROADMAP.
  - Verified: 87/87 tests (4 new on parentOf/depthLayout) + tsc + lint ==
    baseline + build green; **live Chromium drive** (esbuild harness +
    playwright-core, 12/12 checks: render, edges + predicate labels, walk
    recenter, inspector with quoted evidence, back, reduced-motion flattening)
    with screenshots reviewed.
- **2026-07-11** — **Requeue UX shipped: the extraction queue is visible.**
  New session-authed `GET /api/jobs/queue-status` (queued = `stored` +
  retryable `failed` under the attempt cap; `analyzing`; `stuck` = failed past
  retries) and a topbar **QueuePill** ("⟳ processing N items"): invisible when
  idle (simplicity rule — no new chrome in the common case), polls every 8s
  while draining / 60s idle, pauses when the tab is hidden, and shows "⚠ N
  stuck" honestly when items exhausted their retries. New `dm-spin` keyframe
  (covered by the existing reduced-motion guard). Roadmap item closed.
  Verified: 83/83 tests + tsc + lint == baseline + build green.
- **2026-07-11** — **ON-DEMAND SYNTHESIS shipped: "✦ Synthesize" writes a cited
  cross-document note** (north-star item; generation ONLY when the user asks —
  the button is the only trigger, there is no background path).
  - **Pure core** [synthesis.ts](lib/datamodo/synthesis.ts):
    `collectSynthesisSources` (content entities with a `bodyMd` linked to the
    subject in EITHER direction; best-connected first; ≤8 sources, ≤1500 chars
    each), `buildSynthesisPrompt` (numbered sources + the same grounding
    contract as answers: sources only, cite [n]), `renderSynthesisBody` (the
    model's note + OUR deterministic `#### Sources` footer + an honest
    "Synthesized on … because you asked" stamp), `canSynthesize` (≥2 sources).
  - **`POST /api/knowledge/entities/[id]/synthesize`**: org-scoped; uses the
    ESCALATE model via `llmForUser` (BYOK respected); writes the note to
    `entities.body_md`; fails soft (friendly 502 on no-key/flaky model).
  - **UI**: "✦ Synthesize" in the entity-page footer whenever the entity has
    ≥2 connected bodies of content (concepts, hub people/companies, notes);
    busy state, inline error, and the open page updates in place.
  - Verified: 83/83 tests (5 new) + tsc + lint == baseline + build green.
    **NOT run against a live LLM** (no key in sandbox) — same chatJSON
    contract as the verified extraction paths.
- **2026-07-11** — **Timeline follow-ups shipped: sent-vs-arrived clock +
  per-entity history on entity pages** (both roadmap items).
  - **`timeBasis` option** on the pure `buildTimeline`: `"sent"` puts message
    events at the sender's send time (`items.sent_at`, falls back to
    received_at when the channel doesn't know) — forwarded email keeps its
    original date. API: `?basis=sent`; UI: a "clock: arrived ⇄" pill in the
    Timeline header toggles it.
  - **`EntityHistory`** ([timeline-view.tsx](app/dashboard/timeline-view.tsx)):
    every entity page ends with a COLLAPSED "◷ History" disclosure — fetched
    only when opened (progressive disclosure per the simplicity rule), renders
    the same event rows narrowed to that entity, chips navigate to other
    entities' pages. Hidden for virtual dataset nodes (no vault history).
  - Verified: 78/78 tests (1 new on sent-basis + fallback) + tsc + lint ==
    baseline + build green.
- **2026-07-11** — **NODE SHAPES PHASE 2 shipped: image nodes, bookmarks,
  dataset-as-node** (Explorer track item — "a node can be anything").
  - **Pure core** [node-shapes.ts](lib/datamodo/node-shapes.ts) (import-free):
    `entityImageType` (image documents detected via `file_type` fact or the
    filename inside the `doc:` natural key, same media gate as the vision
    tier), `entityBookmarkUrl` (the `url` fact or a URL-shaped label; plain
    http(s) only — anything else never becomes a link), `buildDatasetNodes`
    (datasets → VIRTUAL `dataset` nodes with `contains` edges to the entities
    projected into their rows; deduped, unknown ids dropped, empty tables
    skipped — never enters the vault).
  - **Image nodes render their image**: entity pages/Explorer panel embed the
    original via `/api/documents/[id]?inline=1` (new inline disposition; the
    binary still never leaves blob storage).
  - **`bookmark` builtin kind** (required `url` field, title/site, `about`/
    `shared_by` relations) — `ensureKinds` backfills it to existing orgs; the
    extractor can now classify shared links. Bookmark nodes render a link card.
  - **Dataset-as-node**: `/api/knowledge/entities` also returns each dataset's
    row-entity ids; the Explorer's world = entities + dataset nodes, so you can
    walk INTO a table and out through any of its rows. Panel shows a "▦ Table"
    card (rows × columns); dossier hidden for virtual nodes.
  - Verified: 77/77 tests (6 new) + tsc + lint == baseline + build green.
    Image rendering not eyeballed live (no blob bucket in sandbox) — the
    `<img>` rides the already-verified download route.
- **2026-07-11** — **`bumpSupport` is now atomic** (`support = support + 1` via
  Prisma's `increment`, one round-trip): concurrent per-entity extraction can
  no longer lose corroboration counts to a read-modify-write race. Roadmap
  item closed. Verified: 71/71 tests, tsc clean, lint == baseline.
- **2026-07-11** — **CI pipeline added**: `.github/workflows/ci.yml` runs the
  full verification bar (unit tests → tsc → lint==baseline → `next build`) on
  every PR and on pushes to dev/prod. The lint gate is
  `scripts/check-lint-baseline.mjs` (fails only on NEW problems vs the
  documented 8-error/16-warning baseline; shrink the constants as old ones get
  fixed). Build runs with dummy auth/DB env (module-scope reads only; nothing
  connects). Verified locally: 71/71 tests, tsc clean, baseline check green,
  build green.
- **2026-07-10** — **EXPLORER shipped (north-star phase 1): walk the graph edge to
  edge; every edge shows its meaning.** Two durable decisions recorded in
  docs/MEMORY.md: free exploration with natural-shape nodes is the product's
  destination, and generation is ON-DEMAND only (no background syntheses).
  - **Ego-graph core** (pure [explorer.ts](lib/datamodo/explorer.ts)): BFS 2 hops
    around a center, ring caps keep the most-connected neighbors (truncation
    counted), edges are DIRECTED and carry the whole fact behind them; concentric
    deterministic radial layout (hop-2 fans out in its parent's sector).
  - **Explorer view** ([explorer-view.tsx](app/dashboard/explorer-view.tsx)): 4th
    Knowledge mode (Cards · Graph · Concepts · **Explore**) + "◍ Explore" on every
    entity page. Click a neighbor → it becomes the center (breadcrumb trail + back);
    "Jump to anything…" search; side panel shows the CURRENT node in its natural
    shape (shared `EntityPageBody`); **click an edge → the edge inspector**:
    semantics · confidence % · since (valid_from) · strength (corroboration) · the
    exact source messages, with both endpoints walkable. Edge stroke width scales
    with corroboration.
  - **Fact metadata exposed**: `KnowledgeFactView` gains `confidence` + `validFrom`
    (listKnowledge selects them) — the vault always had them; the UI now shows them.
  - **Entity pages**: `EntityPageBody` extracted (modal + Explorer share it) and
    per-fact **provenance drill-down on the page** (click "N sources" → the actual
    messages); `SourceRow`/channel meta moved to shared ui.tsx.
  - Verified: 71/71 tests (4 new on ego-graph/rings/caps/layout determinism) + tsc
    + build green; lint == baseline; SSR smoke 18 checks (explorer canvas, hop-2
    ring, panel record, jump box + all prior views).
- **2026-07-10** — **Vision tier BUILT: image attachments become understood thick
  nodes** (the last projections-catalog item; scanned-PDF OCR still out — needs
  page rasterization, images-only is the v1).
  - **Provider layer sees**: `ChatJsonRequest.images` ([types.ts](lib/llm/types.ts)) —
    OpenAI-compatible sends data-URI `image_url` parts, Anthropic sends base64 image
    blocks; `LlmModels.vision` (env `OPENROUTER_VISION_MODEL` / `OPENAI_VISION_MODEL` /
    `ANTHROPIC_VISION_MODEL`, defaults to the extract model). A blind model just
    errors → the attachment degrades to `metadata_only` like any unreadable PDF.
  - **`extractFromImage`** ([extract.ts](lib/datamodo/extract.ts)): SINGLE vision call
    classifies AND extracts (no separate classify pass, no escalation ladder — vision
    calls cost real money): prompt = full category menu + "the primary entity's kind
    IS the classification" ([buildImagePrompt](lib/datamodo/ontology.ts)); output =
    summary (transcribing load-bearing text/numbers) + template facts + ≤3 concepts.
    Same restraint backstop + **off-template review routing** as documents (shared
    `restrainForKinds` tail).
  - **Pipeline** ([documents.ts](lib/datamodo/documents.ts)): image gate
    `attachmentImageType` (png/jpeg/webp/gif via content-type or extension,
    `MAX_IMAGE_BYTES` 3.5MB keeps base64 under provider caps); summary becomes the
    node's `body_md` AND is chunked as its passage — image content is searchable/
    citable. **`EXTRACTION_VERSION` bumped to 2** — after deploy, one authed
    `POST /api/jobs/extract-requeue` re-runs old items so past image attachments
    get understood.
  - Verified: 67/67 tests (6 new: gate, size cap vs base64 math, prompt) + tsc +
    build green; lint == baseline. **NOT run against a live vision model** (no key
    in sandbox) — same chatJSON contract as verified paths. **Owed by a human:**
    set `OPENROUTER_VISION_MODEL` (or provider equivalent) in Vercel to a
    vision-capable model, then curl the requeue endpoint once.
- **2026-07-10** — **Off-template review routing + delta-reprocessing endpoint**
  (closes two documented gaps: restraint drops were silent; extraction_version
  had no requeue trigger).
  - **Off-template → Review queue**: `restrictExtractionToTemplates` now RETURNS the
    facts it dropped for vocabulary reasons (`offTemplate` — concept-leash drops stay
    policy, never routed); pure `buildOffTemplateReview` ([ontology.ts](lib/datamodo/ontology.ts))
    packages them as a SELF-CONTAINED replayable unit (mini extraction = the facts +
    exactly the entities they touch, from the pre-restriction extraction, plus
    pre-rendered display lines). The document pipeline files it as a new
    `knowledge_reviews.kind = "off_template"` (no migration — kind is free text;
    best-effort, never fails the attachment). **Accept = "add anyway"**: replays the
    payload through the normal `ingestExtraction` (resolution + dedup + provenance);
    reject discards — nothing is applied at filing time, unlike the other kinds.
    Review Studio renders it as a 4th decision type (± rows, "Outside the template"
    group, card nudges "or add the field to the category"); simulated preview updated.
  - **`POST /api/jobs/extract-requeue?below=N`** ([route](app/api/jobs/extract-requeue/route.ts),
    CRON_SECRET-gated like the tick): flips analyzed items stamped `extraction_version
    < N` (or unstamped) back to `stored` with fresh attempts; the normal tick
    re-extracts them. Safe by construction (resolution/claim-key dedup/supersession).
    Bump `EXTRACTION_VERSION`, deploy, curl once.
  - Verified: 61/61 tests (4 new on capture/packaging) + tsc + build green; lint ==
    baseline. Accept-path ingest rides on the already-verified `ingestExtraction`.
- **2026-07-10** — **Projections catalog continued ②: CONCEPT MAP + DOSSIER EXPORT
  shipped** (the last two pure-query items of the designed remainder).
  - **Concept map** — the Obsidian-style map of content, one zoom level above the
    entity graph. Pure core [concept-map.ts](lib/datamodo/concept-map.ts)
    (`buildConceptMap`, type-imports only → unit-testable): nodes = `concept` entities
    sized by how much content is `about` them; links = explicit concept→concept facts
    (`related_to`, solid) MERGED with **co-occurrence** (two concepts sharing a
    document/note, dashed, weighted by shared count). UI
    [concept-map-view.tsx](app/dashboard/concept-map-view.tsx): third Knowledge mode
    (Cards · Graph · **Concepts**), deterministic bubble layout, click a concept →
    drawer lists its content with jump-to-page; reads over ALL entities (not the
    search subset — a half-filtered map of content misleads).
  - **Dossier export** — "everything we know about Acme, cited", as downloadable
    markdown. Pure renderer [dossier.ts](lib/datamodo/dossier.ts) (`buildDossier`,
    `generatedOn` injected → deterministic tests): summary (body_md), attribute facts
    with `[n]` citations, connections BOTH directions, the 1-hop neighborhood's facts,
    and a numbered Sources footer (identical messages collapse to one number;
    no-provenance case stays honest). `GET /api/knowledge/entities/[id]/dossier`
    streams it as an `.md` attachment (`dossierFilename` slug). **"dossier ↓" on every
    entity page footer** (documents keep "original ↓" beside it). PDF stays a later
    add-on behind the same builder.
  - Verified: 57/57 tests (11 new) + tsc + build green; lint == baseline (8/16);
    SSR smoke: concept labels/dashed edges/legend/empty state render (12 checks incl.
    the prior graph+timeline ones).
- **2026-07-10** — **Projections catalog continued: TIMELINE + GRAPH CURATION shipped**
  (the next two items from the designed remainder).
  - **Timeline** — the chronological projection, pure query as designed. Pure core
    [timeline.ts](lib/datamodo/timeline.ts) (`buildTimeline`, no imports → unit-testable):
    events derive from data that already carries time — **messages** (received_at, with
    "N facts extracted" + entity chips), **domain dates** (current facts with value_date:
    due dates, meeting days; future ones surface as an **Upcoming** section, soonest
    first), **changes** (superseded facts → "1200 EUR → 1450 EUR" at valid_to), **first
    sightings** (entities.created_at). `?entity=` narrows to "everything about X, in
    order" — in the UI, click any entity chip. `GET /api/knowledge/timeline` (fetch +
    row-adaptation live in the route; the projection is pure). UI
    [timeline-view.tsx](app/dashboard/timeline-view.tsx): 5th Data sub-toggle
    (Tables · Knowledge · Insights · Files · **Timeline**), day-grouped sections.
  - **Graph curation** — the canvas is now a lived-in space
    ([knowledge-graph.tsx](app/dashboard/knowledge-graph.tsx)): **dragging a node PINS
    it** — persisted to `entities.graph_pin` (jsonb {x,y} normalized 0..1; migration
    [20260710220000](neon/migrations/20260710220000_entities_graph_pin.sql), **applied +
    verified on all 4 Neon branches** incl. both previews) via
    `PATCH /api/knowledge/entities/[id]` (`{graphPin}` only — facts are NOT editable
    there; knowledge changes stay extraction+review). Layout holds pinned nodes fixed
    and relaxes the rest around them; pinned nodes show an accent dot; **Unpin** in the
    inspector. **Hypernodes**: "clusters" chips fold a whole kind into one
    "Invoices (12)" node (edges reroute + dedup, click to expand) — session-local by
    design (a reading mode, not data). `KnowledgeEntityView` gains `graphPin`.
  - Verified: 46/46 tests (7 new on the pure timeline) + tsc + build green; lint ==
    baseline (8 errors/16 warnings, all pre-existing); SSR smoke-rendered both views
    (graph: chips/edges/pin marker/cluster row; timeline first paint).
- **2026-07-10** — **Generated notes SHIPPED: a dump becomes a note WE author (the
  Obsidian move, inverted to fit the product).** Decision: users never write structured
  notes — they dump prose into any channel and the PIPELINE authors the note.
  - **`note` builtin kind** ([ontology.ts](lib/datamodo/ontology.ts); `ensureDefaultKinds`
    now BACKFILLS builtins added after an org was seeded, so old orgs get it too —
    trade-off documented: a deliberately deleted builtin resurrects until tombstones).
  - **Message extraction now also decides note-worthiness** ([extract.ts](lib/datamodo/extract.ts)):
    transactional messages (invoices, confirmations) return no note; a substantive
    write-up (braindump, meeting notes, plan) returns `note:{title, body}` — body is
    OUR markdown distillation of the user's content. A subject starting `note:`/`memo`
    is the explicit gesture and forces one. `runExtractionForItem` folds it in via pure
    `buildNoteExtraction` ([document-extraction.ts](lib/datamodo/document-extraction.ts)):
    note entity (natural key = item id → re-extraction dedupes), machine-made
    "wikilinks" = real `mentions`/`about` edges to the same text's entities (their
    facts NOT re-ingested), `body_md` = the distillation. Best-effort — never fails
    the item. Notes read as pages in the existing EntityPageModal (panel says "Note").
  - Seed: a WhatsApp braindump item + its generated note (body, 3 mentions, 1 concept).
  - Verified: 39/39 tests + tsc + build green; lint == baseline. **Note prompts not yet
    run against a live LLM** (sandbox has no key).
- **2026-07-10** — **Ontology phase ⑤ SHIPPED: thick nodes — classify-first document
  extraction + natural-shape rendering.** The design conversation's conclusion: some
  knowledge is graph-shaped, some is document/table-shaped; nodes should open in their
  NATURAL SHAPE, and documents should be DISTILLED (not transcribed) into the graph.
  - **`entities.body_md`** (migration [20260710210000](neon/migrations/20260710210000_entities_body_md.sql),
    **applied + verified on all 3 Neon branches**): an entity can carry a generated
    markdown body — the thick node's page. Seed gives both demo documents one.
  - **Classify-first, template-restrained document extraction**
    ([extract.ts](lib/datamodo/extract.ts) `classifyDocumentKind` + `extractFromDocument`,
    replacing `extractFromMessage` in the attachment pipeline): ① a cheap call classifies
    the document into the user's categories ("this PDF IS an invoice / a paper"); ② a
    focused prompt extracts ONLY that kind's template fields + relation verbs + ≤3
    concepts + a markdown `summary` (stored as the doc entity's `body_md`). Post-LLM,
    pure `restrictExtractionToTemplates` ([ontology.ts](lib/datamodo/ontology.ts))
    backstops: off-template facts on templated kinds drop, concepts cap at 3, a concept
    that merely names a kind ("Invoices") drops — category membership is the `kind`
    COLUMN, never a hub node, so invoices cluster by query, not by edges to a giant
    topic node. Un-templated kinds still pass through (steer, never block); message
    extraction is unchanged (free-range). `indexKinds` now also indexes kind plurals.
  - **Natural-shape entity pages** ([entity-page.tsx](app/dashboard/entity-page.tsx)):
    every entity opens as a page — documents read as a **summary page** (safe
    `MarkdownLite` renderer — React-text-node output, injection-inert) with connection
    chips + "original ↓"; typed entities read as a **record table** (template fields
    first, missing-required flagged amber, off-template attrs after, relationships as
    clickable chips that navigate page→page). Wired from Knowledge cards ("open ›"),
    the graph inspector ("Open page ›"), and Files cards.
  - **`mergeEntities` gap fixed** ([knowledge.ts](lib/datamodo/knowledge.ts)): merges now
    also repoint `doc_chunks.entity_id` + `dataset_rows.subject_entity_id` and carry
    `body_md` to the winner — thick-node payloads were previously stranded on the
    tombstone. (Merge moves identity only; stored content is never rewritten.)
  - Verified: 37/37 tests (10 new on restraint/prompts) + tsc + build green; lint ==
    baseline; SSR smoke-rendered both page shapes (14 assertions incl. XSS-inertness).
    **Doc-mode prompts not yet run against a live LLM** (sandbox has no key) — same
    chatJSON contract as the verified message extraction.
- **2026-07-10** — **Ontology phase ④ SHIPPED: leashed concepts, completeness cues,
  extraction_version.**
  - **Concepts, with the leash**: extraction now receives the user's existing concept
    labels (top 30 by support) with a hard instruction — ≤3 concept tags, strongly
    prefer existing labels. In the document pipeline, concept entities get **`about`**
    edges from the document (the map-of-content edge) instead of generic `mentions`.
  - **Completeness cues** ([knowledge-view.tsx](app/dashboard/knowledge-view.tsx)):
    Knowledge cards check the entity against its category template and show an amber
    "missing: due date" chip for unmet REQUIRED fields; kind groups now use the
    registry's icon/color/plural.
  - **`items.extraction_version`** (migration
    [20260710200000](neon/migrations/20260710200000_items_extraction_version.sql),
    applied to all 3 Neon branches): stamped on every analyzed item
    (`EXTRACTION_VERSION = 1` in [extract.ts](lib/datamodo/extract.ts)). Bump it when
    the prompt/pipeline changes materially, then requeue `extraction_version < N`
    for delta reprocessing (requeue endpoint itself: future work).
  - Verified: 27/27 tests + tsc + lint + build green.
- **2026-07-10** — **Ontology phase ③ SHIPPED: AI-drafted categories + one-click
  category → table** (feedback: the first editor was too form-heavy).
  - **The user never writes schema now**: name the category + optional sentence →
    "✦ Draft it" (`suggestKindTemplate` in [kinds.ts](lib/datamodo/kinds.ts),
    `POST /api/kinds/suggest`, BYOK-aware) proposes icon/plural/description/aliases/
    typed fields/relations; the editor shows the template as **prunable chips**
    (type glyph, required dot, unit hint) with one-line adders (key auto-slugified
    from the label); aliases + raw keys live under an "Advanced" disclosure.
  - **Category → table** (`POST /api/kinds/[id]/table`): creates a dataset whose
    columns mirror the template (fields + relation verbs; bookkeeping fields like
    file_size skipped) and projects every entity of the kind via the existing
    `projectEntitiesToDataset` — column key == predicate **by construction**. Name
    collision → projects into the existing table instead. "▦ Build table" button in
    the category editor.
  - Verified: 27/27 tests + tsc + lint + build green + redesigned editor screenshotted.
- **2026-07-10** — **Ontology phase ② SHIPPED: embeddings (Tier 1b) + the document
  evidence layer (chunks).** The two adoptions from the multimodal-KG research.
  - **Embeddings** ([lib/llm/embeddings.ts](lib/llm/embeddings.ts)): OpenAI-compatible
    /embeddings client, 1536-dim (matches `entities.embedding`), FAIL-SOFT — no
    `EMBEDDINGS_API_KEY`/`OPENAI_API_KEY` → null and every caller degrades to the
    non-semantic path. `ingestExtraction` batch-embeds all extracted entities in one
    call; embeddings stored on entity create (raw SQL — the vector column is
    Unsupported in Prisma); `resolveEntity` gains **Tier 1b semantic blocking**: when
    trigram finds <5 candidates, ANN over the org+kind's embeddings RECALLS more
    (cosine ≥0.5) — resolution still goes through LLM adjudication, cosine never
    auto-merges. **Owed by a human: set `OPENAI_API_KEY` (or `EMBEDDINGS_API_KEY`) in
    Vercel** or embeddings stay off (everything still works without).
  - **doc_chunks** (migration [20260710190000_doc_chunks.sql](neon/migrations/20260710190000_doc_chunks.sql),
    applied to all 3 Neon branches): after fact extraction, a document's PASSAGES now
    survive — pure `chunkDocText` (per-PDF-page lineage, ~1200 chars, paragraph/sentence
    boundaries, 60-chunk cap) → [chunks.ts](lib/datamodo/chunks.ts) `storeDocChunks`
    (idempotent replace per entity + best-effort chunk embeddings). `searchChunks`
    (keyword, ≤2 passages/doc) joins `GET /api/search` as `passages`, renders as an
    **"In your documents"** section (page-cited quote cards), and feeds the grounded
    answer as `[n] Passage from "report.pdf" (page 3)` sources — answers can now cite
    from INSIDE documents. Verified: 27/27 unit tests + tsc + lint + build green.
    Semantic (ANN) chunk search is a later drop-in behind the same searchChunks shape.
- **2026-07-10** — **Ontology layer ① SHIPPED: user-editable kind registry
  ("Categories").** New `kinds` table (migration
  [20260710180000_kinds_registry.sql](neon/migrations/20260710180000_kinds_registry.sql),
  applied to all 3 Neon branches). Pure core
  [ontology.ts](lib/datamodo/ontology.ts): `DEFAULT_KINDS` (person/company/invoice/
  document/event/concept, each with field templates + relation verbs + aliases),
  `canonicalizeExtraction` (kind synonyms → canonical slug, predicate synonyms →
  template field keys — **fixes the predicate-drift fact-dedup bug**; off-template
  vocabulary passes through slugified, never blocked), `promptCategories` (compact
  category menu injected into the extraction prompt). DB side
  [kinds.ts](lib/datamodo/kinds.ts) (lazy per-org seeding + CRUD), `GET/POST /api/kinds`
  + `PATCH/DELETE /api/kinds/[id]`. Extraction (`extractFromMessage` +
  `runExtractionForItem` + document pipeline) now loads the registry, steers on it,
  and canonicalizes output. UI: **Categories** manager
  ([categories-modal.tsx](app/dashboard/categories-modal.tsx)) from the Data tab —
  list + editor (icon, description, aliases, typed fields w/ required, relation verbs
  w/ target kinds); builtins editable, slug immutable (identity). Verified: 22/22 unit
  tests + tsc + lint + build green + both modal views screenshotted.
- **2026-07-10** — **Inbound email verified LIVE end-to-end + extraction no longer
  waits for GitHub's cron.** First real forwarded emails (Gmail → Cloudflare Email
  Routing → worker → `/api/ingest`) captured on the dev DB with the attachment blob +
  body archived to the new **R2 bucket** (`ingest`, eu; env vars live in Vercel; worker
  secret wired). Debugged en route: worker crashed first on missing
  `INGEST_WEBHOOK_SECRET` (401) then on missing R2 env (500) — both fixed in Vercel by
  the human; dev redeployed (empty commit `cb74c7e` on `dev`). Diagnosed the cron gap:
  GitHub fires the 5-min schedule **hours** apart on a quiet repo, and the `APP_URL`
  repo secret points at PROD only — so dev items sat `stored`. Fixes: **ingest now
  kicks extraction itself** post-response (`after()` from next/server in
  [app/api/ingest/route.ts](app/api/ingest/route.ts), atomic claim → race-safe with
  the cron, which becomes the sweeper) and
  [extract-cron.yml](.github/workflows/extract-cron.yml) ticks **both** environments
  (`APP_URL` + www.datamodo.dev). NOTE: the scheduled workflow runs from the DEFAULT
  branch (`prod`) — the both-env tick takes effect only once this merges through to prod.
- **2026-07-10** — **Search now ANSWERS in plain language with citations + document
  originals downloadable + extract tick drains the backlog.**
  - **Grounded answers** ([answer.ts](lib/datamodo/answer.ts)): the Search tab's
    long-promised second half. Keyword+knowledge search picks the evidence; the model
    gets a NUMBERED source list (top 6 entities + 8 rows) and must answer from it only,
    citing `[n]` — `citedSources` rejects any answer that cites nothing, so ungrounded
    prose never renders. BYOK-aware (`llmForUser`), best-effort by construction: any
    LLM failure returns null and plain results still show. `GET /api/search?q=&answer=1`;
    UI [answer-card.tsx](app/dashboard/answer-card.tsx) — prose with inline citation
    chips (click → opens the cited table) + a source-chip row.
  - **Download the original** ([app/api/documents/[id]/route.ts](app/api/documents/%5Bid%5D/route.ts)):
    a `document` entity's natural key carries its blob hash → org-scoped entity → blob →
    streamed bytes with the attachment's real filename/content-type. 503 until the blob
    bucket exists. "original ↓" button on every Files card.
  - **Tick drain loop** ([extract-tick](app/api/jobs/extract-tick/route.ts)): keeps
    claiming batches while <25s elapsed, so a backlog clears at LLM speed instead of
    `EXTRACT_BATCH` per 5-minute cron.
  - Verified: 17/17 unit tests (new pure tests for context building + citation
    filtering) + tsc + lint + `next build` green + AnswerCard screenshotted (citation
    chips + source row). **Answer path not yet run against a live LLM** (sandbox has
    no key) — the prompt follows the same chatJSON contract as extraction.
- **2026-07-10** — **Extraction queue hardened + spreadsheets join the document
  pipeline + `simulateAgentUpdate` deleted.**
  - **Orphan recovery & retry** (the step-6 TODO): `items` gains `claimed_at` +
    `attempts` (migration [neon/migrations/20260710130000_items_claim_tracking.sql](neon/migrations/20260710130000_items_claim_tracking.sql),
    idempotent; schema.sql + Prisma schema updated). `claimStoredItems` stamps both;
    new `recoverExtractionQueue` ([extract.ts](lib/datamodo/extract.ts)) runs at the top
    of every tick: stale `analyzing` orphans (>10 min or null claim) and retryable
    `failed` items requeue to `stored`, capped at 3 attempts — beyond that orphans are
    marked failed ("extraction timed out"), poison items stay failed. Tick response now
    reports `{requeued, abandoned}`. **DDL applied + verified 2026-07-10** on all three
    Neon branches (`dev`, `prod`, and the Vercel-created
    `preview/claude/dev-branch-work-4p5wlf`) via the Neon MCP — nothing owed at promote.
  - **.xlsx attachments** now flow through the document pipeline:
    `attachmentTextKind` gains `"sheet"`, parsed with the EXISTING `parseWorkbook`,
    flattened by pure `sheetToText` (header + pipe-rows, 200-row cap → `partial`).
  - **`simulateAgentUpdate` deleted** (Next-steps item 4 — real extraction flows):
    removed from datasets.ts / actions.ts / a dead control-center import;
    `proposeAgentRows` kept (sheet sync uses it).
  - Verified: 13/13 unit tests; recovery/claim state machine exercised on a throwaway
    local PG16 across all 8 item states (fresh/in-flight/orphan/legacy-null/out-of-
    attempts/transient-fail/poison/analyzed — every transition correct); migration
    idempotent against updated schema; tsc + lint + `next build` green.
- **2026-07-10** — **Attachments → documents in the graph + smart folders (built — the
  designed Next-steps item; bucket provisioning ① still owed by a human).**
  - **Document pipeline**: every attachment on an item now becomes a `document`
    **entity** (natural key = blob hash + filename → the same file re-forwarded dedupes)
    with `file_type`/`file_size`/`indexed` facts and `mentions` relationship facts to
    whatever its text talks about. Pure core in
    [document-extraction.ts](lib/datamodo/document-extraction.ts) (`buildDocumentExtraction`
    composes the combined Extraction; `extractAttachmentText` reads the PDF text layer via
    **unpdf**, or plain text/CSV/JSON, capped at 20 pages / 20k chars → `indexed: partial`);
    orchestration in [documents.ts](lib/datamodo/documents.ts) (`processItemAttachments`:
    readBlob → text → the SAME `extractFromMessage` → `ingestExtraction`, provenance =
    the item). Hooked into `runExtractionForItem` best-effort: **no blob bucket / scanned
    PDF / LLM error degrades that document to `metadata_only` — never fails the item**.
  - **Files sub-view** ([files-view.tsx](app/dashboard/files-view.tsx)): Data tab gains a
    4th toggle (Tables · Knowledge · Insights · **Files**). Smart folders are
    **projections over `mentions` facts** — chips per linked entity ("every document
    linked to Brightwave"), one doc lives in many folders, nothing is moved. Cards show
    type/size, an indexed/partially/not-indexed badge, clickable mention chips, and the
    message it arrived via.
  - **Seed**: [neon/seed.sql](neon/seed.sql) now seeds 2 demo attachments + document
    entities (INV-4417.pdf, Brightwave-MSA-2026.pdf) with mentions + provenance.
  - Verified: 10/10 unit tests (`npm test`, new node:test setup — incl. reading a real
    generated PDF through unpdf) + seed applied twice against a throwaway local PG16
    (idempotent, graph correct) + tsc + `next build` green + Files view screenshotted
    (Chromium, all-docs + folder-filtered states). **NOT yet run live end-to-end**
    (needs the blob bucket ① and a real inbound attachment).
  - Also hardened `NEXT_PUBLIC_SITE_URL` handling (`||` not `??` in layout/robots/sitemap
    — an EMPTY env var crashed `next build` with `ERR_INVALID_URL`).
- **2026-07-10** — **Fixed env split-brain: www.datamodo.dev signed users up into the
  PROD branch.** `www.datamodo.dev` serves the **dev git branch** (Vercel Preview), and
  `DATABASE_URL` was correctly scoped per environment — but `NEON_AUTH_BASE_URL` was one
  shared value (the prod endpoint) across Preview+Production, so auth users landed in the
  Neon **prod** branch while app data went to the **dev** DB. Fixed via `vercel env`:
  removed the shared var; `NEON_AUTH_BASE_URL` is now Production → `ep-falling-sound…`
  (prod) and Preview(dev) → `ep-wispy-river…` (dev), mirroring DATABASE_URL. Redeployed
  dev (empty commit). **Verified live**: sign-up on www.datamodo.dev created
  `wiring-check@datamodo.dev` in the dev branch's `neon_auth."user"` (was empty).
  Leftovers a human may want to clean: the 2 old users in the prod branch's auth
  (signed up before the fix; passwords are hashed and unrecoverable — reset or delete in
  Neon console → Auth), and the throwaway `wiring-check@datamodo.dev` in dev.
- **2026-07-10** — **Fixed "invalid origin" on sign-in/sign-up at www.datamodo.dev.**
  Neon Auth rejects state-changing auth calls whose browser Origin isn't in the
  branch's `trusted_origins`. The lists were mirror-mismatched: the **prod** branch
  endpoint (which the www.datamodo.dev deployment actually talks to) trusted
  `https://datamodo.dev` but not `https://www.datamodo.dev`; the **dev** branch had
  the reverse. Added the missing origin to each branch via the Neon API. **Verified
  live**: `POST /api/auth/sign-in/email` from origin `https://www.datamodo.dev` went
  from `403 INVALID_ORIGIN` to `401 INVALID_EMAIL_OR_PASSWORD` (credentials now being
  checked). Notes for a human: (a) apex `datamodo.dev` has **no DNS record** — only
  www resolves; add the apex in Vercel if it should work. (b) the deployment behind
  www.datamodo.dev uses the **prod** Neon Auth endpoint — if datamodo.dev is meant to
  be the dev environment, point its Vercel env's `NEON_AUTH_BASE_URL` (and
  `DATABASE_URL`) at the dev branch instead.
- **2026-07-10** — **Dashboard catch-up to the landing: knowledge GRAPH view, PR-style
  review queue, BYOK wired live.**
  - **Knowledge graph view** ([knowledge-graph.tsx](app/dashboard/knowledge-graph.tsx)):
    the Data ▸ Knowledge tab gains a **Cards / Graph** toggle. Nodes = canonical
    **entities** (kind-colored chips); edges = **relationship facts** (facts whose value
    is another entity), labelled by predicate on hover. Attribute facts stay in the
    click-to-pin inspector (facts + natural keys + clickable links) — they'd drown the
    canvas as nodes. Interaction ported from the design-system KnowledgeGraph: drag to
    rearrange (edges follow live), hover lights the neighborhood, keyboard accessible.
    Layout is deterministic (kind clusters + a short synchronous force relaxation, seeded
    PRNG — no jitter between visits); caps at the 60 most-connected entities (footer
    says how many are hidden). Search filters the graph too. `KnowledgeFactView` gained
    `refId` (edge target) in [types.ts](lib/datamodo/types.ts)/[knowledge.ts](lib/datamodo/knowledge.ts).
    Verified: SSR render smoke test (nodes/edges/labels/bounds) + tsc + build green.
    **NOT yet eyeballed in-browser** (needs login).
  - **Review queue reads like a pull request** ([review-studio.tsx](app/dashboard/review-studio.tsx)),
    matching the landing's "Review the changes. Merge when it's right." section: an
    OPEN header with `graph:main ← inbox/new-facts` branch chips and +/~/⇄ counts,
    grouped one-line **diff rows** (mono summary, confidence %, impact ×n, inline ✓/✕),
    click a row to expand the full evidence card (the existing merge/conflict/extraction
    layouts, unchanged), and a merge bar with "Approve all & merge". Same live wiring
    (`GET /api/knowledge/reviews`, accept/reject POST; simulated preview when empty).
  - **BYOK is now real** ([llm-for-user.ts](lib/datamodo/llm-for-user.ts)): extraction
    (`runExtractionForItem`), entity adjudication (`adjudicateMatch`, threaded through
    `ingestExtraction`/`resolveEntity`) and spreadsheet→graph import all resolve the
    owner's provider: compute mode `byok` + saved key → `getLlmProvider(aiProvider, key)`
    (their OpenRouter/OpenAI/Anthropic account); otherwise the platform env key. The
    SettingsModal UI + `user_settings.byok_key` already existed — this connects them.
    Fails safe: settings lookup errors fall back to the platform provider.
- **2026-07-10** — **New landing page + Datamodo Design System imported.** The
  claude.ai/design project "Datamodo Design System" is now mirrored in the repo at
  [design/system/](design/system/) (brand guide `readme.md`, `SKILL.md`, `--dm-*` tokens,
  8 channel logos, all 16 React components with `.d.ts` + `.prompt.md`, and the `landing/` +
  `app/` full-page templates; `NOTES.md` lists the deliberately-skipped Design-pane infra).
  A repo Claude skill **`.claude/skills/datamodo-design/`** makes agents load the brand
  rules (lowercase "datamodo", cream/ink/coral, Geist Mono for data) on any UI work.
  **The landing page was fully replaced** with a native Next.js port of the new
  `templates/landing/` design: [app/page.tsx](app/page.tsx) +
  [components/landing/](components/landing/) (ThreeSteps rAF timeline, SourceGraph
  per-channel fact graphs w/ LinkedCards connectors, interactive PR-style ReviewFlow,
  UseCases/AskAnything/Trust/CTA) + [app/landing.css](app/landing.css) (`.lp-landing`-scoped
  tokens + `lp-*` keyframes so nothing collides with dashboard/auth styles; the dead
  old-landing CSS was removed from globals.css — **dashboard and auth untouched**).
  Follow-up SEO: [app/robots.ts](app/robots.ts) (disallow /dashboard, /api),
  [app/sitemap.ts](app/sitemap.ts), OpenGraph/Twitter metadata + `metadataBase` from
  `NEXT_PUBLIC_SITE_URL`. Verified: tsc + `next build` green; hero screenshotted
  pixel-faithful; review widget interaction, robots.txt/sitemap.xml/og:tags checked live
  against `next start`. **Owed by a human:** set `NEXT_PUBLIC_SITE_URL` in Vercel
  Production (and Preview) so sitemap/OG URLs aren't the localhost fallback.
- **2026-07-09** — **Pivoting off Supabase → Neon (dev/prod branching; leaving Supabase
  long-term).** Zero users, so no data migration — porting the **schema only**. Schema
  **ported + verified on Neon** (project `still-dew-44832149`, PG18, eu-central-1): dumped
  the local `public`+`private` schema, stripped Supabase-isms (55 RLS policies, `auth.*`
  coupling, `authenticated`/`service_role` grants, `auth.users` FKs, and the
  pgmq/pg_cron/pg_net/vault objects), rewrote `extensions.`→`public.`, applied to Neon
  `prod` and `dev` — **20 tables, 0 policies**, pgvector/pg_trgm intact, `entities.embedding
  vector(1536)` preserved. Saved to [neon/schema.sql](neon/schema.sql). **Reverted** the
  just-merged pgmq/pg_cron extraction PR #26 (Supabase-specific — no pgmq/pg_net on Neon).
  Authz moves to **app-layer** (RLS dropped; scope by `org_id` in server code). Branch model:
  two standing branches **`dev`/`prod`** mirrored across GitHub ↔ Vercel ↔ Neon (no throwaway
  branches). **The app still runs on Supabase** — the rewrite (see "Neon migration plan") is
  the remaining work.
- **2026-07-09** — **Visual polish pass — texture, depth & motion (keeps the warm,
  non-techy vibe).** The signed-in app read as flat solid-color rounded rectangles;
  added a reusable motion/texture layer in [globals.css](app/globals.css) and applied
  it: **paper grain + warm radial glow** on `.dm-app`; **`.dm-card`** hover-lift with a
  soft layered shadow; **`.dm-rise`/`.dm-stagger`** staggered entrances; **`.dm-bar-fill`**
  bars that grow on paint; **`.dm-modal-in`/`.dm-fade-in`** so every `ModalShell` pops in;
  richer `primaryBtn` (top-highlight gradient + warm glow); **`.dm-bob`** gentle float on
  empty-state icons. New **`CountUp`** ([ui.tsx](app/dashboard/ui.tsx)) animates headline
  numbers (Insights tiles, Knowledge/Search counts). All motion is class-opt-in and
  **disabled under `prefers-reduced-motion`**. Verified: `next build` + typecheck clean;
  rendered against the real `globals.css` with a hovered card (grain/glow/lift/sheen/bars
  confirmed).
- **2026-07-09** — **Spreadsheet → knowledge graph (import + merge).** A user can hand
  us a table and we **infer a graph from it and merge it into the existing knowledge
  layer** — the flagship idea from the backlog. Pure, unit-tested `inferGraphFromTable`
  ([infer-graph.ts](lib/datamodo/infer-graph.ts)): each row → a subject entity (kind
  inferred from the table name), columns that name other things → relationship facts
  to referenced entities, the rest → attribute facts; id-ish columns (email/phone/
  invoice no) become natural keys that drive dedup. `importTableAsGraph` then merges
  every row through the **existing `ingestExtraction`** (entity resolution + fact dedup
  + bitemporal) — no new graph store. `POST /api/knowledge/import-graph` (xlsx upload
  via `parseWorkbook`, or a `datasetId` to graph-ify an existing table). UI:
  [ImportGraphModal](app/dashboard/import-graph-modal.tsx) — upload → merge → summary
  (new/matched entities, facts added, inferred schema in plain words), reachable from
  a Data-tab **"Spreadsheet → knowledge"** button and, per the cost note, a CTA in the
  onboarding modal (cheapest while the graph is fresh). Verified: 20/20 unit tests on
  the inference (Contacts/Invoices/known-label/edge cases) + full `next build` +
  typecheck clean + modal screenshotted. Live merge rides on the already-verified
  `ingestExtraction`. **Next:** dedupe referenced entities across rows before ingest
  (cheaper), a pre-merge preview/confirm step, and column-mapping overrides.
- **2026-07-09** — **Insights is now configurable (any measure × any axis, from your
  own facts).** Was hardcoded to `amount` by `issued_by`. New `listMeasures`
  ([analytics.ts](lib/datamodo/analytics.ts)) discovers chartable predicates from the
  user's facts — `numeric` (has value_num) vs `groupBy` (relationship or categorical
  text) — exposed via `POST /api/knowledge/analytics {op:"measures"}`. Insights view
  ([insights-view.tsx](app/dashboard/insights-view.tsx)) gains **[agg] of [measure] by
  [axis]** dropdowns that re-aggregate live; the total tile + bar list follow the
  selection (currency formatting via a name heuristic). Defaults to amount/issued_by
  when present, else the top predicates. Degrades gracefully (no numeric → hint; no
  groupables → total tile only). Verified: 6/6 unit tests on `listMeasures` +
  `next build` + typecheck clean + controls screenshotted.
- **2026-07-09** — **Search now covers the knowledge layer, not just tables.** The
  search box promised "everything your agents have captured" but only scanned
  `dataset_rows`. Added `searchKnowledge` ([search.ts](lib/datamodo/search.ts)):
  pure, ranks `KnowledgeEntityView[]` (from the existing `listKnowledge`) by distinct
  terms matched across label / kind / natural keys / each fact's predicate+value.
  `GET /api/search` now returns `entities` alongside table `hits` (knowledge fetch is
  best-effort so it never drops table results). `SearchTab`
  ([control-center.tsx](app/dashboard/control-center.tsx)) renders an **"In your
  knowledge"** section (entity cards w/ matched facts highlighted) above **"In your
  tables"**; placeholder/subtitle updated to match. Verified: 8/8 unit tests on
  `searchKnowledge` (label/fact-value/natural-key/ranking) + full `next build` +
  typecheck clean + results screenshotted.
- **2026-07-09** — **Auto-link suggestions across tables.** Relationships were
  manual-only; now we spot table pairs that share values in a column and propose the
  link the user hasn't drawn. Pure detector `suggestRelations` + fetch helper
  `getRelationSuggestions` ([relations.ts](lib/datamodo/relations.ts)): distinct
  values per linkable column (skips number/date/status), overlap → containment score,
  direction points the subset (foreign-key) side at the side that contains it, excludes
  already-linked pairs. `GET /api/relations/suggestions`
  ([route.ts](app/api/relations/suggestions/route.ts), user RLS client). UI: a
  "Suggested links" strip in `RelationshipGraph` ([control-center.tsx](app/dashboard/control-center.tsx))
  with one-click Link (→ `createRelationAction`) / Dismiss. **Seed:** added a
  `traveler` column to Trips matching Contacts names, so the demo surfaces
  `Trips.traveler → Contacts.name` (needs `supabase db reset`). Verified: 10/10 unit
  tests on `suggestRelations` (mock fixtures incl. the demo scenario) + full `next
  build` + typecheck clean + strip screenshotted.
- **2026-07-09** — **Onboarding / business-context capture (steers extraction).** The
  `saveOnboarding`/`getOnboardingContext` backend + `POST /api/onboarding` existed
  and the extraction prompt already reads it, but there was no UI (an explicit TODO).
  New **OnboardingModal** ([onboarding-modal.tsx](app/dashboard/onboarding-modal.tsx)):
  a "what does your business do?" free-text + a multi-select of what to pull out
  (invoices, contacts, meetings, …) → `POST /api/onboarding` `{businessContext,
  answers:{track}}`. Surfaced two ways in [control-center.tsx](app/dashboard/control-center.tsx):
  a persistent topbar **Context** button (shows ✓ once set) and a dismissible
  **first-run banner** shown until a context is saved. [page.tsx](app/dashboard/page.tsx)
  now loads `getOnboardingContext` and passes it in. Verified: full `next build` +
  typecheck clean; modal + banner screenshotted (Chromium) and eyeballed. Live save
  path unrun here (DB blocked) but the route + `saveOnboarding` were already in place.
- **2026-07-09** — **Insights view — the analytics backend finally has a UI.** The
  `aggregate`/`monthlySeries`/`factMetrics` layer (`POST /api/knowledge/analytics`)
  was built + verified but unsurfaced. New **Insights** sub-view under Data (third
  `Segmented` toggle: Tables · Knowledge · Insights,
  [insights-view.tsx](app/dashboard/insights-view.tsx)): headline stat tiles (total
  invoiced, things known, facts on file), a single-hue "Invoiced by vendor" bar list
  (sum of `amount` grouped by `issued_by`, direct-labelled), and an entity-mix
  breakdown by kind — all computed live from facts, no new backend. Graceful empty
  states when there are no numeric measures / no facts. Followed the dataviz skill
  (validated the reused category palette; every colored mark carries a text label so
  identity is never color-alone). **Also fixed** a shared pluralization bug
  (`company→companies`, `person→people`; was "Companys"/"Persons") in both the new
  view and [knowledge-view.tsx](app/dashboard/knowledge-view.tsx). Verified: full
  `next build` + typecheck clean; layout screenshotted (Chromium) and eyeballed. The
  DB-backed numbers themselves ride on the already-verified analytics functions.
- **2026-07-09** — **Fact provenance drill-down ("where did this come from?").** The
  Knowledge view showed only a provenance *count* per fact; now each fact with
  sources is **expandable to reveal the actual message(s)** it was extracted from —
  channel + sender + subject + the exact snippet. `listKnowledge`
  ([knowledge.ts](lib/datamodo/knowledge.ts)) now joins `fact_sources → items` and
  embeds `provenance: FactSourceView[]` per fact (new type in
  [types.ts](lib/datamodo/types.ts)); `sources` is now the real count (was optimistic
  `?? 1`). UI: expandable fact rows + `SourceRow` cards
  ([knowledge-view.tsx](app/dashboard/knowledge-view.tsx)). This makes the "parse
  from communications" story auditable — the trust layer over the smart store.
  **Seed enriched** ([seed.sql](supabase/seed.sql)): items now carry `body_preview`, a
  3rd item added, and `fact_sources` link real facts (invoice amount ×2 emails,
  issued-by, two works-for) to those messages — so the drill-down is populated in the
  demo. **Needs `supabase db reset`** locally to take effect. Typecheck clean. **NOT
  yet verified in-browser.**
- **2026-07-09** — **Real keyword search shipped (Search tab is no longer a mock).**
  The Search tab was a static fake (hardcoded question, fake `$20,750` answer, fake
  graph, fake "recent questions"). Replaced with **live keyword search over the
  user's own tables**: `searchDatasets` ([search.ts](lib/datamodo/search.ts)) —
  tokenizes the query (drops stop/question words), scans accepted `dataset_rows`,
  scores each row by DISTINCT terms matched across its cell values / column labels /
  table name, returns ranked hits with matched-cell flags. Exposed via
  `GET /api/search?q=` ([route.ts](app/api/search/route.ts), user RLS client → own
  data only). New `SearchTab` ([control-center.tsx](app/dashboard/control-center.tsx))
  has a real input, term-highlighted result cards that open the source table, empty/
  no-match states, and clickable example prompts; an honest note says plain-language
  answers with citations are still coming. Typecheck clean. **NOT yet verified
  in-browser** (needs a logged-in local session — the seeded demo's Invoices/Contacts/
  Trips give it real data to hit). Next for search: ~~NL answers + citations~~ ✅ **done
  2026-07-10** (grounded answers, see Recent changes); pg full-text / embeddings when
  volume grows.
- **2026-07-09** — **Nav simplified: Knowledge folded into Data (surface matches the
  promise).** Top nav is now **Agents · Data · Review · Search** (was 5 tabs). The
  Knowledge view is no longer a top-level tab — it's a **Tables / Knowledge**
  sub-toggle inside the Data tab ([control-center.tsx](app/dashboard/control-center.tsx),
  `Segmented` from `ui.tsx`), reinforcing "tables are *derived from* your knowledge"
  rather than making the user reason about the facts ontology up front. `KnowledgeView`
  and "Build from knowledge" are untouched — just relocated. Rationale: the product's
  value prop is "forward messages → clean tables"; the facts/entities layer is the
  engine, not a user-facing destination. Typecheck clean for the change (repo's
  pre-existing tsc errors are from absent optional deps `stripe`/`@tanstack/react-table`
  in this sandbox's partial node_modules). **NOT yet verified in-browser** (needs a
  logged-in local session).
- **2026-07-09** — **Clean Data table view + demo knowledge seeded.** Table detail
  no longer has the table-level "Review changes"/"Simulate agent update" panel
  (review is fact-level) — tables are just viewed/edited/synced (version History
  kept). `seed.sql` now seeds the demo user's knowledge layer (3 companies / 3
  people / 2 invoices + 13 facts w/ relationships + provenance) and drops the old
  table-row proposal demo. **Ran `supabase db reset`** — local demo restored
  (Invoices 4 / Contacts 3 / Trips 2 rows, 0 proposed) + knowledge populated.
  NOTE: reset gave the demo user a fresh id → re-login needed locally.
- **2026-07-09** — **Knowledge view + build-from-knowledge (Data tab caught up to
  the fact-level model).** New **Knowledge** tab ([knowledge-view.tsx](app/dashboard/knowledge-view.tsx))
  shows the canonical entities grouped by kind with their facts, relationships (→),
  natural keys, and per-fact provenance counts — lazy-loaded from
  `GET /api/knowledge/entities` (`listKnowledge` in [knowledge.ts](lib/datamodo/knowledge.ts),
  view types in [types.ts](lib/datamodo/types.ts)). Data tab now frames tables as
  "derived from your knowledge" + a **"Build from knowledge"** modal
  ([build-from-knowledge.tsx](app/dashboard/build-from-knowledge.tsx)): pick an
  entity kind + target table → runs the projection (auto-materializes rows). Nav is
  now Agents · Knowledge · Data · Review · Search. Verified: listKnowledge view
  model correct (entities/facts/refs/provenance). Not yet rendered in-browser.
- **2026-07-09** — **Review is FACT-level; retired table-level review.** The
  Review tab shows only knowledge decisions — entity merges, fact conflicts,
  low-confidence extractions ([review-studio.tsx](app/dashboard/review-studio.tsx)).
  The old table-row Versioning tab is retired (`versioning.tsx` unused). **Tables
  are a projection**, not a review surface: `projectEntitiesToDataset`
  ([project.ts](lib/datamodo/project.ts)) now **auto-materializes** accepted rows
  directly (adds → `accepted`, updates in place; idempotent, human-edits protected)
  instead of proposing them. Sidebar "Needs review" + nav badge count fact-level
  reviews (`pendingReviewCount`). (Corrects an earlier misstep that folded table
  proposals back into Review — reverted.)
- **2026-07-09** — **Connect-a-channel UI built** (surfaces the identify-once flow).
  [`app/dashboard/connections.tsx`](app/dashboard/connections.tsx) `ConnectionsModal`
  (opened from a new topbar "Connect" button): shows the email inbox address
  (copyable, "live") + WhatsApp/Slack/Teams rows with a "Get link code" button
  that mints + displays a single-use code with per-channel instructions. Backed by
  `createChannelLinkCodeAction` ([actions.ts](app/dashboard/actions.ts)) →
  `createChannelLinkCode` (runs on the user's RLS client). Typechecks + compiles;
  bot handle/number placeholders until providers are configured; not yet rendered
  in-browser (needs login).
- **2026-07-09** — **Dashboard UI consistency pass** (fixed drift vs shipped backend):
  channel catalog now offers **Teams** (real adapter) and drops **Telegram** (no
  adapter) — `ui.tsx` LOGO/CH_NAMES + new `public/logos/microsoft-teams.svg`;
  settings BYOK provider adds **OpenRouter** (the backend default) — `AiProvider`
  type + `SettingsModal` + `providerLabel`; the **Review** nav badge shows the REAL
  pending count (`pendingReviewCount` from page.tsx) instead of the hardcoded
  simulated 6; removed the orphan `/dashboard/reviews` route (superseded by the
  Review tab). **Still NOT surfaced in UI** (backend exists, no UI yet): connect-
  channel link-code flow; knowledge/entities view; "build table from knowledge"
  (projection trigger); analytics/charts; onboarding business-context capture.
- **2026-07-09** — **Analytics over facts (the research's "numbers" layer) built.**
  [`lib/datamodo/analytics.ts`](lib/datamodo/analytics.ts): `aggregate` (sum/avg/
  min/max/count of a numeric measure predicate, optionally grouped by another
  predicate incl. relationships → grouped by target label), `monthlySeries` (measure
  bucketed by a date predicate), `factMetrics` (entity counts by kind + fact totals).
  Trigger: `POST /api/knowledge/analytics` `{op:aggregate|series|metrics, measure,
  groupBy?, date?, kind?, agg?}` (auth'd, org-scoped). Implemented as relational
  aggregation (fetch current facts → group/aggregate) — honors the research point
  (numbers in a relational engine, NOT the graph); **DuckDB is the documented
  drop-in scale path** behind the same functions when volume needs columnar speed.
  Verified: total/by-vendor/avg/monthly all correct on seeded invoices.
- **2026-07-09** — **Facts → tables projection (pipeline step ⑦) built.**
  [`lib/datamodo/project.ts`](lib/datamodo/project.ts) `projectEntitiesToDataset`:
  projects every entity of a `kind` into rows of a dataset, matching each column
  by key against the slug of a fact predicate (entity-valued facts → the target's
  label; numbers stay typed). Emits results as PROPOSALS through the existing
  Versioning review flow. Idempotent + safe: rows link to their entity
  (`dataset_rows.subject_entity_id`, migration `20260709100000`), re-projection
  updates instead of duplicating, human-edited rows are never clobbered, and
  entities with a pending proposal are skipped. Trigger: `POST /api/knowledge/project`
  `{kind, datasetId, labelColumn?}` (auth'd, org-scoped). Verified: fresh→adds,
  re-project→unchanged, edited fact→update, pending→skip. **TODO:** a UI to define
  the kind→dataset mapping + a "build table from knowledge" button; currently
  convention-based (predicate slug == column key) and API-triggered.
- **2026-07-09** — **Review tab now conforms to real data + wired live.** Shared
  view-model types ([lib/datamodo/review-types.ts](lib/datamodo/review-types.ts))
  used by both `listPendingReviews` and the tab. `listPendingReviews` rewritten to
  build typed per-kind payloads (merge: parsed/canonical entities+attrs+reason;
  conflict: subject/field/was/now/note; extraction: from/snippet/entities/facts)
  from real entities/facts/items. Added `extraction` review kind (low-confidence
  extractions surfaced; gated <0.75 in `runExtractionForItem`), `knowledge_reviews.item_id`
  (migration `20260709090000`), adjudicator now persists a `reason`. accept/reject
  handle all 3 kinds (extraction reject retracts uncorroborated facts). Tab fetches
  `/api/knowledge/reviews`, falls back to a labelled simulated preview when empty.
  Verified via a harness: real `listPendingReviews` returns the exact shape the UI renders.
- **2026-07-09** — **Review tab UI** ([app/dashboard/review-studio.tsx](app/dashboard/review-studio.tsx)),
  wired into the dashboard as a 4th tab in [control-center.tsx](app/dashboard/control-center.tsx).
  Uses the shared `ui.tsx` design system. Deliberately varied layout per decision
  type (merge = side-by-side comparison w/ confidence ring + impact meter; conflict
  = before→after diff; extraction = message↔understood-facts editorial), with a
  triage header + impact spotlight for flow. **Data is SIMULATED** — next step is to
  wire it to `GET /api/knowledge/reviews` + the accept/reject endpoints (shapes
  already match `lib/datamodo/reviews.ts`). Typechecks + route compiles; NOT yet
  verified in-browser (needs login). The older bare [app/dashboard/reviews/page.tsx](app/dashboard/reviews/page.tsx)
  is the real API-backed (unstyled) version — to be superseded once the tab is wired live.
- **2026-07-08** — **Provider abstraction + confidence-scored entity resolution +
  review queue + onboarding steering.**
  - **LLM provider abstraction** ([lib/llm/](lib/llm/)): `LlmProvider` interface +
    `getLlmProvider(name?, apiKey?)` factory routing on `LLM_PROVIDER` env
    (openrouter | openai | anthropic). `OpenAICompatibleProvider` (OpenRouter +
    OpenAI) + `AnthropicProvider` (Messages API). `apiKey` arg supports per-user
    BYOK. extract.ts + knowledge.ts now depend only on the interface.
  - **Semantic entity resolution** ([lib/datamodo/knowledge.ts](lib/datamodo/knowledge.ts)):
    real `adjudicateMatch` (LLM, fail-safe). Policy: trigram≥0.92 auto; else LLM
    confidence ≥0.85 → auto-resolve to canonical (logged accepted review); ≥0.55 →
    new entity + **pending merge proposal**; below → new. Blocking recall broadened
    (substring) so "Acme" finds "Acme Group". Verified: "Acme"→"Acme Group" @0.9
    auto-resolved (no dup); fact conflicts logged too.
  - **Review queue** ([lib/datamodo/reviews.ts](lib/datamodo/reviews.ts) + migration
    `20260708150000`): `knowledge_reviews` (entity_merge | fact_conflict), **ranked
    by impact** (edges/rows affected). `listPendingReviews` (impact desc),
    `acceptReview` (performs `mergeEntities`), `rejectReview` (reverts fact
    supersession). Exposed via `GET /api/knowledge/reviews`,
    `POST /api/knowledge/reviews/[id]` {accept|reject}, and a minimal page
    [app/dashboard/reviews/page.tsx](app/dashboard/reviews/page.tsx). Verified:
    ranking (impact 4 before 1) + accept→merge (`merged_into` set).
  - **Onboarding steering**: `user_settings.business_context`/`onboarding` +
    `saveOnboarding`/`getOnboardingContext` ([settings.ts](lib/datamodo/settings.ts)),
    injected into the extraction prompt (`runExtractionForItem` loads it per owner),
    saved via `POST /api/onboarding`. **UI note:** reviews page + onboarding form are
    minimal/unstyled and NOT yet verified in-browser (need a logged-in session).
    **Still TODO:** embeddings (Tier 1b) for acronym/paraphrase recall; controlled
    predicate vocabulary; wire onboarding capture into the signup flow.
- **2026-07-08** — **LLM extractor built + working end-to-end** (step ⑤+⑥ live).
  [`lib/llm/openrouter.ts`](lib/llm/openrouter.ts) (OpenRouter client, fetch-based,
  429/5xx retry+backoff, response_format opt-in via `structured` flag) +
  [`lib/datamodo/extract.ts`](lib/datamodo/extract.ts) (`extractFromMessage`:
  flat LLM schema → mapped to `Extraction`, few-shot prompt, confidence-gated
  escalation; `runExtractionForItem`: item→analyzing→analyzed, reads body blob,
  calls `ingestExtraction`). Verified live on a real email: extracted 3 entities
  (invoice/org/person w/ natural keys) + 5 facts w/ entity refs, folded into the
  knowledge layer; re-run resolved all entities (0 created) + deduped facts.
  **Provider:** OpenRouter, key in `.env.local`. **Account is free-tier/no-credits**,
  so paid models 402; using free `cohere/north-mini-code:free` (reasoning model —
  needs maxTokens ≥4096; response_format OFF for free models — they return empty
  with it; needed a few-shot example to extract at all). Most other free models
  are 429-rate-limited. **Recommend ~$10 OpenRouter credit** → unlocks
  `deepseek/deepseek-v4-flash` (~$0.09/M, reliable, structured outputs) — set
  `OPENROUTER_EXTRACT_MODEL`/`OPENROUTER_ESCALATE_MODEL`.
  **Known limitation:** LLM predicate-name variability (`amount` vs `invoice_amount`)
  produces different `claim_key`s → fact dedup misses near-duplicates. Fix: a
  controlled predicate vocabulary / canonical-predicate mapping (TODO). Entity
  resolution is robust across runs.
- **2026-07-08** — **Knowledge layer skeleton built + tested** (the canonical
  facts store). Migration `20260708140000_knowledge_layer.sql`: `entities`
  (canonical, mergeable, per-org, pg_trgm + pgvector/HNSW indexes),
  `facts` (append-only, bitemporal `valid_from/valid_to`, `claim_key`,
  supersession), `fact_sources` (provenance/support), + `knowledge_match_entities`
  trigram blocking fn. Resolution/dedup logic in [`lib/datamodo/knowledge.ts`](lib/datamodo/knowledge.ts):
  tiered entity resolution (Tier 0 deterministic key + Tier 1 trigram blocking
  implemented; Tier 2/3 Splink/LLM adjudication stubbed behind `adjudicateMatch`),
  `claim_key` fact dedup + contradiction→supersession, `mergeEntities` for async
  compaction, `ingestExtraction` orchestrator (the entry point the extractor will
  call). Verified: re-observe→dedup, contradiction→supersede (history kept),
  case-variant→same canonical entity, all per-org. **Embeddings (Tier 1b) + the
  LLM extractor that produces `Extraction` are still TODO** (Phase A other half).
- **2026-07-08** — **Slack + Teams inbound connectors** built + tested locally,
  reusing the shared identify-once infra. [`app/api/webhooks/slack/route.ts`](app/api/webhooks/slack/route.ts)
  (URL-verification challenge + `v0=` HMAC-SHA256 signing-secret verify + 5-min
  replay guard; identify by Slack user id) and [`app/api/webhooks/teams/route.ts`](app/api/webhooks/teams/route.ts)
  (Bot Framework JWT verify via `jose` against Microsoft JWKS, issuer/audience
  checks; identify by AAD object id). Both route by SENDER handle and skip
  capturing the activation message. Env: `SLACK_SIGNING_SECRET` (+`SLACK_BOT_TOKEN`
  for files); `MICROSOFT_APP_ID`. Teams has a `NODE_ENV!=='production'`-only
  `TEAMS_DEV_SKIP_AUTH=1` bypass for local testing. Still TODO for all channels:
  Connect-UI to mint codes; real provider E2E (Slack app / Azure Bot); Slack &
  Teams attachment binary download (metadata captured for Teams).
- **2026-07-08** — **KG architecture decided via research** (see "Knowledge layer"
  below): NOT a standalone graph DB. Canonical = append-only versioned **facts**
  in Supabase Postgres; graph is a *derived index* (recursive CTEs / pgRouting);
  numbers go to **DuckDB** (attaches to Postgres, no copy); **pgvector** for
  semantic search. Founder's "graphs are bad at numbers" instinct confirmed by
  benchmarks. Full report in session history.
- **2026-07-08** — **WhatsApp inbound connector (Twilio BSP)** built + tested on
  the local stack. Model: one shared WhatsApp number, users identified by sender
  `wa_id`, bound once via a link code. New: [`app/api/webhooks/whatsapp/route.ts`](app/api/webhooks/whatsapp/route.ts)
  (X-Twilio-Signature HMAC-SHA1 verify → normalize → in-process `ingest()`),
  [`lib/datamodo/channels.ts`](lib/datamodo/channels.ts) (mint/redeem link codes,
  bind `ingest_sources`), migration `20260708130000_channel_link_codes.sql`.
  Verified: bad-sig→403, code→binds active source, message→captured item,
  unknown sender→refused. Routes by SENDER handle (shared bot), not recipient.
  **Env needed:** `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_WHATSAPP_WEBHOOK_URL`.
  Still TODO: a "Connect WhatsApp" UI that calls `createChannelLinkCode` + shows
  the code/`wa.me` link; real Twilio sandbox test; Teams/Slack adapters (same pattern).
- **2026-07-08** — Connector capture smoke-tested end-to-end on the local stack
  (synthetic email envelope → `/api/ingest` → `items`/`blobs`/`attachments` +
  Storage). Verified item `stored`, attachment persisted, blob dedup/ref-counts,
  idempotency (same `externalId` → deduped), and 401 on bad secret. Reusable
  script: [`scripts/ingest-smoke.sh`](scripts/ingest-smoke.sh).
- **2026-07-08** — **Fixed latent bug**: `service_role` had no DML grants on app
  tables (migrations only granted `authenticated`; platform default privileges
  didn't cover service_role), so the whole ingest path 500'd with `42501`.
  Added migration `20260708120000_grant_service_role_dml.sql`.

## Neon migration plan (in progress — started 2026-07-09)
Leaving Supabase for **Neon** (Postgres 18 + cheap branching) + **Neon Auth**. Zero users →
schema-only port, no data/auth migration. All work lands on `dev`, promotes to `prod` (apply
the same migration SQL to `prod` — Neon branches don't git-merge DDL).

- ✅ **0. Schema port** — done + verified on Neon `prod`/`dev` ([neon/schema.sql](neon/schema.sql)).
- ✅ **1. DB access → Prisma** — done. `prisma db pull` from Neon → 20 models
  ([prisma/schema.prisma](prisma/schema.prisma)); [lib/prisma.ts](lib/prisma.ts) singleton over
  `@prisma/adapter-neon`. All **17 `lib/datamodo/*` modules ported** off supabase-js to Prisma
  (delegate = table name, fields snake_case) + all call sites updated (dropped the leading
  client arg). Prisma `Date`/`JsonValue` vs the app's string types bridged with `as unknown as`
  casts — **runtime date-serialization is a follow-up to verify when the app runs**. `tsc` clean
  + `next build` green. Remaining `@supabase` usage is only the auth (`utils/supabase/*`,
  `app/auth/confirm`) and storage (`lib/ingest/store.ts`) layers → steps 2 & 5.
- ✅ **2. Auth → Neon Auth** — done (compile-verified; not yet run live). **Better Auth**,
  provisioned; email+password + Google (shared creds), verification off. `@neondatabase/auth`
  SDK; [lib/auth/server.ts](lib/auth/server.ts)/[client.ts](lib/auth/client.ts)/[session.ts](lib/auth/session.ts);
  [/api/auth/[...path]](app/api/auth/[...path]/route.ts) handler; [proxy.ts](proxy.ts) protects
  `/dashboard`. `app/auth/actions.ts` → `auth.signIn/signUp/signOut`; GoogleButton →
  `authClient.signIn.social`; all `db.auth.getUser()` → `getSessionUser()`. Deleted
  `app/auth/{callback,confirm}` + `utils/supabase/{server,client,middleware}`. Better Auth user
  ids are **uuid** → drop straight into our columns, no schema change. `tsc` + `next build` green.
  **Owed by a human:** GitHub OAuth needs your own OAuth-app client id/secret (no shared creds).
- ✅ **3. App-layer authz** — folded into step 2: `requireUserOrg()`/`getSessionUser()` in
  [lib/auth/session.ts](lib/auth/session.ts); all DB scoped by `org_id` in code (RLS gone).
- ✅ **4. Signup side-effects** — folded in: `requireUserOrg()` lazily provisions personal org
  + profile + settings + inbox on first sign-in (covers email + OAuth).
- ⬜ **3. App-layer authz** — RLS is gone; central `requireUser()` and always filter by
  `org_id` in server code.
- ⬜ **4. Signup side-effects** — reimplement the old `handle_new_user` trigger in app code:
  on first sign-in create `profiles` + personal `organizations` + `organization_members` +
  `user_settings` + a `forwarding_addresses` inbox.
- ✅ **5. Storage + remaining admin-client DB writes** — done (code). `store.ts` fully
  ported: DB → Prisma, storage → an **S3-compatible adapter** [lib/storage/blob.ts](lib/storage/blob.ts)
  (`putBlob`/`getBlob`, `AWS_*` env). 9 remaining `createAdminClient` sites cleaned
  (dead ones removed; `billing/webhook` `user_settings` write → Prisma). **`utils/supabase/`
  deleted; all `@supabase/*` SDK deps removed — zero `@supabase` imports in app/lib.** `tsc`
  + `next build` green. **⚠️ Storage not provisioned:** chosen target **Neon Object Storage**
  is private-preview + **us-east-2 only**, but our DB is **eu-central-1** → not usable yet.
  The adapter is S3-generic, so wiring is just env vars once we have Neon Storage access **or**
  fall back to R2/S3. Ingest blob archival is non-functional until then (ingest isn't live yet).
- ✅ **6. Extraction loop (Neon way)** — done + **verified live on Neon**. Queue =
  `claimStoredItems()` in [extract.ts](lib/datamodo/extract.ts) — one atomic `UPDATE … WHERE id IN
  (SELECT … FOR UPDATE SKIP LOCKED) RETURNING id` (stored→analyzing, no double-claim; no pgmq).
  Consumer [/api/jobs/extract-tick](app/api/jobs/extract-tick/route.ts) (CRON_SECRET-gated) claims
  a batch and runs `runExtractionForItem` per item. Scheduler =
  [.github/workflows/extract-cron.yml](.github/workflows/extract-cron.yml) (every 5 min → curls the
  consumer; needs `APP_URL` + `CRON_SECRET` GitHub secrets). **Verified:** inserted a stored item →
  endpoint returned `{claimed:1,processed:1,failed:0}`, item reached `analyzed`, LLM ran, facts
  folded via Prisma (0 from nonsense text = correct); 401 without the secret. ~~TODO: orphan
  recovery + failed-item retry~~ ✅ **done 2026-07-10** (`recoverExtractionQueue`; the
  `items_claim_tracking` migration is applied to all Neon branches — see Recent changes).
  Remaining: throughput is 3/5min (raise `EXTRACT_BATCH` / add an internal drain loop).
- 🔨 **7. Env/config + prod cutover** — **prod flipped to Neon** (PR #27 merged; Vercel
  production deploy `READY`). Fixed a Vercel build gap: added `postinstall: prisma generate`
  (Vercel does a clean install and never generated the client). Vercel Production env set
  (`DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `CRON_SECRET`). **Verified
  on prod:** app boots (200), `/dashboard`→`/login` (Neon Auth middleware works), build green.
  **Owed by a human:** (a) **`CRON_SECRET` mismatch** — Vercel prod value ≠ generated one, and
  GitHub Actions `CRON_SECRET`/`APP_URL` unset → set the SAME value in both so the extraction
  cron authenticates; (b) a browser **signup on prod** to confirm the `DATABASE_URL`→Neon
  runtime path (couldn't be tool-tested — browser sandboxed to localhost; identical to the
  verified local flow). **Still ⬜:** Neon `dev`→Vercel Preview env; CI (Prisma-migrate on a
  Neon branch + typecheck/build).
- ✅ **8. Decommission Supabase** — done. Deleted `supabase/` (migrations, seed, config),
  removed the `supabase` CLI devDependency, cleaned Supabase out of `.env.example` +
  `CLAUDE.md` + the dashboard schema-notice. Demo seed ported to
  [neon/seed.sql](neon/seed.sql) (resolves the user via `profiles.email` — Neon Auth owns the
  auth user, so sign up `user@example.com` first, then run the seed). Zero Supabase left in the
  repo except historical mentions in this file's Recent-changes log.

**Note:** the older "Next steps" below (Supabase Edge Function extraction, DuckDB, etc.) is
superseded on the infra axis by this plan; the *product* goals there still hold.

## What datamodo is

An **individual-only** product (no teams/orgs/sharing — see `CLAUDE.md`) that
turns unstructured communications (email today; WhatsApp/Teams/Slack planned)
into structured, reviewable data for the user. A user forwards/connects a
channel; we capture the raw message, extract meaning from it, and surface it as
data the user can review, correct, and use.

## Architecture at a glance

```
channel adapter (e.g. workers/email-ingest, a Cloudflare Email Worker)
   │  normalizes any channel → IngestEnvelope
   ▼
POST /api/ingest            app/api/ingest/route.ts   (x-ingest-secret gated)
   ▼
ingest()                    lib/ingest/store.ts
   ├─ resolveTarget: recipient → forwarding_addresses / ingest_sources → org+user
   ├─ storeBlob: sha256 + gzip + dedupe → Storage 'ingest' bucket + blobs table
   └─ insert items(status received→stored) + attachments
   ▼
   ┌──────────  ⛔ NOT BUILT: extraction / knowledge pipeline  ──────────┐
   │  small model triages → big model extracts → knowledge layer → tables │
   └───────────────────────────────────────────────────────────────────────┘
   ▼
dataset_rows (proposed → accepted)   lib/datamodo/datasets.ts
   review / versioning / snapshots    lib/datamodo/review.ts
```

### Key modules
- **Capture:** `lib/ingest/store.ts`, `lib/ingest/types.ts`, `app/api/ingest/route.ts`
- **Email adapter:** `workers/email-ingest/` (Cloudflare Email Worker)
- **Inbox provisioning:** `lib/datamodo/inbox.ts` (`<token>@<INBOUND_EMAIL_DOMAIN>`)
- **Structured layer:** `lib/datamodo/datasets.ts` (rows, proposals, accept/reject),
  `lib/datamodo/review.ts`, `lib/datamodo/types.ts`
- **Source registries:** `ingest_sources` (channel-agnostic) + `forwarding_addresses` (email)
- **Settings / BYOK:** `lib/datamodo/settings.ts` (`getByokKey` exists, unused),
  `lib/datamodo/plans.ts`
- **Data model:** `agents`, `datasets` (`.columns` jsonb schema),
  `dataset_rows` (`.data` jsonb blob, `source_item_id` provenance),
  `dataset_snapshots`; raw side: `items`, `blobs`, `attachments`.
  See `supabase/migrations/`.

## Current state (2026-07-08)

- ✅ **Capture pipeline** works end-to-end in code: email worker → `/api/ingest`
  → deduped blob storage + `items` rows at status `stored`.
- ✅ **Structured/table layer** complete: manual entry, .xlsx import, and a full
  proposal → review → accept → snapshot/versioning flow.
- ⚠️ **Rows are created only** by manual entry, xlsx import, and
  `simulateAgentUpdate()` (a stand-in — no live extraction).
- ⛔ **No LLM code anywhere** (no `@anthropic-ai/sdk`, no extraction worker).
  `items` status enum reserves `analyzing`/`analyzed` for this future step.
- ⛔ **Only email** is a real adapter. Slack/WhatsApp/Teams are enum values +
  logo assets only. No connector OAuth (only Supabase auth OAuth exists).
- ⛔ **No edge functions, cron, or queues.** `supabase/functions/` does not exist.

## Next steps

-4. **Projections catalog (DESIGNED 2026-07-10) — every view is a derivation of the
   knowledge vault; nothing is a second store.** Shipped today: ✅ entity pages (record
   table / document summary page), plus the pre-existing tables, smart folders, cards,
   graph, insights, search+answers. The designed remainder, in rough order of value:
   - ~~Authored notes~~ → **✅ Generated notes (shipped 2026-07-10, reframed)**: the
     user DUMPS prose via any channel; the pipeline authors the note node (distilled
     body_md + machine-made mention/about edges). No editor — authoring is our job,
     not the user's. Explicit gesture: subject `note:`/`memo`.
   - ~~Graph curation~~ ✅ **shipped 2026-07-10** — drag-to-pin persisted in
     `entities.graph_pin`, unpin in the inspector, kind-cluster hypernodes
     (session-local). See Recent changes.
   - ~~Timeline~~ ✅ **shipped 2026-07-10** — pure chronological projection
     (messages / domain dates / changes / first sightings, Upcoming section,
     per-entity filter). See Recent changes.
   - ~~Concept map~~ ✅ **shipped 2026-07-10** — concept bubbles sized by content,
     explicit + co-occurrence links, drawer to the content. See Recent changes.
   - ~~Dossier export~~ ✅ **shipped 2026-07-10** — cited markdown download on every
     entity page ("dossier ↓"); PDF later behind the same builder. See Recent changes.
   - ~~Vision tier (images)~~ ✅ **built 2026-07-10** — image attachments →
     understood thick nodes via one vision call; needs `OPENROUTER_VISION_MODEL`
     env + a live key to verify, then a requeue curl. See Recent changes.
     **Scanned-PDF OCR remains** — needs page rasterization (canvas) before the
     same vision call; images-only was the deliberate v1 cut.
   - ~~Off-template review routing~~ ✅ **shipped 2026-07-10** — drops become
     `off_template` reviews; accept replays them through ingest. See Recent changes.
-3. **Local / open-source single-user edition (DESIGNED 2026-07-10, not built).**
   Self-hosted, one user, privacy-first. ~90% of code ships unchanged because the
   seams are already provider-generic (Postgres-native schema, S3-generic blobs,
   OpenAI-compatible LLM client).
   - **Stack**: same Next.js app (`next start`, Docker) — the 60s cap + cron hacks
     vanish; local Postgres 16 + pgvector/pg_trgm (schema validated on vanilla PG16);
     `@prisma/adapter-pg` (env-switched vs adapter-neon); **filesystem blob driver**
     (`~/.datamodo/blobs/<hash>`); **`SINGLE_USER=1`** auth bypass (bind 127.0.0.1,
     auto-provision the one user — no Neon Auth); a standing **worker process**
     reusing `recoverExtractionQueue`/`claimStoredItems` in a loop; LLM = Ollama via
     the OpenAI-compatible client (BYOK-to-cloud stays the quality path); embedding
     DIMENSION must become config (local models are 768-dim vs vector(1536)).
     Packaging: docker-compose (app+db+worker); PGlite for a no-Docker v2.
   - **Connectors — push→pull inversion** (a laptop has no public endpoint; every
     connection originates OUTBOUND from the user's machine). Model: **BYOB — bring
     your own bot**: the user owns the bot/credentials on every channel, we ship
     wizards + blueprints ("send to your datamodo" UX preserved).
     · Email: IMAP pull of a dedicated mailbox/label (IDLE = near-instant) — a
       mailbox IS a user-owned bot address. Easiest, ship first.
     · Telegram: own bot via @BotFather + long-polling `getUpdates` — pure BYOB,
       zero infra. · Slack: own app from our manifest + **Socket Mode** (official
       no-public-URL path). · WhatsApp/Teams (push-only providers): **user-owned
       dead-drop relay** — a ~50-line worker deployed to the USER's free Cloudflare
       account (deploy-button; generalizes our email worker): provider webhooks →
       relay → their own KV/queue → local instance polls outbound w/ shared secret.
       WhatsApp caveat: Meta Cloud API needs a separate bot phone number; Baileys
       linked-device bridge is the unofficial no-number alternative. Teams stays
       "relay/tunnel-supported, not first-class".
     · Cross-channel UX: **"your self-chat / your bot is your inbox"** — capture
       stays gesture-based (forward/label), never account-wide slurping.
   - Effort: seams (fs blobs, pg adapter, single-user mode, worker) ~1 day; IMAP ~1
     day; Telegram ~½; Slack ~1; WhatsApp bridge ~2-3; relay template ~1.
-2. **Ontology layer — user-editable kind registry ("Categories") (DESIGNED 2026-07-10,
   not built).** The answer to "how do we structure the graph so we're not lost" +
   "users should define categories with templates the agent fills". Decision: the
   substrate stays UNIVERSAL (one node shape = `entities`, edges = facts whose value is
   an entity — verbs with confidence/valid-time/provenance already); what's missing is
   a VOCABULARY layer, not a storage change.
   - **`kinds` table** (per org): kind slug, label, plural, icon/color, plain-language
     description (steers the classifier), `fields` jsonb (template:
     `[{key,label,type(text|number|date|entity),unit?,required?,aliases[]}]`),
     `relations` jsonb (verb vocabulary: `[{predicate,label,targetKind?}]`). Seeded
     with editable builtins (person, company, invoice, document, event, concept…);
     users add their own.
   - Powers: ① extraction steering (prompt gets the category menu + field keys as
     predicate names); ② **canonicalization** post-LLM (kind `org`→`company`,
     predicate `invoice_amount`→`amount` via aliases — FIXES the long-documented
     predicate-drift fact-dedup bug); ③ navigable UI (registry order/icons/colors,
     template fields first on cards, completeness cues "invoice missing due_date");
     ④ template ⇢ table schema (makes `projectEntitiesToDataset`'s slug==key
     convention explicit; one-click "build table from category"); ⑤ growth loop
     (no-fit entities land as free-form `thing` + the agent can PROPOSE a new
     category w/ inferred template via the Review queue).
   - Templates STEER, never block — off-template facts still land (reviewable).
   - **Concepts as nodes, with a leash**: builtin `concept` kind; extraction links
     content to ≤3 concepts, prefers the user's existing list, proposes new ones via
     review (never silently). Edges `about` / `related_to`. Obsidian-style map of
     content without noun-soup.
   - **Physical layer stays Postgres + R2** (evaluated the Lance/lance-graph
     "multimodal KG in one columnar dataset" thesis, thedataquarry 2026-04: their
     "split-brain" critique targets 3-system stacks with sync drift; we are 2 systems
     joined by immutable content hashes, embeddings live IN the node row via pgvector,
     and our writes are OLTP-shaped — entity resolution, SKIP LOCKED queues,
     bitemporal supersession — which is Postgres's home turf. **lance-graph is the
     designated candidate for the "derived graph index"/columnar analytics sidecar**
     (PROJECT_STATE already treats the graph as a derived index) when multi-hop
     traversal or >100k-fact analytics arrive; Lance reads object storage, so an
     entities+facts+embeddings export to R2 is a clean later add-on, same slot as the
     documented DuckDB path.)
   - From the CocoIndex/LanceDB incremental-pipeline article: adopt the discipline,
     not the framework — we already have content-hash dedup, idempotent ingest,
     claim-key dedup and fact_sources lineage; the missing piece is an
     **`extraction_version` stamp** on items/facts so prompt/model/ontology upgrades
     can requeue ONLY stale items (delta reprocessing) instead of everything.
   - Build order: ① `kinds` registry + seeds + prompt injection + canonicalization →
     ② Categories manager UI + fields-first cards + completeness → ③ template→table
     generator + new-category review proposals → ④ concept kind + embeddings
     (Tier 1b, `entities.embedding` already in schema) + extraction_version.
-1. **Attachments → documents in the graph + smart folders — ✅ BUILT 2026-07-10**
   (see Recent changes) **except step ①: provision the blob bucket** (Cloudflare R2 or
   S3 until Neon Object Storage reaches eu; wiring is env vars only —
   `AWS_ENDPOINT_URL_S3`/`AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`BLOB_BUCKET`).
   Until then documents land as `metadata_only` nodes. Follow-ups: OCR tier for scanned
   PDFs, xlsx/docx text extraction, open/download the original from the Files card.
   The original design decision, for the record:
   - **Always keep the original.** Attachments are already captured as deduped,
     ref-counted blobs (sha256 + gzip) via `lib/ingest/store.ts` → the S3-generic
     adapter [lib/storage/blob.ts](lib/storage/blob.ts). The only blocker is
     provisioning a bucket (Neon Object Storage is us-east-2-only preview; our DB is
     eu-central-1 → use Cloudflare R2 or S3 until Neon Storage reaches eu). Nothing
     about this design changes if the bucket vendor changes.
   - **Explore it — a PDF without context is dead weight.** Pipeline: attachment →
     text extraction (PDF text layer first; OCR is a later tier) → the SAME
     `extractFromMessage` → `ingestExtraction`, with `fact_sources` provenance pointing
     at the item + page snippet. Crucially, the document itself becomes an **entity**
     (kind `document`, natural key = blob hash + filename) with relationship facts to
     what it mentions (`attached_to` → the message's entities, `about` → invoice
     #A-204, `belongs_to` → Acme Inc). The binary stays in blob storage; its *meaning*
     lives in the graph — so it shows up as a node, in search, and in provenance.
     Guardrails for big PDFs: cap extraction at the first N pages / M tokens, mark the
     document entity `partially_indexed` beyond that, never inline the binary into
     prompts.
   - **Smart folders are projections, not directories** — exactly like tables are
     projections of facts. A "folder" is a saved query over document entities'
     relationship facts ("all documents linked to Acme Inc", "all invoices from Q3").
     One document can live in many folders; folders assemble themselves as facts
     arrive; nothing is ever physically moved. This is the "Files · Acme Inc" story
     the landing page already sells.
   Build order when picked up: ① provision R2 bucket (env only) → ② pdf-text
   extraction worker step on `attachments` after `extract-tick` → ③ `document`
   entity kind + `attached_to` facts → ④ a Files sub-view (folders = kind/entity
   grouped queries) in the Data tab.
0. ~~Import a spreadsheet → infer a graph → merge into the knowledge graph~~ ✅ **done
   2026-07-09** (see Recent changes — `infer-graph.ts`, `POST /api/knowledge/import-graph`,
   `ImportGraphModal`, onboarding CTA). Follow-ups: dedupe referenced entities across
   rows before ingest, a pre-merge preview/confirm, and column-mapping overrides.
1. ~~Connector smoke test~~ ✅ **done 2026-07-08** (see Recent changes). Capture
   path verified end-to-end; service_role grant bug fixed. Real inbound email
   (Cloudflare worker + live MX) still untested — only the synthetic POST path is.
2. **Extraction pipeline** (design under discussion — see below). Target shape:
   Supabase Edge Function, channel-agnostic (keys off `IngestEnvelope`), two-model
   (cheap triage → capable extraction), output feeds `proposeAgentRows(...)` at
   `lib/datamodo/datasets.ts` and sets `items.status stored→analyzing→analyzed`.
3. **Knowledge layer (DECIDED — Phase A first; refined by 2026-07-08 research):**
   three-layer model — raw `items` → **canonical FACTS** (append-only, versioned;
   `facts(subject_entity, predicate, value, unit, ts, source_item_id, confidence,
   valid_from, valid_to, extracted_at)`) → **projections**: (a) editable user
   **tables**, (b) a **derived graph index** for relationship/provenance reasoning
   via recursive CTEs / pgRouting (NOT a separate graph DB — Apache AGE isn't
   installable on hosted Supabase; Kùzu is archived), (c) **pgvector** embeddings
   for semantic Q&A. **Numbers/aggregation go to DuckDB** (attaches to Postgres
   directly, columnar, no copy) — this is the answer to "graphs are bad at numbers."
   Bitemporal versioning modeled on Graphiti (valid-time + ingest-time; contradictions
   invalidate, never delete). Entity resolution: Splink (MIT, runs on DuckDB).
   Extraction produces a per-message summary + per-fact confidence for the review card.
   - **Phase A (now):** extraction Edge Function whose OUTPUT schema is already
     entities/facts/summary/confidence, but projected straight into `dataset_rows`
     via `proposeAgentRows`. Proves the loop, ships value.
   - **Phase B (later):** persist `entities`/`facts`/`entity_mentions` as canonical
     store, move versioning there, make `dataset_rows` a projection. Additive — no rewrite.
4. ~~Delete `simulateAgentUpdate()` once real extraction flows~~ ✅ **done 2026-07-10**.
5. Additional channel adapters — **WhatsApp done** (Twilio, needs Connect-UI +
   live sandbox test); **Teams/Slack next** (same shared-bot + identify-once
   pattern via `ingest_sources` + `channel_link_codes`).

## Local development
No local DB stack anymore — dev runs against the Neon **`dev`** branch. Set in
`.env.local` (gitignored): `DATABASE_URL` = the Neon `dev` pooled connection string,
`NEON_AUTH_BASE_URL` + `NEON_AUTH_COOKIE_SECRET`, and `OPENROUTER_API_KEY` for
extraction. `npm run dev`, then sign up (or `user@example.com`) — `requireUserOrg`
provisions the org on first load; run `psql "$DATABASE_URL" -f neon/seed.sql` for demo
data. Prod uses the Neon `prod` branch (Vercel Production env). Note: a stale
`.env.development.local` from the Supabase era can override `.env.local` — delete it.

## Conventions
- Individual-only product. Never add teams/sharing without an explicit decision.
- Keep `user@example.com` demo data seeded (`supabase/seed.sql`).
- This is a modified Next.js — read `node_modules/next/dist/docs/` before writing.
- **Update this file at the end of every state-changing task.**
