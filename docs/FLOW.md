# datamodo — the flow (living infographic)

> **Maintained doc — update with EVERY commit that changes the pipeline or adds
> a feature to a stage.** Mermaid renders natively on GitHub, so this diagram is
> the always-current infographic: stages × features × stack in one picture.
> Siblings: [STATE.md](STATE.md) · [ROADMAP.md](ROADMAP.md) · [MEMORY.md](MEMORY.md).
>
> Last updated: 2026-07-17

## The one-picture version

```mermaid
flowchart LR

subgraph SENDS["1 · THE USER SENDS<br/>gesture-based capture, never account slurping"]
  direction TB
  EM["✉ Email<br/><i>forward to their<br/>private inbox address</i>"]
  WA["🟢 WhatsApp<br/><i>message the shared bot<br/>(link-code identify once)</i>"]
  SL["▦ Slack / ◇ Teams<br/><i>same shared-bot +<br/>link-code pattern</i>"]
  XL["▦ Spreadsheet upload<br/><i>xlsx → table or<br/>→ knowledge graph</i>"]
  NT["✎ Prose dump<br/><i>subject 'note:' forces<br/>a generated note</i>"]
  APP["▣ In-app Chat<br/><i>type · attach · dictate ·<br/>voice-note, in the dashboard</i>"]
  IMAP["📥 IMAP pull <i>(local edition)</i><br/><i>datamodo connect — watches<br/>your own mailbox, no webhook</i>"]
end

subgraph LISTEN["2 · WE LISTEN<br/>adapters normalize to one envelope"]
  direction TB
  CFW["Cloudflare Email Worker<br/><code>workers/email-ingest</code>"]
  WH["Signed webhooks<br/><code>/api/webhooks/{whatsapp,slack,teams}</code><br/>Twilio HMAC · Slack v0 · Teams JWT"]
  ING["<b>POST /api/ingest</b> → <code>ingest()</code><br/><code>lib/ingest/store.ts</code> · x-ingest-secret"]
  IMAPP["IMAP poller (imapflow, in <code>serve</code>)<br/>→ <code>POST /api/local/imap</code> → mailparser<br/><code>lib/local/connectors/*</code> · local-only"]
  CFW --> ING
  WH --> ING
  IMAPP --> ING
end

subgraph STORE["3 · WE STORE RAW<br/>nothing is ever lost"]
  direction TB
  BLOB[("R2 blobs<br/>sha256 + gzip, deduped,<br/>ref-counted originals")]
  ITEMS[("items + attachments<br/>status: received→stored,<br/>claim tracking, attempts")]
end

subgraph PROCESS["4 · WE PROCESS<br/>LLM extraction, steered by the user's ontology"]
  direction TB
  TICK["Queue: <code>extract-tick</code> cron + after() self-kick<br/>atomic claim (SKIP LOCKED) · orphan recovery ·<br/>retry cap 3 · <code>extraction_version</code> + requeue endpoint"]
  KINDS["Categories registry steers the prompt<br/><code>lib/datamodo/ontology.ts</code> + <code>kinds.ts</code>"]
  MSG["Message → free-range extract<br/>(2-model, confidence-gated escalation)"]
  DOC["Document → classify-first,<br/>template-restrained + md summary"]
  IMG["Image → vision call<br/>(classify+extract in one)"]
  AUD["Audio → transcribe (fail-soft),<br/>then the document pipeline;<br/>body = summary + transcript"]
  NOTE["Substantive dump →<br/>generated note (we author)"]
  CANON["Canonicalize + reconcile + restrain<br/>kind/predicate synonyms collapse ·<br/>same-message multi-values → list facts,<br/>never last-one-wins ·<br/>off-template facts → Review, not lost"]
  TICK --> MSG & DOC & IMG & AUD & NOTE
  KINDS -.steers.-> MSG & DOC & IMG & AUD
  MSG & DOC & IMG & AUD & NOTE --> CANON
end

subgraph VAULT["5 · CANONICAL VAULT<br/>one store, per-user (org_id), Neon Postgres"]
  direction TB
  ENT[("entities<br/>resolved: exact key → trigram →<br/>ANN embeddings → LLM adjudication")]
  FACTS[("facts<br/>append-only · bitemporal ·<br/>claim-key dedup · supersession")]
  PROV[("fact_sources<br/>provenance to the exact message")]
  CHUNKS[("doc_chunks<br/>page-cited passages")]
  REV[("knowledge_reviews<br/>merge · conflict · extraction ·<br/>off-template · category proposal<br/>— impact-ranked")]
end

subgraph DERIVE["6 · WE DERIVE<br/>every view is a projection; nothing is a second store"]
  direction TB
  TAB["▦ Tables = categories<br/><i>draggable schema canvas;<br/>kind_id-bound datasets;<br/>dashed table↔table links</i>"]
  EXP["◍ Explorer (the walk)<br/><i>edge to edge; edges show<br/>confidence · time · sources;<br/>nodes in their natural shape<br/>(record · page · image · player)</i>"]
  TL["◷ Timeline<br/><i>messages · due dates ·<br/>corrections · first seen</i>"]
  EP["▤ Entity pages + dossier ↓<br/><i>cited markdown export</i>"]
  FI["🗂 Files<br/><i>smart folders =<br/>queries over mentions</i>"]
  INS["∑ Insights<br/><i>any measure × any axis</i>"]
  SE["⌕ Search + answers<br/><i>grounded, [n]-cited,<br/>quotes from inside docs</i>"]
  RS["✓ Review Studio<br/><i>PR metaphor: approve<br/>& merge to graph:main</i>"]
end

SENDS --> LISTEN
ING --> BLOB & ITEMS
ITEMS --> TICK
CANON --> ENT & FACTS & PROV & CHUNKS & REV
VAULT --> DERIVE
REV -.accept/reject.-> RS
XL -.infer graph → same ingest.-> CANON
```

## Stage detail (what · how · stack)

| Stage | What the user senses | How we do it | Stack / key files |
|---|---|---|---|
| **Send** | "Forward it to datamodo" — email address, bot DM, upload, or the in-app Chat (text · files · voice notes · dictation) | Gesture-based capture; identify-once link codes bind a sender handle to the user; the Chat route attributes by session, no codes needed | `forwarding_addresses`, `ingest_sources`, `channel_link_codes`, `app/api/chat` |
| **Listen** | Instant "got it" | Channel adapters normalize to `IngestEnvelope`; signature-verified; idempotent by `external_id` | `workers/email-ingest`, `app/api/webhooks/*`, `app/api/ingest` |
| **Store raw** | "The original is always kept" | sha256+gzip blob dedup (same file re-forwarded = one blob), items at `stored` | `lib/ingest/store.ts`, `lib/storage/blob.ts`, R2 |
| **Process** | Facts appear minutes later; unclear things ask for review | Cron + self-kick drain; claim/recover/retry; classify → extract → ground (zero-LLM evidence check: fabricated snippets / absent numbers cap confidence into the review gate) → canonicalize → reconcile (zero-LLM: broken refs drop, repeats collapse, values/keys normalize, declared/heuristic cardinality settles multi-values as coexisting list facts) → restrain; audio transcribes first (fail-soft) then follows the document path; low confidence escalates models, then to Review; a clearly weaker new value is HELD for review instead of silently overwriting a corroborated one | `lib/datamodo/extract.ts`, `ontology.ts`, `reconcile-core.ts`, `documents.ts`, `lib/llm/*` (incl. `transcription.ts`) |
| **Vault** | One clean version of every fact, with receipts | Tiered entity resolution (never a silent bad merge), bitemporal facts (contradictions supersede, never delete), provenance per claim | `lib/datamodo/knowledge.ts`, Neon (pgvector + pg_trgm) |
| **Derive** | Tables, graph, timeline, answers — all just *there*; on demand: describe a table or a folder tree and it builds itself out of the graph, and any answer can be shown IN the graph | Pure projections over the vault, computed live or auto-materialized; accept in Review = commit to the graph; prompt-shaped projections (derive-table, folder export) preview before anything is written | `lib/datamodo/{project,analytics,search,answer,timeline,concept-map,dossier,derive-table,folder-export,zip}.ts`, `app/dashboard/*` |

## Invariants (the flow's laws)
1. **Originals are immutable** — blobs are content-addressed; merge moves identity, never rewrites content.
2. **Facts are append-only** — a new value supersedes, history stays queryable (`valid_from`/`valid_to`).
3. **Every claim has provenance** — `fact_sources` points at the exact message; answers must cite or they don't render.
4. **Templates steer, never block** — messages free-range; documents restrained, but drops go to Review, not the void.
5. **Views derive** — deleting every projection loses nothing; the vault rebuilds them.
6. **Failure degrades, never breaks** — no key → no embeddings/vision/transcription, item still lands; bad attachment → `metadata_only` node.
