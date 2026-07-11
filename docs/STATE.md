# datamodo — current state (features · code map · stack · env)

> **Maintained doc — update with EVERY commit that changes behavior.**
> The rule lives in `CLAUDE.md`. Sibling docs: [FLOW.md](FLOW.md) (pipeline
> infographic), [ROADMAP.md](ROADMAP.md) (what's next), [MEMORY.md](MEMORY.md)
> (durable context). Dated history stays in [../PROJECT_STATE.md](../PROJECT_STATE.md).
>
> Last updated: 2026-07-11

## Stack at a glance

| Layer | Choice | Where |
|---|---|---|
| App | Next.js 16 (modified — read `node_modules/next/dist/docs/` first), React, TypeScript | `app/`, `components/` |
| DB | Neon Postgres 18 (pgvector, pg_trgm), branches `prod`/`dev`/previews | schema: `neon/schema.sql`, migrations: `neon/migrations/` |
| ORM | Prisma 7 + `@prisma/adapter-neon` | `prisma/schema.prisma`, `lib/prisma.ts` |
| Auth | Neon Auth (Better Auth), app-layer authz (`org_id` scoping, no RLS) | `lib/auth/*`, `app/api/auth/[...path]`, `proxy.ts` |
| Blobs | S3-generic adapter → Cloudflare R2 bucket `ingest` (eu) | `lib/storage/blob.ts` |
| LLM | Provider-agnostic interface: OpenRouter (default) / OpenAI / Anthropic; BYOK per user | `lib/llm/*`, `lib/datamodo/llm-for-user.ts` |
| Email inbound | Cloudflare Email Worker → `POST /api/ingest` | `workers/email-ingest/` |
| Jobs | GitHub Actions cron → `extract-tick` (+ `after()` self-kick on ingest) | `.github/workflows/extract-cron.yml`, `app/api/jobs/*` |
| Hosting | Vercel (Production=prod branch, Preview=dev branch) | — |
| Tests | `node:test` over pure cores (`npm test`) | `tests/*.test.ts` |
| CI | GitHub Actions: tests, tsc, lint==baseline, build — on every PR, dev/prod push, AND `claude/**` pushes (agent-session pushes don't fire `pull_request` events) | `.github/workflows/ci.yml`, `scripts/check-lint-baseline.mjs` |
| Screenshot harness | `npm run shoot [-- explorer timeline]` — bundles a fixture harness (esbuild), renders it in local Chromium (playwright-core), writes `.shoot/<name>.png`, fails on page errors. No DB/login needed | `scripts/shoot/run.mjs`, `scripts/shoot/harnesses/*.tsx` |
| Design | datamodo design system (cream/ink/coral, Geist Mono data) | `design/system/`, skill `.claude/skills/datamodo-design/` |

## Feature inventory (shipped)

### Capture (channels in)
| Feature | Code |
|---|---|
| Email inbound (forward to `<token>@domain`), live E2E verified | `workers/email-ingest/`, `app/api/ingest/route.ts`, `lib/ingest/store.ts`, `lib/datamodo/inbox.ts` |
| WhatsApp inbound (Twilio, shared bot + link-code identify) | `app/api/webhooks/whatsapp/route.ts`, `lib/datamodo/channels.ts` |
| Slack inbound (signing-secret verify) | `app/api/webhooks/slack/route.ts` |
| Teams inbound (Bot Framework JWT verify) | `app/api/webhooks/teams/route.ts` |
| Connect-a-channel UI (inbox address + link codes) | `app/dashboard/connections.tsx`, `createChannelLinkCodeAction` in `app/dashboard/actions.ts` |
| Raw store: sha256+gzip deduped blobs, ref-counted; items + attachments | `lib/ingest/store.ts` (tables `items`, `blobs`, `attachments`) |

### Extraction pipeline
| Feature | Code |
|---|---|
| Queue: atomic claim (`FOR UPDATE SKIP LOCKED`), orphan recovery, retry cap, drain loop | `claimStoredItems`/`recoverExtractionQueue` in `lib/datamodo/extract.ts`, `app/api/jobs/extract-tick/route.ts` |
| Message extraction (two-model, confidence-gated escalation, onboarding-context steered) | `extractFromMessage`/`runExtractionForItem` in `lib/datamodo/extract.ts` |
| Document extraction: classify-first, template-restrained, markdown summary (thick node) | `classifyDocumentKind`/`extractFromDocument` in `extract.ts`; pure text/chunk core `lib/datamodo/document-extraction.ts`; orchestration `lib/datamodo/documents.ts` |
| **Vision tier**: image attachments → understood thick nodes (1 vision call; fail-soft) | `extractFromImage` in `extract.ts`, `buildImagePrompt` in `ontology.ts`, `attachmentImageType` in `document-extraction.ts`, providers `lib/llm/*` |
| **Audio tier**: audio attachments → transcript (fail-soft Whisper-shaped client) → classify-first document pipeline → thick node (body = summary + capped transcript; full transcript in doc_chunks) | `lib/llm/transcription.ts`, `attachmentAudioType`/`buildTranscriptBody` in `document-extraction.ts`, audio branch in `documents.ts` |
| Spreadsheet attachments (.xlsx → text → same pipeline) | `sheetToText` in `document-extraction.ts`, `lib/datamodo/spreadsheet.ts` |
| Generated notes: substantive prose dump → note node WE author (`note:`/`memo` forces) | `buildNoteExtraction` in `document-extraction.ts`, note logic in `extract.ts` |
| Ontology/categories: user-editable kind registry, prompt steering, canonicalization (fixes predicate drift), template restraint | pure `lib/datamodo/ontology.ts`; DB `lib/datamodo/kinds.ts`; API `app/api/kinds*`; UI `app/dashboard/categories-modal.tsx` |
| AI-drafted category templates + one-click category→table (**structural binding**: `datasets.kind_id` → `kinds.id`, set on create/adopt; plural-name match is only a pre-migration fallback) | `suggestKindTemplate` in `kinds.ts`, `app/api/kinds/suggest`, `app/api/kinds/[id]/table`, `datasetForKind` in `app/dashboard/schema-view.tsx`, `neon/migrations/20260711100000_datasets_kind_id.sql` |
| Off-template review routing (drops become reviews; accept = replay through ingest) | `restrictExtractionToTemplates`/`buildOffTemplateReview` in `ontology.ts`, `createOffTemplateReview` in `knowledge.ts`, accept in `reviews.ts` |
| `extraction_version` stamp + delta requeue endpoint | `EXTRACTION_VERSION` in `extract.ts`, `app/api/jobs/extract-requeue/route.ts` |

### Knowledge layer (canonical store)
| Feature | Code |
|---|---|
| Entity resolution: exact key → trigram blocking → ANN (embeddings) recall → LLM adjudication w/ confidence policy (auto ≥.85, propose ≥.55) | `resolveEntity`/`adjudicateMatch` in `lib/datamodo/knowledge.ts` |
| Facts: append-only, bitemporal, claim-key dedup, contradiction → supersession | `upsertFact`/`ingestExtraction` in `knowledge.ts` (tables `entities`, `facts`, `fact_sources`) |
| Embeddings (fail-soft, 1536-dim, stored on entity) | `lib/llm/embeddings.ts` |
| Document evidence layer: page-lineage chunks + keyword passage search | `chunkDocText` in `document-extraction.ts`, `lib/datamodo/chunks.ts` (table `doc_chunks`) |
| Entity merge (repoints facts/chunks/rows/body, tombstones) | `mergeEntities` in `knowledge.ts` |
| Review queue: merges, conflicts, low-confidence extractions, off-template — impact-ranked, accept/reject with real side-effects | `lib/datamodo/reviews.ts`, `lib/datamodo/review-types.ts`, `app/api/knowledge/reviews*` |

### Projections (every view derives from the vault; nothing is a second store)
| Feature | Code |
|---|---|
| Tables: facts → dataset rows (auto-materialized, human edits protected) + full manual/import/versioning layer | `lib/datamodo/project.ts`, `lib/datamodo/datasets.ts`, `lib/datamodo/review.ts` |
| Knowledge cards (facts, provenance drill-down, completeness cues) | `app/dashboard/knowledge-view.tsx` |
| ~~Knowledge graph (Map)~~ REMOVED 2026-07-11 (user: redundant next to the walk) — `entities.graph_pin` + its PATCH endpoint remain dormant | (view deleted; endpoint `PATCH app/api/knowledge/entities/[id]` kept) |
| **Explorer v2 — the 3D graph walk**: depth-field ego graph (center forward, hop-1 ring, hop-2 hazy behind cream fog), world-reflow walk with enter-from-parent/recede animations, floating breadcrumb + jump box, edge inspector (confidence meter · since · corroboration pips · quoted evidence), natural-shape side panel; flat 2D radial under `prefers-reduced-motion` | pure `lib/datamodo/explorer.ts` (`buildEgoGraph` + `parentOf`, `depthLayout`, `DEPTH`), `app/dashboard/explorer-view.tsx`; design source: Claude Design project "Datamodo Explorer v2" |
| **Node shapes phase 2 + audio**: image documents render the original inline (`?inline=1` streaming), `bookmark` builtin kind renders a link card, datasets appear as walkable virtual nodes in the Explorer (`contains` edges to row entities), audio documents render a PLAYER streaming the original above the summary+transcript body | pure `lib/datamodo/node-shapes.ts` (`entityImageType`/`entityAudioType`); `app/dashboard/entity-page.tsx`, `knowledge-view.tsx`, `app/api/knowledge/entities`, `app/api/documents/[id]` |
| ~~Concept map view~~ REMOVED 2026-07-11 (concepts are just a kind — they live in the schema/tables surface); pure core kept dormant | pure `lib/datamodo/concept-map.ts` (+tests) |
| Timeline (messages · domain dates · corrections · first sightings; Upcoming; per-entity; sent-vs-arrived clock toggle; collapsed "◷ History" on every entity page) — design skin: vertical rail, coral day dots, rising cards, channel tints | pure `lib/datamodo/timeline.ts` (`timeBasis`), `app/api/knowledge/timeline` (`?basis=sent`), `app/dashboard/timeline-view.tsx` (`EntityHistory`) |
| **Data tab IA** (flat + unified, 2026-07-11): ONE toggle — ▦ Tables · ◍ Explore · Timeline · Files · Insights. **Tables = the unified surface**: a Supabase-style schema CANVAS — kind cards (columns + FK relation rows) are DRAGGABLE, relation lines follow live, bring-to-front on grab, arrangement persists (localStorage `dm-schema-positions-v1`), auto-layout seeds first visit; click a header (no drag) → browse rows as entity cards; "▦ open/make table" per card; "+ new table" in the toolbar creates category + dataset as ONE object; dataset list below | `app/dashboard/schema-view.tsx`, `knowledge-view.tsx` (`view: "schema"\|"explore"`), `control-center.tsx` (`DataView`) |
| Entity pages (record table / document summary page; safe MarkdownLite) | `app/dashboard/entity-page.tsx` |
| Dossier export (cited markdown download) | pure `lib/datamodo/dossier.ts`, `app/api/knowledge/entities/[id]/dossier` |
| **On-demand synthesis**: "✦ Synthesize" on entity pages (≥2 connected content bodies) → cited cross-document note stored as `body_md`; never automatic | pure `lib/datamodo/synthesis.ts`; `POST app/api/knowledge/entities/[id]/synthesize`; button in `entity-page.tsx`, wiring in `knowledge-view.tsx` |
| Files view (smart folders = projections over `mentions`) + original download | `app/dashboard/files-view.tsx`, `app/api/documents/[id]` |
| Insights (any measure × any axis, live aggregation) | `lib/datamodo/analytics.ts`, `app/dashboard/insights-view.tsx` |
| Search: tables + knowledge + document passages, grounded answers with citations | `lib/datamodo/search.ts`, `lib/datamodo/answer.ts`, `app/api/search`, `app/dashboard/answer-card.tsx` |
| Review Studio (PR-metaphor queue) | `app/dashboard/review-studio.tsx` |
| Spreadsheet → knowledge graph import (infer + merge) | `lib/datamodo/infer-graph.ts`, `app/api/knowledge/import-graph`, `app/dashboard/import-graph-modal.tsx` |
| Auto-link suggestions between tables; explicit dataset_relations draw as **dashed lines** between schema-canvas cards | `lib/datamodo/relations.ts`, `app/api/relations/suggestions`, `SchemaTableLink` in `app/dashboard/schema-view.tsx` |
| Queue pill: "⟳ processing N items" in the topbar (hidden when idle; fast-polls while draining; stuck items surface) | `app/dashboard/queue-pill.tsx`, `GET app/api/jobs/queue-status` |
| Onboarding / business context (steers extraction) | `app/dashboard/onboarding-modal.tsx`, `lib/datamodo/settings.ts` |
| BYOK (user's own OpenRouter/OpenAI/Anthropic key) | `lib/datamodo/llm-for-user.ts`, SettingsModal in `app/dashboard/ui.tsx` |
| Landing page + SEO | `app/page.tsx`, `components/landing/`, `app/landing.css`, `app/robots.ts`, `app/sitemap.ts` |

## Environment variables

**Core (required to run):** `DATABASE_URL` (Neon pooled), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`.

**LLM (extraction, answers, adjudication):** `LLM_PROVIDER` (`openrouter`|`openai`|`anthropic`, default openrouter) + per provider: `OPENROUTER_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; model overrides `*_EXTRACT_MODEL`, `*_ESCALATE_MODEL`, `*_VISION_MODEL` (vision REQUIRED on OpenRouter — free default can't see); `OPENROUTER_BASE_URL`/`OPENAI_BASE_URL`, `OPENROUTER_APP_URL`.

**Embeddings (optional, fail-soft):** `EMBEDDINGS_API_KEY` (falls back to `OPENAI_API_KEY`), `EMBEDDINGS_BASE_URL`, `EMBEDDINGS_MODEL`.

**Transcription (optional, fail-soft — the audio tier is dormant without it):** `TRANSCRIPTION_API_KEY` (falls back to `OPENAI_API_KEY`), `TRANSCRIPTION_BASE_URL` (default `https://api.openai.com/v1`), `TRANSCRIPTION_MODEL` (default `whisper-1`).

**Blobs (R2/S3):** `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BLOB_BUCKET`.

**Ingest & jobs:** `INGEST_WEBHOOK_SECRET` (worker↔app), `INBOUND_EMAIL_DOMAIN`, `CRON_SECRET` (tick + requeue; must match the GitHub Actions secret, with `APP_URL`), `EXTRACT_BATCH`.

**Channels:** `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_WHATSAPP_WEBHOOK_URL`; `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`; `MICROSOFT_APP_ID` (+ dev-only `TEAMS_DEV_SKIP_AUTH`).

**Billing (dormant):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_MAX`.

**Web:** `NEXT_PUBLIC_SITE_URL` (sitemap/OG).

## Verification bar (what "shipped" means here)
Unit tests on every pure core (`npm test`), `tsc` clean, `next build` green,
lint == baseline, SSR smoke or screenshot for UI, DDL applied + verified on all
Neon branches. Anything NOT verified live (no LLM key / no browser login in the
sandbox) is flagged in PROJECT_STATE's Recent changes.
