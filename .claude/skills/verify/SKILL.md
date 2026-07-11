---
name: verify
description: Verify datamodo changes end-to-end by driving the running app in a real browser (build/launch/drive recipe for this repo).
---

# Verifying datamodo changes at runtime

## Launch

- `npm run dev` boots on :3000 with the checked-in `.env.local` (Neon dev
  DATABASE_URL). No build step needed for dev verification.
- `/dashboard/*` is auth-guarded by `proxy.ts` (Neon Auth); local `.env.local`
  may lack working auth vars. Routes outside `/dashboard` are unguarded.

## Driving dashboard components without auth/DB

Most dashboard views are client components taking plain props (entities,
kinds…). To verify one, mount it on a TEMP unguarded fixture route —
`app/dev-<thing>/page.tsx` ("use client", import the view + `DEFAULT_KINDS`
from `lib/datamodo/ontology`, synthesize `KnowledgeEntityView[]` fixtures) —
drive it, then DELETE the route before committing. Fact/entity helper shapes
to copy: see `tests/explorer.test.ts` (`rel`/`ent`).

## Browser driving

- Playwright: repo has `playwright-core` only. From a script OUTSIDE the repo,
  import it by absolute path (`/home/user/datamodo/node_modules/playwright-core/index.mjs`)
  — ESM resolves node_modules from the script's location, not cwd.
- Chromium executable: `executablePath: "/opt/pw-browsers/chromium"`.
- Node cards expose `aria-label="Walk to <label>"`; accessible names come from
  aria-label, not visible text (Back button = "Back", not "← Back").
- Allow ~1.5–2s after loads/clicks for the walk's enter/settle animations
  before screenshots; `page.emulateMedia({ reducedMotion: "reduce" })`
  exercises the flat 2D radial path.

## Gotchas

- `pgrep -f "next dev"` also matches the `next-devtools-mcp` harness process —
  kill your dev server by its own PID (or `pkill -f "npm run dev"`), don't
  `pkill -9 -f next`.
