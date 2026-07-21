# Premium dashboard refactor — design brief

_Drafted 2026-07-21. Status: motion identity + iOS-feel shipped 2026-07-21;
shell phase (inset sheet, sidebar refinement, topbar diet, ⌘K palette, dead
token layer deleted) shipped 2026-07-22. Remaining: per-view sweeps — see
`docs/ROADMAP.md` "Premium chrome, per-view sweeps"._

## Thesis

The brand (cream paper, coral, Bricolage + Geist Mono, the handwritten wordmark)
is good and stays. What reads "childish" is not the palette — it's the **chrome
discipline**: glyphs-as-icons, emoji leaks, bouncy motion, radius chaos, and
fractional inline font sizes. The move is from *friendly notebook* to
**precision instrument on good paper**: same warmth, machined execution.

Reference altitude: Linear's discipline + Notion's calm density, executed in
datamodo's warm editorial palette. Nothing cold, nothing neon, no dark mode.

## What stays (brand equity — do not touch)

- Cream world (`#F6F2E9` family), ink `#211E18`, one coral accent `#E4593B`.
- Bricolage Grotesque display, Geist UI, Geist Mono for all data.
- The Caveat "data" wordmark — but **only** in the sidebar and auth. Caveat
  appears nowhere else in the app.
- Warm, diffuse ink-tinted shadows. Voice and microcopy rules.
- Dark ink sidebar + light main pane architecture.

## The seven fixes (de-childing)

1. **Kill glyph icons.** `✦ ▦ ◍ ⊛ ▣ ⎇ ◷` in tabs/menus and all emoji in chrome
   (`🟢 ⚠ 📄 📥 ⚙ 🕑 📅 📦`) are replaced by ONE thin-stroke inline-SVG icon set
   (1.5px stroke, 16/18px grid, `currentColor`). The `✦` spark survives as a
   single drawn SVG spark, reserved exclusively for Ask/AI affordances.
2. **Radius scale.** Today: 7,8,9,10,11,12,13,14,16,18,20,22. New scale, four
   steps: `--dm-r-1: 6px` (chips, inputs) · `--dm-r-2: 10px` (buttons, small
   cards) · `--dm-r-3: 16px` (cards, panels) · `--dm-r-4: 24px` (sheet, modals)
   · `999` only for status pills.
3. **Type scale.** Kill fractional inline sizes (9.5/10.5/12.5/13.5). Strict
   scale: `11` mono micro-label · `12` secondary · `13` UI default · `14` body ·
   `16` card title · `20` page title · `28` stat display. `font-variant-numeric:
   tabular-nums` on every numeric surface. Bricolage only for page titles and
   stat numbers — everything else Geist.
4. **Motion discipline.** Remove `CountUp` bounce and `dm-sheen` bloom; all
   motion comes from the motion system below (one signature curve, three
   durations, iOS spring physics). `dm-float`/bob is a landing-page-only
   behavior.
5. **Color discipline in chrome.** Channel logos render **monochrome ink** in
   app chrome (opacity/filter), full color only in the Connect flow. No
   `#25D366`/`#EA4335` in the working UI. Status stays two hues (green/gold) +
   coral for "new data".
6. **One shell.** Merge the duplicated `.cc-*` / `.dm-*` shells. Kill the dead
   `--primary:#4f46e5` token layer. Promote the `C` object + inline styles into
   real `--dm-*` custom properties in `globals.css`; replace the JS `Hov`
   helper with CSS classes.
7. **States that look finished.** Skeleton loaders shaped like the layout
   (cream shimmer) instead of bare "Crunching your numbers…" text — keep that
   line as a caption *under* the skeleton (voice stays, structure shows).
   Composed empty states per view.

## New structural signatures (the premium additions)

- **Inset-sheet architecture.** Outer shell canvas darkens one step
  (`#ECE6D8` + paper grain); the main pane becomes an inset sheet
  (`#FAF7F0`, radius 24 on the outer corner, hairline `#E3DBC9` border, 1px
  inner top highlight). The UI reads as a machined object sitting in a tray,
  not paint on a page.
- **Sidebar refinement.** Deepen to `#1B1815`. Hairline dividers
  `rgba(241,236,225,.08)`. Active nav = 6% cream fill + coral dot (no accent
  borders). The "Needs review" block becomes a quiet hairline-topped row with
  a small pulse dot, not a boxed card.
- **Calmer topbar.** Title (Bricolage 600, 20px) + mono meta line on the left.
  Right side reduces to: a `⌘K` command pill + one contextual primary action.
  Context/Connect/inbox-address move into the command palette and sidebar.
- **⌘K command palette** as the flagship pro affordance: navigate views, open
  tables, run asks, connect channels.
- **Data density spec.** Tables: 36px rows, 13px cells, numerics right-aligned
  mono tabular, 11px mono uppercase sticky header, horizontal hairlines only
  (no vertical rules), hover = 3% ink wash. The 3px coral left-border stays
  reserved for the freshly-extracted row (the one allowed accent border).
- **One shadow system.** Hairline border + `0 1px 2px rgba(33,30,24,.05),
  0 16px 40px -28px rgba(33,30,24,.28)`. Single light source, top.

## Motion system — the datamodo motion identity

Archetype: **Premium** (LottieFiles motion-design taxonomy) with iOS spring
physics. Motion illustrates the pipeline and confirms actions; it never
decorates. Three brand constants:

1. **Signature easing** (80% of all motion): `cubic-bezier(0.32, 0.72, 0, 1)`
   — the iOS sheet curve. Fast start, long gentle landing, zero overshoot.
   The only exception: *state pops* (a pill appearing, a check confirming, the
   segmented thumb landing) may use a paper-weight spring
   `cubic-bezier(0.3, 1.15, 0.5, 1)` — 3–5% overshoot, never more.
2. **Duration palette** (three, no ad-hoc values):
   `--dm-t-quick: 140ms` press/hover/toggles · `--dm-t-move: 260ms`
   cards/rows/segmented/collapse · `--dm-t-sheet: 420ms` modals-as-sheets and
   page transitions. Exits run ~30% faster than entrances.
3. **Entrance pattern**: fade + 8px rise, hero first. Stagger budgets: 20–30ms
   between list rows, 40ms between cards, total choreography < 500ms. With 3+
   elements, never more than a third in motion at once.

Three layers on every composed surface: **primary** (the element moving),
**secondary** (its shadow deepening ~50ms late, an icon shifting 1–2px),
**ambient** (the review pulse ring, the ask caret blink — max one ambient
element per screen region). Feedback timings: hover < 100ms, press < 150ms
with `scale(0.97)`, success = check draw-in + pill pop (≈300ms), error = firm
±10px shake, 2 oscillations, no overshoot. Everything honors
`prefers-reduced-motion` with the visible end-state as base.

## iOS-native feel — structure, not skin

The app keeps its cream/coral identity but adopts iOS *structural* patterns
(clarity, deference, depth). Not Apple-gray, not SF Pro — datamodo materials,
Apple physics:

- **Large-title pattern.** Each view opens with a large title (28px Bricolage)
  that collapses on scroll into a compact 52px translucent bar —
  frosted cream (`rgba(250,247,240,.75)` + `backdrop-filter: blur(18px)
  saturate(1.4)`) with a hairline bottom edge. Blur applies only to this
  fixed bar, never to scrolling content.
- **Materials.** Translucency signals layering: the compact bar, sheet scrims,
  and the ⌘K palette are frosted; static cards stay opaque paper.
- **Sheets, not popups.** Modals become sheets rising from the bottom edge
  (420ms, signature curve) with a grabber handle, swipe-down/scrim/Esc
  dismissal, and a stacked-depth scrim (content behind dims and recedes
  ~2% scale).
- **Segmented control.** Sub-navigation (Tables/Explore/Timeline/Insights,
  Review filters) becomes an iOS segmented control: inset track
  (`rgba(33,30,24,.06)`), sliding white thumb with a soft shadow, spring
  landing.
- **Press physics everywhere.** Buttons, nav rows and list rows respond with
  `scale(0.97)`/opacity within 150ms — the "haptic" of the web app.
- **Grouped-inset lists.** Rails and settings surfaces use iOS grouped-list
  styling: inset rounded groups, hairline separators indented past the icon
  column, chevron affordances. Row swipe-to-act (accept/skip) on review items.
- **Touch metrics.** Interactive rows ≥ 40px (44 on touch), controls never
  below 36px; 8/16/24 spacing increments align with the existing scale.

## Per-view order of work

1. **globals.css token layer** — new `--dm-*` scale (color/radius/type/motion),
   both shells merged. Everything else cascades from this.
2. **Shell + topbar + ⌘K** (`control-center.tsx`).
3. **table-page.tsx** — the flagship data surface; density spec + skeletons.
4. **review-studio / review-card** — keep PAPER/INK skins, flatten decoration,
   stroke icons.
5. **Agents view** — denser cards, monochrome channel marks.
6. **insights-view** — dataviz-grade bars (consistent scale, mono axis labels).
7. **chat / explorer / knowledge** — token sweep + icon sweep.
8. **Empty/loading/error states** everywhere.

## Landing page (phase 2, after dashboard direction is approved)

Same maturation carried over: bigger, more confident editorial type; keep the
simulated product windows and pipeline motion (they're the strongest asset);
monochrome channel marquee (color on hover); remove floating doodads; sectional
rhythm via generous `py` and one asymmetric bento moment instead of stacked
equal cards. No re-brand — the landing inherits the app's new chrome discipline.

## Non-goals

- No dark mode, no second accent, no icon font dependency, no framework or
  styling-library migration, no changes to information architecture beyond the
  topbar simplification.
