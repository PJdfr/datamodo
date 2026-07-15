# datamodo — Local edition packaging & distribution brief

> **For the build agent.** This is a spec, not a task list — read it whole, then
> plan. Goal: one install command that gives a user datamodo running on their
> own machine, with a clean separation so the *published* local package contains
> ONLY the local surface even though the code lives in this monorepo.
> Owner intent (2026‑07‑15): "one install command, either **local** or **BYOK**;
> if local we detect/ask RAM and size the models; models editable from the
> dashboard; and there must be a **non‑Docker** path for non‑technical users."

---

## 1. The three things to build

1. **Code separation** — a build that emits a *local‑only* artifact (npm package
   and/or Docker image) from this repo. Cloud code (auth, Neon, billing,
   webhooks, landing, MCP host) must be **physically absent** from that artifact,
   not just flag‑gated. (This is the ROADMAP "HARD REQUIREMENT" — see
   `docs/ROADMAP.md` "Code‑separation".)
2. **Two runtimes, one product**:
   - **A. No‑Docker (npm)** — for non‑technical users / no Docker. Embedded
     Postgres (pglite), `datamodo serve`. *Already largely built.*
   - **B. Docker Compose** — app + real Postgres (pgvector) + optional Ollama.
     More robust; the recommended path where Docker is available.
3. **First‑run sizing** — detect (or ask) the RAM budget → pick a model tier →
   pull the models → write them to the dashboard‑editable config.

Everything else (the pipeline, dashboard, vault) is the SAME app in both modes;
only storage/auth/LLM wiring differ, and those seams already exist.

---

## 2. What already exists (the starting point — do NOT rebuild)

The local edition is functional today via `bin/datamodo.mjs`:

| Capability | Where |
|---|---|
| CLI `datamodo serve` / `build` / `connect` | `bin/datamodo.mjs` |
| Auto‑build on first run (sets `DATAMODO_LOCAL=1` internally) | `bin/datamodo.mjs` (`runNextBuild`, `hasBuild`) |
| No login — single fixed `LOCAL_USER`, middleware bypassed | `lib/auth/session.ts`, `proxy.ts`, `app/auth/*`, `app/{login,register,page}.tsx` |
| Embedded Postgres (pglite + pgvector/pg_trgm) over a socket | `lib/local/embedded-db.mjs` (installs schema via `prisma db push` + custom functions/triggers from `neon/schema.sql`) |
| fs blob storage | `lib/storage/blob-fs.ts` + dispatch in `blob.ts` |
| Local embeddings default to Ollama, configurable vector dim | `bin/datamodo.mjs` (`embeddingDefaults`), `lib/local/config.ts` (`localEmbeddingDefaults`), `embedded-db.mjs` |
| Pool `max:1` + retry (pglite concurrency workaround) | `lib/prisma.ts` |
| Robust LLM JSON parse + Ollama `json_object` mode | `lib/llm/util.ts`, `lib/llm/openai-compatible.ts` |
| **Dashboard‑set model names** (text + vision) → `~/.datamodo/llm.json` | `app/api/local/llm-models`, `LocalModelsFields` in `control-center.tsx`, `lib/local/llm-config.ts`, precedence in `getLlmProvider` |
| IMAP "bring your own box" capture (no public URL) | `lib/local/connectors/*`, `app/api/local/imap`, dashboard "Mailboxes" |
| Step A of the split: local `next build` needs ZERO secrets; cloud routes 404 in local | `lib/auth/server.ts` (`getAuth` lazy), route guards |

**Model config precedence is already: dashboard (`llm.json`) → env var → default.**
Keep that contract in both runtimes.

Not yet done: the physical code split (step B/C), Docker, the real‑Postgres
option, and the RAM→model first‑run wizard.

---

## 3. Install UX — the "one command" and the decision tree

A single installer script is the front door (`curl -fsSL https://get.datamodo.dev | sh`,
plus a Windows `.ps1`). It decides the path, or the user picks:

```
datamodo install
│
├─ "How do you want to run the AI?"
│   ├─ Local (private, on this machine)         → LOCAL runtime
│   └─ Bring your own key (Anthropic/OpenAI/…)  → same app, cloud LLM, no Ollama
│
├─ (LOCAL only) "Do you have Docker?"
│   ├─ Yes → Docker Compose path (app + Postgres [+ Ollama on Linux/GPU])
│   └─ No  → npm path (`datamodo serve`, embedded pglite, host Ollama)
│
└─ (LOCAL only) "RAM budget?"  → detect default, let them override → model tier → pull
```

BYOK is the escape hatch for anyone who doesn't want to run models locally — it's
the same binary/image, just `computeMode=byok` with a key, no Ollama, no model
pulls. Make switching **local ↔ BYOK** a Settings toggle, not a reinstall.

---

## 4. Runtime B — Docker Compose (sketch)

Recommended default where Docker exists. **Use real Postgres, not pglite** — it
removes the single‑instance concurrency workaround (`prisma max:1`) and lets us
load the full `neon/schema.sql` faithfully (functions/triggers/indexes) instead
of the "prisma db push builds a partial schema" gap.

```yaml
# docker-compose.yml (sketch — the build agent fills in real values)
services:
  db:
    image: pgvector/pgvector:pg16          # Postgres 16 + pgvector
    environment: { POSTGRES_PASSWORD: datamodo, POSTGRES_DB: datamodo }
    volumes:
      - datamodo-db:/var/lib/postgresql/data
      - ./neon/schema.sql:/docker-entrypoint-initdb.d/10-schema.sql:ro   # full schema on first init
    healthcheck: { test: ["CMD","pg_isready","-U","postgres"], interval: 5s }

  app:
    image: ghcr.io/datamodo/local:latest   # built from the OSS CORE only (see §6)
    depends_on: { db: { condition: service_healthy } }
    environment:
      DATAMODO_LOCAL: "1"
      DATABASE_URL: postgres://postgres:datamodo@db:5432/datamodo
      BLOB_DIR: /data/blobs
      OLLAMA_BASE_URL: ${OLLAMA_URL:-http://host.docker.internal:11434}  # host Ollama by default
    ports: ["4321:4321"]
    volumes: [ "datamodo-data:/data" ]     # blobs, llm.json, connectors.json, ingest secret

  # OPTIONAL — only on Linux + NVIDIA. Mac users MUST use host Ollama (see §7).
  ollama:
    image: ollama/ollama
    profiles: ["gpu"]
    deploy: { resources: { reservations: { devices: [{ capabilities: ["gpu"] }] } } }
    volumes: [ "ollama:/root/.ollama" ]

volumes: { datamodo-db: {}, datamodo-data: {}, ollama: {} }
```

Notes:
- `pgvector/pgvector:pg16` gives pgvector out of the box. Confirm `pg_trgm`,
  `pgcrypto`, `btree_gin/gist`, `uuid-ossp` are creatable (all are contrib).
- With real Postgres, `lib/prisma.ts` can use the pg adapter WITHOUT `max:1` and
  WITHOUT the retry shim — gate those on "embedded pglite only".
- Model weights are NOT baked into images — pull at first run (§5).

---

## 5. First‑run: RAM → model tier → pull

App logic (works in BOTH runtimes; independent of Docker). Detect the budget
(`os.totalmem()`, or the container memory limit, or ask), map to a tier, pull the
models, write them into `llm.json` (already the dashboard‑editable store).

| RAM budget | Text/extract | Vision / scanned‑PDF | Embeddings | Note |
|---|---|---|---|---|
| ~4 GB | `llama3.2:3b` (or `qwen2.5:3b`) | (skip / `moondream`) | `nomic-embed-text` | warn: extraction quality is limited on tiny models |
| ~8 GB | `llama3.1:8b` | `llava` | `nomic-embed-text` | sensible default |
| ~16 GB | `llama3.1:8b` / stronger | `llama3.2-vision` | `nomic-embed-text` | |
| 32 GB+ | a 14–34B extract model | `llama3.2-vision` / `minicpm-v` | `nomic-embed-text` | |

- After the pull, these land in `llm.json` and are **editable in Settings**
  (already built — `LocalModelsFields`). The wizard just seeds good defaults.
- Keep the precedence contract: dashboard value → env → default.
- Embeddings dim must match the model (already handled: `EMBEDDINGS_COLUMN_DIM`,
  default 768 for `nomic-embed-text`).

---

## 6. Code separation — the publishable local‑only package (the hard part)

Requirement: the shipped local artifact reveals **only** the dashboard + local
adapters; the cloud/auth/landing/billing/webhook/MCP‑host code is not present.

Two ways, pick based on "one‑shot" feasibility:

- **C (pragmatic, recommended for a first pass): build‑time prune.** A script
  copies the OSS **core** into a clean tree, builds it, and packs the npm
  tarball / Docker image from that tree. Enforce with a dependency‑boundary lint
  (e.g. `dependency-cruiser`) so core can't import the closed layer — the build
  FAILS if it does. Lower blast radius; achievable in one shot.
- **B (ideal, more work): workspace split.** `packages/core` (OSS‑eligible),
  `packages/cloud` (closed), `packages/local` (the CLI/compose entry that depends
  only on core). The local build simply never includes `cloud`.

**Draw the boundary** (already ~90% seamed — the cloud deps funnel through ~4
files):

- **CORE / local‑eligible:** dashboard UI (`app/dashboard/*`), pure cores
  (`lib/datamodo/*` explorer/graph/kinds/knowledge/extract pipeline), `lib/llm/*`
  (incl. Ollama), local adapters (`lib/storage/blob-fs`, `@prisma/adapter-pg`,
  `lib/local/*`, embedded‑db), the deterministic ingest pipeline, IMAP connector.
- **CLOSED / never in the local artifact:** landing/marketing routes
  (`app/page.tsx`, `components/landing/*`), Neon Auth (`lib/auth/*` + `app/api/auth`),
  Neon serverless + `@prisma/adapter-neon`, hosted channel webhooks
  (`app/api/webhooks/*`), billing/Stripe (`app/api/billing/*`), cron/ops, the
  MCP server host (`app/api/mcp/*`) — decide if MCP ships local (it can).
- **INTERFACES the core imports** (cloud impls live only in the closed layer):
  storage (`putBlob/getBlob`), auth/session (`getSessionUser`), db adapter
  selection (`lib/prisma.ts`), channel ingest. These already exist as seams.

**One‑install outcome:** `npm i -g datamodo` (from the pruned package) OR
`docker run ghcr.io/datamodo/local` — both built from the same core, cloud code
absent from both.

---

## 7. The Ollama / GPU caveat (do not skip)

Ollama needs the GPU to be usable:
- **Linux + NVIDIA:** container GPU passthrough works → Ollama can live in compose (the `gpu` profile above).
- **Windows + WSL2 + NVIDIA:** works.
- **macOS (Apple Silicon):** containers **cannot** use Metal → Ollama in Docker is **CPU‑only and slow**. **Ollama must run natively on the host**, and the app (container or npm) talks to `http://host.docker.internal:11434` / `http://localhost:11434`.

So: **do not** put Ollama in the default compose. Default to host Ollama
everywhere; offer the `--profile gpu` Ollama service only on Linux/NVIDIA. The
installer should detect OS/GPU and choose. If Ollama isn't reachable, the app
already fails soft (keyword search / metadata‑only) — surface a clear "start
Ollama or add an API key" hint.

Also: **Docker Desktop itself is a dependency** (a VM on Mac/Windows, ~2–4 GB
overhead, not present for many non‑technical users). That's exactly why the
**no‑Docker npm path must remain first‑class**, not an afterthought.

---

## 8. Acceptance criteria

- `curl … | sh` (and a `.ps1`) installs and launches datamodo with **one command**
  on macOS, Linux, Windows — choosing Docker vs npm automatically, with an
  override.
- LOCAL and BYOK are a **Settings toggle**, not separate installs.
- First run detects/asks RAM, pulls a sensible model tier, and the models are
  **visible and editable in Settings** (reuse `LocalModelsFields`).
- The **published local package/image contains no cloud code** — `git`‑cloning or
  unzipping it reveals dashboard + local adapters only; a boundary lint fails the
  build if core imports the closed layer.
- Docker path uses **real Postgres** (drop the `max:1`/retry shim there); npm path
  keeps embedded pglite. Both build the schema faithfully (functions + triggers).
- macOS uses **host Ollama** (never CPU‑only container inference).
- Everything stays **fail‑soft**: no Ollama → keyword search; no key → prompt; the
  app never hard‑crashes on a missing model/provider.

## 9. Open questions for the owner

1. Does MCP (use‑your‑Claude‑subscription) ship in the local package, or stay cloud‑only?
2. Publish channel for the local image — GHCR? Docker Hub? And the npm name
   (`datamodo` is currently `private: true`, `name: "next-app"` — needs a real
   published name).
3. Licensing of the OSS core (the ROADMAP notes FSL/BSL vs AGPL+trademark) — this
   gates whether the pruned tree is public source or a closed binary/image.
4. RAM auto‑detect vs always‑ask, and whether to cap by *free* vs *total* RAM.

---

## 10. Note to Fable — build it AND verify it end‑to‑end (don't hand back untested)

You're on a **~16 GB RAM cloud session**, so you can and MUST actually run local
models and click through the whole product — not just compile it. Pull the tier:

```
ollama pull llama3.1:8b          # text extraction
ollama pull llama3.2-vision      # (or llava) — images + scanned PDFs
ollama pull nomic-embed-text     # embeddings (768‑dim, already wired)
```

Then boot the local edition (npm path is fine for the smoke test:
`node bin/datamodo.mjs build && node bin/datamodo.mjs serve`) and **verify every
user‑facing feature actually works with a real local model** — this repo has a
history of "it compiled / returned HTTP 200" hiding real breakage, so drive the
UI/flows and confirm data lands in the vault:

- **Boot** — dashboard loads with **no** "couldn't load / missing a migration" banner; console has no `[dashboard]` errors.
- **LLM setup** — Settings → Ollama URL + set the **Text** and **Vision** models; confirm the precedence (dashboard value beats env).
- **Add an agent** — create one; confirm it saves (this was the invalid‑UUID crash — it must not return).
- **@agent in Chat** — type `@`, the suggested list appears, ↑↓/Enter selects, the sent bubble shows "→ Agent", and the item is attributed to that agent.
- **Ingest — text** — send a chat message with real content → watch it go "reading… → ✓ filed" → entities/facts appear in Data/Explore.
- **Ingest — document (PDF with a text layer)** → extraction produces structured data.
- **Ingest — picture/image** → the **vision** model runs → a described/extracted node (not `metadata_only`).
- **Ingest — scanned PDF (no text layer)** → rasterize → vision/OCR path → extracted.
- **Edit tables** — add a column and remove a column on a dataset (exercises the stored `add_dataset_column` / `remove_dataset_column` functions that `prisma db push` does NOT create — confirm no `function … does not exist`).
- **Search / knowledge** — run a search and an entity match (exercises `knowledge_match_entities`); confirm no 42883.
- **Semantic search** — with `nomic-embed-text` pulled, confirm vector search returns sensible hits (not just keyword fallback).
- **Change models in the dashboard** — edit the Text/Vision model, re‑ingest, confirm the new model is used (check the Ollama logs / usage).
- **Fail‑soft** — stop Ollama mid‑run → the app degrades (keyword search / metadata‑only), never hard‑crashes.

For the packaging deliverable specifically, also verify: the **pruned local
artifact contains no cloud code** (grep the built package/image for `@neondatabase`,
`stripe`, `app/api/webhooks`, landing routes — should be absent), the **boundary
lint fails** if core imports the closed layer, and on the Docker path the app
runs against **real Postgres with the `max:1`/retry shim disabled**.

Expected reality on 16 GB: `llama3.1:8b` extraction is usable but not instant
(seconds per doc) and JSON is mostly clean thanks to `json_object` mode +
`parseLoose`; if a tiny model is substituted, expect more `parseLoose` salvage
work — that's the model, not the pipeline. Report anything that only "worked" at
the HTTP/compile level but not in the actual vault.
