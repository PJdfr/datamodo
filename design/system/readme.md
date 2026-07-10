# Datamodo Design System

**Forward the mess. Get back a spreadsheet.**

Datamodo turns the mess of your inbox and chats — email, WhatsApp, Slack, Teams,
receipts, screenshots — into clean, queryable data. It automatically extracts
the people, companies, invoices, amounts and dates buried in your messages and
files them into editable, versioned tables you can ask questions of.

**Target client:** individual professionals drowning in unstructured
communication — freelancers, consultants, founders, dealmakers — who need what's
in their messages as organized data, without hiring an assistant or doing manual
data entry. It's an **individual-only** product: no teams, orgs, or sharing.

This design system captures the datamodo brand — a warm, editorial,
anti-"techy" identity — and packages it as tokens, components, foundation
specimens, and full-screen UI recreations.

---

## Sources

Everything here is grounded in the datamodo codebase (not reconstructed from
memory). Explore these to build more faithfully:

- **GitHub:** `PJdfr/datamodo` — **latest design is on the `dev` branch**
  (https://github.com/PJdfr/datamodo/tree/dev).
  - `design/` — the ground-truth brand references: `Datamodo Landing.dc.html`,
    `Datamodo App.dc.html` (login/register/dashboard), and `design/README.md`
    (the brand handoff doc these tokens come from).
  - `app/globals.css`, `components/logo.tsx` — production styling + the wordmark.
  - `public/logos/*.svg` — the real full-color channel marks (copied into
    `assets/logos/`).
  - `README.md`, `PROJECT_STATE.md`, `app/dashboard/README.md` — product context
    and the front-end ↔ backend map.

Consumers of this system don't need repo access, but if you have it, the `design/`
folder is the canonical reference.

---

## Content fundamentals — how datamodo writes

The voice is **warm, plain-spoken, and confident** — a calm human explaining a
trick, never a SaaS pitch. It sells relief from drudgery, not technology.

- **Person & address:** speaks to **"you"** ("your inbox", "your second brain",
  "your datamodo address"). The product refers to itself lowercase as
  **"datamodo"**, in third person ("datamodo reads the message", "datamodo does
  the other two").
- **Casing:** the brand name is **always lowercase** — "datamodo", never
  "Datamodo" or "DataModo", even at the start of a sentence in body copy.
  Headlines use sentence case, not title case.
- **Sentence shape:** short, punchy, declarative. Fragments are welcome for
  rhythm ("No formulas. No setup." · "Three steps. That's the whole thing.").
  Em-dashes carry asides. Rule-of-three lists recur.
- **Headline formula:** a promise built on the messy→clean contrast, often two
  beats. Examples (verbatim from the product):
  - "Forward the mess. Get back a spreadsheet."
  - "One email in. A connected brain out."
  - "A junk drawer that sorts itself."
  - "It builds the dataset you didn't ask for — but needed."
  - "Ask in plain words. Get answers with receipts."
- **Microcopy:** lowercase mono lines that reassure ("no card · works with the
  apps you already use", "↳ sourced from 6 forwarded confirmations"). Kickers
  are lowercase mono too ("watch it work", "how it works", "01 — forward an
  email").
- **Verbs:** the user only ever "forwards" or "drops the bot in". datamodo does
  the "reading", "linking", "structuring", "building". Keep the user's effort
  framed as one tiny action.
- **Emoji:** essentially none in product chrome. A single contextual emoji
  appears only *inside* a simulated user message ("Ski trip 🏔"), never in
  datamodo's own UI or headings.
- **Numbers & data:** concrete and specific ($12,000, #A-204, 6 flights,
  u8x2@datamodo.in). Amounts, IDs, emails and counts are always set in mono —
  the "data" is visually distinct from the "prose".

---

## Visual foundations

A **warm, editorial, paper-like** system. The opposite of a cold data tool: think
a well-set magazine spread that happens to contain spreadsheets.

### Color & vibe
- **Cream canvas, not white.** The page is `#F6F2E9`; the app outer shell is a
  slightly darker cream `#EFE9DC`; cards are `#FFFDF8`; only inputs and the
  email/table "windows" go pure `#FFFFFF`. This warmth is the signature.
- **Ink, not black.** Text and dark sections are `#211E18` (a warm near-black),
  with `#2B2720` cards and `#3A352C` borders inside dark sections.
- **One accent: coral `#E4593B`.** Used for primary buttons, links, highlights,
  the "data" energy. Pressed state darkens to `#CF4A2F`. Coral tints
  (`#FBEAE3`, `#FDF1EC`) back eyebrow pills and freshly-added rows.
- **Two status hues only:** success green `#3F8F5B` on `#E4F0E8`, warning gold
  `#B08A2E` on `#F6ECD4`. "Approved" reuses the coral accent.
- **Imagery vibe:** warm, no photography in the core surfaces. "Imagery" is
  really *simulated product UI* — realistic macOS windows, chat bubbles, graph
  nodes, tables. Full-color third-party channel logos are the only external art.

### Type
- **Display — Bricolage Grotesque** (600/700/800), tight tracking (−0.02 to
  −0.035em). All headings, card titles, big numbers.
- **Body/UI — Geist** (400/500/600). Paragraphs 15–18.5px, line-height ~1.55.
- **Data — Geist Mono** (400/500). Amounts, emails, invoice numbers, table
  headers, timestamps, kickers, micro-labels. The "this is data" signal.
- **Script — Caveat** (700). Used for **one thing only**: the handwritten "data"
  in the wordmark.
- **Scale:** h1 `clamp(38–64px)`, h2 `clamp(30–44px)`, feature h3 ~29px, card
  titles ~20–21px. Never below 11px except mono micro-labels.

### Space, radius, shadow
- **Rounded, generous.** Radii: inputs 11, buttons 13, small cards 14, feature
  cards 18, auth/app shells 22, dark feature cards 26, pills 999, mono chips 7.
- **Corners are always soft** — nothing sharp. Cards read as tactile paper cards.
- **Shadows are warm and diffuse**, tinted with ink not gray:
  - Card: `0 18px 44px -30px rgba(33,30,24,.35)` — soft, high-blur, barely there.
  - Floating window (email/table): `0 30px 60px -28px rgba(33,30,24,.5), 0 6px 16px -8px rgba(33,30,24,.22)` — the mocks levitate.
  - Accent button glow: `0 6px 18px rgba(228,89,59,.28)`.
- **Cards:** cream fill + 1px tan border (`#E7E0D2`) + soft shadow. Never a
  colored left-border accent stripe on a card (the ONE place a 3px accent
  left-border appears is a freshly-extracted **table row**, with a coral tint).
- **Layout:** landing content maxes at 1160px centered; the "watch it work"
  column at 900px; the app shell at 1400px. Sidebar is a fixed 248px.

### Motion
Motion tokens and shipped keyframes live in **`tokens/motion.css`** (imported by
`styles.css`): easings (`--dm-ease-out` decel, `--dm-ease-spring` gentle
overshoot, `--dm-ease-bob` float), durations (`--dm-dur-fast` → `--dm-dur-float`
6s), and named `@keyframes` (`dm-float`, `dm-pulse-ring`, `dm-fade-up`,
`dm-drop-in`, `dm-pop`, `dm-row-flash`, `dm-scan`, `dm-blink`, `dm-draw`,
`dm-marquee`, `dm-shimmer`, `dm-flow`) that components reference by name.

All CSS, all gentle, all **disabled under `prefers-reduced-motion: reduce`**
(a global guard in `motion.css`). The base state of every animated element is
its VISIBLE end-state, so print / no-CSS / reduced-motion always show finished
content. The email window does a slow 6s vertical **bob** (`dm-float`); a
"forwarded" dot **pulses** an expanding ring; graph edges **draw** in via
stroke-dashoffset and nodes **pop** in staggered; extracted rows/chips **drop
in**; a new table row **flashes** coral-tint then settles; a gradient line
**scans** down the auto-built table; the query caret **blinks**; the channel
strip **marquees**. Nothing bounces or loops aggressively — motion illustrates
the pipeline.

The dynamic components (`KnowledgeGraph`, `LinkedCards`, `SpotlightCard`, `Marquee`,
`RevealOnScroll`, `BentoGrid`) exist to **break the "pile of cards" feel** —
fluid, interactive, asymmetric surfaces for a product about tables, graphs and
data. Reach for them on hero and feature sections instead of another stacked box.

### Hover / press
- Primary buttons darken coral to `#CF4A2F` on hover. White/outline buttons warm
  to `#FBF8F1`. Dark pills lighten slightly. No scale-on-press; the feedback is
  color. Links go from coral to pressed-coral.

---

## Iconography

Datamodo is **deliberately light on iconography** — part of the warm, non-techy
feel. There is no icon font and no custom SVG icon set in the product.

- **Unicode glyphs as icons.** The product uses plain unicode characters where a
  tool would reach for an icon set: `✦` (the "ask anything" sparkle), `▦` (a
  sheet/table), `＋` (new capture), `✓` (checkmark bullets), `✉`/`🔒`/`◔` (form
  field glyphs), `↓` (flow connectors), `★` (email star), `›`/`↳` (query
  prompt/source). These are intentional placeholders — a production build can
  swap them for a stroke icon set (e.g. Lucide: Mail, Lock, Table, Sparkles,
  Check) at the same weight, but the design leans on type + color over icons.
- **macOS traffic lights** are drawn as three 12px dots (`#FF5F57` / `#FEBC2E` /
  `#28C840`) with an inset hairline — a recurring, recognizable motif, provided
  by the `MacWindow` component.
- **Real, full-color channel logos** are the only true icons: Gmail, Outlook,
  WhatsApp, Slack, Teams, Telegram, iMessage, Discord. These live in
  **`assets/logos/`** (copied from the datamodo repo, originally from the
  open gilbarbara/logos and svgl libraries) and are shown via the `ChannelPill`
  component. Always use the real mark, never a redraw.
- **Emoji** are not used as UI icons (see Content fundamentals).

> **No standalone brand logo mark exists** — and none was invented. The brand
> identity *is* the wordmark (see below); wherever a logo would go, render the
> wordmark in live type via the `Logo` component.

---

## The wordmark

The signature brand element. The word **"data"** is set in **Caveat**
(handwritten, rotated −4°, ~1.4× larger) flowing directly into **"modo"** set in
**Bricolage Grotesque** (clean, tight tracking). The idea: *messy handwriting →
clean type = messy data becomes clean data.* Both halves are ink `#211E18` on
light, cream `#F1ECE1` on dark. **Always live text via `<Logo>`, never an image.**

---

## Foundations index (Design System tab)

Specimen cards, grouped:
- **Colors** — Canvas & surfaces · Ink family · Accent (coral) · Status & borders
- **Type** — Display (Bricolage) · Body (Geist) · Mono & Script
- **Spacing** — Spacing scale · Radii
- **Brand** — Wordmark · Channel logos · Shadows

---

## Components

Reusable React primitives (import via `window.DatamodoDesignSystem_07247b`).
Grouped under `components/`:

- **Logo** (`brand/`) — the datamodo wordmark; on-cream and on-ink.
- **Button** (`core/`) — primary (coral) · dark (ink pill) · outline · ghost, in sm/md/lg.
- **Card** (`core/`) — warm surface container: cream · ink · accent tones.
- **Badge** (`core/`) — status pills (Paid/Sent/Approved) and mono data chips.
- **Eyebrow** (`core/`) — the uppercase mono section kicker.
- **ChannelPill** (`core/`) — a channel logo + label capsule ("works with").
- **Input** + **Field** (`forms/`) — white field with a leading glyph + label row.
- **MacWindow** (`windows/`) — the macOS window chrome (traffic lights + title).
- **DataTable** (`data/`) — the warm invoices/spreadsheet grid: click-to-sort headers, row hover, optional checkbox selection, rich cells (status pill, confidence meter, source tag), highlightable new row.
- **ChangeReview** (`review/`) — the accept/reject review + versioning queue: datamodo proposes changes to your DB, tables and knowledge graph (new records, field updates, merges, graph links, removals), each with provenance + confidence and an inline diff; Accept flashes then collapses into a committed strip (with Undo), Reject dismisses, Accept-all clears the queue. The core "review AI-suggested data mutations" surface.
- **KnowledgeGraph** (`motion/`) — the signature animated, interactive node-link graph; edges draw in, nodes pop, hover/focus lights connections — plus drag-to-rearrange nodes and click-to-inspect (facts + links panel). Breaks the card pile.
- **OrbGraph** (`motion/`) — an abstract, interactive 3D knowledge-graph orb: a rotating canvas point-cloud with coral concept nodes labelled and ringed together; auto-rotates, tilts to the pointer, points flee the cursor. The atmospheric "your knowledge, connected" visual.
- **LinkedCards** + **LinkedCard** (`motion/`) — real content cards joined by animated connectors measured from the live DOM; edges draw in on scroll, a dashed pulse flows along them, and hovering a card lights its neighborhood while dimming the rest. The primitive for turning a stack of boxes into a connected graph.
- **SpotlightCard** (`motion/`) — feature card that lifts, tilts toward the cursor, and shows a coral spotlight on hover.
- **Marquee** (`motion/`) — infinite horizontal strip (channel logos / entity chips) with edge fades; pauses on hover.
- **RevealOnScroll** (`motion/`) — fades + rises content into view on scroll; optional per-child stagger.
- **BentoGrid** + **BentoTile** (`layout/`) — asymmetric tile layout that breaks the even N-column grid.

Each component ships a `.d.ts` (props + adherence + starting-point tag), a
`.prompt.md` (usage), and a `@dsCard` demo HTML in its directory.

---

## Templates

Full-screen, interactive starting points under `templates/` (consuming projects
can seed a new design from these):

- **`landing/`** — the complete marketing landing page (nav → hero → watch-it-work
  → channels → how → use cases → ask anything → trust → CTA → footer).
- **`app/`** — the signed-in product: an auth screen (login ⇄ register + dark
  marketing aside) that enters a two-pane dashboard (dark sidebar with switchable
  Sheets + main pane with the ask bar, stat cards, and the active table).

Both are visual recreations, not production code (the extraction pipeline, real
auth, and export are mocked; datamodo exports `.xlsx`, never CSV).

---

## Root manifest

- `styles.css` — the entry point consumers link (imports the token files + fonts).
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `motion.css`.
- `assets/logos/` — the 8 full-color channel marks.
- `components/` — `brand/`, `core/`, `forms/`, `windows/`, `data/`, `review/`, `motion/`, `layout/`.
- `guidelines/` — foundation specimen cards.
- `templates/` — `landing/`, `app/` (starting points).
- `SKILL.md` — makes this downloadable as a Claude Code Agent Skill.

---

## Notes & caveats

- **Fonts** load from Google Fonts (Bricolage Grotesque, Caveat, Geist, Geist
  Mono) — all four are the *real* families the product uses, so no substitution
  was needed. To self-host, swap `tokens/fonts.css` for local `@font-face` rules.
- **No logo mark** was created (none exists); the wordmark stands in everywhere.
- Component styling references CSS custom properties with literal fallbacks, so
  cards and kits render even before `styles.css` is fully applied.
