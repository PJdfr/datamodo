# Project State — datamodo

> **Living handoff doc.** Read this first when starting a session. It is the
> single place that summarizes what datamodo is, where it stands, and what's
> next — so a fresh agent (or human) can get oriented without prior context.
>
> **Every agent MUST update this file at the end of a task** that changes the
> product's state: move items between sections, add a dated line to
> "Recent changes", and adjust "Next steps". Keep it tight — this is a map,
> not a changelog. Details live in code, migrations, and `app/dashboard/README.md`.
>
> Last updated: 2026-07-10

## Recent changes
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
  Trips give it real data to hit). Next for search: NL answers + citations (needs the
  LLM layer) and pg full-text / embeddings when volume grows.
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
  folded via Prisma (0 from nonsense text = correct); 401 without the secret. **TODO:** orphan
  recovery (a crashed tick leaves an item in `analyzing`; needs a `claimed_at` column + reset) and
  failed-item retry; throughput is 3/5min (raise `EXTRACT_BATCH` / add an internal drain loop).
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

-1. **Attachments → documents in the graph + smart folders (DESIGNED 2026-07-10, not built).**
   The decision on "what do we do with a big PDF in a forwarded message":
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
4. Delete `simulateAgentUpdate()` once real extraction flows.
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
