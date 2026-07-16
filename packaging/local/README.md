# datamodo — local edition

Your private data vault, self-hosted and single-user. Forward the mess —
email, files, photos, voice notes — and get back structured, queryable data:
tables, a knowledge graph, timelines, grounded answers. Everything runs on
**your machine**: embedded Postgres, local files, local AI models.

## Quick start

```sh
npm install -g datamodo
datamodo serve
```

Open http://localhost:4321 — that's it. On first run datamodo:

1. builds the app (one-time, ~a minute),
2. creates your vault in `~/.datamodo` (embedded Postgres — nothing to install),
3. sizes the local AI to your machine (RAM → model tier) and pulls the models
   from [Ollama](https://ollama.com/download) if it's running.

No account, no login, no cloud.

## The AI

Two ways to run it — switchable any time in **Settings** (never a reinstall):

- **Local (default)** — models run on your machine via Ollama. Private, free,
  offline. `datamodo setup` re-sizes the models; they're editable in Settings.
- **Bring your own key** — Anthropic / OpenAI / OpenRouter key, or any
  OpenAI-compatible server. Same app, cloud-quality models.

Without either, datamodo still captures and files everything (keyword search,
metadata-only) — AI reading resumes the moment a model appears.

## Capture

- **Chat** — the dashboard's Chat tab: drop text, files, photos, voice notes.
- **Your mailbox** — Settings → Mailboxes (or `datamodo connect`): datamodo
  pulls new mail over IMAP. Credentials stay in `~/.datamodo/connectors.json`.

## Commands

```
datamodo serve      run the dashboard (http://localhost:4321)
datamodo setup      size the local AI: RAM → model tier → pull
datamodo connect    attach an IMAP mailbox (BYOB capture)
datamodo build      force a clean rebuild of the app
datamodo init       scaffold ~/.datamodo without serving
```

## Your data

Everything lives in `~/.datamodo`: `pgdata/` (the vault — embedded Postgres),
`blobs/` (original files, content-addressed), `llm.json` (model choice),
`connectors.json` (mailboxes). Back up that folder and you've backed up
everything. Set `DATABASE_URL` to use your own Postgres instead (with
pgvector; load `neon/schema.sql` to initialize it).

## Docker

Prefer containers? The Docker Compose bundle (app + real Postgres) is
documented at https://datamodo.dev/docs/local — same product, same data model,
`docker compose up`.
