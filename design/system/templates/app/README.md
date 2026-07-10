# App UI kit — Datamodo signed-in product

An interactive click-through of the datamodo app, built from the design-system
components (`Logo`, `Button`, `Input`/`Field`, `Card`, `Badge`, `DataTable`).

## Flow
- **Auth** (`Auth`) — login ⇄ register toggle with a dark marketing aside.
  "Sign in", "Create account", or "Continue with Google" all enter the dashboard.
- **Dashboard** (`Dashboard`) — two-pane app shell: dark sidebar (wordmark, New
  capture, the five Sheets with live row counts, user chip) + main pane (the
  "ask anything" bar with the user's `u8x2@datamodo.in` inbox, four stat cards,
  and the active sheet's table). Click any sheet in the sidebar to switch the
  table; the user chip signs out.

## Files
- `index.html` — mounts React + the compiled DS bundle, defines the `dm-floaty`
  / `dm-flash` keyframes, loads `app.jsx`.
- `app.jsx` — seed data for all five sheets + the `Auth`, `Dashboard`, `Stat`
  and `App` components.

## Notes
This is a visual recreation, not production code. The extraction pipeline,
real auth, and export are mocked. Export is labelled `.xlsx` (datamodo never
exports CSV). Numbers are illustrative seed data.
