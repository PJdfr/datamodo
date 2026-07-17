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
> Last updated: 2026-07-16

## Recent changes
- **2026-07-16** — **Adaptive-classifiers design recorded (user discussion)**
  — the router/chunk-scorer/escalation-gate learning plan written into
  GRAPH_PIPELINE.md ("Adaptive classifiers") + ROADMAP: routing learns from
  acceptance signals (Tab-accept/✕-dismiss/re-address → per-agent centroids,
  contextual-bandit shape), chunk ranking becomes embedding-closeness to the
  user's context anchors (business context + templates + agent purposes;
  embed-before-select makes it free), escalation priors per sender later.
  Docs only. Also: feature branch merged to dev earlier today (suite 343/0
  green after full dep install).
- **2026-07-16** — **Obsidian import phase 1b: the folder picker + folder
  shapes become category proposals.** (1) New `ObsidianImportModal`
  (Build menu: "⇪ Obsidian vault → knowledge"): `webkitdirectory` picker,
  .md files read client-side (nothing unparsed uploads), dry-run preview
  (counts + folder shapes), batched confirm (100/request) with progress
  and done counts; re-running safe (hash idempotency). (2) The import's
  confirm now files each detected folder shape as a `category_proposal`
  review — DETERMINISTIC template (no AI draft, keeping the zero-LLM
  promise): field types read from the notes' actual values (number /
  ISO-date / text), wikilink-valued keys become RELATIONS, kind =
  singularized folder slug, sample labels from the folder, any-status
  dedupe (a folder's kind is proposed once, ever). Accepting snaps the
  imported notes' facts onto a real template + table. Suite 340 pass / 3
  pre-existing canvas failures; tsc clean; new files lint-clean
  (control-center's 9 warnings pre-exist). NOT live-fired — the modal is
  a prime candidate for the browser session. Still open: local CLI,
  attachment import.
- **2026-07-16** — **Obsidian vault import, phase 1 (user ask: "give access
  to the vault folder and we migrate it")** — the engine, zero-LLM by
  design: pure `obsidian-import.ts` maps notes → `note` entities
  (body_md = the note, label = basename so wikilink stubs and real notes
  converge on one key), [[wikilinks]] → mentions edges, frontmatter →
  typed facts (wikilink values → edges, lists → cardinality many),
  tags → concepts (`about`), aliases → also_known_as; `planVault` also
  detects folder SHAPES (≥3 notes sharing ≥2 keys — templates announcing
  themselves, preview-only for now). `POST /api/import/obsidian`: dry-run
  plan by default, `confirm:true` ingests via the new
  `ingestExtraction(..., {adjudicate:false})` option (deterministic
  resolution tiers only — no LLM fan-out on bulk imports; consolidation
  embeds/merges later) with content-hash idempotency (items
  external_id `obsidian:<path>`; unchanged no-op, edited supersede with
  history). 4 unit tests (frontmatter/lists/wikilinks incl. embeds+self-
  links excluded, typed mapping, localId integrity, folder shapes); suite
  340 pass / 3 pre-existing canvas failures; tsc/eslint clean. STILL
  OPEN (phase 1b/2): the folder-picker modal (webkitdirectory, batched
  client → dry-run preview → confirm) + Build-menu entry, local CLI
  `datamodo import obsidian`, folder-shape → category_proposal filing,
  attachment import. NOT live-fired.
- **2026-07-16** — **Per-row review graph preview (user ask: the PR should
  show what accepting or refusing ONE row does to the graph)** — a "◍" pill
  on every graph-shaped queue row (entity_merge / orphan_prune /
  fact_conflict) opens a modal rendering THAT decision's two futures as
  mini graph scenes with a "✓ if you accept / ✕ if you refuse" toggle:
  merge = two stars vs one canonical node absorbing the loser (ghost
  dashed-coral "merges into" edge; the loser's connections re-point as
  coral "add" edges; shared neighbors collapse to one node); orphans =
  kept vs fading dashed-red; conflict = the disputed value solid vs
  struck-and-dropped. Scenes come from pure `review-preview.ts`
  (1-hop neighborhoods from KnowledgeEntityView, capped 5/center;
  label-only fallback so the Studio's simulated mode previews too);
  layout is deterministic fixed-position SVG (no physics — Explorer
  standing rule); each future carries one plain-sentence note including
  the safety semantics ("deleted — but only the ones STILL unlinked at
  accept time"). View-models gained sourceEntityId/targetEntityId/
  subjectEntityId/orphan ids (reviews.ts). 6 new tests (re-pointing,
  shared-neighbor collapse, label-only, fade/keep roles, value swap);
  suite 336 pass / 3 pre-existing canvas failures; tsc/eslint clean.
  Built under the datamodo-design rules (paper skin, one coral accent,
  mono kickers, no second accent — drop/danger uses the studio's
  existing #C7362C reject tone). NOT live-fired; the animated
  absorb/settle motion is the deliberate design-pass follow-up.
- **2026-07-16** — **Unbounded documents + chunk-importance selection (user
  call: "no limit on PDF size — but don't put everything in the LLM
  context; classify which chunks matter")** — the 20-page/20k-char read
  caps became safety ceilings (500 pages / 600k chars / 500 chunks): the
  WHOLE document is read, chunked, embedded, and passage-searchable. The
  distill prompt now gets a SELECTION: above a 24k-char budget,
  `distillInput` (documents.ts) classifies the kind from the document head,
  then the pure zero-LLM scorer `chunk-select.ts` ranks every chunk —
  boost results/summary/conclusion headings, demote
  references/appendix/acknowledgments, reward digit/%/currency density and
  overlap with the classified kind's template vocabulary + agent purposes,
  keep openings always — and fills the budget, re-ordered by document
  position with [p.N] markers and "[… less relevant passages omitted …]"
  marks so the model knows it reads a selection. Same path for long audio
  transcripts. The "25-page paper" gap (pages 21–25 invisible) is closed:
  every page is stored and citable; only the prompt is selective. 5 new
  tests (term extraction, scoring order, budget/openings/page markers);
  suite 330 pass / 3 pre-existing canvas failures; tsc/eslint clean
  (chunks.test now builds MAX_CHUNKS+50 paragraphs). NOT live-fired.
- **2026-07-16** — **Efficiency track, step 1 (user ask: "reduce LLM bill,
  avoid degeneration, faster queries, leaner storage — small steps")** —
  six shippable steps, plan + backlog in GRAPH_PIPELINE.md "Efficiency
  track": ① TRIVIALITY GATE (pure `extract-gate.ts`, 15 tests-worth of
  cases): "ok/merci 🙏/👍" never reaches steering, priming (an embedding),
  provider resolution (a BYOK cap can't fail an ack), or extraction —
  conservative allowlist (en/fr ack tokens, ≤80 chars, no
  digit/€$/URL/@/?), attachments + note-subjects always pass; item files
  analyzed as `gate:trivial`, the chat ping still replies "Nothing to
  file". ② STABLE-PREFIX PROMPTS + CACHING: categories moved from user →
  SYSTEM prompt (per-org constant prefix), Anthropic sends ≥4000-char
  systems as `cache_control` ephemeral blocks (short ones stay strings —
  below the cacheable minimum), mock-ollama accepts both shapes; OpenAI
  prefix-caching benefits automatically. ③ ADJUDICATION FLOOR/CAP: judge
  only candidates sim ≥.25, top 3 — substring-blocking's sim≈.1 noise no
  longer buys an LLM call (and can't win a bad merge). ④ SEARCH FAST PATH:
  `listKnowledge({provenance:false})` on search/GraphRAG skips the
  fact_sources+items joins (KnowledgeHit never renders provenance).
  ⑤ PARTIAL INDEXES `20260716230000_perf_indexes.sql`
  (facts org/current + subject/current — the hot set stays tight as
  supersession history grows; **owed on dev+prod**). ⑥ SNIPPET CAP 280
  chars on fact_sources. Suite 325 pass / 3 pre-existing canvas failures;
  tsc/eslint clean on changed files. NOT live-fired.
- **2026-07-16** — **Agent lenses, phase 1 (GRAPH_PIPELINE.md P5)** — the
  last big graph-track phase: per-agent READ views over the ONE shared
  graph. `facts.agent_id` lands via migration
  `20260716220000_fact_agent_lens.sql` (FK SET NULL, partial index, one-time
  backfill joining `items.meta` agent stamps through `source_item_id`);
  `runExtractionForItem` stamps body+attachment facts in ONE fail-soft
  UPDATE after ingest; `listKnowledge` gained `{agentId}` (the lens
  chokepoint — identity never splits, a lens just filters facts) and
  `?agent=` rides `/api/knowledge/entities` (Explorer feed) and
  `/api/search` (entities/traversal/answers lens-scoped; table-row keyword
  hits deliberately global). Also this commit: `npx prisma generate` now
  runs against the hand-edited schema (typed `last_used_at`/`agent_id`;
  incidentally cleared the stale-client `kind_id` tsc errors — 107→73
  pre-existing). Suite 320 pass / 3 pre-existing canvas failures. Phase 2
  open: lens chips in the UI, agent-addressed chat defaulting to its lens,
  MCP tool params. **Migration owed on dev+prod** (fail-soft until then).
- **2026-07-16** — **Template-slot backfill + reification pattern (P4)**.
  ① The consolidation tick gained pass ②b: existing nodes that predate their
  kind's template (ingest-time fill only touches entities an extraction
  mentions) get their null slots backfilled — `ensureTemplateSlots` over the
  org's templated nodes, capped 200/org/tick, idempotent; new
  `slotsBackfilled` stat. ② P4 shipped as a PATTERN, simpler than the
  planned `reify:true` flag: after the template block, a relationship kind
  IS just a kind — the message SYSTEM prompt now teaches "a relationship
  with its OWN attributes is ITSELF an entity: own kind, stable label naming
  both ends ('James Porter — Acme Group'), entity-valued facts to each end";
  the stable label makes repeat mentions converge on ONE node via tier-0/1
  resolution, and the growth loop can propose relationship kinds from
  observed edges. `facts.attributes` jsonb deliberately not built. Suite
  320 pass / 3 pre-existing canvas failures. NOT live-fired.
- **2026-07-16** — **Template block + self-creating templates (user
  decisions)**. ① Templates' FIELDS became a guarantee (MEMORY.md decision
  revised): `ensureTemplateSlots` runs at the end of every `ingestExtraction`
  — each templated node gets placeholder facts (all-null value, confidence 0,
  `skipDuplicates` race-safe) for missing template fields, so "each row in a
  table is a node with AT LEAST the columns as metadata, possibly null"
  holds by construction. `upsertFact` fills a placeholder SILENTLY (no
  fact_conflict review — null→value is completion); `promptKindTemplate`
  adds "ATTEMPT EVERY template field". Placeholders are schema, not
  observations: excluded from orphan edge-counts (consolidate + accept-time
  recheck), ontology-health telemetry, and adjudication fact context; they
  render "—" (existing fmt fallback). ② The growth loop's drafts are now
  grounded (user call "the LLM should take the initiative on templates"):
  `maybeProposeCategories` feeds `suggestKindTemplate` the entities'
  observed literal predicates, their observed EDGES grouped by target kind
  (merged deterministically into the drafted relations — never droppable by
  the model), the onboarding business context, and agent purposes — so
  entities sharing metadata "by chance" become a proposed template whose
  table-relationships are inferred from the graph. Suite 320 pass / 3
  pre-existing canvas failures; tsc/eslint clean. NOT live-fired.
- **2026-07-16** — **Context-rich documents + metadata-aware merging + PDF
  vision opt-in (user calls, one commit)**. ① Merge adjudication now judges
  with EVIDENCE: blocking candidates are enriched with natural keys, support,
  and their top-4 current facts (`enrichMatchCandidates`/`topFactsForEntities`
  in knowledge.ts — one query, fail-soft), the consolidation sweep passes
  BOTH sides' facts, and the judge prompt says matching identifiers ≈ proof,
  contradicting ≈ disproof. ② Scanned-PDF vision is now OPT-IN
  (`PDF_SCAN_VISION=1`, default OFF per user call "avoid vision on PDFs for
  now") — scans stay metadata_only with the blob archived; photos unchanged.
  ③ Document extraction got the user's WORLD: `buildDocumentPrompt` renders
  the doc-text-primed known-entities block, active agents (name+purpose),
  and existing tables (name+columns) — "a dropped PDF usually means extract
  to a template/table"; `DOC_SYSTEM`'s summary is now a markdown-page style
  guide (sections, field/value table, bold figures, [[wikilinks]] the entity
  page renders live); the ≤3-concept cap stays (tags, not content).
  Audio transcripts get agents+tables too. tests: buildDocumentPrompt block
  test added; suite 320 pass / 3 pre-existing canvas failures; tsc/eslint
  clean (gotcha: pure modules imported by test-reachable files need explicit
  .ts extensions — ontology.ts → priming-core.ts). NOT live-fired.
- **2026-07-16** — **Relevance-based entity priming (GRAPH_PIPELINE.md
  P2.6, user call: "give him the entities/concepts/names close to the
  input")** — the extraction prompt's context is now chosen BY the message,
  not by popularity: `priming.ts` runs a LEXICAL leg (entity labels
  literally present in the text — strongest evidence, zero keys needed) and
  a SEMANTIC leg (ANN over ONE embedding of the message head, current
  space, sim ≥ .3), merged by pure `rankPrimedCandidates` (named-first, then
  by sim; support ≥ 2 floor for semantic non-concepts so one-mention strays
  can't attract force-fits; cap 15). Non-concepts render as a new "ALREADY
  IN the user's graph" prompt block (`renderKnownBlock` — labels only, never
  ids) whose NEVER-FORCE rule keeps uncertain identity in the message's own
  words, flowing into the resolution ladder + review gate as before; the
  silent-merge risk of priming + tier-0 exact match is thereby bounded.
  Concepts keep their leash line, now primed-first with support-ranked fill
  to 12 (`conceptsForPrompt` — never empty without embeddings).
  `EXTRACTION_VERSION` → 4 (requeue optional — old items valid, just less
  label-consistent). 6 unit tests on the pure core; suite 319 pass / 3
  pre-existing canvas failures; tsc/eslint clean. Messages only; document
  priming (on the doc's own text, inside processItemAttachments) is the
  follow-up. NOT live-fired.
- **2026-07-16** — **PDF → markdown, phase 1 (GRAPH_PIPELINE.md P3)** — the
  structure-preserving document-reading seam: `pdf-markdown.ts` shells out
  to whatever `PDF_MARKDOWN_COMMAND` names (Docling/marker/MinerU-style CLI;
  PDF temp path appended, markdown on stdout, `PDF_MARKDOWN_TIMEOUT_MS` 45 s,
  4 MB output cap, <40 non-ws chars = scan = null) — null/error falls back
  to the unpdf text layer with the scanned-PDF vision path intact, so the
  seam is pure upside. `chunkDocText` gained markdown awareness
  (`looksLikeMarkdown` ≥2 headings): section-aligned chunks with the heading
  prefixed on EVERY piece, so passage citations name their section (markdown
  drops page lineage; headings replace it; page-lineage chunking unchanged
  when pageTexts exist). Import uses the explicit `.ts` extension
  (node strip-types resolution, lib/llm precedent). 6 new tests via fake
  converter fixture scripts (happy path, fail-soft, seam-off, markdown
  detection, section chunking, page-lineage precedence); suite 313 pass / 3
  pre-existing canvas failures; tsc/eslint clean on changed files (the 2 tsc
  hits are the sandbox's missing @napi-rs/canvas). Phase 2 open: package an
  actual converter per deployment + live-fire on a real structured PDF.
  Also this session: the user-requested graph schema infographic
  (3 mermaid diagrams: ER structure, LLM prompt view, merge path) delivered
  as a file, not committed.
- **2026-07-16** — **P2.5 research adoptions (GRAPH_PIPELINE.md §10b)** —
  the two open items from the degeneration-literature pass, built: ①
  **alias-aware growth gate** (RELATE/KGGen-lite): `predicatesLookAlike`
  (snake_case token subset / Jaccard ≥ .5 — "invoice_total_amount"→"amount",
  "was_issued_by"→"issued_by"; no substring accidents) makes
  `proposeFieldAdditions` emit `aliasOf` proposals; accept appends the alias
  to the matching field/relation via `updateKind`, so canonicalization
  collapses the spelling on every future write (existing facts keep the old
  predicate — migration deferred). Card/ping/Studio wording adapts ("Add
  alias"). ② **usage-weighted retention**: new `entities.last_used_at`
  (migration `20260716210000_entity_usage.sql` + schema.sql + prisma model);
  `touchEntities` (raw, fail-soft) stamps graph seeds + answer-cited
  entities in `/api/search` and dossier downloads; `orphanEligible` skips
  anything read inside its prune window and orphan-ACCEPT re-checks usage in
  SQL. Every reader goes through `to_jsonb(e)->>'last_used_at'` so
  un-migrated cloud DBs read NULL instead of erroring. CwA (2607.13728)
  stays parked as the index-service seam (trigger: pgvector strain at ~1M+
  vectors). 20 unit tests on the pure cores (4 new suites-worth: look-alike,
  alias routing, usage windows); suite 309 pass / 3 pre-existing canvas
  failures; tsc clean on changed files; the knowledge.ts unused-interface
  lint warning pre-exists. NOT live-fired. **Migration owed on dev+prod.**
  Follow-ups: page-open beacon, MCP-read stamping, embedding-level snap.
- **2026-07-16** — **Ontology-health telemetry + template growth gate
  (GRAPH_PIPELINE.md P2)** + **prior-art research folded into the doc
  (§10b)**. Research first (user ask): the degeneration problem maps to four
  literatures — canonicalization/ER (Galárraga'14 canopy blocking, CESI
  WWW'18 joint NP+relation canonicalization), ontology-constrained
  extraction (RELATE predicate-embedding mapping, KGGen relation clustering,
  AdaKGC schema-constrained decoding, + the Ontology-Conformance/
  Faithfulness metrics), temporal KGs (Zep/Graphiti 2501.13956 — bitemporal
  invalidation, converges with our claim_key design), and refinement/
  forgetting (Paulheim'16, CleanGraph, 2026 sleep-time-consolidation wave;
  transferable idea we lack: usage-weighted retention). Admitted gap: no
  GraphRAG system measures graph-level fidelity — P2 had no design to copy.
  Then P2 shipped: pure `ontology-health.ts` — per-kind **conformance**
  (aliases + universal predicates conform; unregistered kinds null),
  **new-predicate windows** (first-seen over ALL rows incl. superseded),
  off-template top-list; `proposeFieldAdditions` growth gate (≥3 current
  facts, majority value type, entity→relation, unit, ≤2/kind). Wired:
  `loadHealthFacts` shell (analytics.ts), `op:"ontology_health"` on the
  analytics route, "Ontology health" Insights card (worst-first conformance
  bars, off-template chips, new-this-week), consolidation pass ③ filing
  `field_proposal` reviews (any-status kind+predicate exclusion), new review
  kind end-to-end (accept = `updateKind` appends field/relation, idempotent;
  decline never re-asks; ping question + card + Studio chrome). 16 unit
  tests green (8 new); suite 304 pass / 3 pre-existing sandbox canvas
  failures; tsc + eslint add nothing new (insights-view's one lint error
  pre-exists). Not live-fired (sandbox — no DB/LLM).
- **2026-07-16** — **Background consolidation worker (GRAPH_PIPELINE.md P1)**
  — the graph's missing homeostasis, shipped as designed in the same-day
  doc: a DAILY cron (`consolidate-cron.yml` → `POST /api/jobs/consolidate`,
  CRON_SECRET) runs per-org ① embedding backfill (missing/stale-space
  vectors), ② a merge sweep — same-kind candidate pairs from a trigram
  self-join (sim ≥.55) UNION per-entity ANN twins (cos ≥.85, current space
  only), minus pairs any entity_merge review already ruled on (either
  direction, any status) and minus natural-key-conflicting pairs; survivors
  LLM-adjudicated on the owner's provider (BYOK-aware; fail-soft → propose-
  only, text similarity NEVER auto-merges): ≥.85 → `mergeEntities` with
  winner = edges>support>age and natural-key accretion, logged as an
  accepted review; ≥.55 → pending proposal; below → auto-rejected review so
  the pair is settled forever — and ③ an orphan pass (support≤1, zero edges,
  no body, >30d old, concepts >7d, document/note never) filing ONE batched
  `orphan_prune` review; accept prunes only what is STILL unlinked at accept
  time, decline never re-asks (ids excluded via all prior orphan reviews).
  New review kind wired end-to-end (types, list, side-effects, ping
  question, card body, Studio chrome). Pure core `consolidate-core.ts`
  unit-tested (9 tests: pair dedup/veto, winner ordering, orphan windows);
  suite 296 pass / 3 pre-existing sandbox canvas failures; tsc adds no new
  errors (my files clean). NOT live-fired (no DB/LLM in sandbox) — watch the
  first cloud tick; env knobs `CONSOLIDATE_{ADJUDICATIONS,EMBED_BATCH,ORGS}`.
- **2026-07-16** — **New living doc: `docs/GRAPH_PIPELINE.md`** (user ask:
  "make ULTRA CLEAR the pipeline") — the end-to-end graph reference: schema
  (entities/facts/doc_chunks/reviews), the exact extraction prompts + the
  context each LLM call gets, model-picking (BYOK → platform, extract/
  escalate/vision slots), the multimodal paths (unpdf text layer, scan →
  rasterize → vision, audio → transcript), GraphRAG query flow + grounded-
  answer shape, claim-key versioning + the review PR loop, edge-fact vs
  node-attribute semantics, and the ordered optimal-graph roadmap (P1
  consolidation worker → P2 vocabulary telemetry → P3 PDF→markdown → P4
  reification → P5 agent lenses → P6 multimodal embeddings). Decisions
  recorded: ONE graph per user with agent lenses (per-agent physical graphs
  rejected — identity fragmentation); graph-DB migration explicitly off the
  roadmap; arXiv 2607.13728 (CwA — learned ANN partitioning, Meta FAIR)
  assessed as wrong-scale for now, filed as the future index-service seam.
  ROADMAP.md gained the track summary. Docs only — no behavior change.
- **2026-07-16** — **Interpretable filenames** (user request): a document
  arriving with a MACHINE name (scan0001.pdf, IMG_20260716_123456.jpg,
  "document (3)", a UUID/hex/digit blob, WhatsApp/Screenshot exports) is
  RENAMED once the pipeline has understood it — `<kind>-<primary subject>.<ext>`
  (e.g. `invoice-initech-corp.txt`), applied before anything user-facing is
  saved: the `attachments` row, the document entity's label + natural key,
  off-template review labels, the parse reply. Conservative by design
  (`isCrypticFilename` allowlist of machine patterns — anything possibly
  human-authored is NEVER touched; no rename without a ≥3-char primary
  label). Original kept as an `original_filename` fact on the document node.
  Re-runs are stable: the renamed file is no longer cryptic so it keeps its
  name/key on reprocessing. Pure + unit-tested (`isCrypticFilename`/
  `interpretableFilename` in document-extraction.ts, 3 test blocks over ~22
  names); rename hook in `processItemAttachments` (documents.ts). Verified
  3/3 E2E on the packed artifact (scan0001.txt → invoice-initech-corp.txt;
  reply uses the new name; brightwave-proposal.txt untouched).
- **2026-07-16** — **Chat animations + parse-summary reply on direct pings**
  (user request). (1) The chat thread feels alive: a three-dot TYPING bubble
  (ink, `dm-typing` keyframes) while the pipeline reads a message, and the
  agent's reply reveals line by line (`dm-line-in`, staggered). (2) When the
  agent is PINGED DIRECTLY it answers with what it parsed: entities with up
  to 3 inline facts, documents read, the note kept, concept tags — or a plain
  "Nothing to file from this one". Ping = `items.capture_mode = 'active'`
  (app chat, Slack DM, WhatsApp, direct email); passively watched IMAP
  mailboxes (`auto`) stay silent — the bot never narrates an inbox. Reply
  text is built by pure `buildParseReply` / gated by `shouldSendParseReply`
  (`lib/datamodo/parse-reply.ts`, unit-tested ×7); app-thread delivery is
  `meta.parse_reply` on the item (fresh-meta merge so routed_agent_* stamps
  survive) rendered as a `datamodo` bubble via GET /api/chat `reply`; channel
  delivery reuses `sendChannelText`. Review-question count rides along on
  channel replies (the app shows its own review bubble). Verified 5/5 E2E on
  the packed artifact (typing indicator seen mid-read; reply lists INV-777
  (invoice) with facts; trivial "hey hello" → "Nothing to file"; replies on
  the API). tsc clean, 288/290 tests, no new lint errors.
- **2026-07-16** — **Anthropic path is now E2E-verifiable (mock /v1/messages
  + `ANTHROPIC_BASE_URL`)**. The two Claude-key bugs (temperature 400, empty
  response) reached the user because mock-ollama only spoke the
  OpenAI-compatible surface — the Anthropic provider (`/v1/messages`,
  `x-api-key`) had no mock and a hardcoded base URL, so it could never be
  driven end-to-end. Now: `getLlmProvider` honors `ANTHROPIC_BASE_URL` (same
  pattern as the other `*_BASE_URL`s); mock-ollama serves an Anthropic-shaped
  `/v1/messages` that ENFORCES the current API rules (temperature on
  Sonnet 5/Opus 4.7+/Fable → 400; thinking-block-first replies unless
  `{type:"disabled"}`; Fable/Mythos reject a thinking config) and `/v1/models`
  answers the `x-api-key` dialect with claude ids (Settings dropdown). E2E
  6/6 on the packed 0.2.0 artifact: BYOK Claude key via Settings UI + text
  model claude-sonnet-5 → graph-worthy message ANALYZED, trivial message
  completes, wire shows no 400s and `(no-thinking)`; negative control
  confirmed the mock 400s on temperature and leads with thinking blocks (old
  code fails both ways). Unit: `ANTHROPIC_BASE_URL` rerouting + thinking-first
  reply parsing through full `chatJSON`.
- **2026-07-16** — **Hardening: OpenAI reasoning models (o-series, gpt-5\*)**
  — same failure class as the Anthropic fixes below, caught preemptively
  (user asked "does this affect OpenAI/OpenRouter too?"). The real OpenAI API
  rejects `temperature` on reasoning families and takes
  `max_completion_tokens` instead of `max_tokens`. `openai-compatible.ts` now
  gates via pure `isOpenAiReasoningModel(name, model)` — true only for
  provider `openai` + `o\d`/`gpt-5*` ids (OpenRouter normalizes params per
  model; Ollama takes the classic shape for everything, so both stay
  untouched). Current defaults (`gpt-4o-mini`/`gpt-4.1`) unaffected; this
  protects Settings model overrides. Unit-tested (wire-shape via stubbed
  fetch + pure fn).
- **2026-07-16** — **Fix: "anthropic: empty response" on Sonnet 5 (thinking
  blocks)** — follow-up to the temperature fix below; user hit it on the next
  real chat message. Two causes, both from the same model generation: (1) on
  Sonnet 5 / Opus 4.7+ omitting `thinking` now runs ADAPTIVE thinking, so the
  reply's `content[]` leads with thinking blocks (empty text under the default
  display) and thinking tokens bill against `max_tokens`; (2) our parser read
  `content[0].text` blindly → "empty response". Fixes in `lib/llm/anthropic.ts`:
  `buildAnthropicBody` now sends `thinking:{type:"disabled"}` on those models
  (our chatJSON calls are structured JSON extraction, formerly temperature-0;
  never sent on always-thinking families where "disabled" is itself a 400 —
  `anthropicAlwaysThinks`), and the reply is parsed with `extractAnthropicText`
  (joins `text` blocks, ignores thinking) with a clearer error naming
  `stop_reason` when there's genuinely no text. Both pure + unit-tested.
- **2026-07-16** — **Fix: Anthropic `temperature` 400 on newest Claude models**
  (user bug report: "temperature is deprecated for this model" when using a
  Claude API key). Anthropic removed sampling params (`temperature`/`top_p`/
  `top_k`) on Sonnet 5, Opus 4.7/4.8 and later — sending one returns HTTP 400.
  Our Anthropic escalate default is `claude-sonnet-5`, so every escalation on
  a Claude key failed. `lib/llm/anthropic.ts` now builds the request via
  `buildAnthropicBody()` which includes `temperature` only when
  `anthropicAcceptsSampling(model)` says the family still takes it (allowlist:
  claude-2.x/3.x, haiku-*, opus/sonnet 4.0–4.6 incl. dated snapshots; wrongly
  omitting is harmless, wrongly sending breaks the call). Both functions are
  exported and unit-tested in `tests/llm-provider.test.ts` — the tests caught
  a first-draft regex hole where `claude-opus-4-7` slipped through the
  optional group. Defaults unchanged: extract/vision `claude-haiku-4-5`
  (still accepts temperature), escalate `claude-sonnet-5` (now sent without).
  Verified: tsc, 275/277 tests (2 pre-existing skips), lint (7 pre-existing
  errors), boundary clean.
- **2026-07-16** — **BYOK monthly spend cap** (ROADMAP cost-tracking
  follow-up) + **version 0.2.0**. Settings → BYOK gains "Monthly spend cap
  (USD)" (`user_settings.byok_monthly_cap_usd`, migration
  `20260716170000_byok_cap.sql` + schema.sql + prisma; empty = no cap).
  Enforcement in `llmForUser` BEFORE burning the key: month-to-date ledger
  spend (`monthToDateSpendUsd`, calendar month UTC, fail-soft 0) feeds the
  pure `byokCapDecision` (llm-cost.ts) — under cap "ok"; at/over cap LOCAL
  **falls back to the machine's free Ollama** (logged plainly), CLOUD
  **blocks** with a clear requeue-able error (never silently bills anyone;
  the block error is rethrown past the fail-soft catch — it IS the feature).
  Ollama-as-BYOK is keyless/free → cap hidden/ignored there. `/api/usage`
  now returns `monthToDateUsd` + `capUsd`; the Usage card shows a cap
  progress bar ("Monthly cap reached — your key is paused" state).
  **Version bumped 0.1.0 → 0.2.0** so existing local vaults take the
  `prisma db push` upgrade (schema grew oauth tables + this column since
  0.1.0). VERIFIED: 2 pure unit tests (273 pass) + 6/6 E2E on the packed
  0.2.0 artifact against a REAL 0.1.0-era vault (marker upgraded
  0.1.0:768 → 0.2.0:768, data kept): cap saved via UI → message 1 runs on
  the key (bearer in mock log, ledger $0.000142) → message 2 falls back to
  KEYLESS ollama → serve log states the cap → Usage card shows the reached
  bar. tsc, lint baseline, boundary clean.
- **2026-07-16** — **"Disconnect Claude" — per-user OAuth revocation UI**
  (the OAuth PR's flagged follow-up). Settings → Connect Claude now lists
  the apps connected via OAuth ("Connected apps": client name + since-date,
  from `listOAuthGrants` — live token pairs grouped by client, fail-soft [])
  and a **Disconnect** per app: `DELETE /api/mcp-token?client_id=` runs
  `revokeOAuthGrants` (deletes the user's token rows + un-exchanged codes) —
  the revocation the stateless HMAC tokens can't do. VERIFIED on the packed
  artifact: OAuth E2E extended to 22/22 — the grant appears in
  `/api/mcp-token`, DELETE revokes it, and a LIVE refresh token gets
  `invalid_grant` afterwards (real revocation, not just list cosmetics) —
  plus a Playwright pass (Connected apps renders → Disconnect removes the
  row → grants empty server-side). tsc, 269 tests, lint baseline, boundary
  clean.
- **2026-07-16** — **Channel PR-loop: Slack replies + email pings** (ROADMAP
  "Channel adapters E2E" follow-ups). (1) **Slack reply interception** — the
  outbound ping asked for "1 yes" but the Slack webhook never parsed it; a
  text-only DM from a bound sender now runs the SAME `applyReviewReply`
  shared core WhatsApp uses (before capture; messages with files always
  capture; fail-soft — a reply-handling error never loses the message) and
  confirms the decision back in the DM via `chat.postMessage`. (2)
  **Outbound EMAIL pings (Resend)** — email-channel users used to get NO
  ping at all; `sendChannelText("email", …)` now posts to Resend
  (`RESEND_API_KEY` + `EMAIL_FROM`, optional `RESEND_BASE_URL` override for
  tests/proxies), env-gated dormant like every sender. Email has no reply
  loop, so `buildReviewPing` gained `replyable:false` — one-way channels get
  "Review at <url>." instead of a reply hint nobody parses
  (`extract.ts` marks only whatsapp/slack replyable). VERIFIED: 4 new unit
  tests drive the Resend sender against a LOCAL mock HTTP server (payload
  shape, bearer, 422 → reason, dormant without env, bad address) + the
  one-way ping copy (269 pass). The Slack glue mirrors the shipped WhatsApp
  pattern; live Slack/Resend still belong to the roadmap's "channel adapters
  E2E on real providers" human item. tsc clean, boundary clean, lint at
  baseline (−1 warning: the Slack route's unused `link`).
- **2026-07-16** — **Multi-page scanned PDFs** (ROADMAP follow-up from the
  2026-07-14 OCR ship: "v1 is page 1"). A textless (scanned) PDF's pages now
  ALL reach the vision model in ONE call: `rasterizePdfPages` renders page 1
  up to `MAX_SCAN_PAGES` (6) within a payload budget
  (`MAX_SCAN_BASE64_CHARS` ≈ 6.7 MB of image bytes), stopping early and
  marking `truncated`; a rasterization failure on page N>1 keeps pages
  1..N-1 (a partially read scan beats an unread one; page-1 failure still →
  null → metadata_only). `extractFromImage` gained `additionalPages` (the
  LLM layer already carried an images array — both providers); the prompt
  tells the model the images are the CONSECUTIVE PAGES of ONE document (one
  summary, one primary entity, facts from any page). `documents.ts` marks
  indexing "full" only when every page was seen, else "partial".
  `rasterizePdfFirstPage` kept as a shim. Mock now logs "(vision xN)" — the
  page-count proof. VERIFIED: 4 new unit tests (order, cap+truncated flag,
  garbage→null, shim) — 265 pass — and 7/7 E2E on the packed artifact: a
  generated 3-page textless PDF → analyzed, mock saw ONE call with
  "(vision x3)", marker in the doc body; a 9-page scan → "(vision x6)" (cap).
  tsc clean, lint at baseline, boundary clean.
- **2026-07-16** — **MCP OAuth (phase 3) — claude.ai connectors**. datamodo
  is now its own OAuth 2.1 authorization server for the MCP endpoint, so
  claude.ai's "Add custom connector" works with just the server URL — the
  user approves in a branded consent page instead of copying a bearer token.
  Discovery: `/.well-known/oauth-protected-resource` +
  `/.well-known/oauth-authorization-server` (RFC 9728/8414, path-suffixed
  forms, CORS) and the MCP 401 now carries `WWW-Authenticate:
  resource_metadata=…`. Registration: RFC 7591 dynamic, public clients only
  (PKCE binds the flow — no secrets). Consent (`/oauth/authorize`,
  dm-auth-styled): client+redirect validated BEFORE render (bad pairs render
  an error card, never redirect); signed-out users round-trip through
  `/login?redirectTo=`; the Approve POST carries ONE HMAC-signed field
  naming the exact grant shown (10-min expiry) so cross-site form posts
  can't forge a grant. Tokens (`/api/oauth/token`): S256-only PKCE exchange,
  single-use codes (DELETE-first — replays fail closed), rotating refresh,
  opaque `dmo_`/`dmr_` values stored sha256-hashed → per-user revocation by
  row delete. `resolveMcpBearer` (new `lib/datamodo/mcp-auth.ts`) accepts
  local-tokenless / `dmk_` HMAC / `dmo_` OAuth; the OAuth lookup is
  fail-soft so an unmigrated cloud keeps HMAC working. Tables in
  `neon/schema.sql` + `prisma/schema.prisma` + migration
  `20260716150000_oauth.sql` (⚠️ MUST be applied on dev+prod Neon branches —
  in "Owed by a human"). VERIFIED: 9 unit tests (RFC 7636 vector, consent
  signing, redirect rules) and 19/19 OAuth E2E on the packed artifact
  (discovery → register → consent → approve → PKCE exchange → refresh
  rotation → MCP tools/list under the OAuth bearer, + 8 negatives), MCP
  suite re-run 19/19 (its two "401 + token" asserts were stale pre-tokenless
  expectations, updated to the tokenless-local contract), pipeline 18/18;
  tsc, 261 unit tests, lint at baseline, boundary clean.
- **2026-07-16** — **The local tarball ships the prebuilt app** (roadmap gap;
  user: "go"). First `datamodo serve` on a fresh vault now answers in ~6 s
  (measured 5.8 s incl. wizard + embedded-DB schema build) instead of running
  `next build` for minutes on the user's machine. Pack step
  (`build:local-package --build`) prepares `.next` for shipping: junk `next
  start` never reads is stripped (cache/trace/types/.nft.json), Turbopack's
  externalized-package SYMLINKS (`.next/node_modules/pg-<hash>` — npm can't
  pack symlinks) become `.next/local-externals.json`, and
  `required-server-files.{json,js}` (read by `next start`, embed the build
  machine's app dir — deleting them crashes next 16, learned the hard way)
  ship as path-tokenized `.tmpl`s. New `bin/link-externals.mjs` recreates the
  links + materializes the server-files for the actual install dir at
  POSTINSTALL (global dirs can be root-owned when `serve` later runs) and
  fail-soft on every serve. Build env scrubs `NEXT_PUBLIC_*`; a leak sweep
  FAILS the pack if any absolute path or NEXT_PUBLIC value survives in the
  artifact (it caught required-server-files). Local package deps now PINNED
  EXACT from the installed tree so the user's `next` always matches the
  shipped build. Tarball 415 KB → 9.6 MB (944 files). VERIFIED on the packed
  artifact: clean global install → 7 links recreated → appDir materialized →
  5.8 s first boot, "building the app" absent from the log → 18/18 pipeline
  E2E + 31/31 AI-panel E2E on that install. tsc, 252 tests, lint baseline,
  boundary clean; CI's `--no-pack` proof path untouched.
- **2026-07-16** — **Non-dev AI settings panel** (user: "make the interface
  easier for non-dev users + allow them to do everything from the dashboard
  and not in the terminal" + "make sure everything is ready" — no stale
  roadmap copy). Settings → Local: live Ollama status (green "running · N
  models" / friendly not-running box with ollama.com link + **Check again**
  that recovers in place), model **dropdowns from what's installed**,
  **one-click download chips** for the models the sizing recommends for this
  machine (`POST /api/local/ollama-pull`, UI polls until the model lands),
  and **Test it** — one real tiny completion with latency. BYOK: **Test key**
  (free list-models call: Anthropic `/v1/models`, OpenAI `/v1/models`,
  OpenRouter `/key`+`/models`) validates the typed key (human 401 copy) and
  fills the model dropdowns with what that key can use; probe keys are
  transient, never stored (`POST /api/local/llm-probe`). Removed both
  "…is on the roadmap" sentences (BYOK helper + MCP card). **Root-cause fix**:
  fresh local vaults opened Settings on "Bring your own key"/Claude with a
  red "Add your API key to start" badge because the DB default is
  cloud-shaped (`compute_mode='byok'`) — local `getSettings` now reports the
  mode actually in effect (byok without a credential runs on the machine's
  Ollama anyway), so the Local card + green "Local AI — this machine" badge
  are the fresh-install truth. VERIFIED 31/31 on the repacked artifact
  (16 API probes incl. dead-server/bad-key/missing-model errors + 15
  Playwright steps incl. kill-Ollama→box→restart→Check-again→green and a
  chip download landing in `/api/tags`); tsc, 252 unit tests, lint at
  baseline, `lint:boundary` clean.
- **2026-07-16** — **Live agent suggestion while typing** (user: "if the
  classifier is free and fast, can't we suggest the agent before send?").
  The SAME zero-cost router now also runs IN THE BROWSER on every keystroke
  (`agent-router.ts` is pure/import-free, so the client bundle imports it
  directly — no API call, microseconds per run): while an unaddressed draft
  (≥12 chars) confidently matches one auto agent, the composer's "to" row
  shows a coral-tinted chip — **"↪ Bookkeeper? Tab"** — click or Tab makes it
  the explicit recipient (same `pickAgent` path as the picker/@mention), ✕
  dismisses for that match (re-arms on the next draft). An explicit/sticky
  recipient suppresses it; ignoring it is fine — the server routes the sent
  message identically and the bubble now shows the **↪ routedAgent**
  attribution chip (server stamp surfaced; explicit "→ agent" unchanged).
  Suggest → accept-or-ignore → attribute: the loop is visible end to end,
  all at zero LLM cost. VERIFIED 7/7 on the packed artifact (Playwright):
  chip appears while typing an invoice draft, Tab addresses (chip gone,
  "→ Bookkeeper" on the sent bubble), off-topic draft shows nothing, ✕
  dismisses, and a dismissed-but-sent interview note came back with
  "↪ Recruiter" from the server. Also live-proved this session: the SIGTERM
  fix (serve now stops cleanly, port freed) and the router's twin-profile
  behavior (duplicate same-purpose agents tie every score → correctly never
  routes).
- **2026-07-16** — **Local MCP is tokenless + zero-cost auto-mode agent
  routing** (two user calls). (1) **MCP auth split**: the LOCAL edition's MCP
  needs NO bearer token — one user, and the server binds 127.0.0.1, so
  reaching the port IS the boundary (`verifyToken` returns `LOCAL_USER` under
  `isLocalMode`; `withMcpAuth required` only in cloud; `/api/mcp-token`
  returns `{token: null, authRequired: false}` locally and the Connect-Claude
  card shows a header-less `claude mcp add` one-liner; documented caveat:
  binding beyond localhost opens everything, MCP included). Cloud keeps
  HMAC bearer tokens unchanged. (2) **Zero-cost agent router** — the
  ROADMAP's deferred "reroute" step, built the FREE way (user: auto mode is
  too expensive if routing needs an LLM): pure `lib/datamodo/agent-router.ts`
  — each ACTIVE **auto**-mode agent's name+purpose becomes a keyword profile
  (idf-style weights: terms shared across profiles are discounted, name terms
  ×2, plural folding), an UNADDRESSED item routes to the top agent only when
  it clears an absolute floor AND a margin over the runner-up — **ambiguity
  never routes** (generic datamodo agent, exactly as before). Deterministic,
  no LLM call, no spend. Hook in `runExtractionForItem`: explicit `@agent`
  meta always wins; a routed pick steers extraction with that agent's
  purpose and is stamped on the item (`meta.routed_agent_id/name/terms` —
  attribution is never silent; chat GET now returns `routedAgent`).
  (3) Bonus CLI fix the E2E surfaced: `datamodo serve` now handles SIGTERM
  (not just Ctrl-C) — `kill <pid>` used to orphan the next-server child on
  the port with a dead embedded DB. VERIFIED on the packed artifact (8/8):
  tokenless tools/list + tool call read the vault; two auto agents created
  through the real wizard; unaddressed "Invoice INV-77…" → Bookkeeper,
  "Interview with the candidate…" → Recruiter, "Lunch on Thursday…" →
  generic (no stamp), explicit @Recruiter on invoice-ish text beats the
  router. 6 new unit tests (252 total), tsc, lint == baseline, boundary +
  prune clean.
- **2026-07-16** — **MCP everywhere + the full tool surface (14 tools)** (user
  call — reverses the hours-earlier "cloud-only" call; FINAL state: the MCP
  server ships in BOTH editions, same code, each bound to its own vault —
  cloud → the hosted Neon org, local → the machine's pglite/compose Postgres;
  local reachable by Claude Desktop/Code on the same machine, claude.ai web
  can't hit localhost). Restored the local packaging state (routes + contract
  cores + `mcp-handler`/`zod`/sdk deps back in the prune, boundary treats MCP
  as core, Connect-Claude card visible locally, `MCP_TOKEN_SECRET` from the
  per-install ingest secret). **Six NEW tools** complete the surface, each a
  thin wrapper over an existing tested core: `capture_message` (forward raw
  content → SAME ingest + post-response extraction kick; the no-extraction
  counterpart to submit_extraction), `walk_graph` (the Explorer as a tool —
  `buildEgoGraph` hop-1/2 neighborhood with predicates+confidence),
  `list_facts` (structured lookups by subject/predicate/kind with **as-of
  date** over the bitemporal validity window), `search_documents` (passage
  search via `searchChunks`, keyword+semantic), `list_tables` +
  `get_table_rows` (datasets as read-only projections — deliberately NO
  row-write tool; writes go through extraction). Deliberately absent: entity
  deletion (append-only vault), review bypass. VERIFIED 19/19 on the packed
  artifact with a raw streamable-HTTP JSON-RPC client: 401 without token,
  token minted locally, initialize, all 14 tools advertised, capture →
  pipeline extraction lands (Hooli), submit_extraction files (C-77 → facts
  value/signed_on/party), get_entity/walk_graph/get_context read it back,
  list_facts as-of 2020 correctly empty, org-scoped table-id validation,
  inbox/reviews execute. `datamodo-*.tgz` rebuilt with MCP included.
- **2026-07-16** — ~~**MCP is CLOUD-ONLY**~~ (superseded above) (user call — reverses the same-day
  "MCP ships local" decision from the packaging build; settles brief open
  question 1 the other way). The local artifact no longer contains the MCP
  host: `app/api/mcp` + `app/api/mcp-token` dropped from the prune INCLUDE,
  the contract cores `lib/datamodo/mcp-{extraction,token}.ts` deleted from
  the copied tree (new `EXCLUDE_FILES` step), and `mcp-handler` + `zod`
  dropped from the local package.json (`@modelcontextprotocol/sdk` no longer
  pinned — zod's only importers were the MCP files). Boundary lint closes MCP
  again (`app/api/mcp`, `lib/datamodo/mcp-`, `mcp-handler`,
  `@modelcontextprotocol` are CLOSED targets in both the repo config and the
  generated zero-exception in-tree config; grep sweep gains the same
  markers). Local Settings hides the "✦ Connect Claude" card (`!local`);
  `serve`/docker-entry no longer export `MCP_TOKEN_SECRET`. Cloud unchanged —
  the MCP host keeps working exactly as shipped 2026-07-14. VERIFIED: pruned
  tree builds green with zero MCP/zod references (grep + zero-exception
  depcruise), tarball boots fresh, dashboard Settings shows no Connect-Claude
  card locally, `/api/mcp*` 404 in the local artifact, 246 unit tests, tsc,
  lint == baseline.
- **2026-07-16** — **Local BYOK verified + per-provider model config** (user:
  "make sure in local i can use my own claude api key or openai or
  openrouter"). The Settings toggle existed, but live-driving found the trap:
  the first-run wizard seeds `llm.json` with OLLAMA model names
  (llama3.1:8b…) and `llmForUser` applied them to EVERY provider — switching
  to a Claude/OpenAI/OpenRouter key would have requested "llama3.1:8b" from
  that API and failed every call. Fix: **`llm.json` model names are now
  namespaced PER PROVIDER** (`{url, providers: {ollama: {…}, anthropic: {…},
  openai: {…}, openrouter: {…}}}`; legacy flat files migrate to
  `providers.ollama` on read — pure `sanitizeLlmFile` in `lib/local/config.ts`,
  unit-tested). `llmForUser` applies only the RESOLVED provider's saved models
  (byok → `settings.aiProvider`'s slot; local default → the `LLM_PROVIDER`
  env-resolved slot, ollama). `/api/local/llm-models` takes `?provider=` /
  `{provider, models}`; Settings' `LocalAiFields` is provider-aware
  (per-provider placeholders — claude-haiku-4-5 / gpt-4o-mini /
  anthropic-claude-haiku-4.5 —, Ollama-only URL/status/datalist, byok panel
  edits the SELECTED provider's slot). Two more real fixes: **`llm_usage` now
  ships in `neon/schema.sql`** (the BYOK spend card was permanently empty
  locally — the ledger table only existed as an unapplied cloud migration),
  and **`usageSummary` was broken everywhere**: Prisma `groupBy._max` on the
  boolean `estimated` emits `max(boolean)` → 42883 (never seen in cloud only
  because the table was never migrated there) — rewritten as raw SQL with
  `bool_or`. Mock-ollama now accepts any model id on keyed requests (cloud-API
  semantics) so BYOK is drivable against it. VERIFIED on the packed tarball
  (fresh vault, `OPENAI_BASE_URL` → mock): **11/11 BYOK E2E** — key saved
  through the real Settings UI, extraction runs with the bearer key, OpenAI
  default model used (no Ollama-name leak), per-provider dashboard override
  honored, ollama/openai slots isolated, spend ledger populates, toggle back
  to Local resumes keyless llama3.1:8b. Anthropic rides the same routing (its
  API client is cloud-shared code, not mock-drivable).
- **2026-07-16** — **Local packaging phase 3: the shipped tarball driven
  end-to-end, and the 5 real bugs that only live-driving found** (brief §10 —
  "don't hand back untested"). Harness: mock Ollama on :11434 (rule-based
  extractor, real 768-d embeddings) + `npm i -g dist/datamodo-0.1.0.tgz` +
  `datamodo serve` on a fresh vault + an HTTP driver and a real-Chromium
  (playwright) click-through. **Result: 18/18 API checks, 8/8 UI checks, 4/4
  fail-soft checks pass on the PACKED ARTIFACT** — boot/redirect, wizard-seeded
  models visible+editable via Settings API, text ingest → entities
  (Acme Corp/INV-42/Jane Doe) + facts (amount/due_date/issued_by), keyword +
  semantic search, grounded answer, image → VISION model (marker in body_md),
  text-layer PDF → extraction, dashboard-set model actually used (mock logged
  `dash-test-model`), agent wizard → @Bookkeeper mention → send → "✓ filed",
  Data/Explore render with zero console errors, and Ollama-killed-mid-run →
  item fails soft, dashboard + keyword search stay up. Bugs found & fixed —
  each "worked" at compile level and broke live: (1) **installed-package build
  failed typecheck** — a global npm install puts the app inside `node_modules`,
  where tsc refuses to analyze `.mjs` (local next.config now skips typecheck;
  the tree is fully checked at pack time); (2) **pg pool idle-close kicked the
  pglite socket** ("Connection terminated unexpectedly" on first write) —
  `idleTimeoutMillis: 0` on the embedded pool; (3) **every route bundle opened
  its own pool** (prod Next inlines lib/prisma.ts per route; the globalThis
  singleton was dev-only) — pglite serves ONE connection, so routes kicked each
  other; singleton now always set in local; (4) **first-boot org provisioning
  raced itself and corrupted BOTH transactions** (two interactive transactions
  interleave on pglite's single session: nested BEGIN is a no-op, one ROLLBACK
  undoes both) — provisioning is now sequential idempotent upserts, no
  transaction, race-safe catch-and-refetch (cloud unchanged semantics);
  (5) **the Free-plan gate blocked local agent creation** ("Auto mode is a Pro
  feature") — `planLimits` returns unmetered self-hosted entitlements under
  `DATAMODO_LOCAL` (server-side), and the sidebar/wizard "runs on" chrome is
  local-aware ("Local AI — this machine" / "self-hosted · settings"). NOT
  verified in-sandbox (egress policy): real model quality (no weights
  reachable), the Docker image build (no base-image pulls), live IMAP.
- **2026-07-16** — **Local packaging phase 2: physical code separation + Docker
  runtime + one-command installers** (brief §3/§4/§6 — the ROADMAP "HARD
  REQUIREMENT"). (1) **Boundary lint**: `.dependency-cruiser.cjs` forbids the
  CORE (dashboard, core/local API routes, `lib/{datamodo,llm,local,ingest}`,
  blob-fs, bin, shared UI atoms) from importing the CLOSED layer (Neon Auth
  server/client, `@neondatabase/*`, `@prisma/adapter-neon`, stripe, `@aws-sdk`,
  billing/webhooks/auth routes, landing) — seam files (`lib/prisma.ts`,
  `lib/storage/blob.ts`, `lib/auth/session.ts`, `app/auth/actions.ts`,
  `proxy.ts`) are the only allowed crossings; `npm run lint:boundary` + a CI
  step enforce it (0 violations today). (2) **Build-time prune** (`npm run
  build:local-package` → `scripts/build-local-package.mjs`): copies the core
  into `dist/local-package/`, swaps the 5 seams + `app/page.tsx` +
  `next.config.ts` for local implementations checked in under
  `packaging/local/overrides/`, generates a real `package.json` (name
  **datamodo**, bin, cloud deps dropped, build-time deps promoted), then
  PROVES the separation: a grep sweep for closed markers, a ZERO-exception
  depcruise config generated into the tree, and (`--build`) a full
  `npm install` + `DATAMODO_LOCAL=1 next build` in the pruned tree. Verified
  in-session: tree builds green; `npm pack` → **datamodo-0.1.0.tgz, 181 files,
  ~400 KB, zero closed-layer paths inside**. Decision (brief open question 1):
  **MCP ships in the local package** (vault-as-tools on the user's own Claude
  subscription is a flagship local feature); its `MCP_TOKEN_SECRET` derives
  from the random per-install ingest secret, never the constant local cookie
  placeholder. Turbopack gotcha for posterity: building the pruned tree NESTED
  in the repo makes Turbopack infer the OUTER repo as project root and pick up
  the cloud `proxy.ts` — the local `next.config.ts` pins `turbopack.root`.
  (3) **Docker runtime** (`packaging/local/docker/`): multi-stage Dockerfile
  built FROM the pruned tree (cloud code physically absent from the image);
  compose = app + `pgvector/pgvector:pg16` with healthcheck + named volumes +
  optional `gpu`-profile Ollama (Linux/NVIDIA only); host Ollama is the default
  everywhere (macOS containers can't use Metal — §7). `bin/docker-entry.mjs`
  is the container `serve`: waits for PG, installs the schema from
  `neon/schema.sql` on a fresh DB (dim-rewritten for local embeddings) or
  `prisma db push` on upgrade, runs the non-interactive first-run sizing
  (cgroup RAM), starts `next start` + the IMAP poller — real PG, so the pglite
  shim stays off. NOT run in-session: the image build itself (sandbox egress
  blocks Docker Hub base images) — flagged for a human/CI with network.
  (4) **Installers** (`packaging/install.sh` + `install.ps1`, brief §3): one
  command → asks Local vs BYOK → Docker Compose vs npm (auto-detect, override
  flags `--local/--byok/--docker/--npm/--ram/--yes`) → Ollama guidance per OS
  (macOS host-Ollama note) → npm path installs global + runs `datamodo setup`;
  docker path fetches the compose bundle and `docker compose up -d`. sh/POSIX
  syntax-checked. CI gained "Boundary" + "Local package prune" steps.
- **2026-07-15** — **Local packaging phase 1: real-Postgres runtime + first-run
  model sizing + LOCAL↔BYOK settings toggle** (packaging brief §2/§3/§5;
  overnight build). (1) **`neon/schema.sql` now loads top-to-bottom into an
  EMPTY database** — dropped the psql-only `\restrict` meta-commands and moved
  the 3 inline `REFERENCES` on `doc_chunks`/`kinds` (hand-added tables) into the
  end-of-file FK section (same auto-generated constraint names, so deployed DBs
  match). This unblocks Docker initdb AND lets the embedded DB build the schema
  **faithfully from schema.sql** on a fresh vault (functions + triggers + hnsw
  included — the "prisma db push partial schema" gap is gone; push remains only
  as the app-upgrade diff path, and a `reset all` clears the dump's session SETs
  since pglite is one shared session). (2) **Real-Postgres local runtime**: the
  pglite `max:1`/read-retry shim in `lib/prisma.ts` is now gated on
  `DATAMODO_EMBEDDED_DB=1` (set by `serve` only when it boots pglite); a
  user-supplied `DATABASE_URL` gets a normal pooled `@prisma/adapter-pg`.
  (3) **First-run sizing wizard** — `datamodo setup` (and auto on first
  `serve`): detects RAM (`os.totalmem` capped by the cgroup limit in
  containers), maps to a model tier (4/8/16/32 GB → llama3.2:3b …
  qwen2.5:14b + llava/llama3.2-vision + nomic-embed-text; pure core
  `lib/local/sizing.mjs`, unit-tested), pulls via Ollama `/api/pull` with
  progress, seeds `~/.datamodo/llm.json` (the dashboard-editable store);
  fail-soft with an install hint when Ollama is absent. (4) **LOCAL ↔ BYOK is a
  Settings toggle**: local Settings hides the cloud plan/billing card, the
  compute cards read "Local — on this machine" vs "Bring your own key"
  (stored `computeMode` unchanged: "cloud" means platform-default = host
  Ollama locally; plan gate bypassed under `isLocalMode`), and a new
  `LocalAiFields` panel edits the **Ollama server URL** (new `url` field in
  `llm.json`, http(s)-validated) + text/vision models with live reachability +
  installed-model suggestions (`GET /api/local/llm-models` now probes
  `/api/tags`). `serve` defaults `LLM_PROVIDER=ollama`. (5) **Mock Ollama**
  (`scripts/mock-ollama.mjs`): tags/pull/chat(JSON+vision)/embeddings
  (deterministic 768-d) — lets the whole pipeline run E2E where weights can't
  (CI/sandboxes). VERIFIED: schema.sql loads clean into empty pglite (22
  tables/6 triggers/all stored fns); embedded-db integration tests incl. the
  new upgrade-path test (data kept, hnsw restored); wizard live against the
  mock (detect 15.7 GB → "plus", `--ram 8` → standard, 3 pulls, idempotent
  re-run) and against nothing (hint + seeded llm.json); 250 unit tests, tsc
  clean, lint == baseline, local `next build` green. NOT verifiable in this
  sandbox: real model pulls (egress policy blocks ollama.com/registry.ollama.ai,
  huggingface, Docker Hub blobs — see the session report).
- **2026-07-15** — **Local edition: pick LLM model names from the dashboard**
  (user: "why can't we set these from the dashboard, not the terminal? we can
  do both"). Previously the Ollama model ids were ENV-ONLY
  (`OLLAMA_EXTRACT_MODEL` / `OLLAMA_VISION_MODEL` / `OLLAMA_ESCALATE_MODEL`) —
  the dashboard only took the server URL, so "where does the vision/OCR model
  go?" had no answer in the UI. Now: **Settings → BYOK (local) shows Text model
  + Vision/scanned-PDF model inputs** that save to `~/.datamodo/llm.json` via a
  new local-only route `POST/GET /api/local/llm-models`. `getLlmProvider` gained
  an `opts.models` override applied across ALL providers with precedence
  **dashboard override → env var → built-in default** (so BOTH work, as asked);
  `llmForUser` reads `llm.json` in local mode and threads it in. No DB migration
  (avoids cloud schema drift) — it's a local file like `connectors.json`. Pure
  `sanitizeLlmModels` (trims/drops blanks) in `lib/local/config.ts` (unit-tested);
  fs read/write in `lib/local/llm-config.ts`; `LocalModelsFields` UI in
  `control-center.tsx` (saves on blur, shown only in local mode). VERIFIED:
  precedence (dashboard `dash-extract` wins over env, env wins over default),
  `next build` compiles the route, tsc clean, lint at baseline, 237 unit tests +
  both DB tests pass. Vision model = the one used for images + scanned-PDF OCR.
- **2026-07-15** — **Robust LLM JSON parsing + Ollama JSON mode** (extraction
  failed with `LLM: response was not valid JSON` on a local model). Two fixes:
  (1) `parseLoose` (`lib/llm/util.ts`) was rewritten — it now unwraps ```` ```json ````
  fences, tolerates leading/trailing PROSE around the JSON, handles ARRAYS (not
  just objects), strips TRAILING COMMAS, and extracts the first BALANCED value
  (respecting strings/escapes) instead of a greedy `/\{[\s\S]*\}/` that
  over-spans when the model appends text; it throws with a content snippet so
  failures are diagnosable. (2) The OpenAI-compatible provider
  (`openai-compatible.ts`) now nudges KEYLESS servers (Ollama/LocalAI) with a
  JSON-mode ladder — `json_schema` (if the caller wants structured) → `json_object`
  (local models honor this and it markedly improves validity) → none — degrading
  on rejection; cloud providers (with a key) never get `json_object`, so their
  path is unchanged. New `tests/llm-parse.test.ts` (8 cases: fences, prose,
  arrays, trailing commas, greedy-overmatch, braces-in-strings). Note: a tiny
  local model can still emit unsalvageable JSON for complex extraction — a more
  capable model (or a cloud key) helps; this makes the common wrapping/laxity
  cases work. tsc clean, lint at baseline, 236 unit tests + both DB tests pass.
- **2026-07-15** — **Local edition: install the stored SQL functions + triggers
  (`prisma db push` skips them).** After the UUID/dashboard/concurrency fixes,
  search/knowledge hit `function knowledge_match_entities(uuid, …) does not
  exist` (P2010 / 42883). Root cause: `prisma db push` builds only the
  declarative schema (tables/columns/indexes) — the `private` schema, the stored
  FUNCTIONS (`knowledge_match_entities`, `add_dataset_column`,
  `remove_dataset_column`, `dataset_accepted_counts`, plus the private
  refcount/`touch_updated_at` trigger fns) and their 6 TRIGGERS live only in
  `neon/schema.sql` and were never created locally. Fix: `ensureSchema` now
  parses those `CREATE FUNCTION … $$…$$;` blocks + `CREATE TRIGGER` statements
  (and `create schema private`) out of `neon/schema.sql` and applies them —
  functions as `CREATE OR REPLACE`, triggers ignoring "already exists" — and
  runs this on EVERY boot (idempotent), so it also repairs installs built before
  this landed (it's no longer gated behind the schema-version marker). Verified:
  guarded DB integration test now asserts `knowledge_match_entities` resolves,
  `dataset_accepted_counts` is callable, and the 6 refcount/updated_at triggers
  exist; `tsc` clean, lint at baseline, 228 unit tests + both DB tests pass.
- **2026-07-15** — **Local edition was fundamentally broken — three real bugs
  fixed** (user hit: dashboard "couldn't load / missing a migration" banner,
  "invalid input syntax for type uuid" creating an agent, "could not send" a
  chat). All three shared root causes in the LOCAL runtime, none caught earlier
  because verification only checked `/dashboard` returned HTTP 200 (the notice
  renders at 200) and the DB integration test used a random UUID.
  **(1) `LOCAL_USER.id` was not a valid UUID** — `00000000-…-0000000d0m0d`; the
  `m` isn't a hex digit, so Postgres rejected EVERY query keyed on the local
  user (org resolution → dashboard notice; agent create; chat). Fixed to
  `00000000-0000-4000-8000-000000000d0d` (hex only) + a test asserting the UUID
  regex (the old test only checked length ≥ 32, which the bad id passed). No
  data migration needed — every write with the bad id had failed, so nothing
  existed.
  **(2) `/dashboard` was statically prerendered at BUILD time** — the local-mode
  change made `getSessionUser` not read cookies, so Next no longer saw the page
  as dynamic and prerendered it during `next build` (no DB running → "Can't
  reach database server at 127.0.0.1:5432"), baking the failure banner into a
  static page served on every request. Fixed with
  `export const dynamic = "force-dynamic"` on the dashboard (cloud was already
  dynamic via the cookie read).
  **(3) pglite-socket concurrency** — pglite is a single WASM instance behind
  the socket; a normal connection pool opens several connections and the socket
  drops them ("Connection terminated unexpectedly"), so the dashboard's ~5
  parallel reads (`Promise.allSettled`) failed intermittently (measured 0/12
  clean rounds). `lib/prisma.ts` now, in local mode, caps the pool at `max: 1`
  (queries serialize) AND retries the rare remaining transient drop on
  idempotent READs only (never writes/transactions) — measured 15/15 clean.
  (Tried upgrading pglite 0.4→0.5 to get its query queue; 0.5 REMOVED the
  bundled `vector` extension → reverted, stayed on 0.4.6 / socket 0.1.6.)
  Also: the dashboard's silent `catch {}` blocks now `console.error` the reason
  (these hid all of the above — a real diagnosability fix). VERIFIED end-to-end
  on the embedded DB (`.env.local` moved aside): fresh `serve` → dashboard loads
  clean, notice ABSENT across 8 repeated loads, 0 errors logged; `tsc` clean,
  lint at baseline, 228 unit tests + both guarded DB tests pass.
- **2026-07-15** — **`datamodo serve` auto-builds — kills the `DATAMODO_LOCAL=1`
  footgun.** The manual `DATAMODO_LOCAL=1 npm run build` step bit users three
  times (PowerShell `$env:` syntax, forgetting it, and — on Mac — running a
  plain `npm run build` that then prerendered `/dashboard` in cloud mode and
  crashed on `Missing required config: cookies.secret`). Fix: `serve` now
  **auto-builds on first run** when `.next/BUILD_ID` is absent, running
  `next build` with `DATAMODO_LOCAL=1` set internally (via `runNextBuild`), so
  the user never sets the flag or fights cross-shell env syntax. Added a
  `datamodo build` subcommand for manual rebuilds (e.g. after `git pull`).
  Hoisted a `cliEntry(pkg)` helper (resolves a dep's JS bin, run via
  `process.execPath`) now shared by the build + `next start` spawns. The whole
  local flow collapses to `npm install` → `node bin/datamodo.mjs serve`.
  VERIFIED end-to-end on Linux: `rm -rf .next` then `serve` auto-built (41/41
  pages, no `cookies.secret` error) → embedded DB ready → dashboard HTTP 200,
  with no manual build and no env var. README updated to the one-command flow.
  **Robustness follow-up (same PR):** the "is there a build?" check keys on
  `.next/prerender-manifest.json` (written at the END of a successful build +
  required by `next start`), NOT `BUILD_ID` (written early) — so a PARTIAL
  `.next` left by a failed/interrupted build (exactly the earlier cloud-mode
  `cookies.secret` crash → `next start` ENOENT on `prerender-manifest.json`) is
  treated as "needs rebuild"; serve then clears the stale `.next` and rebuilds
  clean. Verified by simulating a BUILD_ID-only `.next` → serve recovered to
  HTTP 200.
- **2026-07-15** — **Windows fix (round 2): `spawn EINVAL` → run CLIs via
  `node`, not `npx`.** Round 1 (below) switched the spawns to `npx.cmd` on
  Windows, but modern Node then throws `EINVAL` — it refuses to spawn a `.cmd`
  without `shell: true` (CVE-2024-27980). The robust cross-platform fix is to
  drop `npx` entirely: resolve the CLI's JS entry (`prisma/build/index.js`,
  `next/dist/bin/next`) via `require.resolve` and run it with `process.execPath`
  (the current node binary) — no shim, no shell, no `.cmd`. Applied to the
  `prisma db push` (`lib/local/embedded-db.mjs`, with a clear "run npm install"
  error if the CLI can't be resolved) and the `next start` fallback
  (`bin/datamodo.mjs`). VERIFIED end-to-end on Linux: a fresh-data-dir
  `datamodo serve` ran prisma db push + next start and the dashboard returned
  HTTP 200; both guarded DB integration tests pass. This supersedes round 1.
- **2026-07-15** — **Windows fix (round 1, superseded): `datamodo serve`
  "prisma db push failed"** (user report on PowerShell). Node's `spawn("npx", …)`
  with no shell can't resolve the npm shim on Windows (it's `npx.cmd`) → ENOENT,
  and the error was swallowed, leaving only the opaque "could not build the
  local database schema." Switched to `npx.cmd` on win32 + surfaced the spawn
  error — but `.cmd` then hits EINVAL on modern Node, so see round 2 above.
- **2026-07-15** — **Cloud/local split, step A: clean local build, no cloud
  eval** (user call "go for A" — the cheap one-repo half of the code-separation
  requirement). Investigation first: cloud deps are remarkably well-contained —
  `@neondatabase/auth` only in `lib/auth/{server,client}.ts`, the neon Prisma
  adapter only in `lib/prisma.ts`, `stripe` constructed lazily INSIDE the 2
  billing route handlers (settings.ts does NOT import the SDK — earlier grep was
  a false positive on the `setPlanFromStripe` name), and the whole better-auth
  engine reached by only 4 files. The one thing that broke the local build /
  forced a placeholder secret was **Neon Auth built at module load**
  (`createNeonAuth` reads `NEON_AUTH_*` and throws without it; the `/api/auth`
  route evaluated it during page-data collection). Fix: `lib/auth/server.ts` now
  exports **`getAuth()`** — a lazy singleton that dynamic-imports better-auth on
  first real call — and its 4 importers (`session.ts`, `app/auth/actions.ts`,
  `proxy.ts` now async, `/api/auth/[...path]` now per-request + `isLocalMode()`
  404) were updated. Result, VERIFIED: **`DATAMODO_LOCAL=1 npm run build`
  succeeds with ZERO env vars** (previously required a placeholder
  `NEON_AUTH_COOKIE_SECRET`) and the `[neon-auth]` cookie warnings are gone; the
  local runtime never constructs better-auth. Cloud build WITH its secret still
  passes (no CI regression); cloud build without it fails at `/dashboard`
  prerender as expected (cloud legitimately needs cloud config). Also guarded
  the pure-cloud routes with `isLocalMode()` → 404: `/api/billing/{checkout,
  webhook}`, `/api/webhooks/{whatsapp,slack,teams}`. HONEST SCOPE: this is
  bundle/eval-level dormancy + a clean secret-free local build — it does NOT
  make cloud code physically absent from the source (the neon Prisma adapter is
  still statically imported by the sync `prisma` singleton; cloud route files
  still exist, compiled but inert). Physical severance is steps B/C (workspace
  split / build-time prune) and remains required before OSS. Verified: `tsc`
  clean, lint at baseline (7/16), 228 tests pass, local build zero-secret green,
  cloud build with secret green. Docs: ROADMAP (step A done + B/C framed),
  README (build step drops the placeholder).
- **2026-07-15** — **Local edition: local embeddings that actually work**
  (fulfils the 2026-07-14 "local = local embeddings" decision, which was
  recorded but never wired — user asked point-blank "if I do npm install will
  it use local embeddings?", and the honest answer was no). Two parts:
  (1) **Configurable pgvector column dimension** — the embedded DB hardcoded
  `vector(1536)`, so a local model like Ollama `nomic-embed-text` (768-dim) was
  rejected at store time. `ensureSchema` now takes `{ embeddingDim }` and, on
  the FRESH build (columns empty → safe), `ALTER`s `entities.embedding` +
  `doc_chunks.embedding` to that dimension before creating the hnsw index; the
  `.schema-version` marker is now `<version>:<dim>` so a dim change re-pushes.
  (2) **Offline-first defaults** — `serve` (bin `embeddingDefaults` / app-side
  `localEmbeddingDefaults`) points embeddings at a local Ollama server
  (`http://localhost:11434/v1`, `nomic-embed-text`, `EMBEDDINGS_COLUMN_DIM=768`)
  **only when no cloud embeddings key/URL is set** — an OpenAI-key user keeps
  their 1536 provider untouched; `serve` also exports `DATAMODO_DATA_DIR`.
  Everything stays fail-soft: no Ollama/model → `embedTexts` returns null →
  keyword-search fallback (no regression), and the cloud path is byte-identical.
  `lib/llm/embeddings.ts` is UNCHANGED (the OpenAI `dimensions` API param still
  only fires on `EMBEDDINGS_DIMENSIONS`, which the local default doesn't set).
  Verified: `tsc` clean, lint at baseline (7/16), 228 tests pass + BOTH guarded
  DB integration tests green — the new one builds the schema at 768 dims against
  real pglite and asserts `entities.embedding` is `vector(768)` and a 768-d
  vector stores + ANN-round-trips (sim ~1). The live Ollama HTTP call isn't
  exercised in CI (no Ollama) — flagged, and it's fail-soft. README gained a
  "Run it locally" section (install → LLM options incl. the "your Claude
  subscription isn't an API key, but MCP lets you use it" note → local
  embeddings → mailboxes). Docs: MEMORY (decision → shipped), STATE env matrix.
- **2026-07-15** — **Local edition, phase 3b: manage IMAP mailboxes from the
  dashboard + poller hot-reload** (follows 3a below; the CLI-only friction was
  the gap). Two parts, both gated on `isLocalMode()`:
  (1) **Hot-reload** — `startConnectors` now re-reads `connectors.json` at the
  start of EVERY tick (was once at boot) and lazy-loads imapflow, so a mailbox
  added/removed at runtime is picked up within one 60 s interval with no `serve`
  restart; a corrupt file is logged, not fatal; the returned handle exposes
  `tick()` (for a future "poll now" + tests). A newly-added mailbox still goes
  through the first-run UID high-water mark (no backfill), then captures new
  mail. (2) **Dashboard UI** — a new local-only route
  `app/api/local/connectors` (GET list / POST add / DELETE remove) writes the
  SAME `connectors.json` the CLI uses, via shared store helpers moved into
  `imap-poll.mjs` (`writeConnectors`/`addConnector`/`removeConnector`/
  `publicConnectors`, all re-validating through `parseConnectors`, chmod
  `0600`); the CLI `connect` command was refactored onto those helpers (one
  validated path). A `ConnectorsCard` in Settings (shown only when the
  `ControlCenter local` prop is set) lists mailboxes and adds/removes them;
  passwords are WRITE-ONLY (sent on add, `publicConnectors` strips them, never
  echoed). `serve` now also exports `DATAMODO_DATA_DIR`; the app resolves the
  data dir via a new pure `localDataDir()` (env → parent of `BLOB_DIR` →
  `~/.datamodo`). Verified: `tsc` clean, lint at baseline (7/16) — matched the
  codebase's `live`-guarded `.then()` effect pattern to avoid the
  set-state-in-effect rule — 226 tests pass (3 new: store round-trip incl. the
  no-password-leak check, duplicate-id rejection, and an end-to-end hot-reload
  drive: add a mailbox after start → next tick records the high-water mark and
  captures nothing → new mail arrives → following tick captures it), `next
  build` green (both `/api/local/*` routes compile), CLI add/list/remove
  smoke-tested through the shared helpers. Live IMAP still not in CI.
- **2026-07-15** — **Local edition, phase 3a: IMAP BYOB connector** (roadmap
  "Phase 3 — BYOB connectors, IMAP first"). A self-hosted install has no public
  URL, so the cloud webhooks don't apply — instead it PULLS from the user's own
  mailbox. `datamodo connect --host imap.gmail.com --user you@… --pass <app-pw>
  [--mailbox INBOX] [--insecure]` writes a `0600` `connectors.json` (with
  `--list` / `--remove <id>`); `datamodo serve` then, once the dashboard is up,
  runs an in-process poller (imapflow) that watches each mailbox on a 60 s tick.
  First sight of a connector records the UID high-water mark and captures
  nothing (so connecting an old mailbox doesn't backfill years of mail); from
  then on each NEW message's raw RFC822 is downloaded and POSTed to a new
  local-only route `POST /api/local/imap` (gated on `isLocalMode()` + a
  per-install `INGEST_WEBHOOK_SECRET` persisted at `~/.datamodo/.ingest-secret`),
  which parses it (mailparser), maps it to an `IngestEnvelope`, resolves the
  single local org, and feeds it through the SAME `ingest()` + extraction-kick
  path as every other channel. Per-connector UID cursor lives in
  `connectors-state.json`; the message-id (namespaced by connector) is the
  idempotency key; a rejected ingest doesn't advance the cursor (retried next
  tick). Split by runtime: the mapping (`lib/local/connectors/imap.ts`, TS) is
  used by the route; config-parse + cursor + poll (`imap-poll.mjs`, plain JS)
  are used by the CLI, which can't import TS. The `after()` extraction kick was
  extracted into a shared `lib/ingest/kick.ts` used by both `/api/ingest` and
  the new route. New deps: `imapflow`, `mailparser` (+ `@types/mailparser`);
  `mailparser` added to `serverExternalPackages`. Verified: `tsc` clean, lint
  at baseline (7/16), 224 tests pass (13 new, incl. the poll loop against a
  FAKE IMAP client + fetch — no network), `next build` green (the
  `/api/local/imap` route compiles), and the `connect` add/list/remove CLI
  path smoke-tested (derived id, `0600` perms). NOT verified: a live IMAP
  session (no server in CI) — flagged, consistent with prior local phases.
  Still TODO in phase 3: Telegram, Slack Socket Mode, WhatsApp/Teams dead-drop,
  and a dashboard UI to manage connectors (today CLI-only).
- **2026-07-15** — **Local edition: no login** (user ask: "also for the local,
  remove the auth, the user do not even need a login"). In local mode the app
  no longer has any auth surface — you open localhost and land directly in the
  dashboard as the single `LOCAL_USER`. Implementation, all gated on
  `isLocalMode()`/`DATAMODO_LOCAL=1` so the cloud path is byte-identical:
  `proxy.ts` short-circuits the Neon Auth middleware (it used to redirect
  `/dashboard`→`/login` before the single-user session bypass could apply — the
  real blocker); the login/register pages, the marketing landing, and `/` all
  `redirect("/dashboard")`; the `login`/`signup`/`signout` server actions no-op
  straight into `/dashboard` (nothing to sign into/out of); and the dashboard
  header hides the sign-out control via a new `ControlCenter local` prop
  (`app/dashboard/page.tsx` passes `local={isLocalMode()}`). `localServeEnv`
  exports placeholder `NEON_AUTH_COOKIE_SECRET`/`NEON_AUTH_BASE_URL` so the auth
  lib doesn't throw at import even though its session/middleware path is never
  reached locally. Verified: `tsc` clean, lint at baseline (7/16), 210 tests
  pass, `next build` succeeds (the auth route needs a cookie secret at
  page-data collection — pre-existing, unrelated to this change). Cloud login
  is untouched.
- **2026-07-14** — **Local edition, phase 2: zero-setup embedded database**
  (user ask: "cant you create the databases for the user local directly?").
  `datamodo serve` now runs its OWN Postgres — no Docker, no install, no
  `DATABASE_URL`. `lib/local/embedded-db.mjs` opens **pglite** (Postgres in
  WASM, with the `vector`/`pg_trgm`/`pgcrypto`/`btree_gin`/`btree_gist`/
  `uuid-ossp` extensions) at `~/.datamodo/pgdata`, fronts it with
  **pglite-socket** on a free localhost port, and on first run builds the
  schema via `prisma db push` over the socket (`db push` — NOT `neon/schema.sql`,
  which is a hand-edited dump with inline-FK-before-PK ordering that won't load
  into an empty DB; Prisma emits correct dependency order) then swaps the two
  embedding indexes from btree (can't index a 1536-d vector — 6160 B > btree's
  2704 B max) to hnsw/`vector_cosine_ops`, matching cloud. `lib/prisma.ts` uses
  `@prisma/adapter-pg` (node-postgres) → the socket when `DATAMODO_LOCAL`,
  else the Neon WS adapter. CLI `serve` picks a free port, boots the DB,
  `ensureSchema` (idempotent via a `.schema-version` marker), then spawns Next
  with the local env; SIGINT/exit close pglite. New deps `@electric-sql/pglite`
  + `-socket`, `@prisma/adapter-pg`. Verified: a guarded integration test
  (`DATAMODO_TEST_DB=1`, `tests/embedded-db.test.ts`) boots the real stack —
  schema builds (>15 tables), `entities.embedding` is `vector`, and an
  org→entity→**ANN (sim=1) + trigram** round-trip works on the actual tables;
  CLI runs (init shows the embedded-db path, serve boots it); tsc, lint ==
  baseline, `next build` green with the pg adapter imported. NOT verified: the
  full Next dashboard booting against the socket (sandbox OOMs on `next start`)
  — every component below it is proven, and it's the same app that builds
  green. Still open: ship the built Next standalone IN the npm package
  (today `serve` falls back to `next start`), and the build-level code-split.
- **2026-07-14** — **Local edition, phase 1: the `datamodo` CLI + single-user
  mode + fs blobs** (user ask: npm-installable self-hosted — `npm install
  datamodo` → `datamodo serve` → dashboard on localhost, pick your LLM). Also
  amended MEMORY: cloud product embeds cloud-side, LOCAL edition embeds LOCAL
  (privacy/no-key/offline; the one-space rule is auto-satisfied when the whole
  deployment is one user). Shipped: `bin/datamodo.mjs` (commander CLI — `init`
  scaffolds `~/.datamodo/blobs` + prints next steps, `serve` resolves config /
  ensures dirs / boots the built Next standalone or `next start` with the
  local env / guides the user when no DATABASE_URL, `--version`/`--help`); pure
  `lib/local/config.ts` (`resolveLocalConfig` flags>env>default,
  `localServeEnv`, `LOCAL_USER`, `isLocalMode`); `DATAMODO_LOCAL=1` →
  `getSessionUser` returns the one fixed local identity (no Neon Auth;
  provisioning runs like any first sign-in); `BLOB_DIR` → `lib/storage/blob-fs.ts`
  behind the same `putBlob`/`getBlob` chokepoint (traversal-proof); `bin` +
  `commander` in package.json. The cloud path is untouched — every local
  behavior is gated on `DATAMODO_LOCAL`/`BLOB_DIR`. Verified: CLI run
  end-to-end (init creates dirs, serve guides without a DB, version/help),
  7 new unit tests incl. an fs-blob round-trip + traversal-proof (210 pass),
  tsc, lint == baseline, `next build` green. NOT done (honest): the embedded
  zero-setup DB (phase 2 — pglite + pglite-socket + `@prisma/adapter-pg`, both
  pglite deps already present), shipping the built app in the npm package, and
  the BUILD-LEVEL code-split (the roadmap's HARD REQUIREMENT — phase 1 is a
  flag-gated single binary, so the cloud code is present-but-dormant, which
  does NOT yet satisfy "cloud code physically absent from the OSS artifact").
- **2026-07-14** — **BYOK provider cost tracking** (user ask): track what the
  user's OWN LLM key cost while datamodo used it — NOT the datamodo
  subscription. Both providers now report per-call token usage via a new
  `onUsage` hook (`ProviderHooks`/`LlmUsage` in `lib/llm/*`); OpenAI-compatible
  reads `usage.prompt_tokens/completion_tokens` (and, for OpenRouter, requests
  `usage:{include:true}` to get the EXACT `usage.cost`), Anthropic reads
  `usage.input_tokens/output_tokens`. `llmForUser` wires `usageHooks(org,user)`
  ONLY on BYOK (cloud-mode runs on our platform key = our cost, not theirs).
  Pure cost core `lib/datamodo/llm-cost.ts` (prefix-matched list-price table,
  `estimateCostUsd` → null for unknown/local models — never a guessed number;
  OpenRouter's exact cost is preferred and marked `estimated:false`). Shell
  `usage.ts`: `recordUsage` (fail-soft insert — a lost row is an imperfect
  estimate, never a billing error; survives an unmigrated table) +
  `usageSummary` (groupBy per provider/model, total, hasUnpriced flag). New
  `llm_usage` table (migration `20260714120000` + Prisma model + `generate`).
  `GET /api/usage?days=` + a "Your provider spend" card in Settings (30-day
  total + per-model breakdown; ~ = estimated, — = unpriced; only shown for
  BYOK non-Ollama). Verified: 4 new unit tests on the cost core (203 pass),
  tsc, lint == baseline, build green, AND live-fired the record→groupBy path
  against a throwaway local Postgres (migration applied clean; totals exact:
  Sonnet $0.075 + Haiku $0.045 + OpenRouter exact $0.0021 = $0.1221,
  hasUnpriced true for Ollama). ⚠ **Migration must be applied on dev+prod
  Neon branches** — the ledger is dormant (fail-soft) until then, and it never
  live-fired against a real provider's usage block (no key here — the
  Settings card fills in once the live-fire pass runs on BYOK).
- **2026-07-14** — **Scanned-PDF OCR** (roadmap; the vision tier's v1 cut,
  now closed). A PDF whose text layer comes back empty/near-empty is a SCAN
  (pixels, not text) — `isLikelyScannedPdf` (pure, < ~24 non-space chars ×
  page count) detects it; `rasterizePdfFirstPage` renders page 1 to a PNG via
  `unpdf`'s `renderPageAsImage` + native `@napi-rs/canvas` (new dep;
  `serverExternalPackages` in `next.config.ts` keeps the `.node` binary out of
  the bundler), and `documents.ts` feeds it to the SAME `extractFromImage`
  vision tier a photo uses. Fail-soft end to end: no text AND not scanned → as
  before; scanned but no canvas / no vision key / bad bytes → `metadata_only`
  (the rasterizer returns null, never throws). `indexing` = full for a 1-page
  scan, partial when the PDF has more pages (v1 reads page 1 — most
  receipts/invoices are one page; multi-page is the follow-up). Verified:
  3 new unit tests on the detector (199 pass), tsc, lint == baseline, build
  green, AND live-fired the rasterizer — a real PDF → a 9004-char base64 PNG
  with a valid PNG header, garbage input → null. Not run against the LLM
  vision model (no key) — the wiring past the raster is the proven photo path.
- **2026-07-14** — **Per-entity blame** (Review-track follow-up): the entity
  page's "◷ History" disclosure (`EntityHistory`) gained a **story ⇄ blame**
  toggle. Blame is the git-style commit log filtered to that entity
  (`GET …/timeline?view=commits&entity=<id>` — `buildCommitLog`'s `entityId`
  seam, already there, narrows each commit's diff lines to facts touching the
  entity), rendered with the Commits view's `CommitCard` — so an entity page
  now shows exactly which extraction run added or changed each of its facts,
  supersessions as `~ was → now`. Fetches lazily per tab; story fetches the
  timeline events as before. Verified: tsc, lint == baseline, 196 tests, build
  green, new `entity-blame` shoot ✓ (INV-4417's correction + original commits,
  amount strikethrough diff). Still open from the track: a richer standalone
  supersession-diff view.
- **2026-07-14** — **Outbound sync, phase 1: push a table to the user's own
  Postgres** (roadmap). Philosophy fit — every view is a projection, so an
  external DB is just another target. One-way, idempotent: upsert keyed on the
  datamodo row id (a `dm_id text PRIMARY KEY` + `dm_synced_at`), so re-syncing
  converges the user's table to datamodo instead of duplicating. Pure SQL core
  `lib/datamodo/sync-postgres.ts` (`buildSyncPlan` — quoted `CREATE TABLE IF
  NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` (additive, never drops) + a fully
  parameterized `ON CONFLICT DO UPDATE`; `safeTableName` sanitizes to a legal
  identifier; `rowParams` coerces by column type, all-junk numbers → NULL not
  0). Shell `sync-outbound.ts` defines `OutboundWriter` (the ONE-interface seam
  future Sheets/Drive/fs writers implement) + `postgresWriter` (uses `pg`, new
  dep; SSL opportunistic, statement timeout, friendly error mapping).
  `POST /api/sync/postgres` (org-scoped; conn string per-request, never
  stored). UI: a "↑ Sync out" panel in the table editor (`SyncOutPanel`).
  Verified: 6 new unit tests (196 pass), tsc, lint == baseline, build green,
  AND **live-fired against a throwaway local Postgres**: two pushes of
  overlapping rows → the table holds 3 rows not 5 (upsert proven), amounts
  updated, name sanitized "Unpaid Invoices!" → unpaid_invoices, blank/"n/a"
  cells → NULL. (First outbound feature actually run end-to-end this session.)
- **2026-07-14** — **MCP server, phase 2 (pull model + reads)**: three
  additions to the endpoint. `process_inbox` — raw `stored`/`failed` items
  with their loaded text (`loadItemText` now exported), read-only so cron and
  the client never double-process; the sub-powered client extracts and files
  with the item's id. `get_entity` — one entity's full record (facts +
  confidence + source counts + `body_md`). `submit_extraction` gained an
  optional `itemId`: when present it's validated against the org and the
  extraction attaches to that queued item (the push-path new-item capture is
  the `else`); EITHER path marks the item `analyzed` + stamps
  `EXTRACTION_VERSION` AFTER `ingestExtraction`, so the cron tick never
  re-extracts. Verified: tsc, lint == baseline, 190 tests, build green (the
  live `next start` tools/list probe kept OOM-ing the sandbox — transport
  already proven identically in phase 1; the 8 tools register through the
  same `server.tool` mechanism the green build compiles). OAuth = phase 3.
- **2026-07-14** — **MCP server, phase 1** (roadmap's biggest track; the
  strategic "run datamodo on a Claude subscription" play): streamable-HTTP
  MCP endpoint at `app/api/mcp/[transport]` (`mcp-handler` 1.1 +
  `@modelcontextprotocol/sdk` 1.29 + `zod` 4; stateless — no Redis, SSE off).
  Six tools closing the extract-loop the architecture was built for: READ
  `list_kinds` (the registry steers the client extractor), `search_entities`
  (resolution candidates — GraphRAG text-linking seeds ranked first),
  `get_context` (graph-first evidence as text), `pending_reviews`; WRITE
  `submit_extraction` — strict zod contract (`mcp-extraction.ts`; dangling
  localIds / bad dates bounce back as fixable messages), source captured via
  the normal `ingest()` as an `upload` item (`meta.via="mcp"`) then marked
  `analyzed` + stamped `EXTRACTION_VERSION` so the cron tick never re-extracts
  it, then the SAME deterministic `ingestExtraction` (adjudication fail-soft
  without a server LLM key — ambiguity becomes review proposals, never
  auto-merges) — and `resolve_review` (same accept/reject side-effects core).
  AUTH: per-user HMAC-derived bearer tokens (`mcp-token.ts`,
  `dmk_<user>.<mac>` — zero schema change, stateless, constant-time verify;
  documented trade-off: per-user revocation waits for OAuth phase 2, rotate
  `MCP_TOKEN_SECRET` to revoke all); `GET /api/mcp-token` + Settings
  "✦ Connect Claude" card reveal URL/token/`claude mcp add` one-liner.
  Verified: 4 new unit tests (190 pass — token roundtrip/tamper/forge,
  extraction contract), tsc, lint == baseline, build green, AND a live
  protocol probe against `next start`: initialize → serverInfo "datamodo",
  tools/list → all six, no/tampered token → 401. NOT verified: a real Claude
  client end-to-end (needs a deployed URL) and tool calls against a live DB
  (sandbox has none) — first MCP checks after the dev deploy.
- **2026-07-14** — **Review = ALL change: Timeline moved under Review + a
  git-style Commit log** (roadmap, user call same day — revises the
  2026-07-11 "Review owns pending / Timeline owns learned" split). The Review
  tab gained its own flat toggle (✓ Pending · ⎇ Commits · ◷ Timeline — the
  Data toggle lost its Timeline pill; per-entity "◷ History" on entity pages
  unchanged). NEW: `buildCommitLog` in the pure timeline core — one commit
  per extraction run (source item), its facts as the diff: a fact that
  superseded an older one renders `~ was → now` (via the `supersededBy` back
  reference), the rest `+ added`; changes sort before adds; runs that wrote
  nothing aren't commits; `entityId` filter is the seam for per-entity blame
  later. Served by `GET /api/knowledge/timeline?view=commits` (route
  refactored to fetch inputs once, project twice); rendered by
  `CommitLogView` (short-id chip, channel dot, `+N ~M` counts, expandable
  diff lines, "show N more"). Verified: 2 new unit tests (186 pass), tsc,
  lint == baseline, build green, new `commits` shoot ✓ (headers, strikethrough
  was→now, relationship values coral). Remaining from the track: per-entity
  blame view + richer supersession diff.
- **2026-07-14** — **Ollama as a first-class keyless provider** (roadmap):
  `ProviderName`/`AiProvider` gained `"ollama"` — `getLlmProvider("ollama")`
  reuses the OpenAI-compatible provider with a new `keyless` flag (no
  authorization header when keyless AND no key; an `OLLAMA_API_KEY`/BYOK key
  still rides along for authenticated proxies). Bare pasted URLs normalize to
  `/v1` (`normalizeOllamaUrl` — custom proxy paths survive). BYOK: the Ollama
  preset in Settings turns the key field into a SERVER URL (same
  `byok_key` column, no migration — `ai_provider` is a plain text column);
  `llmForUser` routes it as `baseUrl`. Embeddings + transcription now count a
  custom `*_BASE_URL` as configured without a key, and embeddings pass an
  optional `EMBEDDINGS_DIMENSIONS` through as the OpenAI `dimensions` param.
  Documented dimension contract: columns are `vector(1536)`; a 768-dim model
  fails soft at store time (column widening = local-edition follow-up, needs
  DDL). Also gave `lib/llm/*` internal imports explicit `.ts` extensions so
  the layer is unit-testable under node strip-types. Verified: 5 new
  stubbed-fetch tests (184 pass — keyless header behavior, URL routing,
  key-required still enforced), tsc, lint == baseline, build green. NOT
  live-fired against a real Ollama daemon (none in the sandbox).
- **2026-07-14** — **Review cards: one core, two skins — chat bubbles get full
  PR fidelity** (roadmap "Chat review bubbles", user call same day): new
  `app/dashboard/review-card.tsx` renders every review kind's EVIDENCE body
  once (`ReviewCardBody`: merge side-by-side + match% + reason · conflict
  was→now diff · extraction snippet+facts · off-template facts · category
  proposal samples+drafted template) with a `ReviewSkin` parameter —
  `PAPER_SKIN` for Review Studio, `INK_SKIN` for the chat's datamodo bubble
  (warm ink, ONE coral accent, status tones lifted for dark contrast).
  Review Studio's five kind cards refactored to `CardShell` (kind header +
  shared body + kind footer/actions) — net ~100 lines deleted; the chat's
  "✦ needs your OK" bubble now shows the full evidence under each numbered
  question (GET /api/chat returns the typed `ReviewItem`s from
  `listPendingReviews`, filtered to the ping questions; ✓ yes/✗ no and the
  side-effects core unchanged). Verified: tsc, lint == baseline, 179 tests,
  build green, `chat` + `review` shoots ✓, scripted expand-a-row checks on
  Studio (merge body + conflict diff render from the shared core, no page
  errors). Channel pings (WhatsApp text) unchanged — text-only by nature.
- **2026-07-14** — **GraphRAG: grounded answers start from `facts`** (roadmap
  "Graph-first retrieval", all four steps): `/api/search?answer=1` now (1)
  links the query to seed entities — new pure `lib/datamodo/graphrag.ts`
  `linkQueryEntities` (label/natural-key coverage ≥ half the label, stricter
  than keyword search by design) + `annLinkEntities` in knowledge.ts (ANN over
  `entities.embedding`, current-space gate, sim ≥ 0.35) — then (2) traverses
  the fact graph via `expandFromSeeds` (the ONE `buildAdjacency` rule;
  neighbors ranked by seed-tie weight; seed-touching facts lead, then
  confidence; hop-2 named by label), (3) SCOPES semantic chunk retrieval to
  the linked neighborhood (`searchChunks` gained `vector` — one query
  embedding shared across both legs — and `entityIds`; keyword recall stays
  global), and (4) cites through the existing entity machinery unchanged
  (evidence rides KnowledgeHit via `mergeKnowledgeHits`; MAX_ENTITY_SOURCES
  6→8; UI result lists keep plain keyword hits — only the answer runs on
  graph evidence). Fail-soft leg by leg. Verified: 4 new unit tests (179
  pass), tsc, lint == baseline, `next build` green. NOT live-verified (no DB
  or keys in the sandbox — `DATABASE_URL` is empty here; WS + HTTP smoke
  attempts both dead-ended): the two raw-SQL legs (`annLinkEntities`, the
  `= ANY(::uuid[])` chunk scope) follow knowledge.ts's proven ANN pattern and
  degrade to keyword evidence on any error — first thing to eyeball in the
  live-key pass.
- **2026-07-14** — **Chat: address a specific agent** (roadmap track, parts 1+2
  — part 3 "suggested reroute" deferred until a live LLM key): the composer
  gained a "to" chip row (dropdown: ✦ datamodo general + each ACTIVE agent
  with its purpose one-liner, ✓ on the current pick, × to clear) and inline
  `@agent` autocomplete (new pure core `lib/datamodo/chat-address.ts`:
  `activeMention` caret-aware span — never matches emails, never spans lines;
  `matchAgents` prefix > word-prefix > substring; `stripMention`; ↑↓/Enter/
  Tab/Esc keyboard, popover owns Enter while open). Recipient is sticky; sent
  bubbles carry a "→ agent" chip. POST /api/chat accepts `agentId` (validated
  against the org), stores `meta.agent_id`/`agent_name`; GET returns active
  agents + each message's addressee. `runExtractionForItem` now resolves
  `meta.agent_id` → the agent's `purpose_text` and finally FEEDS the dormant
  `agentPurpose` prompt plumbing — addressing changes what extraction looks
  for. No addressee = general agent, deterministic (roadmap's "no silent
  guessing" rule). Also swapped the optimistic-bubble id from `Date.now()` to
  a ref counter (react-hooks/purity). Verified: 4 new unit tests (175 pass),
  tsc, lint == baseline, `chat` shoot ✓ + scripted headless checks (dropdown
  pick, @mention popover, Enter-pick strips the token and sets the sticky
  recipient). NOT live-fired: the purpose→extraction steer needs the real key.
- **2026-07-14** — **Semantic (ANN) passage search** (roadmap small follow-up;
  prep for the live-key pass): `searchChunks` now runs TWO recall legs in
  parallel — the existing keyword scan plus, when `opts.query` is set and an
  embeddings key exists, one `embedTexts([query])` call + pgvector ANN over
  `doc_chunks.embedding` (current-`embedding_model` space only, sim floor
  0.2). New pure core `lib/datamodo/passage-rank.ts` (`mergePassages`): dedupe
  by (entity, seq); both-paths passages add scores (similarity boosts the
  keyword rank); semantic-only hits score < 1 so they NEVER outrank an exact
  match — semantic extends recall, keyword keeps precision. `ChunkHit` moved
  to the pure module (chunks.ts re-exports). `/api/search` passes the raw
  query. Fail-soft end to end: no key / no vectors / API error → keyword-only.
  Verified: 4 new unit tests (171 pass), tsc, lint == baseline. NOT live-fired
  (no embeddings key in sandbox — it activates with the real key).
- **2026-07-14** — **⊛ Graph custom-rendering pass** (user ask: "you can
  customize fully"): nodes are now CARDS, not discs — a custom WebGL node
  program (`graph-card-program.ts`, subclasses sigma's `NodeCircleProgram`,
  swaps the circle SDF for a rounded-rect: paper fill + kind-colored frame,
  with PICKING_MODE kept flat so clicks hit the card shape) plus matching
  canvas-2D label/hover drawers (label seats against the card edge; hover is
  a paper rounded-rect halo with a warm ink shadow). Edges CURVE
  (`@sigma/edge-curve`, new dep). Clicking a card opens the Explorer's
  natural-shape SIDE PANEL on the right (same grammar: kind kicker, "◍ Walk"
  hand-off, "Full page ›", `EntityPageBody` flat variant — record table,
  relationships, full markdown body; wikilinks/relationship chips recenter
  the graph and glide the camera via `fly` on the selection). The link
  inspector became a proper `LinkInspector` component with clickable
  endpoints. **Bug found + fixed while verifying: sigma 3.0.3's
  `stagePadding` setting misaligns the picking framebuffer — EVERY click
  reads as stage (repro'd in an isolated bisect: base✓ / +stagePadding✗) —
  so the override is gone (default 30).** Also reshaped `select`/`goTo` so
  render-created handlers never read refs (react-hooks/refs). Verified:
  tests 167 pass, tsc clean, lint == baseline, build green, `graph` shoot ✓,
  scripted headless checks: card+curve rendering, node click → markdown
  panel, wikilink → panel nav + camera glide, curved-edge click → inspector.
- **2026-07-14** — **⊛ Graph: the whole-vault sigma.js surface shipped as a new
  Data sub-tab next to ◍ Explore** (user ask; the roadmap's "Explorer v2
  experiment" spike). graphology holds the graph, sigma.js draws it (WebGL);
  NOT centered on one node — the entire vault at once, user-chosen layout
  (✦ Organic/ForceAtlas2 · ◯ Circle · ◉ By kind/circlepack, all deterministic).
  New pure core `lib/datamodo/vault-graph.ts` (`buildVaultGraph` — every entity
  a node incl. isolated ones, ONE edge per pair carrying every directed
  predicate; reuses `buildAdjacency`) + `app/dashboard/graph-view.tsx` (lazy
  sigma/graphology imports, kind-colored dots sized by degree, coral focus
  dims the rest, node panel with "◍ Walk from here"/"open ›", edge click →
  link inspector, kind legend, WebGL fail-soft). Existing Explorer untouched;
  keep/kill side-by-side call stays open (ROADMAP). Deps added: `graphology`,
  `graphology-layout`, `graphology-layout-forceatlas2`, `sigma`. Verified:
  4 new unit tests (167 pass), tsc clean, lint == baseline (fixed a
  setState-in-effect and an unescaped-entity error the first cut introduced),
  `next build` green (page-data collection needs dummy `NEON_AUTH_*` in the
  sandbox — env, not code), new `graph` shoot harness ✓ + scripted checks of
  all three layouts, node click (panel + focus dimming) and edge click (link
  inspector) in headless Chromium. Not verified live: real-vault scale (the
  FA2 worker is a known follow-up).
- **2026-07-14** — **Explorer: removed edge predicate labels on the base walk
  too** (user call, revised from the original "base keeps names, zoom-out drops
  them"). Now NO zoom level draws a predicate label on edges — the walk's
  `EdgeLayer` dropped its `<text>` render (and the `showLabel`/`hop`/`layout`
  plumbing that fed it); the direction dot stays. The predicate name shows only
  in the fact inspector on click. Verified via the `explorer` shoot (walk edges
  now clean, no "issued by"/"works for" text). tsc + lint clean.
- **2026-07-14** — **Explorer continuous scroll: rAF-eased so it actually
  animates** (user: "the continuous scroll doesn't really animate / doesn't draw
  the edges continuously"). The first Feature-2 cut mapped wheel deltas straight
  to `layers`, so each tick JUMPED (only a 70ms card tween) and the edges snapped
  rather than drew. Now the wheel feeds a TARGET (`zoomTarget` ref) and a rAF
  loop (`animateZoom`) eases the displayed `layers` toward it (~0.2/frame), so
  cards AND edges move together every frame and the emerging ring's edges draw
  outward continuously; it still HOLDS at whatever fraction you stop at. The
  card transform CSS-transition was dropped (rAF drives it; a tween would only
  lag the edges). Fixed a stuck-below-2 bug found via the shoot harness: the
  animator keeps the raw float in `zoomDisp` (only the RENDER maps sub-2 → walk),
  so an ease-up from the walk crosses 2 instead of pinning at the sentinel.
  `walkTo` recenter/back paths sync the zoom refs so the animator never fights
  React state. Verified via `explorer-layers` shoot: eases to the accumulated
  target (3.6 of 4 layers), ring 4 emerging. tsc + lint clean.
- **2026-07-14** — **Roadmap: added an "Explorer v2 experiment" item** (user
  ask) — try a SECOND explorer built on graphology (graph data structure +
  algorithms) rendered by sigma.js (WebGL, thousands of nodes), PARALLEL to and
  not replacing the existing hand-rolled DOM+SVG explorer (separate route/toggle
  for a side-by-side keep/kill call). Fills the whole-vault-scale niche the
  dropped Cosmos was meant to, but as a real tool. Open questions captured in
  ROADMAP: WebGL discs vs our natural-shape cards (nodes likely stay dots that
  open the existing panel on click), reproducing the brand look in sigma's
  node/edge programs, and feeding it from `entities`/`facts` while keeping the
  click→walk + edge→fact-inspector interactions. Docs-only change.
- **2026-07-14** — **Explorer zoom-out is now CONTINUOUS (Feature 2)** — reverses
  the 2026-07-13 "zoom is DISCRETE" call (user ask). The wheel no longer steps
  one ring per notch; scroll maps DIRECTLY to a float ring count (`layers` is now
  a float; SENS ≈ one ring / 320px) and HOLDS wherever you stop — the user chose
  hold-partial over settle-to-nearest. `floor(zoom)` rings are landed; the
  fraction emerges the next ring FROM THE CENTER (radius 0 → target, always
  full-blurred) with its edges drawing outward — the emerging edge's outer
  endpoint travels out so it reveals center→rim, opacity ramping with the
  emergence (`opOf` fades the emerging ring by the emerge easing). Geometry: the
  original per-integer wheel math is now `wheelGeom(KK)`, computed for `floor`
  and `floor+1` and LERPed by the fraction — landed rings shrink inward (camera
  pulls back) as the new ring grows, and the old blurred frontier "becomes less
  blurred and bigger" for free (ring K is the blurred frontier at count K but a
  sharp interior at count K+1, so the LERP does it). Only the emerging layer
  animates; landed rings/edges stay. The wheel handler is a continuous
  functional `setLayers` (no `wheelAcc`/`lastStep`/cooldown); the `<g key={K}>`
  per-step re-fade is gone (edges track every frame); recenter still blooms via
  `RingAnim.all`. Walk↔layered boundary (zoom < 2) stays a swap (3D perspective
  vs 2D wheel). Verified via the `explorer-layers` shoot harness (now a
  continuous scroll held at a fraction): 3.0 landed, 3.1 with ring 4 just
  emerging faint near center, 3.4/3.5 with ring 4 travelled ~¾ out — all render
  clean, status reads "3.x of 4 layers". tsc + lint clean, 163 tests green.
- **2026-07-14** — **Dropped the WOW/Cosmos feature + Explorer edges clickable
  at every zoom level (Feature 1)**. (1) Roadmap/MEMORY: removed "THE WOW: the
  graph engine — REPLAY + COSMOS" (user call). No separate WebGL showpiece — the
  Explorer walk + continuous zoom IS the graph surface; landing hero uses the
  live Explorer. `constellation.ts` (the LOD/cluster core kept for the Cosmos
  seam) now has no consumer → dormant, delete after a quiet month;
  `design/briefs/wow-graph-engine-brief.md` retired. (2) **Feature 1**: the
  layered (zoomed-out) edges are now clickable — a fat transparent hit path per
  edge opens the SAME `EdgeInspector` as the base walk. Layered edges are the
  light `{from,to,predicate}` shape, so `layeredEdgeToEgo` rebuilds the full
  `EgoEdge` (finds the fact on the subject entity) on click; cluster spokes
  (empty predicate) route to expand instead. The inspector render lost its
  `layers === null` gate. Layered edges carry NO predicate label (too much text
  across rings) — the predicate shows only inside the inspector. `LayeredView`
  gained `hoverEdge`/`selEdge`/`onEdgeHover`/`onEdgeClick` props (same contract
  as the walk's `EdgeLayer`) — the base and layered edge code are now roughly
  unified, which sets up the planned continuous-scroll zoom (Feature 2, on the
  roadmap). Verified via the `explorer-layers` shoot harness (temporarily
  extended to click an edge while zoomed out, then reverted): the fact inspector
  opened over the layered view ("INV-900 —issued by→ Acme Group", 4 of 4
  layers), edges lit coral on select, no labels drawn on the arcs. tsc + lint
  clean, 163 tests green.
- **2026-07-14** — **Explorer: clicking a card while zoomed out RECENTERS in
  place at the same zoom level + dropped the "N hops"/"not linked yet" ring
  labels + curved the layered edges** (user requests). (1) `walkTo` now branches
  on `layers !== null`: while zoomed out it keeps the current ring count
  (clamped to the new center's `maxHop`), re-blooms every ring from the NEW
  center (`RingAnim{dir:"in", all:true}`) and updates the trail — instead of the
  old `setLayers(null)` that snapped every click back to the fully-zoomed-in
  walk. Zoom is now a property of the view, not reset by navigation. (2) Removed
  the per-ring `<text>` depth badges ("1 hop"/"2 hops"/"not linked yet"), the
  `unlinkedShown` corner note ("outermost ring = not connected to this node"),
  and the "· 2 hops" fragment in the walk's status line — the concentric card
  rings carry depth on their own. (3) Layered-view edges are now `<path>`
  quadratic arcs whose control point is the chord midpoint pulled 40% toward the
  origin (hierarchical-edge-bundling look that belongs to the concentric
  layout), in a warmer taupe (`#D3C6AF`), replacing the grey straight `<line>`
  chords. Verified via the `explorer-layers` shoot harness (temporarily extended
  to click a card while zoomed out, then reverted): breadcrumb + side panel
  recenter on the clicked node while the view STAYS at "4 of 5 layers", ring
  labels gone, edges render as faint inward arcs. tsc + lint clean, 163 tests
  green.
- **2026-07-14** — **Explorer zoom-out: cards now SPREAD from their parent on
  every layer (user: give the base walk's enter-from-parent motion to all
  layers)**. The layered view previously just popped the newest ring in place
  (`dm-rise-z` scale). Now each arriving `LayerCard` first paints at its
  parent's projected slot (½ scale, transparent) then glides to its own ring —
  the same flip `Node3D` uses on the walk. First reveal from the walk blooms
  EVERY ring from the center in a hop-staggered cascade (`RingAnim.all`); a
  single step-in only spreads the newest ring (inner rings glide-rescale).
  Entry positions come from a memoized `enterMap` (stable refs → the fleet's
  memo holds on hover), and an effect drops `ringAnim` to null after the
  entrance so later hovers stay stable. Also hardened the settle flip with a
  `setTimeout(80)` backstop beside the double-rAF, so a backgrounded tab (rAF
  paused) still surfaces the cards. Verified in a throwaway probe (27-node
  fan-out, then deleted): all cards settle visible at increasing per-hop
  distances (hop1<hop2<hop3), enter-start is opacity 0 at the parent, and the
  deep "+3 more" chip-expand still works. tsc + lint clean, 163 tests green.
- **2026-07-14** — **Roadmap: local/OSS edition code-separation made a HARD
  requirement (user call)**. Added to the "Local / open-source single-user
  edition" track: the local build must ship ONLY the dashboard + 100%-local
  storage and physically EXCLUDE the cloud backend (landing page, Neon Auth,
  Neon/serverless storage, cloud channels, billing, cron/ops, MCP host) — a
  build/packaging boundary, not a runtime `SINGLE_USER` flag (which would leave
  the closed code in the bundle). Specified the CORE vs CLOSED split (core =
  dashboard UI + pure cores + deterministic ingest + `lib/llm/*` + LOCAL
  storage/db/worker adapters; closed = `lib/auth/*`, `@prisma/adapter-neon`,
  landing, hosted channels, Stripe, cron, MCP host) and mechanical enforcement
  (separate workspace/package + storage/auth/channel interfaces + a
  dependency-boundary lint that fails if core imports the closed layer). Docs
  only: `docs/ROADMAP.md`.
- **2026-07-14** — **Bugfix: "+N more" fold cards were inert in the zoomed-out
  layered Explorer (user: deep hop-3/hop-4 chips did nothing; only the walk's
  primary ring expanded)**. Root cause: `LayerCard`'s click was hard-gated to
  non-chips (`if (!chip && !isCenter) onWalk`), and `ClusterPanel` only
  rendered while `layers === null` — so in the zoom-out view every chip at
  every depth was dead; the walk view (`Node3D`) was the only place chips
  expanded. Fix (`app/dashboard/explorer-view.tsx`): chips now fire an
  `onExpand` → the shared `ClusterPanel`, `selectedCluster` resolves against
  whichever graph is on screen (walk ego graph OR layered graph — both carry
  `.entity` + `.clusterOf`), and the panel renders in both views. Verified in
  a throwaway probe route (synthetic hub folding 10 companies into a "+3 more"
  chip at hop 4, then deleted): clicking the hop-4 chip opens the member panel
  (Company 7/8/9), a second click toggles it closed, and clicking a member
  walks to it (breadcrumb Center Person / Company 8) — the exact
  previously-dead case. tsc + lint clean, 163 tests green.
- **2026-07-14** — **Roadmap: five user-directed tracks added (planning only,
  no code)**: (1) MCP server/connectors — run datamodo on a Claude
  SUBSCRIPTION: Claude-as-extractor over MCP read tools + a schema-validated
  `submit_extraction` into the existing deterministic ingest pipeline, plus
  in-Claude review resolution (reuse review-ping cores) and a keyless
  `process_inbox` pull model; (2) Ollama as a keyless first-class provider
  (local edition + cloud BYOK pointing at any OpenAI-compatible base URL);
  (3) Review tab absorbs Timeline + gains a git-style history view (commit
  log / blame / supersession diffs from the bitemporal vault) — REVISES the
  2026-07-11 Review/Timeline IA split, decided not yet built; (4) chat review
  bubbles get Review Studio's full PR fidelity via ONE shared review-card
  core with two skins (chat ink+coral bubble; Studio restyled to brand);
  (5) outbound SYNC — one-way push of projections into the user's own infra
  (Sheets/Drive/SharePoint/OneDrive/their own Postgres/local fs), each
  connector designed for both cloud and local editions. Details in
  docs/ROADMAP.md "Next build tracks".
- **2026-07-14** — **Layered zoom-out: hover + scroll perf pass (user: "still
  a bit laggy; hover unresponsive when zoomed out")**. Root cause: every
  hover round-tripped through React and re-rendered the WHOLE tree — ~100
  layer cards AND the walk's hidden 3D scene still mounted beneath. Fixes:
  (1) hover feedback (pop-to-readable + unblur + z-lift) is now PURE CSS
  `:hover`/`:focus-visible` (a per-card `--pop` var) — zero React, zero
  latency; (2) cards are a memoized `LayerCard` whose props only change on a
  zoom step (stable callbacks via a goTo ref; riseStyle undefined-not-{}), so
  a hover re-render reconciles only the SVG edge layer; card dimming on hover
  dropped in the layered view (edge lighting carries the affordance);
  (3) the walk's 3D scene UNMOUNTS while the layers cover it (edge geometry
  re-measured on return); (4) no more `filter` transitions (blurred-layer
  compositing is expensive at 3.4k-px widths — ring promotion snaps sharp);
  (5) cadence tightened again: 120ms step spacing, NOTCH 85, glide 220ms,
  rise 260ms, sink 240ms. Probe artifact fixed: harness/probes now re-query
  the wheel target per event (the captured walk card detaches when the scene
  unmounts — real pointers always hit attached elements). 163 tests, tsc,
  lint == baseline, `next build`, cadence/step/animation probes green.
- **2026-07-14** — **Roadmap: added "Address a specific agent in Chat" as a
  Next build track** (planning only, no code). Explicit agent picker (dropdown)
  + inline `@agent_name` autocomplete, each showing the agent's short
  description; no-addressee drops default to the general datamodo agent. Logged
  with pushback: the "classify the drop and route it" idea becomes a SUGGESTED
  reroute confirmed via the existing Review flow, not silent auto-routing
  (silent misrouting buries content in the wrong agent's private dataset;
  ambiguity is common) — classify only the no-addressee path; true auto-routing
  revisited later behind a per-user opt-in. Docs only: `docs/ROADMAP.md`.
- **2026-07-14** — **Roadmap: added "Graph-first retrieval (GraphRAG)" as a
  Next build track** (planning only, no code). Captures the strategy discussed
  with the user: grounded answers should entity-link the query → traverse
  `facts` (current claims via `valid_to IS NULL`, or as-of via
  `valid_from/valid_to`; `superseded_by`+`confidence` for contradictions) as
  primary context → fall back to `doc_chunks` scoped to the linked entities →
  cite via `fact_sources`. Absorbs the older "Semantic (ANN) chunk search"
  follow-up as its fallback leg; embeddings drop to an entity-linking aid, so a
  free/local model suffices (per-row `embedding_model` already allows
  incremental swaps). Docs only: `docs/ROADMAP.md` (+ date bump).
- **2026-07-14** — **Layered zoom-out: scroll responsiveness (user: "it takes
  time to load subsequent layers — weird friction")**. The friction was
  pacing, not compute: (1) scroll events during the per-step cooldown were
  DISCARDED — now they BANK into the accumulator, so a continuous scroll
  steps at a steady cadence instead of demanding a fresh notch after every
  pause; (2) step spacing 340→160ms; (3) animations tightened (rise 480→320ms
  + 16ms stagger, glide 420→260ms, sink 320→240ms, edge re-fade lands at
  ~400ms post-step instead of ~640ms); (4) real perf nit: the edge renderer
  did two O(N) `find`s per line (O(E·N) per render) → Map lookup. Cadence
  probe: walk→4 layers in ~0.9s and back in ~0.7s of continuous trackpad
  scrolling (was ~600ms+ per step). 163 tests, tsc, lint == baseline,
  `next build`, screenshots + step/animation probes green.
- **2026-07-14** — **Layered zoom-out: ring spacing pass (user feedback on a
  live 98-node graph: cards overlap in arcs while the ring has empty space;
  the focus ring rendered SMALLER than the others)**. Two pure-core fixes in
  `buildLayeredEgo` (both deterministic — bearings stay permanent, the walk's
  shared angles stay in sync): (1) each ring's bearings BLEND toward even
  full-circle spacing, strength ∝ ring fullness vs its circumference
  (count/(9·k)) — busy rings use the whole circle, sparse rings keep pure
  parent-wedge locality; (2) a HARD FLOOR: no two ring-neighbours closer than
  half a uniform slot (order-preserving forward pass + seam squeeze). One
  view fix: the crowd factor can no longer defeat the highlight — every other
  ring is capped RELATIVE to the realized focus scale (0.82^Δ taper inward,
  frontier 0.85×), so the newest sharp ring is always the biggest on screen.
  +1 unit test (163 green), tsc, lint == baseline, `next build`, screenshots.
- **2026-07-14** — **Layered zoom-out: focus-layer highlight**. User calls,
  applied in order: (1) no blur GRADIENT — only the OUTERMOST ring (the
  frontier/preview) carries hop-2's blur+0.9 opacity; it sharpens the moment
  the next ring surfaces (otherwise far-out views blur into nothing);
  (2) the HIGHLIGHTED layer is the last sharp ring — the one just revealed:
  biggest cards (coral ring badge), sizes tapering 0.8×/ring DOWN toward the
  center ("explored ground recedes; the reading focus is the newest ring").
  The perspective-projection radii were replaced by CARD-DRIVEN radii: each
  ring gap clears the card heights of its two neighbour rings (the focus ring
  gets the room its big cards need, inner rings pack tight), then the wheel
  fits the canvas — radial overlap impossible by construction, bearings
  unchanged, layout still static between steps. Verified: 162 tests, tsc,
  lint == baseline, `next build`, `explorer-layers` screenshot (focus ring
  large + sharp, frontier blurred, taper toward center).
- **2026-07-13** — **Graph zoom, FINAL shape: the Explorer's layered zoom-out
  (physics map REPLACED)**. User reset after the calm pass: "the only thing
  you can do is go from the explorer view and zoom out … the graph stays
  centered … edges reappear at the same place … one axis … no wiggle
  (impossible since all edges are fixed), just card size + new layers." Built
  exactly that: new pure core `buildLayeredEgo` (`lib/datamodo/explorer.ts`) —
  BFS rings around the walk's center to ANY depth, permanent bearings via
  deterministic wedge subdivision (55% subtree-weight / 45% uniform blend so
  fat branches can't squeeze siblings), per-parent "+N more" folding at every
  depth, one dashed final ring for entities unreachable from the center;
  5 new unit tests (160 total). `LayeredView` in `explorer-view.tsx`: scroll
  out on the walk → rings fade in (ring spacing adapts to the busiest ring but
  NEVER to the zoom — zooming is a pure rescale, wiggle geometrically
  impossible), cards are the walk's own NodeCards scaling with the dial (hover
  pops one readable), click walks there, scroll in returns to the walk; walk
  chrome (breadcrumb/jump/panel) stays. REMOVED: the "◎ Map" pill,
  `force-graph-view.tsx`, its 3 harnesses (physics/cluster-LOD map + calm
  pass discarded); `constellation.ts` + tests stay DORMANT as the COSMOS seam
  (concept-map policy). MEMORY.md design rule updated (graph zoom = one dial,
  fixed bearings, no physics). Ring guide CIRCLES removed same day (user:
  clutter) — the card rings carry the shape, only the tiny hop badges remain.
  **Walk↔zoom continuity pass (same day)**: (1) card size is ∝ the scroll —
  layered cards are exactly walk-sized at 2 layers and shrink with the same
  factor the rings do (plus a K-independent crowd factor for busy rings), and
  the layered ring radii MATCH the walk's rings (r1/r2 = DEPTH.r1/r2) at
  entry, so scrolling out reads as a continuation, not a jump; (2) ONE bearing
  per node shared by both views — new pure `layeredAngles` +
  `depthLayout(..., angles)` override make the WALK sit its cards at the
  layered bearings (walk-only "+N more" kind-chips take the circular mean of
  their members'), so a card keeps its angle when the layers unfold;
  (3) zoom went DISCRETE (final same-day revision, user call: "scroll enough
  → one more layer; one easy recursive animation"): scroll notches accumulate
  (110 deltaY) with a 340ms per-step cooldown; each step adds/removes exactly
  ONE ring — the arriving ring's cards FALL from higher z (scale 1.75 +
  transparent → land, 28ms stagger; edges + ring badge fade in with it), a
  leaving ring lifts back off (ghost cards, animation ends inert), and the
  layout between steps is completely static (pure rescale of fixed ratios).
  Below the entry step (3 layers, or 2 if the graph is shallow) you're back
  in the walk. Playwright probe asserts: steps are one-at-a-time (a 5-notch
  burst inside the cooldown moves nothing), enter/exit animations attach only
  to the stepping ring. **Depth rules pass (same day, user call: "each layer
  = exactly the base view's rules, one more layer")**: every ring now obeys
  the WALK's own depth grammar — ring k sits one layer deeper on the walk's
  perspective math (`DEPTH.*` constants; a 2D projection of fixed radii/z, so
  positions stay exact), rendering smaller with depth + the walk's cream fog;
  the haze rule is RELATIVE to the view (user fix: "only the next layer is
  blurry — no gradient or you see nothing far out"): ONLY the outermost ring
  — the frontier — carries hop-2's blur/0.9 opacity, and it sharpens the
  moment the next ring surfaces behind it; each step pulls the camera back ONE
  layer-gap (200z); a new ring COMES UP from one layer deeper (small +
  transparent → surfaces, staggered) instead of dropping from the camera, a
  leaving ring sinks back; hovering a deep card unblurs + pops it readable;
  the edge SVG re-fades per step (keyed) so lines never visibly detach from
  the gliding cards. Verified: 162 tests, tsc, lint == baseline, `next
  build`, harnesses incl. `explorer-layers` (two paced notches → 4-layer
  screenshot showing the blur/haze gradient).
- **2026-07-13** — **Map calm pass (user feedback: "everything wiggles")**:
  split/merge transitions no longer shake the graph. Four sim rules in
  `force-graph-view.tsx`: (1) entering siblings are placed DETERMINISTICALLY
  on an evenly-spaced, overlap-free ellipse around the pinned anchor (the
  walk's ego-ring, precomputed — the collision solver has nothing to explode);
  (2) while fresh nodes land, VETERANS get ~10% force weight, so a split
  nudges the neighbourhood instead of shaking the world; (3) velocities are
  capped and alpha cools 0.96/tick (settle ≈1.5s, transitions reheat to only
  0.25 — the global-reheat-on-split was removed); (4) pins + damping release
  only when motion CEASES (alpha < 0.003) — releasing earlier let a
  full-strength coda re-shake the layout (probe caught the anchor drifting
  52 units; after the fix 0.04). Playwright probe asserts: anchor drift 0.04,
  residual wiggle 0.44 world units over 600ms post-settle. All 10 harnesses,
  155 tests, tsc, lint == baseline green.
- **2026-07-13** — **Map continuity pass (user feedback on v1)**: (1) a
  splitting cluster no longer "disappears" — its ANCHOR card inherits the
  cluster's exact world position and is PINNED there while the sim settles
  (members pop in around it, cross-links stay); merging is symmetric (the
  cluster reappears where its hub was). Verified with a playwright probe:
  0.00 world-units of anchor drift across a split. (2) Cards adopt the WALK's
  visual language — kind chip row, kind-tinted paper tones, ink
  company/dataset cards, dashed pseudo-cluster cards ("+N more inside") — so
  the map reads as the walk zoomed out. (3) The deepest zoom needs NO click:
  a lone entity card filling the screen center past `walkPx` makes the map
  FALL INTO the real `ExplorerView` INLINE (dm-drop-in transition, "◎ Back to
  map" chip bottom-center, camera pulled back on exit so it can't re-trigger);
  clicking any card dives the same way. The `AnswerGraphModal` handoff was
  replaced by this inline takeover (+`EntityPageModal` wired for "Full page
  ›"). `LOD.leafSide` 34→56 so the dive threshold lands ~3× instead of ~8×.
  New harness `force-graph-dive` (synthetic click → asserts the real walk
  mounted); `force-graph-zoom` retuned. Verified: 155 tests, tsc, lint ==
  baseline, `next build`, all 10 shoot harnesses, pin probe.
- **2026-07-13** — **"◎ Map": the semantic-zoom constellation shipped** (the
  ROADMAP "Constellation overview", built to the handoff
  `design/mocks/SEMANTIC_ZOOM_README.md`). One graph where zoom = granularity:
  zoomed out → a few big clusters; scroll in → clusters whose card crosses the
  split threshold dissolve into sub-clusters → individual entity cards; click
  any card (or zoom right onto one) → the REAL Explorer walk opens on it via
  `AnswerGraphModal` — the walk was reused, never reimplemented. New pure core
  `lib/datamodo/constellation.ts`: `buildConstellation` (recursive hub +
  seeded label propagation; kind fallback for sparse sets; disconnected dust →
  a dashed "everything else" bucket; fully deterministic), `visibleCut` (the
  LOD tree cut — split/merge hysteresis built as a fixed point so the render
  loop can't oscillate, hard 120-node cap expanding biggest-first), `cutEdges`
  (real edges bundled up to visible reps with counts). Shared adjacency:
  `buildAdjacency` extracted in `explorer.ts` and used by BOTH the walk and
  the map (guardrail: one edge rule, no drift). View
  `app/dashboard/force-graph-view.tsx` ports the constellation mock's physics
  (area-scaled repulsion, link springs, center gravity, hard collision, force
  sliders) over the visible cut only; positions publish to state from rAF
  (React hooks lint clean); wheel-zoom-at-cursor, pan, drag cards;
  reduced-motion settles silently. Wired as the "◎ Map" pill in Data
  (`control-center.tsx`). UI intentionally v1-plain — polish is a Claude
  Design pass. Verified: 11 new unit tests (155 total green), tsc, lint ==
  baseline, `next build` green, and two shoot harnesses
  (`force-graph`, `force-graph-zoom` — the latter fires real wheel events and
  caught a bug where the wheel/resize listeners attached before the canvas
  existed, i.e. zoom would have been dead on first load).
  next split, not the folder's name**. When you select a folder, the trailing
  content (files) column no longer repeats that folder's name in its header —
  the folder is already selected and highlighted in the column to its left, so
  the name was redundant. The header is now reserved for the NEXT split: it
  shows only a "+" that turns the shown files into sub-folders (and the
  standalone "+" rail only renders when there's no content column to host it).
  `files-view.tsx`; verified via the files shoot harness (content header shows
  the "+" with no folder name; the name appears once, in the folder column).
- **2026-07-13** — **Chat goes full-width + a persistent "drop any doc" hint;
  Files subtab rebuilt as a real explorer**. Chat: the thread/composer no
  longer sit in a narrow 720px left column — the container is now full-width
  (bubbles capped at `min(78/84%, 640/700px)` so they stay readable on a wide
  canvas), and an always-visible dashed drop affordance sits above the composer
  ("Drag & drop any doc here — or click to attach. PDFs, photos, spreadsheets,
  notes, voice memos") so the drag/drop/paste capability is discoverable even
  once the empty state is gone (`app/dashboard/chat-view.tsx`). Files subtab:
  the cramped stacked "tree box above the grid" is replaced by a two-column
  **explorer** — a persistent sticky sidebar folder tree (full-width rows,
  hover feedback, rotating caret, nested indent guide-lines) + a breadcrumb
  path (each segment clickable, opens ancestors) + the file grid in the main
  pane (`app/dashboard/files-view.tsx`). The lens ENGINE is unchanged — folders
  are still deterministic projections of the graph, still "nothing is ever
  moved"; only the UI was rebuilt. Considered react-arborist/dnd-kit but a
  drag-to-move tree contradicts the lens model (a file has no single home), so
  we kept lenses and polished the surface. Verified: tsc green.
  **Then (same day) — the tree is user-built, any depth**: the fixed two-level
  stack ("lens + then") became an ORDERED classification PIPELINE the user
  assembles step by step — a chip row "client › month › type" where each step
  opens a searchable dimension picker (grouped Relationships / Concepts /
  Attributes; hides dimensions already used); steps reorder (‹ ›) and remove
  (×), and "+ add a level" appends with no depth cap. Because order = nesting
  and the sidebar echoes the pipeline as a depth legend, every subfolder's
  "why" is visible. Engine change: `buildLensTree` now recurses by DEPTH INDEX
  instead of `stack.indexOf(lens)` (which silently collapsed a repeated
  dimension) — a new 3-level unit test locks in arbitrary depth. Verified:
  144/144 unit tests pass, tsc green.
  **Then (same day) — rendered as a macOS Finder column view**: the sidebar
  tree + separate chip-row builder collapsed into ONE surface — horizontal
  **Miller columns**, one per pipeline step. Each column's HEADER *is* the
  split control (click to change the dimension via the searchable picker;
  ‹ › reorder; × remove), and its body lists that level's subfolders; selecting
  a folder drills the next column open, so you see every subfolder at each step
  side by side and folders nest left → right. An "+ add a level" ghost column
  appends; the picker popover is fixed-positioned so it escapes the
  horizontally-scrolling strip. **Then (same day) — made it TRUE Finder**: the
  files now render INSIDE a trailing column (compact FileRows: mono type badge
  + name + size + ↓, click opens the entity page) instead of a grid below; the
  "+ add a level" shrank to a small plus pinned at the top of a slim rail; and
  the breadcrumb / search / doc grid below were all removed — everything lives
  in the columns. With no splits defined, one "All files" column lists
  everything. Verified: 144/144 tests, tsc + eslint green.
  **Bugfix (same day)**: adding a level looked like a no-op — the progressive
  Finder view only rendered columns along the current selection, so a freshly
  added split had no column until you happened to drill into it. Fix: EVERY
  defined step now renders its own column, so the split label (header) is
  visible immediately; a not-yet-drilled column shows an empty-state ("Pick a
  folder in the column to the left to fill this split") instead of vanishing.
  `addStep` just appends and preserves the selection. Added a Files shoot
  harness (`scripts/shoot/harnesses/files.tsx`, mocked fetch) and drove it in
  headless Chromium: "+ add a level" → "month" immediately shows the Client +
  Month columns (Month with its empty-state), and drilling Client → Month leaf
  shows the files column (MSA.pdf, Receipt June.jpg). Screenshot-verified.
- **2026-07-12** — **The chat is two-way: pull requests land in the thread**.
  Pending reviews now ride `GET /api/chat` as `questions` and render as
  datamodo's own ink bubble — "✦ needs your OK", numbered, with ✓ yes / ✗ no
  buttons per question; tapping posts `POST /api/chat/review` which applies
  the SAME accept/reject side-effects as Review Studio and the WhatsApp
  reply path, with an optimistic receipt line ("✓ approved — merge …") and
  honest fallback on conflict. Closes the loop teased when the channel
  pull-requests shipped. Verified: tests/tsc/lint/build green; shoot shows
  the bubble with the demo account's two real pending decisions.
- **2026-07-12** — **Chat brand pass (10x UI)**. Evaluated open-source chat
  kits per the user's suggestion (chatscope ships its own theme;
  reachat/prompt-kit are Tailwind/shadcn — all three fight the design
  system); rebuilt hand-rolled on the app's own motion vocabulary instead.
  Now: day separators (hairline + mono kicker), right-aligned paper bubbles
  (dm-drop-in entrance, warm shadows), OPTIMISTIC sends with image
  thumbnails in the bubble, attachment tray with real previews (image thumbs,
  playable audio for voice notes) and per-item remove, drag-&-drop veil +
  paste-to-attach, recording state (coral ring on the composer, pulsing dot,
  mm:ss timer), pulsing "reading…" → "✓ filed" status per message, glyph
  toolbar ⊕ ⏺ ∿ (no emoji — brand rule), coral square send button, empty
  state with three try-it chips, auto-growing textarea. New screenshot
  harness (`npm run shoot -- chat`, fetch stubbed). Verified: 143 tests,
  tsc, lint==baseline, build, screenshot eyeballed on-brand.
- **2026-07-12** — **The app is a channel: in-app Chat capture** (user
  must-have). New "Chat" tab in the dashboard rail: a thread + composer that
  sends straight into the SAME pipeline as email/WhatsApp — multiline text,
  any-file attach (photos/PDF/docs, ≤8 files / 15 MB per message), a
  dictaphone (MediaRecorder voice note → the existing transcription tier)
  and live speech-to-text into the box (Web Speech API, feature-detected;
  Chrome-family). `POST/GET /api/chat` is session-authed and attributes the
  org explicitly (no link codes/shared secret — the session IS the
  identity); items land as channel `upload` with `meta.via='app'` and get
  the same post-response extraction kick as /api/ingest, so the thread's
  status chips go ⟳ processing → ✓ filed live (4s poll while busy).
  Verified: 143 tests, tsc, lint==baseline, build green. NOT verified live:
  mic/dictation need a real browser + HTTPS; transcription stays dormant
  until `TRANSCRIPTION_API_KEY`/`OPENAI_API_KEY` is set.
- **2026-07-12** — **Channel pull-requests: the review comes to you** (user
  must-have: "when a message creates validation needs, send the pull request
  over the channel — click/reply to apply"). When extraction leaves decisions
  behind for a message (pending knowledge_reviews and/or proposed rows) — and
  only then — the pipeline pings the sender back over the originating
  channel: numbered questions newest-first, "Reply '1 yes' / '2 no'", plus a
  dashboard link. Replying in WhatsApp resolves the review with the real
  accept/reject side-effects and confirms in-thread; the parser only accepts
  short decision-shaped replies (unit-tested against real-message false
  positives), so capture is never hijacked. Outbound is env-gated fail-soft:
  WhatsApp (Twilio REST, new `TWILIO_WHATSAPP_FROM`), Slack
  (chat.postMessage). New: pure `review-ping.ts` (+5 tests), shells
  `review-inbox.ts`/`outbound.ts`, hook at end of `runExtractionForItem`,
  reply interception in the WhatsApp webhook, `getBoundSource` in channels.
  Also fixed: the heavy seed's merge review used kind 'merge' →
  'entity_merge' (file + all three Neon branches updated). Verified: 143
  tests, tsc, lint, build green. NOT live-fired (no Twilio/Slack creds):
  the actual send + reply round-trip; email/Teams outbound don't exist yet
  (roadmap).
- **2026-07-12** — **Folders pivot to deterministic LENSES (no LLM), many
  trees over the same docs** (user decision: "a folder is just a tag; derive
  folders deterministically from the graph; suggest multiple trees"). New
  pure core `lib/datamodo/folder-lenses.ts`: documents+notes collect their
  tags from facts (linked clients/projects/people/topics, arrival month,
  file type, channel); each lens is a deterministic grouping rule; lenses
  stack two levels ("client / month"); a doc linked to two clients IS in
  both folders. Files view reworked: lens chips (only ones that
  discriminate), collapsible tree, folder click filters the grid, "↓ Export
  tree" zips exactly the on-screen tree (multi-folder docs export in each
  folder). The LLM folder-export modal + Build ▾ entry and the route's LLM
  path are REMOVED (simplicity rule: the lens tree replaces them);
  `parseFolderPlan` now allows one doc in several folders. Verified: 138
  tests (6 new lens tests), tsc, lint==baseline, build green.
- **2026-07-12** — **Ring grouping in the walk (WOW build-order step 1)** —
  user: "a company with 30 invoices doesn't need 30 spokes". `buildEgoGraph`
  gains `clusterTail`/`maxPerKind`: past 3 nodes of one kind (or past the ring
  cap) the tail folds PER KIND into a "+N more <kind>s" pseudo-node
  (`EgoNode.clusterOf`) with a majority-predicate spoke to the center;
  nothing is silently dropped (truncated=0 when clustering), cited/preferred
  nodes are never folded, lone stragglers take a free slot instead of a "+1"
  chip, and clustered members can't leak back in as hop-2. The view renders
  clusters as dashed cards ("click to expand") → ClusterPanel member list →
  walk to any member; cluster spokes open the panel, not the fact inspector.
  Verified: 132 tests (3 new), tsc, lint==baseline, build, shoot screenshot
  shows "+6 more invoices" on the fixture.
- **2026-07-12** — **Heavy demo account `demo@datamodo.dev` seeded on prod +
  dev + the PR-52 preview branch** (user request: "simulate someone using the
  app for 5 weeks — volume"). New `neon/seed-heavy.sql` (idempotent, same
  contract as seed.sql): 4 agents, 5 kind-bound tables, 10 clients, 16 people,
  28 invoices, 12 receipts, 8 projects, 12 documents (pdf/image/text/audio —
  summaries + page-cited chunks; placeholder blob hashes, so originals don't
  download), 5 wikilinked notes + 6 concepts — 98 entities · 273 facts · 81
  provenance links · 54 messages spread over 35 days, plus a pending Ledger
  batch (2 adds + 1 conflict) and 2 knowledge reviews (merge + category
  proposal). **Discovery that amends MEMORY**: Neon Auth (Better Auth) users
  live IN the branch DB (`neon_auth.user`/`account`), so the account was
  created via SQL with a scrypt hash generated by the SDK's own
  `hashPassword` (verified against its `verifyPassword`) — no app signup
  needed. Applied via Neon MCP to `prod`, `dev`, and
  `preview/claude/graph-query-viz-export-a0j73e`; identical counts verified
  on all three. NOT verified: an actual browser login (sandbox network can't
  reach the app).
- **2026-07-12** — **Server-action rejections no longer crash the dashboard**
  (user hit a full-page Vercel error screen on the create-agent wizard's final
  button). Diagnosis: steps 1–3 of the wizard are pure client state — "Create
  agent" is the wizard's ONLY server call, and neither `useAction.run` nor
  `submitAgent` caught a REJECTED action promise, so any framework-level
  failure (network drop; most likely here: the preview redeploying under an
  open tab, invalidating its server-action ids) escaped `startTransition`
  into the error boundary. No 5xx appeared in Vercel runtime logs — consistent
  with a stale-action failure, inconsistent with a handler crash (the action
  itself try/catches everything). Both call sites now catch and show "reload
  the page and try again" inline. Verified: tests/tsc/lint/build green;
  the actual repro needs a live browser (reload the preview tab and retry).
- **2026-07-12** — **"See in graph" no longer gated behind the LLM** (user
  couldn't find the button: it lived only on the grounded-answer card, which
  never renders without an LLM key + cited answer). The plain "In your
  knowledge" search results now carry their own "◍ See in graph" button
  (highlights up to 8 matched entities in the walk — zero LLM involved);
  `AnswerGraphModal` gains a `variant` ("answer" | "results") so the title
  and subtitle stay honest about what's highlighted. Verified: tests/tsc/
  lint/build green.
- **2026-07-12** — **Folders modal: the tree is the deliverable, the zip is
  optional** (user follow-up mid-session: "not [only] as zip — display the
  folder structure for the user to explore, select a doc, multiple layers of
  subfolders"). The folder-export modal now renders the plan as an EXPLORABLE
  tree — nested subfolders (plan depth cap raised 3→4 levels)
  collapse/expand, every file row is clickable and opens that node's
  `EntityPageModal` (body, facts, provenance, original ↓) — and "↓ Download
  .zip" becomes the optional secondary action mirroring exactly that tree.
  Preview API now returns each file's `entityId`. Verified: 129 tests green
  (depth test updated), tsc clean, lint == baseline, `next build` green; the
  modal itself still needs an eyeball in a live browser (LLM-gated).
- **2026-07-12** — **The graph becomes the answer surface: three prompt-shaped
  projections** (user call: research + derived shapes before the WOW visuals).
  ① **Answer → graph highlight**: grounded answers grow a "◍ See in graph"
  action — a modal opens the Explorer walk with every cited node highlighted
  (coral halo + ✦, edges between cited nodes lit, a "✦ used in the answer"
  chip row hops cite-to-cite); rows cite into the graph via their
  `subject_entity_id` (`SearchHit.entityId`), and cited nodes win ring slots
  via the new `EgoOptions.prefer` in the pure core. ② **Derive a table from
  the graph** (Build ▾): plain-language request → LLM designs a spec over the
  graph's SCHEMA only (`summarizeGraph` — kinds/predicates, never row data) →
  `buildDerivedTable` fills rows deterministically (attrs, linked labels in
  either direction, counts) → preview with per-column provenance chips →
  confirm creates a real dataset (rows accepted + entity-linked, so it walks
  in the Explorer). ③ **Folder structure from the graph** (Build ▾): request →
  LLM files documents + body nodes into a folder plan (inventory only:
  labels/kinds/links) → sanitized (traversal-proof, depth-capped, unplaced →
  `unsorted/`) → tree preview → .zip download with originals from blob
  storage (fail-soft to markdown), markdown node pages, and a README —
  via a new dependency-free store-only zip writer (`lib/datamodo/zip.ts`,
  round-trip verified against real `unzip`). All three are on-demand only and
  preview-before-write, per the north star. **Verified**: 129 unit tests green
  (16 new across `derive-table`/`folder-export`/`explorer`/`answer`), tsc
  clean, lint == baseline (7/16), `next build` green, screenshot harness
  (`npm run shoot -- explorer`) shows the highlight state. NOT verified live
  (no LLM key / no browser login in the sandbox): the actual LLM spec/plan
  design calls and the two modals end-to-end; the shared preview/confirm route
  contract is exercised by the pure-core tests.
- **2026-07-11** — **WOW track unified: REPLAY + COSMOS = one graph engine**
  (follow-up to the direction session below; user: "do what you think is
  best"). The stronger wow is a scenaristic chronological REPLAY of the vault
  building itself (Gource/"Wrapped" energy) — cheap because the bitemporal
  vault already stores every timestamp and review decision; the COSMOS is its
  final frame. ROADMAP "THE WOW" rewritten as build order (walk ring-grouping
  → Replay → Cosmos); MEMORY north-star updated; **Claude Design brief
  written and committed**: design/briefs/wow-graph-engine-brief.md (context,
  5-act replay, LOD clustering rules, demo fixture, expected deliverables —
  paste into a Claude Design project, iterate, drop the handoff into design/
  like Explorer v2).
- **2026-07-11** — **Product direction session (no code): the WOW + landing
  rework roadmapped** (both to be designed through **Claude Design**, per
  user). MEMORY gains the Cosmos north-star bullet; ROADMAP gains the full
  spec ("THE WOW: Cosmos view" + "Landing page rework"). Source material for
  the landing copy, so it survives this chat:
  - **Exec pitch**: "Your inbox becomes a database — forward anything (email,
    voice memo, receipt photo, spreadsheet, braindump) and it comes back as
    organized, connected, queryable data. No forms, no filing, no data
    entry." Sections: capture anywhere · speaks your vocabulary (categories
    are yours, AI-drafted, self-proposing) · one vault many views (tables /
    walk / timeline / files / ask-with-citations) · trust story (every fact
    has a receipt; suggested, sourced, reversible; private by design, BYOK).
  - **Personas** (each: what they forward → what builds itself → payoff):
    freelancer (invoices/receipts/call memos → Invoices+Clients tables →
    tax season + "what did Acme pay me?"); researcher (papers/braindumps →
    concept-tagged summaries, walkable lit map → ✦ Synthesize related work);
    student (lectures/whiteboard photos/voice notes → linked notes with
    equations → revision Q&A); recruiter/HR (CVs/debrief memos → Candidates
    pipeline table → "what did X ask for?"); landlord (tenant msgs/meter
    photos → Properties/Tenants/Expenses → renewals surfacing); creator
    (links/idea dumps → self-building knowledge garden). Common thread:
    nobody ever ENTERS data, and every table speaks the user's vocabulary.
- **2026-07-11** — **ONE EMBEDDING SPACE per deployment (stamp + guard +
  re-embed)** — user callout: embeddings are STORED, so mixing vectors from
  different models in one column is catastrophic (silently garbage ANN
  matches feeding wrong-merge proposals). Decisions + mechanics:
  - **MEMORY decision**: embeddings are infrastructure, not BYOK — one space
    per deployment, defined by `EMBEDDINGS_MODEL`. (They already ran
    platform-key-only; now it's written down and enforced.)
  - **Stamp**: new `embedding_model text` on `entities` AND `doc_chunks`
    (chunks store vectors too — best-effort, unread until ANN passage search
    ships). Written on every embed; migration
    `20260711110000_embedding_model_stamp.sql` backfills existing vectors to
    the only space this deployment ever used. DDL applied + verified on
    `dev`, `prod`, and the preview branch via Neon MCP.
  - **Guard**: the ANN recall in `resolveEntity` filters
    `embedding_model = current` — rows from another space fall out of
    semantic recall (trigram still covers them) instead of poisoning it.
  - **Re-embed**: `POST /api/jobs/embed-requeue` (CRON_SECRET, `?batch=`)
    re-embeds entities-then-chunks whose stamp differs or whose vector is
    missing, from the SAME canonical text as ingest (`embedTextForEntity`
    extracted so the two paths can never drift); returns `remaining` — call
    until 0. Also serves as first-time backfill when embeddings get a key.
  - Verified: 113/113 tests + tsc + lint == baseline + build green. Not
    live-fired (needs an embeddings key), same as the rest of the LLM matrix.
- **2026-07-11** — **Node bodies go full Obsidian** (user: "MarkdownLite on a
  node could be complete Obsidian-markdown-like"). MarkdownLite is replaced by
  a two-part renderer:
  - **Pure parser** ([lib/datamodo/markdown.ts](lib/datamodo/markdown.ts)):
    headings, paragraphs, nested quotes, fenced code, hr, nested lists +
    `- [ ]` tasks, GFM tables (alignment, `\|` escapes), `$$` math blocks;
    inline bold/italic/strike/==highlight==/code/links/images,
    `[[wikilinks]]`+aliases, `![[embeds]]`, `$inline math$`, backslash
    escapes. Guards where markdown bites: no intra-word `_emphasis_`
    (snake_case predicates!), `$17,650 and $10` never parses as math, only
    root-relative + https media sources pass (`safeMediaSrc`).
  - **Renderer** ([app/dashboard/markdown.tsx](app/dashboard/markdown.tsx)):
    AST → React elements (injection-proof stays structural); `[[wikilinks]]`
    resolve against the org's real nodes via `buildNodeResolver` (label
    match; click opens the node — unresolved links stay quiet dashed text
    like Obsidian); `![[image.jpg]]` / `![[memo.m4a]]` render the ACTUAL
    node's media inline; math via lazy-loaded KaTeX with **MathML output**
    (no CSS/font imports; loads only when a body contains math; the KaTeX
    string is the page's sole innerHTML). Wired in both body surfaces:
    the page modal (knowledge-view) and the Explorer's side panel.
  - New dep `katex`; new `npm run shoot -- body` harness (screenshot reviewed:
    table alignment, task strike, wikilink chips, MathML equations, embeds).
  - Verified: 113/113 tests (10 new in tests/markdown.test.ts) + tsc + lint ==
    baseline + build + 5 shoot harnesses green. Found & fixed in dev: the
    inline scanner's shared-regex recursion loop (fresh regex per call).
- **2026-07-11** — **CATEGORY PROPOSALS via Review (growth loop ⑤ closes)** —
  when extraction keeps producing entities of a kind the registry doesn't know
  (post-canonicalization, generics like "thing" excluded — pure trigger
  `unregisteredKinds` in ontology.ts), and ≥3 such entities exist org-wide,
  `maybeProposeCategories` (kinds.ts, hooked best-effort into the extraction
  tick) files ONE `category_proposal` review carrying an AI-drafted template
  (`suggestKindTemplate`; a failed draft still files with an empty template).
  Accept = `createKind` with the template (the trigger entities already carry
  the slug, so they snap into it; P2002 = made by hand meanwhile = no-op);
  decline marks rejected and the kind is NEVER re-proposed (the filing check
  matches any status). New Review Studio card (sample chips + drafted template
  rows + honest copy) + group + header chip; new `npm run shoot -- review`
  harness (screenshot reviewed). No DDL (reviews.kind is free text).
  Verified: 103/103 tests + tsc + lint == baseline + build + 4 shoot
  harnesses green. NOT live-verified: template drafting needs an LLM key.
- **2026-07-11** — **Spreadsheet-import follow-ups (all three)** — the import
  is no longer a blind merge:
  - **Preview/confirm**: upload now DRY-RUNS the inference
    (`previewTableGraph`, `mode=preview` on the same endpoint — nothing
    writes) and shows the reading: "N rows, each read as a ‹kind› keyed on
    ‹column›", per-column role list, honest counts (links to known things ·
    new things · facts) and sample identities. Merging happens only on
    confirm.
  - **Column-mapping overrides** (`InferOverrides`): the kind, the identity
    column, per-column link/fact/skip (click a chip to cycle), and each
    link's target kind are all editable in the preview; every change re-runs
    the dry preview so the numbers stay true.
  - **Cross-row reference dedupe** (`combineExtractions`): rows ingest in
    combined batches of 200 with identical entities (kind+label+natural keys)
    collapsed to one shared local id — "Acme" on every row resolves ONCE
    instead of once per row; distinct natural keys never collapse.
  - infer-graph split per convention: pure core `infer-graph-core.ts`
    (import-free, node:test-loadable) + DB shell `infer-graph.ts`. New
    tests/infer-graph.test.ts (5 tests: heuristics, overrides, dedupe).
- **2026-07-11** — **AUDIO TIER shipped (last open Explorer-track item)** — a
  voice memo/recording forwarded on any channel becomes an understood thick
  node, mirroring the vision tier's fail-soft design:
  - **Transcription client** ([lib/llm/transcription.ts](lib/llm/transcription.ts)):
    OpenAI-compatible `/audio/transcriptions` (multipart), same fail-soft
    contract as embeddings — no key/API error → null → the attachment degrades
    to `metadata_only`, never fails the item. Env: `TRANSCRIPTION_API_KEY`
    (falls back to `OPENAI_API_KEY`), `TRANSCRIPTION_BASE_URL`,
    `TRANSCRIPTION_MODEL` (default `whisper-1`).
  - **Pipeline** ([documents.ts](lib/datamodo/documents.ts)): new audio branch —
    gate `attachmentAudioType` (mp3/m4a/wav/ogg/opus/flac/webm + any `audio/*`,
    ≤24 MB), transcribe, then the transcript runs the SAME classify-first
    template-restrained document pipeline; transcript passages land in
    `doc_chunks` (search cites what was said). `EXTRACTION_VERSION` → 3 so old
    audio items can be requeued once a key exists.
  - **Node shape** (north star: "audio as player+transcript"): the entity page
    renders a PLAYER streaming the original (`/api/documents/[id]?inline=1`,
    endpoint unchanged) above the body; the body is summary + the transcript
    under a `#### Transcript` heading (`buildTranscriptBody`, capped at 8k
    chars with an honest truncation note; full text stays searchable).
  - Verified: 96/96 tests (9 new in tests/audio.test.ts) + tsc + lint ==
    baseline (7/16) + build + all 3 shoot harnesses green. NOT live-verified:
    no transcription key in the sandbox — the tier stays dormant (fail-soft)
    until `TRANSCRIPTION_API_KEY`/`OPENAI_API_KEY` is set and a real voice
    memo is forwarded (add to the roadmap's live-fire pass).
- **2026-07-11** — **dataset_relations are visualized again** — explicit
  table↔table links draw as DASHED lines between the schema canvas's kind
  cards (footer to footer; label = the relation's label, else
  "from_column → to_column"; lit/dimmed with selection and drag like the coral
  template-FK lines). Wired `relations` (already loaded by the dashboard page)
  → `KnowledgeView.tableLinks` → `SchemaView`; a card resolves from a dataset
  via the new structural `kind_id` (name fallback for older rows). Schema shoot
  harness gained a link fixture; screenshot reviewed (dashed line renders,
  lights with the selected card, distinct from solid FK lines).
- **2026-07-11** — **Model unification phase 2: `datasets.kind_id`** — "category
  = table" is now STRUCTURAL: new column `datasets.kind_id uuid references
  kinds(id) on delete set null` (+ index), set by the category→table endpoint
  on create AND on name-collision adoption; `datasetForKind` matches the
  binding first and keeps the plural-name rule only as a fallback for
  pre-migration rows (a bound dataset can be freely renamed now). Migration
  `neon/migrations/20260711100000_datasets_kind_id.sql` (idempotent, includes
  the name-convention backfill); seed gained the same backfill tail.
  DDL applied + verified via Neon MCP on `dev`, `prod`, AND this branch's
  Vercel preview branch (`preview/claude/next-features-my99r6`); dev backfill
  bound 3/5 datasets (the rest are hand-made, correctly unbound). Verified:
  96/96 tests + tsc + lint == baseline (7/16) + build green.
- **2026-07-11** — **Data surfaces go full-width** (user: the Explorer and the
  schema canvas were mysteriously capped). Cause: a `maxWidth: 980` wrapper in
  `KnowledgeView` (plus the same cap on Files and Insights). Removed — the
  walk, the schema canvas, Files and Insights now stretch to the dashboard's
  full width; Timeline deliberately keeps its 720px reading column. Verified:
  full bar + shoot green.
- **2026-07-11** — **Schema view is now a real draggable canvas** (user: treat
  categories like a Supabase instance — drag tables around, links must keep
  making sense). Cards float free on a ruled canvas; drag by the header and
  the FK lines re-measure every frame; a <4px press is a click (browse rows);
  grabbing brings a card above the others; the arrangement persists in
  localStorage (`dm-schema-positions-v1`) and survives reload; deterministic
  auto-layout (column-packed, populated-first) seeds the first visit and any
  newly created category. Creation moved to a toolbar ("New table (= new
  category)…" + create — still one object). Verified in Chromium (5/5: drag
  moves, lines follow, persistence, reload survival, click≠drag) + the full
  bar (87/87, tsc, lint 7/16, build, shoot).
- **2026-07-11** — **ONE OBJECT: Tables = Categories = Concepts; Map removed**
  (user decisions: "creating a concept or a table should be the same object";
  "the map feature is actually useless — keep the walk only").
  - **Unified Tables surface** ([schema-view.tsx](app/dashboard/schema-view.tsx)):
    a Supabase-style schema diagram — every kind renders as a table card
    (template fields as column rows with types, relations as coral FK rows,
    one SVG overlay draws the relation lines card-to-card, selected card
    lights its edges). Click a card → its rows browse as entity cards below
    (cards = a display of tabular data, not a separate feature). "▦ open
    table"/"▦ make table" per card; **"+ new table" creates the category AND
    its materialized dataset in one act** (POST /api/kinds → /api/kinds/[id]/
    table). Data pills are now ▦ Tables · ◍ Explore · Timeline · Files ·
    Insights.
  - **Map deleted**: `knowledge-graph.tsx` and the Explorer's ⌂ overview are
    gone (walk only); `concept-map-view.tsx` deleted too (a concept is just a
    kind card in the schema). Pure `concept-map.ts` core kept dormant;
    `entities.graph_pin` + PATCH endpoint dormant. Dead `RelationshipGraph`
    removed from control-center (dataset_relations no longer visualized —
    roadmapped).
  - **Lint baseline improved** 8→7 errors (deleted files carried one) —
    `check-lint-baseline.mjs` lowered accordingly.
  - Deeper model unification (`datasets.kind_id` instead of the plural-name
    match) recorded in ROADMAP as a proper migration.
  - Verified: 87/87 tests + tsc + lint == new baseline (7/16) + build green;
    `npm run shoot` green incl. a NEW `schema` harness (diagram screenshot
    reviewed: columns, FK rows, relation lines, create card all render).
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
