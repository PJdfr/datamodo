<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Read and maintain the living docs (every commit)

Orientation, in reading order:
1. [`docs/MEMORY.md`](docs/MEMORY.md) — durable truths: aim, product model,
   dev/prod branch flow, architecture decisions, design rules, conventions.
2. [`docs/STATE.md`](docs/STATE.md) — every shipped feature → the code/files
   responsible, plus stack and the full env-var matrix.
3. [`docs/FLOW.md`](docs/FLOW.md) — the pipeline infographic (Mermaid): user
   sends → we listen → we store → we process → vault → we derive.
4. [`docs/ROADMAP.md`](docs/ROADMAP.md) — what to build next, ordered.
5. [`PROJECT_STATE.md`](PROJECT_STATE.md) — the dated "Recent changes" journal
   (history + verification details live here).

**Read MEMORY + STATE at the start of a session.** Then, **with EVERY commit
that changes behavior, update the docs in the same commit**:
- new/changed feature → its row in `docs/STATE.md` (and env vars if any);
- pipeline/stage change → `docs/FLOW.md` diagram + tables;
- shipped or discovered work → move/add in `docs/ROADMAP.md`;
- durable decision made/reversed → `docs/MEMORY.md`;
- always → a dated line in `PROJECT_STATE.md` "Recent changes".
Bump each touched doc's "Last updated" date. A commit that changes behavior
but no doc is incomplete — treat it like a failing test.
