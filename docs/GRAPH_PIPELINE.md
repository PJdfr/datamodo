# The graph pipeline — end-to-end reference + optimal-graph roadmap

> **Living doc.** The single place that answers, precisely and with file
> references: what the graph's schema is, what prompt the extraction LLM gets,
> what context rides along, how the model is picked, what happens to non-text
> input, how the graph is queried, and how versioning/review works. The
> roadmap at the bottom is the ordered plan toward the "optimal graph" bar:
> cheap-LLM append, fast retrieval, no degeneration, multimodal.
>
> Siblings: [MEMORY.md](MEMORY.md) · [STATE.md](STATE.md) · [FLOW.md](FLOW.md)
> · [ROADMAP.md](ROADMAP.md).
>
> Last updated: 2026-07-16

## 0 · The mental model in one paragraph

datamodo is a **property graph stored in Postgres**. `entities` are the nodes
(a *kind* + a *label* + dedup keys + an embedding + an optional markdown
body). `facts` are everything hanging off a node: a fact whose value is
another entity is an **edge**; a fact whose value is a literal (text / number
/ date) is a **node attribute**. There is deliberately no separate
"attributes" store — one table, one versioning rule, one provenance rule for
both. The LLM's only job is to fill a small form (entities + facts, closed
vocabulary where possible); every anti-degeneration mechanism (dedup, merge,
supersession, restraint, review) is deterministic code *around* the model,
which is what lets the extraction model be cheap.

## 1 · The database schema (the graph)

Source of truth: [`neon/schema.sql`](../neon/schema.sql) /
`prisma/schema.prisma`. Everything is scoped by `org_id` (one personal org
per user — the privacy boundary; authz is app-layer, no RLS).

### `entities` — nodes (schema.sql ~line 522)

| column | role |
| --- | --- |
| `kind` | the node's category ("person", "invoice", "concept", "document", "note"…). Steered by the user's kind registry. |
| `canonical_label` | display name; the "word" the node is. |
| `normalized_key` | deterministic dedup key (strong natural key if present, else normalized label). **Unique per (org, kind) while `merged_into IS NULL`.** |
| `natural_keys` jsonb | strong identifiers: email / phone / invoice_no / id. Tier-0 identity. |
| `embedding vector(1536)` + `embedding_model` | semantic identity + search. HNSW cosine index. Model-stamped so mixed embedding spaces never compare. |
| `support` int | corroboration count — bumped every time an extraction re-observes the node. |
| `merged_into` | tombstone pointer — dedup merges re-point everything and leave this behind. |
| `body_md` | the "thick node" payload: a document's summary, a note's distilled markdown, a synthesis. |
| `graph_pin` jsonb | user-pinned explorer position. |

Indexes: HNSW on `embedding`, trigram GIN on `canonical_label` (fuzzy match
via the `knowledge_match_entities()` SQL function), partial unique on
`(org_id, kind, normalized_key) WHERE merged_into IS NULL`.

### `facts` — edges AND node attributes (schema.sql ~line 561)

| column | role |
| --- | --- |
| `subject_entity_id` | the node this fact hangs off. |
| `predicate` | snake_case verb/field name ("amount", "due_date", "issued_by"). |
| exactly one of `object_entity_id` / `value_text` / `value_num`(+`unit`) / `value_date` | the value. **Entity-valued = edge; literal-valued = attribute.** |
| `cardinality` | `one` = single-valued slot (new value supersedes); `many` = list (values accumulate). |
| `claim_key` | slot identity: `subject::predicate` (cardinality one) or `subject::predicate::value` (many). **Unique per org while `valid_to IS NULL`** — the versioning backbone. |
| `confidence` | 0..1, from the extractor. |
| `valid_from` / `valid_to` / `superseded_by` | bitemporal chain: a contradicted fact is closed, never deleted. |
| `source_item_id` | the message that produced it. |

### Supporting tables

- **`fact_sources`** — per-fact provenance: every message that (re-)asserted
  the fact, with a quote snippet. Re-observation = a new source row, not a new
  fact.
- **`doc_chunks`** — the evidence layer: chunked passages from inside
  documents (page lineage + embeddings) attached to the document's entity, so
  answers can cite from *inside* files, not just from extracted facts.
- **`items`** — the raw capture queue (email/chat/upload envelope + status
  machine `received → stored → analyzing → analyzed | failed`). The graph's
  input buffer; also the anchor for provenance and replay.
- **`knowledge_reviews`** — the pull-request queue (see §7).
- **blobs** (object storage; `lib/ingest/store.ts`) — original bodies and
  attachments, content-addressed by hash. The graph stores pointers +
  distillates, never raw media (the multimodal rule, §5).

## 2 · Ingest pipeline for a text message (the ⑤→⑥ steps)

Entry point: `runExtractionForItem` in
[`lib/datamodo/extract.ts`](../lib/datamodo/extract.ts) (~line 585), driven by
the cron tick over `claimStoredItems` (`FOR UPDATE SKIP LOCKED` — Postgres-
native queue, no pgmq).

1. **Claim + load** — item flips `stored → analyzing`; text loads from the
   body blob (falls back to `body_preview`).
2. **Agent steering** — if the item was addressed (`meta.agent_id` from chat
   "@agent") that agent's `purpose_text` steers extraction; unaddressed items
   run a **zero-cost lexical router** (`agent-router.ts`, no LLM) against
   active AUTO agents' purposes; ambiguity = generic agent.
3. **Context assembly** — the user's kind registry (`listKinds`), the
   **relevance-primed known entities** (labels literally in the text + ANN
   over one message embedding — `priming.ts`), concepts (primed-first,
   support-ranked fill), their onboarding `businessContext`.
4. **LLM extraction** — `extractFromMessage`: small model first, JSON-schema-
   constrained; **escalate** to `models.escalate` only when self-reported
   `overallConfidence < 0.55`.
5. **Canonicalization** (deterministic, post-LLM) —
   `canonicalizeExtraction` collapses kind/predicate synonyms onto the
   registry's canonical slugs so the same real-world fact always produces the
   same `claim_key`.
6. **Fold into the graph** — `ingestExtraction`
   ([`knowledge.ts`](../lib/datamodo/knowledge.ts)): resolve every entity
   (§6-style tiers: exact key → trigram → ANN-recall → LLM adjudication),
   then upsert every fact (dedup / supersede / insert).
7. **Side products** — substantive write-ups become a pipeline-authored NOTE
   (thick node); attachments run the document pipeline (§5); unregistered
   kinds seen ≥3× become a category *proposal*; low-confidence extractions
   (< 0.75) file an extraction review; pending decisions ping the user back
   on the channel the message came from ("1 yes" approves).
8. Item flips `analyzed` and is stamped `extraction_version` (bump the
   constant → `POST /api/jobs/extract-requeue` reprocesses stale items only).

## 3 · The exact prompts

All verbatim in [`lib/datamodo/extract.ts`](../lib/datamodo/extract.ts).

### 3a · Message extraction — `SYSTEM` (~line 117)

The system prompt says, in full effect: you extract structured facts from a
SINGLE communication for a personal data assistant; return ONLY facts
supported by the text, never invent; model real-world things as ENTITIES with
stable `localId`s; each FACT links subject → snake_case predicate → one value
(`valueType` ∈ text/number/date/entity); put strong identifiers
(email/phone/invoiceNo) on entities *so duplicates can be resolved*;
confidence per fact + overall; empty arrays when nothing useful; and return a
`note {title, body}` ONLY when the message is a substantive write-up the user
dumped to keep. It ends with a one-shot worked example (an Acme invoice) of
the exact JSON.

### 3b · The user prompt = the CONTEXT the extraction LLM gets

`buildUserPrompt` (~line 174) assembles, in order:

| block | source | purpose |
| --- | --- | --- |
| **Categories** (`promptCategories`, [`ontology.ts`](../lib/datamodo/ontology.ts) ~448) | the user's kind registry: each kind + description + `fields(type,unit,required)` + `relations(predicate→targetKind)` | the **closed vocabulary** — "when an entity fits one, use its kind and its exact field/relation names as predicates" |
| **Known entities** (`renderKnownBlock`, priming-core.ts) | relevance-primed: labels literally in the text (any support) + ANN over one message embedding (support ≥ 2, sim ≥ .3), cap 15, labels only — never ids | "reuse its EXACT label and kind … if NOT sure it is the same real-world thing, use the message's own wording — never force a match" |
| **Concepts** | primed (input-relevant) concept labels first, support-ranked fill to 12 | the topic leash: "tag AT MOST 3, STRONGLY prefer these exact labels" |
| **Business context** | onboarding answers | steers which entities/predicates matter |
| **Assistant purpose** | the addressed/routed agent's `purpose_text` | per-agent steering (this is what "separate graphs per agent" already partially is — see §9) |
| Channel / From / Subject | the item envelope | grounding |
| note trigger | subject starts with "note:/memo" | forces the note object |
| **Message text** | the body blob | the payload |

### 3c · Documents — classify then distill (two prompts)

- **① `CLASSIFY_SYSTEM`** (~293): "classify ONE DOCUMENT into the best-fitting
  category from a user's list… judge by PRIMARY content — what the document
  IS, not what it mentions." User prompt = category *menu* + first 2,000 chars.
  Cheap call, `models.extract`.
- **② `DOC_SYSTEM`** (~331): "you are DISTILLING, not transcribing" — return a
  markdown `summary` that is **the document's PAGE in the vault** (since
  2026-07-16: overview → `##` sections when the document has structure → a
  `| field | value |` table of key values → bold figures → `[[wikilinks]]`
  around every entity also returned as facts, which the app renders live),
  the primary subject as `e1` using **ONLY the classified kind's template
  predicates**, entities its relation verbs point at, ≤3 concepts (a TAG cap,
  not a content cap — richness lives in the page and the template facts);
  "NEVER extract incidental entities… Fewer, correct facts beat many." User
  prompt (`buildDocumentPrompt`) carries that ONE kind's template + the
  relevance-primed known-entities block (on the DOCUMENT's own text) + the
  user's **agents** (name+purpose — a dropped PDF usually exists FOR one) +
  their **tables** (name+columns — matching predicates land straight in) +
  concepts + business context + filename + text.
- Off-template facts the model returns anyway are NOT silently dropped:
  `restrictExtractionToTemplates` removes them from the graph and packages
  them as an `off_template` review ("add anyway?").

### 3d · Images — `IMG_SYSTEM` (~428)

One vision call classifies AND extracts (a second vision pass costs real
money): summary that *transcribes the load-bearing text and numbers*, primary
subject `e1` in one of the given categories, same restraint rules, "if
unreadable or decorative, return empty and say so."

### 3e · Entity-merge adjudication — in `adjudicateMatch` (knowledge.ts ~249)

"You decide whether a newly-parsed entity refers to the SAME real-world thing
as one of several candidates… USE the candidates' known facts and identifiers
as evidence — matching identifiers are near-proof, contradicting identifiers
are near-disproof… do NOT merge genuinely different things that merely share
a word." → `{matchId, confidence, reason}`. Since 2026-07-16 (user call)
candidates go in ENRICHED — natural keys, support count, top-4 current facts
(`enrichMatchCandidates`/`topFactsForEntities`) — and the consolidation
sweep passes both sides' facts, so doubt is judged on identity evidence,
never label similarity alone.

### 3f · Grounded answers — `SYSTEM` in [`answer.ts`](../lib/datamodo/answer.ts) (~102)

"You answer a question about the user's OWN data… Answer ONLY from the
sources. Cite [n] inline after each claim. If the sources do not contain the
answer, set answerable to false." → `{answerable, answer}`.

## 4 · How the LLM is picked

Resolution: `llmForUser(userId)`
([`llm-for-user.ts`](../lib/datamodo/llm-for-user.ts)) → `getLlmProvider`
([`lib/llm/index.ts`](../lib/llm/index.ts)).

1. **BYOK first**: compute mode "byok" + a saved credential → the user's OWN
   account (Anthropic / OpenAI / OpenRouter key, or an Ollama server URL).
   A monthly spend cap is checked against the usage ledger BEFORE burning the
   key (local: falls back to free Ollama; cloud: fails the item with a
   requeue-able reason).
2. **Platform default** otherwise: `LLM_PROVIDER` env (default openrouter;
   local edition defaults ollama).
3. **Three model slots per provider**, precedence dashboard → env → default:
   - `extract` — the cheap workhorse (every message, classify calls,
     adjudication, answers). e.g. `claude-haiku-4-5` / `gpt-4o-mini` /
     `llama3.1`.
   - `escalate` — re-runs the SAME prompt only when self-reported confidence
     < 0.55 (e.g. `claude-sonnet-5` / `gpt-4.1`).
   - `vision` — images + scanned PDFs (`llava`, `OPENROUTER_VISION_MODEL`…).
     A blind model fails soft → the attachment stays `metadata_only`.
4. Embeddings and transcription are separate keys/clients
   (`lib/llm/embeddings.ts`, `lib/llm/transcription.ts`), every path
   fail-soft.

This IS the "lowest LLM possible" design: the cheap slot does ~everything,
the graph's integrity never depends on model quality (restraint +
canonicalization + deterministic resolution catch it), and escalation is a
confidence-gated exception, not the rule.

## 5 · When it's not text (multimodal)

Dispatcher: `processItemAttachments` in
[`documents.ts`](../lib/datamodo/documents.ts). The invariant for every
modality: **blob archived in object storage → text distillate + facts in the
graph → passages in `doc_chunks` → thick node (`body_md`)**. Media bytes
never enter the graph; the expensive model runs ONCE at ingest, never at
query time. Every branch fails soft to `metadata_only` (the document node
still exists — filename/type/size + `mentions` edges).

| input | path |
| --- | --- |
| **PDF with a text layer** | **No size limit** (user call 2026-07-16): `extractAttachmentText` via **unpdf** reads the WHOLE document (safety ceilings only: 500 pages / 600k chars) and ALL of it is chunked + stored (`MAX_CHUNKS` 500). Above the 24k-char prompt budget, the classify call reads the head, then the **zero-LLM chunk-importance selector** (`chunk-select.ts`: section headers, info density, template/agent term overlap, position; openings always kept) picks what the distill LLM reads — page-marked, elision-marked, document order. Omitted passages stay searchable in `doc_chunks`. Same selection applies to long audio transcripts. |
| **Scanned PDF** (`isLikelyScannedPdf`: <~24 chars/page) | **OPT-IN since 2026-07-16** (user call: no vision on PDFs for now): only with `PDF_SCAN_VISION=1` does `rasterizePdfPages` (up to 6 pages, ONE vision call) → `extractFromImage` run; otherwise the scan stays `metadata_only` (blob archived — a requeue after enabling re-reads it). Photos are unaffected. |
| **Image** (photo/screenshot) | vision tier §3d; the summary is the image's only text → chunked so passage search can cite what the image says. |
| **Audio** (voice memo) | `transcribeAudio` (Whisper-shaped, fail-soft) → the transcript runs the SAME document pipeline; node body = player + summary + transcript. |
| **Spreadsheet** | `parseWorkbook` → `sheetToText` → document pipeline. (Bulk imports have their own preview/confirm flow.) |

**Known gap (→ roadmap P3): PDF → *markdown*.** unpdf extracts a flat text
layer — headings, tables, and reading order are lost before the LLM ever
sees the document, which costs extraction quality on structured PDFs and
makes `doc_chunks` blind to sections. Open-source converters exist precisely
for this (Docling, marker, MinerU, pymupdf4llm — all Python; pdf.js-based JS
approximations are weaker). The seam is a single function
(`extractAttachmentText`), so this is a swap, not a refactor — see P3 for the
sidecar-vs-library decision.

## 6 · Querying the graph (and what an answer looks like)

Graph-first retrieval (GraphRAG), shipped 2026-07-14, entry
`/api/search?answer=1`:

1. **Link the query to seed entities** — two legs: TEXT
   (`linkQueryEntities`: label/natural-key coverage, deliberately strict — a
   seed must be *named*) + SEMANTIC (`annLinkEntities`: ANN over
   `entities.embedding`, current-embedding-space only, sim ≥ 0.35). One query
   embedding is shared by all legs.
2. **Traverse `facts`** — `expandFromSeeds` (pure, the one `buildAdjacency`
   rule): the seeds' facts + best neighbors' facts ranked by seed-tie weight;
   current claims only (`valid_to IS NULL`).
3. **Scoped passage fallback** — `searchChunks` over `doc_chunks` with the
   linked neighborhood as scope (semantic recall scoped, keyword recall
   global).
4. **Grounded answer** — `buildAnswerContext` composes a NUMBERED evidence
   list (≤8 entities-with-facts, ≤8 table rows, ≤5 passages); the model
   answers **only from those sources** with inline `[n]` citations (§3f);
   `citedSources` then keeps only what was actually cited — an answer that
   cites nothing is discarded rather than shown.

**What you get back** (`GroundedAnswer`): `text` with `[n]` citations +
`sources[]` (type row/entity/passage, label, dataset/entity ids) — which is
why every answer can render citation chips, "◍ See in graph" (cited nodes
haloed in the Explorer), and provenance drill-down to the original messages.
Everything fails soft: no key → plain keyword results still render.

## 7 · Versioning & the pull-request loop

**Fact versioning is git-shaped, at claim granularity:**

- Same slot, same value → **dedup**: a new `fact_sources` row (corroboration),
  no new fact.
- Same single-valued slot, different value → **supersede**: old fact gets
  `valid_to` + `superseded_by`, new fact becomes current, and a
  `fact_conflict` review is filed (auto-applied but reviewable — the user can
  flip it back).
- `cardinality: many` slots accumulate instead (value is part of the key).
- History is never deleted; the Commits view (`buildCommitLog`) renders one
  commit per extraction run with `+ added` / `~ was → now` diff lines, and
  per-entity blame filters that log to one node.

**The review queue** (`knowledge_reviews`) is the human gate, ranked by
impact. Kinds today: `entity_merge` (auto-accepted ≥0.85 for audit, proposed
0.55–0.85, below = new entity — a wrong merge corrupts data, so uncertain
merges NEVER apply silently), `fact_conflict`, `extraction` (overall
confidence < 0.75), `off_template` (template-dropped document facts, replay-
able), `category_proposal` (≥3 entities of an unregistered kind → AI-drafted
template; accept = the ontology grows, decline = never re-asks). Reviews
reach the user in-app, in chat bubbles, and as channel pings with
reply-to-approve ("1 yes").

This is the **ontology feedback loop** that off-the-shelf graph-RAG systems
lack: vocabulary only grows through a gate, and the gate is the user.

## 8 · Edge facts vs node attributes vs node metadata — and how the LLM tells them apart

Three layers, one table + a bit of node-local state:

1. **Edge** = a fact with `valueType: "entity"` → stored with
   `object_entity_id`. It connects two nodes ("INV-9 —issued_by→ Acme").
2. **Node attribute** = a fact with a literal `valueType`
   (text/number/date) → stored in `value_text/num/date`. It's what your
   "metadata on a node" is ("INV-9 —amount→ 100 USD"). Same table, same
   versioning, same provenance — an attribute is just an edge to a literal.
3. **True node metadata** = the few things that are about the node's
   *identity and rendering*, not knowledge: `natural_keys` (strong ids),
   `body_md` (the readable page), `support`, `embedding`, `graph_pin`. The
   LLM populates only the first (via the flat `email/phone/invoiceNo` fields
   on each entity) and — indirectly — `body_md` (via `summary`/`note`).

**How the model differentiates:** it never chooses a storage location. It
emits one flat shape and three signals decide everything downstream:
- `valueType: "entity"` + `valueEntityLocalId` → edge; literal valueTypes →
  attribute (the mapping is `toExtraction` → `valueColumns`, pure code).
- The kind **template** it's shown (§3b/3c) splits vocabulary explicitly:
  a kind's `fields` are attribute predicates, its `relations` are edge
  predicates with target kinds ("issued_by→company") — so the closed
  vocabulary itself teaches which predicates take entities.
- Identifier fields (`email/phone/invoiceNo`) go ON the entity, and the
  prompt says why ("so duplicates can be resolved") — that's the natural-keys
  channel.

This is also why "each attribute could itself be an entity" needs no schema
change: **promote the value to an entity and the attribute becomes an edge.**
That's reification (roadmap P4) — an ontology/prompt decision, not storage.

**Template block (user decision 2026-07-16):** template FIELDS are a
guarantee, not a suggestion — at the end of every ingest, each node of a
templated kind carries **at least** its template fields, null-filled when
unknown (`ensureTemplateSlots`; the prompt also says "ATTEMPT EVERY template
field"). The first real value fills a null slot **silently** (completion,
not a `fact_conflict`), and extra metadata beyond the template stays
welcome. Placeholders render as "—", and are excluded from orphan
edge-counts, ontology-health usage, and adjudication fact context — they are
schema, not observations. Net effect: a table over a kind can always just
read the metadata; every row has every column, possibly null.

**Templates create themselves (growth loop, enriched 2026-07-16):** when
several entities share unregistered kind + metadata "by chance", the
`category_proposal` draft is no longer generic — it is grounded in the
user's world: the entities' **observed literal predicates** ("prefer fields
matching these"), their **observed edges grouped by target kind**
(deterministically merged into the drafted relations — the model may phrase
them, never drop them), the onboarding business context, and the agents'
purposes. Deriving a table from a non-uniform graph stays available
(derive-table); proactive templates are now the primary path.

## 9 · One graph vs one-graph-per-agent (decision)

**Decision: ONE graph per user, with agent *lenses* — not physically separate
graphs.** (Consistent with the individual-only product model in MEMORY.md.)

Why not hard separation:
- **Identity fragments.** "Acme" known to the invoices agent and "Acme" known
  to the recruiting agent become two nodes that can never corroborate each
  other — you'd re-create the duplication problem *by design*, and
  cross-domain questions ("everything involving Acme") stop working.
- The resolution machinery (natural keys, trigram, ANN, support) gets
  *stronger* with more observations in one space; splitting starves it.
- Provenance already records who brought what: items carry
  `meta.agent_id` / `meta.routed_agent_*`, and every fact points at its
  source item — the attribution exists today, it's just not queryable as a
  first-class filter.

What "don't mix what shouldn't mix" actually needs (roadmap P5):
- **Write-side**: keep agent steering as-is (purpose in the prompt), and stamp
  the routed/addressed agent onto the *facts* (denormalize `agent_id` from
  the source item at ingest, or resolve through `source_item_id` at read
  time).
- **Read-side lens**: every surface (Explorer, tables, search, grounded
  answers) accepts an `agent` filter — "show me this vault as the recruiting
  agent sees it". An agent-addressed chat question defaults its retrieval
  scope to that agent's lens (facts it sourced + their neighborhood), with a
  one-tap "search everything" widening.
- **Hard walls stay available at the right altitude**: if a user genuinely
  needs isolation (personal vs client work), that's a second *org/vault*, not
  a per-agent table split.

## 10 · The paper (arXiv 2607.13728, "Cluster with Auctions for Vector Search") — honest assessment

What it is: Meta FAIR work on **partition-based approximate nearest-neighbor
indexing**. CwA jointly learns (a) a *balanced* partition of database vectors
(capacitated linear assignment solved with an auction algorithm) and (b) a
neural probing function trained on the **query distribution**, alternating
the two against one loss. Headline: up to 4.7× throughput over K-Means IVF
at equal recall when queries are out-of-distribution vs the database;
CwA-HNSW / CwA-Prod scale it to 100M vectors.

What it is **not**: it says nothing about entity merging, graph construction,
or RAG orchestration — it's the index layer *under* vector search.

Relevance to datamodo, concretely:
- **Scale mismatch today.** CwA pays off from ~1M vectors per index and needs
  GPU training on a query log. A personal vault is 10³–10⁵ vectors behind
  pgvector HNSW; our retrieval cost is dominated by LLM calls, not ANN.
- **One idea transfers now**: its core observation — *queries and database
  vectors follow different distributions* — is true for us (short natural-
  language questions vs `kind: label (keys)` entity strings and chunk
  prose). Practical consequences we adopt cheaply: keep the one-embedding-
  space rule strict (already enforced via `embedding_model`), don't tune
  similarity thresholds on entity-entity pairs and reuse them for
  query-entity matching (`annLinkEntities`'s 0.35 vs resolution's 0.5 are
  separate knobs — keep them separate), and when we evaluate retrieval, build
  the eval set from real *questions*, not from stored labels.
- **File it as the scale seam**: if a shared/hosted deployment ever
  aggregates enough vectors that pgvector HNSW strains, the exit ramp is a
  Faiss-style index service, and CwA(-HNSW) is the state of the art to reach
  for there. Not before.

## 10b · Prior art: the degeneration literature (researched 2026-07-16)

"Graph degeneration" is not one literature but four; datamodo's design matches
the strongest published pattern in each. Kept here so future work steals
deliberately, not accidentally.

1. **Entity duplication → canonicalization / entity resolution.**
   Galárraga et al. 2014 ("Canonicalizing Open Knowledge Bases") framed it:
   open extraction yields synonymous noun phrases; fix = clustering with
   *canopy blocking* (never compare everything to everything) — our tier-0/
   trigram/ANN ladder is this lineage. **CESI** (WWW'18, arXiv 1902.00172)
   canonicalizes noun phrases AND relation phrases *jointly* over embeddings
   + "side information" (= our natural keys). Lesson: entities and predicates
   degenerate together and should be repaired together.
2. **Predicate sprawl → ontology-constrained extraction.**
   **RELATE** (arXiv 2509.19057) maps free LLM relations onto a fixed
   ontology via predicate embeddings → similarity retrieval → LLM rerank —
   the upgrade path for `canonicalizeExtraction` beyond exact alias tables.
   **KGGen** (via the LLM-KG-construction survey, arXiv 2510.20345) names our
   exact failure mode ("schema-free extraction yields fragmented vocabularies
   … similar relations under many surface predicates") and fixes it with
   embedding-clustering + LLM-guided consolidation. **AdaKGC** handles schema
   drift with schema-constrained decoding (= our JSON-schema + restraint, at
   the decoding layer). The financial-extraction literature (arXiv
   2602.11886) contributes the two P2 metrics verbatim: **Ontology
   Conformance** (share of triples using registry vocabulary) and
   **Faithfulness** (grounded in source text).
3. **Staleness/contradiction → temporal KGs.**
   **Zep/Graphiti** (arXiv 2501.13956) is the closest published system to
   datamodo overall: bitemporal edges, supersession by invalidation (never
   deletion), entity resolution at ingest against the live graph — our
   `claim_key`/`valid_to`/`superseded_by` design independently converged.
   Their extra tier (a community subgraph of clustered summaries) is only
   worth it at retrieval scales we don't feel yet.
4. **Noise accumulation → refinement / forgetting / "sleep".**
   Paulheim & Cimiano's refinement survey (SWJ 2016): refinement =
   completion + error detection, run *outside* the write path — the
   consolidation worker (P1) is textbook. **CleanGraph** (arXiv 2405.03932)
   validates human-in-the-loop repair over silent auto-repair (= the review
   gate). The 2026 agent-memory wave (graph-based agent memory survey arXiv
   2602.05665; "Memory in the Age of AI Agents" arXiv 2512.13564) converges
   on *sleep-time consolidation*: idle-time merge + usage-frequency
   reweighting + pruning. The transferable idea we lack: **usage-weighted
   retention** — `support` counts writes, nothing counts *reads*; retrieval
   touches should protect an entity from pruning and weigh merge-winner
   selection.
   ("Less is More: Denoising KGs for RAG", arXiv 2510.14271: noisy graphs
   measurably hurt retrieval — degeneration is not cosmetic.)

**The admitted gap**: per the incremental-RAG comparisons (LightRAG arXiv
2410.05779, EraRAG arXiv 2506.20963), no major GraphRAG system measures
graph-level fidelity — all evaluate end-to-end QA only. P2's ontology-health
instrumentation has no off-the-shelf design to copy; it is the novel part.

## 11 · ROADMAP — from "80% there" to the optimal graph

Ordered by degeneration-risk-per-effort. Each phase is independently
shippable; none blocks the others except as noted.

### ~~P1 — Background consolidation worker~~ ✅ SHIPPED 2026-07-16
The write path dedups well, but nothing ever *re-examines* the graph; slow
drift (near-duplicate entities that arrived under different labels before
embeddings existed, zero-support orphans) accumulates unchecked.
- A cron job (same pattern as the extraction tick) that, per org:
  1. **Merge sweep**: for each non-merged entity, ANN + trigram candidates of
     the same kind (reuse `knowledge_match_entities` / the ANN block in
     `resolveEntity`); score pairs; ≥ AUTO_MERGE with natural-key agreement →
     `mergeEntities` + accepted review (audit); ≥ PROPOSE → pending
     `entity_merge` review. Budget-capped per tick (N adjudications max —
     it's allowed to be slow).
  2. **Orphan pass**: entities with `support = 1`, zero edges as object,
     no body, older than 30 days → a batched "prune?" review (never silent
     deletion). Concepts get a stricter variant (topic sprawl is the known
     failure mode).
  3. **Embedding backfill**: entities with NULL embedding or a stale
     `embedding_model` re-embed via `embedTextForEntity` (the re-embed seam
     already exists).
- Files: new `lib/datamodo/consolidate.ts` + a `/api/jobs/consolidate` route;
  reuses `mergeEntities`, `adjudicateMatch`, `createMergeReview`.
- Acceptance: seeded near-duplicates ("Acme" / "Acme Inc.") converge to one
  node within a tick without user data loss; the tick is idempotent; every
  merge is visible in Review history.
- **As shipped**: pure core `consolidate-core.ts` (pair filtering, winner
  pick, natural-key conflict veto, orphan eligibility — unit-tested),
  orchestrator `consolidate.ts`, `/api/jobs/consolidate` (CRON_SECRET),
  daily `.github/workflows/consolidate-cron.yml`. Refinements over the
  sketch: adjudicated-below-propose pairs are recorded as auto-REJECTED
  reviews so no pair is ever reconsidered; no-LLM mode (missing key / BYOK
  cap) degrades to propose-only — surface text alone never auto-merges;
  orphans ship as ONE batched `orphan_prune` review whose accept re-verifies
  each entity is STILL unlinked before deleting; winner's natural keys
  accrete the loser's missing ones before the merge. NOT live-fired against
  a real DB/LLM yet (sandbox) — first cloud tick should be watched.

### ~~P2 — Vocabulary telemetry + predicate budget~~ ✅ SHIPPED 2026-07-16
You can't manage what you can't see: today nothing measures sprawl. Metrics
fixed by the prior-art pass (§10b): **Ontology Conformance** (share of
current facts whose predicate is template vocabulary for the subject's kind,
aliases included) and **new-predicate rate** (predicates whose first-ever
appearance is inside the trailing window), per kind and overall.
- Compute-on-read first (facts are append-only, so first-seen dates derive
  from `created_at` — no stats table, no migration); a `graph_stats` history
  table only if trends need to outlive fact deletion.
- Surface: an "ontology health" card in Insights (per-kind conformance bars,
  distinct-predicate counts, new-this-week, top off-template predicates).
- Growth gate: hot off-template predicates (≥3 current facts on one registry
  kind) become a `field_proposal` review — accept adds the field/relation to
  the kind's template (predicates get the same review-gated growth kinds
  already have via `category_proposal`); decline never re-asks.
- Acceptance: injecting 5 synonym predicates for one kind is visible in the
  card within a day and produces one actionable suggestion.
- **As shipped**: pure core `ontology-health.ts` (`computeOntologyHealth` —
  per-kind conformance with aliases + universal predicates conforming,
  first-seen windows over ALL rows including superseded, worst-first sort;
  `proposeFieldAdditions` — ≥3 current facts, majority value type, entity →
  relation, majority unit, per-kind cap 2), DB shell `loadHealthFacts` in
  analytics.ts, `op: "ontology_health"` on `/api/knowledge/analytics`, the
  "Ontology health" Insights card (conformance bars + off-template chips +
  new-this-week), and the growth gate as consolidation pass ③ filing
  `field_proposal` reviews (any-status kind+predicate exclusion — never
  re-asks). Accept appends the field/relation to the kind via `updateKind`
  (idempotent if hand-added meanwhile); decline never re-asks. Not
  live-fired (sandbox); unit-tested (8 tests).

### ~~P2.5 — Research adoptions (§10b)~~ ✅ SHIPPED 2026-07-16
The two remaining adoptions from the prior-art pass, built same day:
- **Alias-aware growth gate** (RELATE/KGGen-lite, string level): an
  off-template predicate whose snake_case tokens subset/Jaccard-match an
  existing template key ("invoice_total_amount" → "amount",
  "was_issued_by" → "issued_by") proposes an ALIAS instead of a new field —
  accept appends it to that field/relation's aliases, so canonicalization
  collapses it on every future write. Facts already written under the old
  spelling keep it (predicate migration = a later step). Escalation path if
  string-level proves too blunt: embed template predicates and snap
  semantically (RELATE proper).
- **Usage-weighted retention** (the sleep-consolidation literature's
  usage-frequency reweighting): retrieval stamps `entities.last_used_at`
  (migration `20260716210000_entity_usage.sql`) when an entity is a graph
  seed or a grounded answer cites it (search route) or its dossier is
  downloaded; the orphan pass skips anything read inside its prune window,
  and orphan-accept re-checks usage before deleting. All readers go through
  `to_jsonb(e)->>'last_used_at'` so a pre-migration cloud DB fails soft
  (NULL) instead of erroring. Not yet stamped: entity page opens (the page
  renders from preloaded listKnowledge data — needs a beacon; follow-up) and
  MCP reads.

### ~~P2.6 — Relevance-based entity priming~~ ✅ SHIPPED 2026-07-16 (user call)
Instead of a static top-30-by-support concept list, the extraction prompt now
carries **graph entities chosen BY the input** (the Graphiti-style
resolution-aware ingestion from §10b): a lexical leg (labels literally in the
message — strongest evidence, works with zero keys) + a semantic leg (ANN
over ONE embedding of the raw message head, current space, sim ≥ .3,
support ≥ 2 for non-concepts), merged/capped at 15 (`priming-core.ts` +
`priming.ts`). Non-concepts render as the "ALREADY IN the user's graph" block
with the **never-force rule** — labels only, never ids, and uncertain
identity stays in the message's own words so it flows into the resolution
ladder + review gate instead of being flattened at write time. Concepts stay
their own leash line, primed-first with support-ranked fill (never empty
without embeddings). `EXTRACTION_VERSION` → 4 (requeue optional). Messages
only for now — priming documents on their own extracted text is the
follow-up.

### P3 — PDF → markdown upgrade (structure-preserving document reading) — PHASE 1 ✅ 2026-07-16
Replace the flat unpdf text layer with structure-preserving conversion.
- **Phase 1 shipped**: the recommended shape (external converter behind the
  seam, JS fail-soft) is in — `lib/datamodo/pdf-markdown.ts` shells out to
  whatever `PDF_MARKDOWN_COMMAND` names (Docling / marker / MinerU /
  pymupdf4llm CLI; contract: PDF path appended as last arg, markdown on
  stdout; `PDF_MARKDOWN_TIMEOUT_MS` default 45 s); non-zero exit, timeout, or
  near-empty output (a scan) → null and the unpdf path runs exactly as
  before, keeping scanned-PDF vision detection intact. Markdown output flows
  into **section-aligned chunking**: `chunkDocText` detects markdown (≥2
  headings) and chunks per section with the heading carried on every piece —
  cited passages now say which section they came from (page lineage is
  markdown's trade-off; headings replace it). Unit-tested via fake converter
  scripts. **Phase 2 (open)**: pick + package an actual converter per
  deployment (cloud worker image; optional dependency for the local
  edition), and a live-fire comparison on a real structured PDF (tables!).
- Decision to make first: **library vs sidecar.** The app is TypeScript;
  the best converters (Docling, marker, MinerU, pymupdf4llm) are Python.
  Options: (a) a small Python sidecar/CLI invoked per document (local
  edition: optional dependency; cloud: a queue-fed worker), (b) stay JS and
  layer heading/table heuristics over unpdf's per-page text (cheaper, less
  good), (c) vision-model conversion for high-value docs only (costs per
  page — conflicts with the cheap-LLM rule; keep as escalation not default).
  Recommendation: (a) behind the existing seam with (b) as fail-soft default —
  `extractAttachmentText` already returns `{text, truncated, pages}` and is
  the only integration point.
- Downstream wins once text is markdown: `chunkDocText` chunks on headings
  (section-aligned `doc_chunks` cite better), tables inside PDFs become
  parseable rows, `body_md` summaries can quote structure.
- Acceptance: a structured PDF (headings + a table) yields section-aligned
  chunks and correctly-extracted table facts that flat-text extraction missed.

### ~~P4 — Edge metadata via reification~~ ✅ SHIPPED 2026-07-16 (as a PATTERN, simpler than planned)
"Facts about facts": *works_at since 2024 as CTO, per this email*.
- **The reframing that shipped**: after the template block, no `reify: true`
  flag is needed — **a relationship kind IS just a kind**. "employment" is a
  registry kind like any other, with fields (role, start_date) and relations
  (employee→person, employer→company); the categories block already teaches
  it, restraint already enforces it, the growth loop can already PROPOSE it
  (observed edges feed drafted relations), and the template block guarantees
  its slots. What shipped in code: the message `SYSTEM` prompt now teaches
  the pattern explicitly — "a relationship that carries its OWN attributes
  is ITSELF an entity: own kind, stable label naming both ends ('James
  Porter — Acme Group'), entity-valued facts to each end, attributes on it;
  simple attribute-less links stay plain facts." The stable two-ends label
  makes tier-0/1 resolution converge repeat mentions onto ONE node.
- Still deliberately NOT built: `facts.attributes jsonb` (lightweight edge
  annotations) — nothing has needed it; anything queryable belongs in the
  graph proper.
- Acceptance stands: the same employment mentioned twice → ONE node between
  person and company in the Explorer.

### P5 — Agent lenses (the §9 decision) — PHASE 1 ✅ 2026-07-16
- Stamp `agent_id` on facts at ingest (from `meta.agent_id` /
  `meta.routed_agent_id`); backfill existing facts through `source_item_id`.
- `agent` filter param on search/answer/Explorer/tables APIs; agent-addressed
  chat questions default to their lens with visible "searching only X's
  view — search everything?" widening.
- Acceptance: two agents with disjoint purposes produce disjoint lenses over
  a shared entity ("Acme" is one node; each lens shows only its own facts),
  and an unfiltered query still sees everything.
- **Phase 1 shipped**: migration `20260716220000_fact_agent_lens.sql`
  (`facts.agent_id` + partial index + one-time backfill from `items.meta`);
  the extraction tick stamps body+attachment facts in one fail-soft
  statement after ingest; `listKnowledge(orgId, {agentId})` is the lens
  chokepoint (identity stays global — entities never split, they just show
  fewer facts); `?agent=` on `/api/knowledge/entities` (Explorer/graph
  feed) and `/api/search` (knowledge evidence + GraphRAG traversal +
  grounded answers scope to the lens; table-row keyword hits stay global).
  **Phase 2 (open)**: the UI — lens chips on Data/Explorer, agent-addressed
  chat defaulting to its lens with the "search everything" widening, and
  MCP tool params.

### P6 — Multimodal embedding space (optional, last)
Today images are caption-then-embed (text space) — cheap and good enough.
A shared image/text space (CLIP-family) would let "that whiteboard photo"
match pixels directly. Costs a second embedding column/space and an
`embedding_model` migration story (the model-stamp rule already handles
coexistence). Do this only when caption-search demonstrably misses real
queries — revisit after P1–P3 have soaked.

### Efficiency track (2026-07-16 — user ask: cost ↓, degeneration ↓, queries ↑, storage ↓, small steps)
Shipped in step 1 (all fail-soft, all unit-tested where pure):
1. **Triviality gate** (`extract-gate.ts`) — unmistakable acks ("ok",
   "merci 🙏", emoji-only) skip the ENTIRE stack: no steering, no priming
   embedding, no provider resolution, no extraction call; the item files
   analyzed with zero facts and the chat still replies "Nothing to file".
   Conservative by design: attachments, note-subjects, length > 80, any
   digit/currency/URL/@/question mark, or one unknown token → extract.
   Biggest per-user cost lever: acks are a large share of chat traffic.
2. **Stable-prefix prompts + Anthropic prompt caching** — the org's
   categories block moved from the user prompt into the SYSTEM prompt, so
   `SYSTEM + categories` is a per-org constant prefix; the Anthropic
   provider sends systems ≥ 4000 chars as a `cache_control` block (~90%
   input-price cut on cache hits), and OpenAI's automatic prefix caching
   benefits for free.
3. **Adjudication floor + cap** — blocking's substring leg can surface
   sim≈0.1 candidates; resolution now judges only candidates ≥ 0.25, top 3.
   No candidate above the floor = new entity at zero LLM cost. (Also
   anti-degeneration: hopeless candidates can't win a bad merge.)
4. **Search fast path** — `listKnowledge({provenance:false})` skips the two
   heaviest queries (every fact_source + its item) on the search/GraphRAG
   path, which never renders provenance. UI surfaces keep the default.
5. **Current-claims partial indexes** — migration
   `20260716230000_perf_indexes.sql`: `facts(org_id)` and
   `facts(subject_entity_id)` WHERE `valid_to IS NULL`; the hot set stays
   tight as supersession history accumulates.
6. **Snippet cap** — fact_source snippets capped at 280 chars (quotes, not
   transcripts).
Next steps, in value order (not yet built):
- **Embedding dimension knob as default guidance**: `EMBEDDINGS_DIMENSIONS`
  already exists — documenting 512-dim (Matryoshka) as the recommended cloud
  setting would cut vector storage 3× and speed ANN, at a small recall cost;
  needs a re-embed pass (embed-requeue exists) and a column-width story.
- **Classify-excerpt trim**: the doc classifier reads 2,000 chars; 1,200 is
  probably enough (measure first — needs live traffic).
- **Cache the DOC system prompt too** (template varies per kind — cache per
  kind's focused prompt; smaller win, same mechanism).
- **Session-batched consolidation adjudication**: several pairs in ONE call
  (matrix prompt) — cuts the sweep's call count ~5× at slight quality risk;
  do after live-fire data shows the sweep's real volume.
- **History compaction** (storage, far later): superseded facts older than N
  years → summarized tombstones. Only when a real vault shows bloat.

### Explicitly NOT on the roadmap
- **Graph database migration** (Neo4j etc.) — the access patterns are 1–2
  hops + similarity + temporal, all Postgres-shaped; a migration buys deep-
  traversal performance we don't need at the cost of the pgvector/trigram/
  bitemporal/Prisma stack. Re-evaluate only if multi-hop path queries become
  a product feature.
- **CwA / learned ANN partitioning** (§10) — wrong scale; filed as the
  future index-service seam.
- **Per-agent physical graphs** — rejected, see §9.
