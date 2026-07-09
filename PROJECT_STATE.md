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
> Last updated: 2026-07-09

## Recent changes
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

0. **Import a spreadsheet → infer a graph → merge into the knowledge graph** *(idea,
   not built).* Let a user hand us a table/spreadsheet; infer entities + relationships
   from it (columns → predicates, rows → entities, shared values → edges) and **merge
   the result into the existing knowledge graph** (reuse the entity-resolution /
   dedup / bitemporal machinery in `knowledge.ts`, not a fresh store). **Strongly
   encourage this during onboarding**: merging a table into a *large* existing graph
   is far costlier (more entities to resolve/compare against) than seeding it while the
   graph is still fresh/empty — so make it a first-run step, not an afterthought.
   Builds on today's `.xlsx` import (`spreadsheet.ts`/`sheets.ts`) + the auto-link
   overlap detector (`suggestRelations`) as the edge-inference seed.
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

## Local development (important gotcha)
`.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at the **remote** project, so plain
`npm run dev` makes the app's **auth + all user-facing reads** hit remote — even
if you're running `npx supabase` locally (only the admin/write client would use
local). Symptom: you seed the local DB but the dashboard shows nothing. Fix: a
gitignored **`.env.development.local`** (higher precedence in dev) that sets the
LOCAL stack for the whole app:
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable>`, plus `SUPABASE_URL`/
`SUPABASE_SECRET_KEY` local and the dev secrets (INGEST_WEBHOOK_SECRET,
SLACK_SIGNING_SECRET, MICROSOFT_APP_ID, TEAMS_DEV_SKIP_AUTH). Get keys via
`npx supabase status`. Delete the file to run against remote.

## Conventions
- Individual-only product. Never add teams/sharing without an explicit decision.
- Keep `user@example.com` demo data seeded (`supabase/seed.sql`).
- This is a modified Next.js — read `node_modules/next/dist/docs/` before writing.
- **Update this file at the end of every state-changing task.**
