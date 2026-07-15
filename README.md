# Datamodo

**Forward your messy messages — get clean, queryable tables back.**

Datamodo captures the email and chat you forward it, and turns the mess into
structured datasets you can edit, version, and export. Agents watch your
channels and propose structured rows; you stay in control of every table.

> **Individual-only product.** There are no teams, orgs, or sharing — every
> agent, dataset, and row is private to its owner. (Each user gets one invisible
> "personal org" at signup purely as a per-user data boundary.) See the root
> [`CLAUDE.md`](CLAUDE.md).

---

## Status at a glance

| Area | State |
| --- | --- |
| Auth, capture store, agents, datasets, table editor, Excel export, versioning | ✅ Built |
| Extraction pipeline, channel connectors, inbound email, NL search, billing | 🚧 Remaining |

---

## ✅ What's built

- **Authentication** — Supabase email/password + Google OAuth; signup, login,
  signout, email confirmation, session refresh (`app/auth/*`, `utils/supabase/*`,
  `proxy.ts`).
- **Raw capture store** — channel-agnostic ingest (`POST /api/ingest`) that
  normalizes any source into one envelope; content-addressed blob store with
  dedup + gzip; `items` / `attachments` / `blobs` per user (`lib/ingest/`,
  `supabase/migrations/…_ingest_store.sql`).
- **Agents** — create, edit (name / purpose / channels / mode / status), pause,
  and delete. Owner-only RLS (`lib/datamodo/agents.ts`).
- **Datasets + full table editor** — user-defined tables with dynamic columns.
  Add / edit / delete rows, add / remove / retype columns (new columns backfill
  a default), rename, delete, and create a table from scratch
  (`lib/datamodo/datasets.ts`, the table editor in `app/dashboard/control-center.tsx`).
- **Excel export (never CSV)** — export one table or many at once as a single
  `.xlsx` workbook with a sheet per table
  (`/api/datasets/[id]/export`, `/api/datasets/export`, `lib/datamodo/xlsx.ts`).
- **Smart versioning** — every change is snapshotted with a plain-language
  summary and who made it; rewind any table with **Restore**. Hand edits mark a
  row protected, so agent data arrives as **proposals** you review — new rows to
  add, plus "Yours vs the agent's" conflict resolution when a change touches a
  row you edited (`dataset_snapshots`, `dataset_rows.human_edited`,
  `status='proposed'`). A **Simulate agent update** button demos the flow.
- **Sync tables with your spreadsheets** — import an `.xlsx` to seed a new
  table (columns + rows inferred from the sheet), or **sync** a sheet into an
  existing table: incoming rows arrive as **reviewable proposals**, so a change
  to a row you hand-edited becomes a "Yours vs the sheet's" conflict — never a
  silent overwrite. Reuses the versioning/proposal model above. A `sheet_links`
  row records the connection (`lib/datamodo/sheets.ts`,
  `lib/datamodo/spreadsheet.ts`, `POST /api/datasets/import`). *v1 is driven by
  file upload; the link is Google-Sheets-ready — see the roadmap.*
- **Local demo data** — the seeded account **user@example.com** (password
  `password`) always has realistic agents/datasets/rows (`supabase/seed.sql`).

## 🚧 What remains

**Buildable now (no external accounts needed):**

- **Review feed on the Agents tab** — surface `proposed` rows as the real
  suggestions inbox (the per-table review already exists).
- **Relationship graph / auto-linking** — exact-match entity resolution across
  tables (people, companies, invoices).
- **Realtime** — live updates via Supabase Realtime.

**Needs your keys / accounts / DNS:**

- **Extraction pipeline** *(the core value)* — message → proposed rows via an
  LLM. Needs `ANTHROPIC_API_KEY` in the env and a runner (Supabase Edge
  Function / cron vs a worker). Everything above lights up once this exists.
- **Inbound email** — a domain + DNS/MX pointed at an inbound provider
  (Postmark / Mailgun / SES) + a public URL for `/api/ingest`. The forwarding
  domain in `handle_new_user()` is a placeholder today.
- **Channel connectors** (Gmail, Outlook, Slack, Telegram, WhatsApp) — an app
  registered per provider (client IDs/secrets) + public webhook URLs.
- **NL search with citations** — natural-language questions over your datasets;
  needs an LLM key. (Keyword search is buildable without one.)
- **BYOK + billing + usage metering** — Stripe keys + encrypted key storage.
- **Google Sheets / API export** — currently stubs.

**Sync / link roadmap (building on today's spreadsheet sync):**

- **Live Google Sheets link** — replace the manual upload with a real Google
  OAuth + Sheets API adapter that pulls a linked sheet on a schedule / webhook.
  The reconcile + proposal path already exists (`syncSnapshotAsProposals`); a
  live adapter just feeds it a fresh snapshot, so conflicts still land in the
  same "ask me" review. Needs a Google client ID/secret + token storage.
- **Two-way sync (push back)** — write accepted Datamodo edits back to the
  sheet. Decisions still open: authority per table/column, and row identity
  across syncs (v1 matches on the first column; a hidden Datamodo key column is
  the robust next step). Scope is **Google Sheets only** for now — no raw
  databases yet.
- **Deletions & schema drift** — v1 never deletes or renames on either side;
  propagating removals and column changes is future work.

See [`app/dashboard/README.md`](app/dashboard/README.md) for the detailed
front-end ↔ backend map and the risks/decisions behind each item.

---

## Tech stack

- **Next.js 16** (App Router, Server Actions) + **React 19** + TypeScript
- **Supabase** — Postgres (with Row-Level Security), Storage, Auth
- **exceljs** for `.xlsx` export
- Prisma is wired in for future use

> This repo runs a modified Next.js — read the guides in
> `node_modules/next/dist/docs/` before writing app code (see `AGENTS.md`).

## Run it locally (self-hosted, single-user)

The **local edition** runs the whole app on your own machine: one user, no login,
its own embedded database, your files on your disk. A published
`npm install -g datamodo` is the goal but **not live yet** — today you run it
from a clone.

```bash
git clone <this-repo> datamodo && cd datamodo
npm install

# Build once — no env vars needed (cloud auth/billing/webhook code is lazy and
# never evaluated in local mode).
DATAMODO_LOCAL=1 npm run build

# Run it. Boots an embedded Postgres (pglite — no Docker, no DB install) and the
# dashboard. First run builds the schema automatically.
node bin/datamodo.mjs serve         # → http://localhost:4321  (no login)
```

Open **http://localhost:4321** and you land straight in the dashboard. Prereqs:
**Node ≥ 20** — nothing else (no Docker, no Postgres).

**Choosing your LLM** (Settings → *Bring your own key*):

- **Ollama** — no key, models run on your machine (`ollama pull llama3.1`). Fully offline.
- **Anthropic / OpenAI / OpenRouter** — an **API key** (billed per use).

> **Your Claude Pro / Claude Code (or ChatGPT Plus) subscription is _not_ an API
> key** and can't be used as the pipeline's provider. You *can* use it a different
> way: **Settings → Connect Claude (MCP)** exposes your vault as tools to Claude,
> and Claude — on your subscription — reads your inbox, extracts, and writes back.
> (MCP locally needs `MCP_TOKEN_SECRET` set in the environment.)

**Semantic search / embeddings** run **locally via Ollama** out of the box: when
no cloud embeddings key is set, `serve` points embeddings at
`http://localhost:11434/v1` with `nomic-embed-text` (768-dim), and the embedded
DB builds its vector columns to match. Just `ollama pull nomic-embed-text`. To use
a different model/server or OpenAI instead, set `EMBEDDINGS_BASE_URL` /
`EMBEDDINGS_MODEL` / `EMBEDDINGS_COLUMN_DIM` (or an `OPENAI_API_KEY`) before
`serve`. Without any of that, capture/extraction/tables/graph still work — only
*semantic* recall falls back to keyword search.

**Capture mail** (a local install has no public URL for webhooks, so it *pulls*):
add a mailbox in **Settings → Mailboxes**, or:

```bash
node bin/datamodo.mjs connect --host imap.gmail.com --user you@gmail.com --pass <app-password>
node bin/datamodo.mjs connect --list        # or --remove <id>
```

New mail is captured while `datamodo serve` is running. (Gmail/Outlook need an
**app-specific password**, not your account password.)

## Local development

```bash
npm install

# Supabase (local stack via Docker) — runs migrations + seeds the demo account
npx supabase start
npx supabase db reset

npm run dev   # http://localhost:3000
```

Sign in with the seeded demo account **user@example.com** / **password** to see
the dashboard populated with agents and editable, versioned tables.

Environment variables live in `.env.local` (see `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`INGEST_WEBHOOK_SECRET`, etc.

## Repo map

| Path | What's there |
| --- | --- |
| `app/dashboard/` | The signed-in Control Center (agents, data tables, search) + its Server Actions |
| `lib/datamodo/` | Typed data-access for agents, datasets, rows, versioning, Excel, and sheet sync (`sheets.ts`, `spreadsheet.ts`) |
| `lib/ingest/` | The channel-agnostic capture core |
| `app/api/` | `ingest` (capture), `datasets/*/export` (Excel), and `datasets/import` (spreadsheet sync) route handlers |
| `supabase/migrations/` | Schema + RLS; `supabase/seed.sql` seeds the demo account |
