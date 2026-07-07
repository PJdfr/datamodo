# Control Center — front-end ↔ backend map

The dashboard (`/dashboard`) is **partially wired**. The things backed by a real
backend today are:

- **Authentication** — Supabase email/password + Google OAuth, signup / login /
  signout, email confirmation, session refresh (`proxy.ts`,
  `app/auth/*`, `utils/supabase/*`).
- **The signed-in account** — the server component
  [`page.tsx`](./page.tsx) reads the real `user` and their
  **forwarding inbox** (`forwarding_addresses`) and passes them in as props.
- **Agents** — real `agents` table + RLS; the Agents grid and header counts are
  loaded from the DB and the New-agent wizard persists via the
  `createAgentAction` Server Action (`actions.ts`, `lib/datamodo/`).
- **Data tables** — real `datasets` / `dataset_rows`; the Data tab renders the
  org's actual datasets (columns, owning agent, live row counts).

- **Agent management** — click an agent card to edit (name, purpose, channels,
  mode, status) or delete it.
- **Table editing** — click a table to open a full editor: add/edit/delete rows,
  add/remove/retype columns (new columns backfill a default), rename, delete,
  and create a table from scratch.
- **Excel export** — export a single table (`GET /api/datasets/[id]/export`) or
  many at once (`GET /api/datasets/export?ids=…`, one sheet per table) as
  `.xlsx`. We only export Excel — never CSV. Google Sheets / API export remain
  stubs.

The remaining surfaces are still driven by local React state / hardcoded
fixtures in [`control-center.tsx`](./control-center.tsx): the **suggestions /
review feed**, the **relationship graph**, and **NL search**. Accepting a
suggestion, etc., does not yet persist.

> **Individual-only.** The product has no teams, orgs, sharing, or agent
> scoping — every agent/dataset/row is private to its owner (see the root
> `CLAUDE.md`). Any roadmap item below about org switching, `org`/`people`/`me`
> scope, teammates, or "specific people" sharing (esp. §10 and risk §8) is
> **obsolete** and intentionally removed.

This document lists what has to be built to turn the mock into a product, and
flags the ambiguous / risky parts up front.

---

## What already exists on the backend

Worth knowing before building — a fair amount of foundation is in place:

| Area | Status | Where |
| --- | --- | --- |
| Auth + sessions | ✅ real | `app/auth/`, `utils/supabase/`, `proxy.ts` |
| Orgs / teams / roles (owner·admin·member) + RLS | ✅ real | `supabase/migrations/…_init_orgs_teams.sql` |
| Personal org + forwarding address auto-created on signup | ✅ real | `handle_new_user()` trigger |
| Generic capture endpoint `POST /api/ingest` | ✅ real | `app/api/ingest/route.ts`, `lib/ingest/` |
| Content-addressed blob store (dedup + gzip), `items` / `attachments` / `blobs` | ✅ real | `supabase/migrations/…_ingest_store.sql`, `lib/ingest/store.ts` |
| Channel-agnostic ingest envelope (email / whatsapp / slack / teams / sms / upload) | ✅ real (shape only) | `lib/ingest/types.ts` |
| Agents (config, owner-only RLS) + create/list/status/delete | ✅ real | `supabase/migrations/…_agents_datasets.sql`, `lib/datamodo/agents.ts` |
| Datasets + dataset_rows (dynamic jsonb columns, provenance, review status) | ✅ real (schema + read/create) | `…_agents_datasets.sql`, `lib/datamodo/datasets.ts` |

So raw messages can be captured and stored per-org, and users can define agents
and datasets. What's still missing is the **extraction pipeline** that turns a
raw `item` into `dataset_rows` — and the review/search/graph surfaces above it.

---

## Feature-by-feature: what the UI shows vs. what's needed

### 1. Agents (Agents tab, `New agent` wizard)
- **Today:** 5 hardcoded agents; the 4-step create wizard collects state and
  throws it away on "Create agent".
- **Needs:**
  - `agents` table: name, avatar, org_id, owner_user_id, **channels**, mode
    (`auto` | `ping`), **purpose** (curated prompt vs. "auto from context"),
    **scope** (`org` | `people` | `me`), target table(s), status
    (active/paused), runtime.
  - CRUD API + wire the wizard's final step to it.
  - An agent is really *"a filter + an extraction spec bound to one or more
    channel sources"* — decide whether it's a row of config or a durable
    worker. See **pipeline** below.
  - "On ping" mode needs a trigger convention (tag/forward/mention) per channel.

### 2. Channel connectors (Gmail, Outlook, WhatsApp, Slack, Telegram)
- **Today:** logos only; no connection flow exists.
- **Needs:** real OAuth / webhook onboarding per provider, storing credentials
  in `ingest_sources` and normalizing inbound payloads into the existing
  `IngestEnvelope`. The envelope + `resolveTarget()` already anticipate this;
  the **adapters do not exist yet**.
  - Email "forward to `…@in.datamodo.email`" is the closest to shippable but
    **needs real inbound MX/DNS + an email→envelope adapter** (the domain in
    `handle_new_user()` is a placeholder — see limits).
  - WhatsApp/Slack/Telegram each need their own app registration, webhook
    verification, and rate/retention handling.

### 3. Parsing / extraction pipeline (the core value prop)
- **Today:** does not exist. Items are stored raw; nothing reads them.
- **Needs:** the "messy message → clean tabular row" engine:
  - A worker that picks up new `items` (status `stored`), runs an LLM
    extraction against the agent's purpose + target schema, and produces
    structured rows.
  - Model routing for **cloud vs. BYOK** (see runtime).
  - Confidence scoring (the UI shows "94% confident"), partial extraction,
    retries, and a dead-letter path for failures.
  - Queue/trigger mechanism (Supabase queue / cron / edge function / external
    worker — undecided).

### 4. Data tables / datasets (Data tab)
- **Today:** 6 hardcoded tables (Invoices, Receipts, Contacts, …) with fixed
  columns and fake rows.
- **Needs:** user-defined **dynamic schemas**:
  - `datasets` (table def: name, columns/types, org, owning agent) and
    `dataset_rows` (jsonb or EAV), plus provenance back to the source `item`.
  - Row versioning (the UI shows `v12 → v13`, "last accepted" vs "proposed").
  - CSV/Sheets/API export (see export).
  - Schema evolution: agents in "freestyle" mode create new tables on the fly —
    **needs a schema-inference + migration story.**

### 5. Suggestions & review (Agents tab review feed)
- **Today:** 2 hardcoded suggestion cards; Accept/Dismiss only mutate local
  state; "auto-accept" toggle is cosmetic.
- **Needs:**
  - `suggestions` (proposed row changes: added/changed/removed, target dataset,
    confidence, source item, version diff) with accept/dismiss endpoints that
    actually apply/reject the diff and bump the dataset version.
  - "Auto-accept from trusted agents" as a persisted per-agent policy.
  - Notification/badge counts derived from real pending suggestions.

### 6. Search + answer + knowledge graph (Search tab)
- **Today:** a single canned question, a hardcoded `$20,750` answer, and a
  static SVG graph.
- **Needs:** the hardest surface —
  - NL query over the user's datasets (text-to-query or retrieval + LLM answer)
    with **citations back to source items** (the UI promises "sourced from 2
    forwarded emails").
  - "Recent questions" history.
  - Requires the relationship graph below to answer relational questions.

### 7. Relationship graph / auto-linking ("1,904 relationships")
- **Today:** decorative SVG nodes/edges.
- **Needs:** entity resolution (dedupe people/companies/invoices across
  messages) and a real edge store (`works at`, `billed to`, …). This is a
  substantial subsystem; the "1,904 auto-linked" stat is aspirational.

### 8. Export & API (Data tab buttons)
- **Today:** Google Sheets / Export CSV / API buttons do nothing.
- **Needs:** CSV generation, Google Sheets OAuth + push/sync, and a documented
  per-org **REST API + keys** for reading datasets.

### 9. Compute / runtime — "Datamodo cloud" vs "Your own key"
- **Today:** sidebar toggle is cosmetic (`cloud` | `byok`).
- **Needs:** real model-provider config per org, BYOK key storage
  (encrypted, e.g. Vault/KMS), usage metering, and **billing** — none of which
  exists. This gates the pipeline's model calls.

### 10. Workspace / org switching, scope & sharing
- **Today:** the topbar "Acme / Team workspace ↔ Personal / Solo" toggle is
  local-only; the wizard's org/people/me scope + teammate picker are fake
  (hardcoded "Acme", teammates Jordan/Priya/…).
- **Needs:** wire to the **real** `organizations` / `organization_members` the
  backend already has: list the user's orgs, switch active org (persist the
  choice), load real teammates for the "specific people" scope, and enforce
  agent visibility scope with RLS.

---

## Missing features / blurry limits / risks

Call these out before committing to timelines:

1. **Inbound email is not actually receivable.** The forwarding domain
   `in.datamodo.email` in `handle_new_user()` is a **placeholder**. Real
   inbound needs MX/DNS + an inbound provider (SES/Postmark/Mailgun) + an
   adapter that POSTs to `/api/ingest`. Until then the inbox address shown in
   the UI is decorative.
2. **No agent/dataset/suggestion schema exists yet.** Everything in sections
   1–7 is greenfield DB + API work. The ingest core stops at "raw item stored".
3. **The extraction pipeline is the whole product and is unspecified.** Trigger
   mechanism, model routing, confidence, idempotency of re-extraction,
   back-pressure, and cost controls all need decisions.
4. **Dynamic/user-defined schemas** (datasets with arbitrary columns, plus
   "freestyle" agents that invent tables) are hard: type inference, migrations,
   and safe querying. Decide jsonb vs. real columns early.
5. **Entity resolution / relationship graph** ("auto-linked") is a research-y
   subsystem, not a CRUD feature. Consider deferring or scoping to exact-match
   linking first.
6. **NL search with citations** depends on both datasets and the graph existing.
   Likely the last thing to build; the current answer is faked.
7. **BYOK + billing + usage metering** are absent. "Compute is account-wide"
   implies org-level quotas that need a metering + billing system.
8. **Scope enforcement.** Agent visibility (`org` / `people` / `me`) must be
   enforced by RLS, not just hidden in the UI, or it's a data-leak surface.
9. **Provider limits.** Each channel has rate limits, retention rules, and
   ToS constraints (esp. WhatsApp/Slack) that affect "auto" (firehose) mode.
10. **Stat/number provenance.** "Captured this week", "1,904 auto-linked",
    "231", etc. are literals; they need real aggregate queries (and some were
    intentionally removed from the Agents tab already).
11. **Realtime.** The UI implies live updates (new suggestions appear as
    messages arrive). Decide polling vs. Supabase Realtime.

---

## Suggested build order

1. **Wire what already exists:** real org switcher + teammates from
   `organizations`/`organization_members`; show real pending counts once
   suggestions exist.
2. **Email intake end-to-end:** real inbound domain → adapter → `/api/ingest`
   (proves the capture loop with the one channel that's closest).
3. **Agents + datasets schema + CRUD;** wire the create-agent wizard to it.
4. **Extraction pipeline v1** (cloud model only): item → suggestion → dataset row.
5. **Review/accept flow + versioning** (make Accept/Dismiss real).
6. **Export (CSV first, then Sheets/API).**
7. **Search v1** (per-dataset NL query with citations).
8. **BYOK + billing**, then **relationship graph / auto-linking**, then
   remaining channel connectors.

> Keep the `IngestEnvelope` boundary (`lib/ingest/types.ts`) as the contract:
> every new channel is just a new adapter that produces that shape, so the
> capture core and everything above it stay provider-independent.
