# datamodo — roadmap (next features)

> **Maintained doc — update with EVERY commit:** move items to STATE.md's
> inventory when they ship; add what the work surfaced. Ordered by value.
> Siblings: [STATE.md](STATE.md) · [FLOW.md](FLOW.md) · [MEMORY.md](MEMORY.md).
>
> Last updated: 2026-07-11

## Now (unblocks everything else)
1. **Merge PR #35 → dev**, then set env: `OPENROUTER_VISION_MODEL` (+ ~$10
   OpenRouter credit for a reliable paid extract model), `OPENAI_API_KEY` (or
   `EMBEDDINGS_API_KEY`) to wake embeddings, then one authed
   `POST /api/jobs/extract-requeue` (re-runs items on pipeline v2).
2. **Live-fire verification pass on dev** — the biggest genuine gap: grounded
   answers, generated notes, doc classification, vision tier, audio tier, and
   the new views have never run against a live LLM / been eyeballed in a
   browser. One session: forward a real email with a PDF + a receipt photo +
   a voice memo (needs `TRANSCRIPTION_API_KEY` or `OPENAI_API_KEY`), watch the
   pipeline, click through every view.
3. **Promote dev → prod** (also activates the both-envs cron tick fix, which
   only takes effect from the default branch).

## Explorer track (the north star — phase 1 ✅ shipped 2026-07-10)
- ~~Ego-graph Explorer~~ ✅ — walk edge to edge, natural-shape panel, edge
  inspector, breadcrumbs, jump box (4th Knowledge mode + "◍ Explore" on pages).
- ~~3D Explorer redesign~~ ✅ 2026-07-11 — Explorer v2 (Claude Design project
  "Datamodo Explorer v2") ported onto the existing pure core: depth-field
  canvas, world-reflow walk, enter-from-parent/recede animations, floating
  breadcrumb, redesigned edge inspector (confidence meter · pips · quoted
  evidence). Flat 2D radial under `prefers-reduced-motion`. Remaining from
  the same handoff, NOT implemented: Review-Studio "Approve all & merge"
  motion + Timeline polish (`DashboardExtras.jsx`, lower priority) and the
  **dashboard IA restructure proposal** (13 choices → 2 verbs — a product
  decision; see the design project's `IAProposal`).
- ~~Dashboard clarity pass~~ ✅ 2026-07-11 — Data tab: 5 views + 3 buttons →
  **Tables · ◍ Explore · Insights** + one "✦ Build ▾" menu; Timeline/Files
  nest as modes of the ONE knowledge surface (Walk is its front door).
  Still open from the design's IA proposal, deliberately not taken: Search/Ask
  as global ⌘K, exports as row actions — revisit if the rail grows again.
- ~~Node shapes, phase 2~~ ✅ 2026-07-11 — image nodes render their image,
  `bookmark` builtin kind, dataset-as-node in the Explorer.
- ~~On-demand synthesis~~ ✅ 2026-07-11 — "✦ Synthesize" on any entity page
  with ≥2 connected bodies of content → cited note into `body_md`.
- ~~Audio tier~~ ✅ 2026-07-11 — audio attachments transcribe (fail-soft
  Whisper-shaped client) → classify-first document pipeline → thick node whose
  page is PLAYER (streams the original) + summary + transcript; passages land
  in doc_chunks. Dormant until `TRANSCRIPTION_API_KEY`/`OPENAI_API_KEY` is set;
  never live-fired against a real API yet.

## Next build tracks (pick after the above)
- **Channel adapters E2E** — WhatsApp (Twilio sandbox), Slack app, Teams bot
  are code-complete but have never touched the real providers. The core pitch
  ("forward from anywhere") ends here.
- **Spreadsheet-import follow-ups** — pre-merge preview/confirm, column-mapping
  overrides, dedupe referenced entities across rows before ingest.
- **Scanned-PDF OCR** — the vision tier's deliberate v1 cut: rasterize pages
  (canvas) → same `extractFromImage` call → thick nodes for scans.
- **Local / open-source single-user edition** — fully designed (see
  PROJECT_STATE "-3"): fs blobs, `@prisma/adapter-pg`, `SINGLE_USER=1`, worker
  loop, BYOB connectors (IMAP first, Telegram, Slack Socket Mode, dead-drop
  relay for WhatsApp/Teams). ~1 week; a strategic call on timing.

## Smaller follow-ups (grab when nearby)
- ~~Model unification, phase 2~~ ✅ 2026-07-11 — `datasets.kind_id` binds a
  dataset to the kind it materializes (structural; plural-name match remains
  only as a fallback for pre-migration rows).
- ~~Schema view: dataset_relations~~ ✅ 2026-07-11 — table↔table links draw as
  dashed lines between the schema canvas's cards.
- Concept-map pure core (`lib/datamodo/concept-map.ts`) is dormant (view
  removed) — resurrect as an Explore lens or delete after a quiet month.
- Category proposals from the agent via Review ("no-fit entity → propose a new
  kind with inferred template") — growth loop ⑤ of the ontology design.
- Semantic (ANN) chunk search behind the same `searchChunks` shape.
- Dossier: PDF rendering behind the same `buildDossier`.
- Graph: persist collapsed-kind state if users ask for it (deliberately
  session-local today).
- DuckDB / lance-graph sidecar when analytics volume demands it (documented
  seam in `analytics.ts`).

## Owed by a human (ops, not code)
- Vercel env: `OPENROUTER_VISION_MODEL`, embeddings key, transcription key
  (`TRANSCRIPTION_API_KEY` or reuse `OPENAI_API_KEY`), `NEXT_PUBLIC_SITE_URL`
  (Preview + Production).
- GitHub Actions secrets: `CRON_SECRET` == Vercel's, `APP_URL`.
- GitHub OAuth app creds for Neon Auth (no shared creds exist).
- Apex DNS `datamodo.dev` (only www resolves); clean stale prod-branch auth
  users + `wiring-check@datamodo.dev` in dev.
