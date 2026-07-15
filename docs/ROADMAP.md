# datamodo — roadmap (next features)

> **Maintained doc — update with EVERY commit:** move items to STATE.md's
> inventory when they ship; add what the work surfaced. Ordered by value.
> Siblings: [STATE.md](STATE.md) · [FLOW.md](FLOW.md) · [MEMORY.md](MEMORY.md).
>
> Last updated: 2026-07-14

## Now (unblocks everything else)
1. **Set env** (the old "merge PR #35" step is long done): a REAL
   `OPENROUTER_API_KEY` (+ ~$10 credit for a reliable paid extract model) and
   `OPENROUTER_VISION_MODEL`, `OPENAI_API_KEY` (or `EMBEDDINGS_API_KEY`) to
   wake embeddings + semantic search, then one authed
   `POST /api/jobs/extract-requeue` (re-runs items on pipeline v2).
2. **Live-fire verification pass on dev** — the biggest genuine gap: grounded
   answers, generated notes, doc classification, vision tier, audio tier, and
   the new views have never run against a live LLM / been eyeballed in a
   browser. One session: forward a real email with a PDF + a receipt photo +
   a voice memo (needs `TRANSCRIPTION_API_KEY` or `OPENAI_API_KEY`), watch the
   pipeline, click through every view.
3. **Promote dev → prod** (also activates the both-envs cron tick fix, which
   only takes effect from the default branch).

## Explorer track (the north star — phase 1 ✅ shipped 2026-07-10)
- ~~Ego-graph Explorer~~ ✅ — walk edge to edge, natural-shape panel, edge
  inspector, breadcrumbs, jump box (4th Knowledge mode + "◍ Explore" on pages).
- ~~3D Explorer redesign~~ ✅ 2026-07-11 — Explorer v2 (Claude Design project
  "Datamodo Explorer v2") ported onto the existing pure core: depth-field
  canvas, world-reflow walk, enter-from-parent/recede animations, floating
  breadcrumb, redesigned edge inspector (confidence meter · pips · quoted
  evidence). Flat 2D radial under `prefers-reduced-motion`. Remaining from
  the same handoff, NOT implemented: Review-Studio "Approve all & merge"
  motion + Timeline polish (`DashboardExtras.jsx`, lower priority) and the
  **dashboard IA restructure proposal** (13 choices → 2 verbs — a product
  decision; see the design project's `IAProposal`).
- ~~Dashboard clarity pass~~ ✅ 2026-07-11 — Data tab: 5 views + 3 buttons →
  **Tables · ◍ Explore · Insights** + one "✦ Build ▾" menu; Timeline/Files
  nest as modes of the ONE knowledge surface (Walk is its front door).
  Still open from the design's IA proposal, deliberately not taken: Search/Ask
  as global ⌘K, exports as row actions — revisit if the rail grows again.
- ~~Node shapes, phase 2~~ ✅ 2026-07-11 — image nodes render their image,
  `bookmark` builtin kind, dataset-as-node in the Explorer.
- ~~Explorer zoom-out~~ ✅ 2026-07-13 — landed as **layers** after two
  discarded physics iterations (force-graph constellation Map → calm pass →
  replaced; user call: one zoom axis, fixed positions, no wiggle): scroll out
  on the walk → concentric BFS rings unfold around the same center to any
  depth + a dashed unlinked outer ring; permanent bearings (pure wedge
  layout, `buildLayeredEgo`), "+N more" folding per parent, click-to-walk,
  scroll-in returns to the walk. The `constellation.ts` cluster/LOD core is
  DORMANT — it is the COSMOS seam (resurrect there or delete after a quiet
  month). Left for the design pass: layered-view typography at small card
  scales, ring-label collisions, maybe a mini-map dial. Fixed 2026-07-14:
  "+N more" chips at any depth in the zoom-out now expand their members (were
  inert past the primary ring — only the walk expanded them). Enhanced
  2026-07-14: layered cards SPREAD from their parent on entry (the walk's
  enter-from-parent motion, applied to every ring — first reveal blooms all
  rings from center; a step-in spreads just the newest). Enhanced 2026-07-14:
  clicking a card while zoomed out RECENTERS in place at the same zoom level
  (was snapping back to the walk); dropped the "N hops"/"not linked yet" ring
  labels; layered edges are soft arcs bowing toward the center.
- ~~**Explorer edges at every zoom level (Feature 1 — clickable, label-less
  when zoomed out)**~~ ✅ 2026-07-14 *(user ask)*: the LAYERED (zoomed-out)
  edges are clickable — a fat transparent hit path opens the SAME fact
  inspector as the base walk (the light `{from,to,predicate}` layered edge is
  rebuilt into a full `EgoEdge` from the subject's facts; cluster spokes
  expand). No predicate label when zoomed out (too much text across rings).
  `LayeredView` gained the walk's `EdgeLayer` edge contract — base + layered
  edge code unified, which set up Feature 2.
- ~~**Explorer continuous scroll with progressive edge drawing (Feature 2)**~~
  ✅ 2026-07-14 *(user ask — reversed the 2026-07-13 "zoom is DISCRETE" call)*:
  the discrete one-notch-per-ring stepper is now a CONTINUOUS scroll that maps
  directly to a FLOAT ring count and HOLDS wherever you stop (no auto-snap —
  user chose hold-partial over settle). `floor` rings are landed; the fraction
  emerges the next ring FROM THE CENTER (radius 0 → target, full blur) with its
  edges drawing outward (the emerging edge's outer endpoint travels out, so it
  reveals center→rim; opacity ramps with emergence). Only the emerging layer
  animates; landed rings stay. Layout = LERP of the two integer-ring wheels
  (`wheelGeom(floor)`↔`wheelGeom(floor+1)`), so landed rings shrink inward as
  the new ring grows and the old blurred frontier sharpens + grows for free.
  Still deterministic (fixed bearings) — a scroll-attached tween, not physics.
  Walk↔layered boundary (below 2 rings) stays a swap.
- ~~**Explorer v2 experiment — a Sigma.js + graphology renderer, PARALLEL to
  (not replacing) the existing explorer**~~ ✅ 2026-07-14 *(user ask; the spike
  shipped as the Data tab's **⊛ Graph** sub-tab, next to ◍ Explore)*: the WHOLE
  vault on one WebGL canvas — graphology holds the graph, sigma.js draws it —
  and the USER picks the layout (✦ Organic = ForceAtlas2 · ◯ Circle ·
  ◉ By kind = circlepack), all deterministic (circular seed, no randomness).
  Unlike the Explorer it is NOT centered on one node. The open questions
  resolved: (1) nodes are tiny CARDS, not dots (custom-rendering pass, user
  ask same day: a custom WebGL node program draws rounded rectangles — paper
  fill, kind-colored frame, the walk's card grammar in miniature — with
  matching canvas label/hover drawers), and the FULL card richness lives in
  the Explorer's own natural-shape SIDE PANEL on the right (record table,
  relationships, markdown body with live wikilinks via `EntityPageBody`;
  "◍ Walk" hands the node to the Explorer, "Full page ›" opens the page);
  (2) the brand look = sigma settings + reducers (cream canvas, warm curved
  edges via `@sigma/edge-curve`, coral-lit focus neighborhood that dims the
  rest) + the card program; (3) it feeds from `entities`/`facts` via a new
  pure core `buildVaultGraph` that reuses the ONE `buildAdjacency` rule. Edge
  click opens a light link inspector (every predicate on the pair, endpoints
  clickable; NO labels drawn on edges — standing rule). Fails soft without
  WebGL. Gotcha for posterity: sigma 3.0.3's `stagePadding` setting misaligns
  the picking buffer — every click reads as stage — so it stays at default.
  New deps: `graphology`, `graphology-layout`, `graphology-layout-forceatlas2`,
  `sigma`, `@sigma/edge-curve` (louvain skipped — kind colors carry the
  reading). Still open from the experiment: the side-by-side KEEP/KILL call
  (both surfaces are live to compare) and a worker for ForceAtlas2 at real
  whole-vault scale.
- ~~On-demand synthesis~~ ✅ 2026-07-11 — "✦ Synthesize" on any entity page
  with ≥2 connected bodies of content → cited note into `body_md`.
- ~~Audio tier~~ ✅ 2026-07-11 — audio attachments transcribe (fail-soft
  Whisper-shaped client) → classify-first document pipeline → thick node whose
  page is PLAYER (streams the original) + summary + transcript; passages land
  in doc_chunks. Dormant until `TRANSCRIPTION_API_KEY`/`OPENAI_API_KEY` is set;
  never live-fired against a real API yet.
- ~~Graph as the answer surface~~ ✅ 2026-07-12 (user call: research + derived
  shapes before the WOW visuals) — three prompt-shaped projections:
  1. **Answer → graph highlight**: "◍ See in graph" on every grounded answer
     opens the walk with the cited nodes haloed, edges between them lit, and a
     chip row to hop cite-to-cite (row citations resolve via
     `subject_entity_id`).
  2. **Derive a table from the graph**: plain-language request → LLM designs a
     spec over the graph SCHEMA → deterministic rows → preview → real dataset.
  3. **Folder structure from the graph**: plain-language request → LLM files
     documents+notes into a folder plan (inventory only) → tree preview →
     .zip with originals + markdown nodes + README.
  Follow-ups, not built: highlight the exact matched FACTS (not just edges
  between cited nodes); re-derive/refresh action on derived tables when the
  graph grows; folder export straight to Drive/Dropbox.

## Next build tracks (pick after the above)
- **MCP server / connectors — run datamodo on a Claude SUBSCRIPTION, no API
  key** (user ask 2026-07-14). **PHASE 1 ✅ SHIPPED 2026-07-14**: Streamable-
  HTTP endpoint `app/api/mcp/[transport]` (`mcp-handler` + `@modelcontext-
  protocol/sdk`, stateless — no Redis/SSE) with the core loop: READ
  `list_kinds` · `search_entities` (resolution candidates — GraphRAG's
  `linkQueryEntities` seeds first) · `get_context` (graph-first evidence) ·
  `pending_reviews`; WRITE `submit_extraction` (strict zod contract in
  `mcp-extraction.ts` — dangling localIds/bad dates bounce back with fixable
  messages; the source lands as an `upload` item `meta.via="mcp"` marked
  `analyzed` so the cron never re-extracts it; then the SAME deterministic
  `ingestExtraction` — adjudication fail-soft without a server key) ·
  `resolve_review` (same side-effects core). AUTH phase 1: per-user
  HMAC-DERIVED bearer tokens (`mcp-token.ts` — zero schema change, stateless;
  trade-off: revocation = rotate `MCP_TOKEN_SECRET`); Settings → "✦ Connect
  Claude" reveals URL + token + the `claude mcp add` one-liner. Verified
  against a running server: initialize/tools-list/401s. PHASE 2 — pull model + reads ✅
  SHIPPED 2026-07-14: `process_inbox` (raw `stored`/`failed` items with their
  text — the client extracts on the sub and files with the item's id;
  read-only until `submit_extraction` lands, so cron and MCP never double-
  process), `get_entity` (one entity's full record — facts + confidence +
  body_md), and `submit_extraction` gained an optional `itemId` to attach to
  a queued item (org-validated) and mark it `analyzed`. STILL open: OAuth
  (claude.ai connectors' dynamic client registration + per-user revocation),
  `query_graph`, MCP `sampling` for the escalation policy. Honest caveats, revised after discussion: the two-model
  confidence escalation is NOT really lost — (a) it existed for OUR API
  cost, and sub inference runs permanently on a frontier model anyway;
  (b) MCP `sampling/createMessage` lets the SERVER request client
  completions with model-preference hints — the proper home for the
  escalation policy where clients support it (progressive enhancement;
  Claude Desktop support limited today; Claude Code subagents can do literal
  two-model passes); (c) `submit_extraction` can soft-reject with "re-examine
  these low-confidence parts" → the tool loop IS the escalation. What truly
  remains: client-reported confidence is uncalibrated → the server re-scores
  deterministically (template conformity, resolution ambiguity) when routing
  to Review; embeddings still want a server key (fail-soft to trigram).
  **Monetization framing (user question 2026-07-14: "what makes users pay if
  they can use the MCP directly?")**: MCP is a CLIENT, not the product —
  every tool call hits our hosted vault, so sub-powered users are the
  cheapest to serve (zero inference cost; LLM margin was already given away
  by BYOK). Pay-for, in defensibility order: (1) ALWAYS-ON CAPTURE (inbox
  address, WhatsApp/Slack/Teams bots, cron — server-side by nature, the
  habit loop, the cleanest paywall line); (2) the trustworthy vault
  (resolution, bitemporality, provenance, reviews — a chat-with-memory can't
  answer "unpaid Acme invoices as of March, with sources"; switching cost
  compounds with data); (3) the surfaces (tables/explorer/lenses/insights/
  sync); (4) hosting convenience. Natural packaging: Free = MCP + small
  capped vault (acquisition funnel through every Claude subscriber); Pro =
  channels + volume + outbound sync; Cloud-LLM tier stays for the key-less;
  local+Ollama edition = open-core valve. Known trade to decide when the
  local edition ships: it open-sources the hard deterministic core —
  distribution vs exclusivity; the cloud moat is then channels + hosting +
  accumulated data.
- ~~**Ollama as a first-class provider (keyless)**~~ ✅ 2026-07-14 — for the
  local edition AND cloud users pointing BYOK at their own server: (1)
  `getLlmProvider("ollama")` rides the OpenAI-compatible provider with
  `keyless: true` (no auth header without a key; a key still rides along for
  authed proxies), `LLM_PROVIDER=ollama` + `OLLAMA_BASE_URL`/`OLLAMA_API_KEY`/
  `OLLAMA_*_MODEL` env (defaults llama3.1 / llava), bare URLs normalized to
  `/v1`; (2) Settings gained the "Ollama" provider option — the BYOK field
  becomes a SERVER URL (same stored column, different meaning; `llm-for-user`
  routes it as `baseUrl`), with tunnel guidance in the helper text; (3)
  embeddings + transcription count a custom BASE_URL as configured without a
  key (keyless local servers), and `EMBEDDINGS_DIMENSIONS` passes the OpenAI
  `dimensions` param. ⚠ Embedding dimension contract: the columns are
  `vector(1536)` — a 768-dim model (nomic-embed-text) fails soft at store
  time; widening the column is a local-edition follow-up (needs DDL). Not
  live-fired against a real Ollama daemon (none in the sandbox) — transport
  verified with stubbed-fetch unit tests.
- ~~**Review tab = ALL change, pending and past**~~ ✅ 2026-07-14 (user call
  same day — REVISED the 2026-07-11 IA split): Review now has its own flat
  toggle — **✓ Pending · ⎇ Commits · ◷ Timeline** (Timeline MOVED here from
  Data; the Data toggle shrank accordingly). ⎇ Commits is the GIT-style
  history: pure `buildCommitLog` in `timeline.ts` (one commit per extraction
  run; the facts it wrote are the diff — a supersession renders `~ was → now`,
  the rest `+ added`; runs that wrote nothing aren't commits; `entityId`
  filter ready for blame), served by `?view=commits` on the timeline route,
  rendered by `CommitLogView` (short-id chip · channel · +N ~M counts ·
  expandable diff lines). Still open from this track: per-entity BLAME (grow
  the entity page's "◷ History" block from the commit log's entity filter)
  and a richer supersession diff view.
- ~~**Chat review bubbles: full PR fidelity**~~ ✅ 2026-07-14 (user call same
  day): ONE review-card core now renders every review's EVIDENCE —
  `ReviewCardBody` in `app/dashboard/review-card.tsx` (merge side-by-side +
  match% + reason, conflict was→now diff, extraction snippet+facts,
  off-template facts, category proposal samples+drafted template) — under two
  SKINS: `PAPER_SKIN` (Review Studio, white on cream) and `INK_SKIN` (the
  chat bubble — the design keeper: warm ink, ONE coral accent, tones lifted
  for dark-surface contrast). Studio's five cards became header + shared
  body + footer (`CardShell`); the chat bubble shows the full evidence under
  each numbered question (`GET /api/chat` now also returns the typed
  `ReviewItem`s via `listPendingReviews`, matched to the questions).
  Surfaces keep their own chrome and action labels; accept/decline
  side-effects core unchanged (`review-inbox.ts`). The two renderings can no
  longer drift.
- **Outbound sync — push datamodo's projections into the USER'S infra**
  (user ask 2026-07-14). Philosophy fit: the vault is the product and every
  view is a projection — external systems are just MORE projection targets.
  Phase 1 is ONE-WAY push (no two-way conflict handling): (a) tables →
  Google Sheets, or the user's OWN database (Postgres first — we already
  speak it; generic via a connection string); (b) folder-lens trees + original
  files → Google Drive / OneDrive / SharePoint / local filesystem (the
  shipped `folder-export` .zip pipeline is the seam — same plan, different
  writer; absorbs the "folder export straight to Drive/Dropbox" follow-up);
  (c) dossiers/notes as markdown. Design rules: every connector is a WRITER
  behind one interface (like `lib/storage/blob.ts`); idempotent re-push
  (upsert by stable ids, never duplicate); and EACH connector is designed
  twice — cloud edition (OAuth per user) and local edition (fs paths, no
  OAuth). Two-way sync only later, and only where review-gating can protect
  the vault.
- ~~**Graph-first retrieval (GraphRAG) — answer from `facts`, vectors as
  fallback.**~~ ✅ 2026-07-14 — grounded answers (`/api/search?answer=1`) now
  start from the graph, not from chunk similarity:
  1. ~~Entity-link the query~~ ✅ — TEXT leg (`linkQueryEntities`, pure: label/
     natural-key coverage, deliberately stricter than keyword search — a seed
     must be NAMED) + SEMANTIC leg (`annLinkEntities` in knowledge.ts: ANN over
     `entities.embedding`, current-space filter, sim ≥ 0.35; ONE query
     embedding shared with the chunk leg).
  2. ~~Traverse `facts`~~ ✅ — `expandFromSeeds` (pure, the ONE `buildAdjacency`
     rule): seeds' facts + best neighbors' facts (ranked by seed-tie weight),
     seed-touching facts first then by confidence; a neighbor's edges name
     hop-2 entities by label. Rides the existing KnowledgeHit shape into
     `buildAnswerContext` (merged via `mergeKnowledgeHits` — seeds outrank
     keyword hits, keyword-only hits survive; entity budget 6→8). Current
     claims only (listKnowledge already filters `valid_to IS NULL`); an
     explicit as-of date is a later step.
  3. ~~`doc_chunks` scoped fallback~~ ✅ — `searchChunks` takes the shared
     query `vector` + `entityIds` scope (the linked neighborhood); semantic
     chunk retrieval is scoped, keyword recall stays global.
  4. ~~Cite for free~~ ✅ — evidence rides the existing entity-citation
     machinery, so chips, "◍ See in graph", and provenance drill-down all
     work unchanged.
  Everything fails soft to the plain keyword evidence (no key → text-linking
  still works). NOT live-fired (sandbox has no DB/keys); embedding model
  stays swappable per the one-space rule. Later: as-of-date answers,
  `fact_sources` snippets inline in the context.
- **Address a specific agent in Chat (agent picker + `@agent` + smart routing).**
  Chat today talks to one implicit agent; let the user choose the recipient.
  "Contacts" here = the user's OWN agents (individual-only product — no other
  people), each already carrying a name + purpose we can surface.
  1. ~~**Explicit pick**~~ ✅ 2026-07-14 — a "to" chip row in the composer
     (dropdown: ✦ datamodo general first, then each ACTIVE agent with its
     purpose one-liner) AND inline `@agent` autocomplete (pure mention core
     `chat-address.ts`: caret-aware span, prefix > word-prefix > substring
     ranking, ↑↓/Enter/Tab/Esc keyboard; picking strips the token). The
     recipient is sticky across sends; sent bubbles show a "→ agent" chip.
     The addressee STEERS EXTRACTION: items store `meta.agent_id` and
     `runExtractionForItem` resolves that agent's `purpose_text` into the
     prompt (the dormant `agentPurpose` plumbing, finally fed).
  2. ~~**Default home**~~ ✅ 2026-07-14 — no addressee = the **general
     datamodo agent** (deterministic, no meta, no steering). No silent
     guessing about ownership.
  3. **Suggested reroute, NOT silent auto-routing** *(the pushback; NOT built
     — needs a live classify call, revisit after the key lands)* — the
     general agent may CLASSIFY a drop and, if it looks meant for a specific
     agent, **suggest** the move ("This looks like it's for your Recruiting
     agent — send it there?") surfaced in the existing Review/confirm flow, not
     move it automatically. Rationale: silent misrouting drops a user's content
     into the *wrong agent's private dataset* — surprising, hard to find,
     erodes trust; and content is often ambiguous across agents. Confirm-before-
     move matches the app's established pattern (spreadsheet-import preview,
     channel reply-to-approve). Cost/latency note: only classify the no-addressee
     path, not every message. (Revisit true auto-routing later behind a
     per-user opt-in once classification precision is measured.)
- ~~**THE WOW: the graph engine — REPLAY + COSMOS**~~ **DROPPED 2026-07-14**
  (user call: remove the Cosmos/WOW feature). The replay-of-the-vault-building
  and standing Cosmos showpiece are OFF the roadmap. What survives independently:
  ring grouping (already shipped in the walk) and the continuous-scroll Explorer
  zoom (below) — the Explorer walk/zoom stays the graph surface; there is no
  separate WebGL showpiece. `lib/datamodo/constellation.ts` (the old cluster/LOD
  core kept "for the Cosmos seam") is now fully dormant with no consumer —
  delete after a quiet month. `design/briefs/wow-graph-engine-brief.md` is
  retired.
- **Landing page rework** (with **Claude Design**, not hand-rolled): fold in
  the exec summary (capture → understand → vault → views → trust story) and
  a "who it's for" section from the 2026-07-11 persona set (freelancer,
  researcher, student, recruiter, landlord, creator — each: what they
  forward / what builds itself / the payoff moment). Hero = the live Explorer
  walk/zoom over demo data (no login), not a bespoke animation.
- **Channel adapters E2E** — WhatsApp (Twilio sandbox), Slack app, Teams bot
  are code-complete but have never touched the real providers. The core pitch
  ("forward from anywhere") ends here. Now also covers the **channel
  pull-request loop** (shipped 2026-07-12, never live-fired): review pings +
  reply-to-approve. Follow-ups, not built: Slack reply interception (outbound
  ping ships; the Slack webhook doesn't parse decisions yet), WhatsApp
  interactive BUTTONS (Twilio content templates instead of "1 yes"), and an
  outbound EMAIL provider (Resend/SES) so email users get the ping too — today
  they only see the Review tab.
- ~~Spreadsheet-import follow-ups~~ ✅ 2026-07-11 — pre-merge PREVIEW/confirm
  (dry-run shows the reading + honest counts; nothing writes until confirmed),
  column-mapping overrides (kind, identity column, per-column link/fact/skip,
  link target), and cross-row reference dedupe before ingest
  (`combineExtractions` — "Acme" on 200 rows resolves once).
- **Scanned-PDF OCR** — the vision tier's deliberate v1 cut: rasterize pages
  (canvas) → same `extractFromImage` call → thick nodes for scans.
- **Local / open-source single-user edition** — fully designed (see
  PROJECT_STATE "-3"): fs blobs, `@prisma/adapter-pg`, `SINGLE_USER=1`, worker
  loop, BYOB connectors (IMAP first, Telegram, Slack Socket Mode, dead-drop
  relay for WhatsApp/Teams). ~1 week; a strategic call on timing.
  **Licensing framing (user concern 2026-07-14: "if we release the code,
  technical users + AI agents replicate the product fast")**: precision
  matters — agents can replicate from the LANDING PAGE already (this repo
  itself was agent-built in ~a week), so source was never the moat; the real
  moats are operational channel assets (approved WhatsApp number, email
  deliverability, OAuth apps — ops, not code), brand/distribution, each
  user's accumulated vault, and shipping velocity. What source release
  actually risks is self-hosting by our own technical segment (mostly
  never-payers). Sequencing decided-in-principle: (1) MCP free tier FIRST —
  distribution through every Claude subscriber with a CLOSED backend;
  (2) local edition later, and NOT necessarily open source: options are a
  closed packaged binary/Docker (most of the promise, zero source), or
  source-available FSL/BSL (read/run/modify for yourself; competing-service
  use prohibited; Sentry/n8n precedent) or AGPL + trademark; (3) the
  channel/ops layer stays closed in every scenario.
  **Code-separation — HARD REQUIREMENT (user call 2026-07-14): the local build
  ships ONLY the local surface; the cloud backend is never in the artifact.**
  A local/OSS user gets the **dashboard app + 100%-local storage and NOTHING
  else** — no landing/marketing page, no Neon Auth, no Neon/serverless storage,
  no cloud channel adapters, no billing/Stripe, no cron/ops. A runtime flag
  (`SINGLE_USER=1`) is NOT sufficient: it leaves the closed code sitting in the
  bundle where it can be read, imported, or re-enabled. The boundary must be at
  BUILD/PACKAGING level so the excluded code is physically absent from the
  local artifact — not shipped, not visible, not reachable. Required structure,
  to design BEFORE the split ships:
  - **Split the tree into an OSS-eligible CORE and a CLOSED cloud layer.** Core
    (can be open/local): the dashboard UI + pure cores (`lib/datamodo/*`
    explorer/graph/kinds/etc.), the deterministic ingest pipeline
    (`ingestExtraction` and friends), the provider-agnostic `lib/llm/*` with
    keyless/Ollama config, and LOCAL adapters — fs blob storage
    (`lib/storage/*`), `@prisma/adapter-pg` for a local Postgres/SQLite, the
    local worker loop, BYOB connectors. Closed (cloud-only, NEVER in the local
    build): the landing/marketing routes, Neon Auth (`lib/auth/*`), Neon
    serverless storage + `@prisma/adapter-neon`, the hosted channel adapters
    (WhatsApp/Slack/Teams webhooks) and outbound providers, billing/Stripe,
    cron/ops endpoints, and the MCP server host.
  - **Enforce it mechanically**, not by convention: separate workspace/package
    (or a generated OSS subtree) so the closed layer is a dependency the local
    build simply does not include; a storage/auth/channel INTERFACE the core
    imports, with the cloud implementations living only in the closed package
    and the local implementations in core; a build that fails if core imports
    anything from the closed layer (lint boundary / dependency-cruiser rule).
    Net: `git`-cloning or unzipping the local edition reveals the dashboard and
    local adapters only — the cloud/auth/landing code isn't there to see.
  This boundary is also what makes the licensing question above tractable: you
  can only open (or ship a binary of) the CORE if the core is already cleanly
  severable from the closed cloud layer.

## Smaller follow-ups (grab when nearby)
- ~~Model unification, phase 2~~ ✅ 2026-07-11 — `datasets.kind_id` binds a
  dataset to the kind it materializes (structural; plural-name match remains
  only as a fallback for pre-migration rows).
- ~~Schema view: dataset_relations~~ ✅ 2026-07-11 — table↔table links draw as
  dashed lines between the schema canvas's cards.
- Concept-map pure core (`lib/datamodo/concept-map.ts`) is dormant (view
  removed) — resurrect as an Explore lens or delete after a quiet month.
- ~~Category proposals via Review~~ ✅ 2026-07-11 — growth loop ⑤: ≥3 entities
  of an unregistered kind → ONE `category_proposal` review with an AI-drafted
  template; accept creates the category, decline never re-asks.
- ~~Semantic (ANN) chunk search behind the same `searchChunks` shape~~ ✅
  2026-07-14 — keyword UNION ANN recall over chunk embeddings (query embedded
  once; current-space filter; semantic extends recall but never outranks
  exact matches; both-paths passages boosted — pure merge in
  `passage-rank.ts`). Fail-soft: keyword-only without a key. Wakes up the
  moment the real embeddings key lands. (GraphRAG step 3 later SCOPES this
  to linked entities.)
- Dossier: PDF rendering behind the same `buildDossier`.
- Graph: persist collapsed-kind state if users ask for it (deliberately
  session-local today).
- DuckDB / lance-graph sidecar when analytics volume demands it (documented
  seam in `analytics.ts`).

## Owed by a human (ops, not code)
- Vercel env: `OPENROUTER_VISION_MODEL`, embeddings key, transcription key
  (`TRANSCRIPTION_API_KEY` or reuse `OPENAI_API_KEY`), `NEXT_PUBLIC_SITE_URL`
  (Preview + Production).
- GitHub Actions secrets: `CRON_SECRET` == Vercel's, `APP_URL`.
- GitHub OAuth app creds for Neon Auth (no shared creds exist).
- Apex DNS `datamodo.dev` (only www resolves); clean stale prod-branch auth
  users + `wiring-check@datamodo.dev` in dev.
