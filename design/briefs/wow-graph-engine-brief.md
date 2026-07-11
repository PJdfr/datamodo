# Claude Design brief — "The WOW": datamodo's graph engine (Replay + Cosmos)

> **How to use this file**: paste it into a new Claude Design project
> (suggested name: **"Datamodo Graph Engine — Replay & Cosmos"**). Iterate
> there until the motion feels right, then export the handoff (prototype +
> MOTION.md, same shape as the "Datamodo Explorer v2" project) into
> `design/` and ask a coding session to port it onto a pure core.

## What datamodo is (context for the designer)

datamodo turns messy forwarded content — emails, voice memos, receipt photos,
spreadsheets, braindumps — into organized, connected, queryable data. One
private vault per user; every view (tables, graph walk, timeline) derives
from it. Brand: warm cream canvas `#F6F2E9`, ink `#211E18`, coral accent
`#E4593B`, gold `#B08A2E`, blue `#5A7BA6`, green `#3E8E5A`; Geist Mono for
data; glyphs (✦ ▦ ◍ ✓), never emoji. The existing 3D graph walk ("Explorer
v2") is the workbench: cream fog, depth field, quiet elegance.

## The assignment

ONE renderer ("graph scene"), TWO modes. This is the product's viral asset —
it must feel like superpowers, science-fiction-grade: technical, alive,
precise. It is the poster, not the workbench, so it MAY break the cream
canvas: a deliberate dark mode (ink/near-black space, coral/gold glowing
nodes, cream text) is encouraged. Canvas/WebGL rendering assumed (hundreds
of animated points; DOM won't survive).

### Mode 1 — REPLAY (build this first): "watch your vault build itself"

A chronological, scenaristic time-lapse of the user's real history — think
Gource, or a "Spotify Wrapped" for their data. Structured in five acts:

1. **First contact** — an empty void; the first message arrives (a small
   envelope/waveform/photo glyph flies in), and one lonely node ignites and
   pulses.
2. **Extraction bursts** — messages land one after another; each POPS into a
   spray of facts: nodes fan out of the message, edges crackle into place.
   Rhythm accelerates with density (a quiet week compresses, a busy day
   swells).
3. **The user's judgment** — review decisions render as physical events:
   an APPROVED merge = two nodes magnetically fuse (satisfying snap + glow);
   a DENIED merge = they repel and settle apart. Accepted facts brighten;
   rejected ones evaporate. The user's taste visibly shapes the graph.
4. **Crystallization** — the money shot: a category's scattered nodes align,
   snap into rows and columns, and become a TABLE (graph → grid morph),
   then release back into the graph. Chaos becomes order.
5. **Today** — the whole structure settles into the living Cosmos (mode 2),
   a caption like "1,204 facts · 312 things · 9 months" fades in, and the
   controls hand over to the user.

Controls: play/pause, a **scrubber** (drag through time; the graph grows and
shrinks with it), speed toggle, and deterministic **captions** as narration
("March 3 — Acme appears" · "April: 12 invoices, your first merge"). Pausing
allows interaction (hover/click a node → its label/preview).

### Mode 2 — COSMOS: the whole vault as one living graph

The final frame of the replay, as a standing view:

- **Level-of-detail clustering** (the core mechanic): high-degree entities
  render as individual NAMED stars — size and glow proportional to
  connections. The long tail collapses into CLUSTER nodes per kind or
  community ("47 other companies") that bloom open on zoom (semantic zoom,
  not optical). Target ≤ ~150 visible nodes at any level.
- Ambient life: slow drift, occasional edge shimmer, hover ripple.
- Kind colors from the user's own registry tint the stars.
- **The handoff**: click any star → "◍ Walk from here" dives into the
  existing 2-hop Explorer walk (the workbench). Cosmos impresses; the walk
  works.

## Deliverables expected from the design project

1. An interactive prototype (`.dc.html` or a self-contained JSX like
   `ExplorerGraph3D.jsx` was for Explorer v2) of BOTH modes over the demo
   fixture below.
2. A `MOTION.md`: every animation named with durations/easings, the act
   structure, scrubber behavior, cluster expand/collapse choreography,
   reduced-motion fallbacks (a static final frame + captions is acceptable).
3. The dark "poster" palette as tokens, related back to the brand.

## Demo fixture (design against this shape)

A believable freelancer vault, ~9 months: ~40 messages (email/WhatsApp/
voice), ~300 entities — 3 hub companies (Acme ~40 connections, Brightwave
~25, Northwind ~15), ~90 invoices, ~60 people, ~50 documents (incl. images +
one audio), ~20 concepts, the long tail thin; ~15 review decisions (11
approved, 4 denied); 3 tables (Invoices, Clients, Trips) crystallizing.
Timestamps clustered realistically (bursty weeks, quiet stretches).

## Hard constraints

- Port target: Next.js + React + TypeScript; the scene must be portable onto
  a pure, unit-testable core (layout/clustering/keyframes as data — the
  Explorer v2 pattern: pure `lib/datamodo/*.ts` core + a skin).
- Respect `prefers-reduced-motion`.
- No sound (autoplays on the landing page).
- Landing hero embeds the REPLAY over this demo data, no login; a user's own
  replay is private, with client-side "export as video" later.
