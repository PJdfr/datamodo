# Landing UI kit — Datamodo marketing site

A high-fidelity recreation of the datamodo landing page, built from the
design-system components (`Logo`, `Button`, `Eyebrow`, `ChannelPill`,
`MacWindow`, `DataTable`).

## Sections (top to bottom)
- **Nav** — wordmark + links + dark "Get started" pill.
- **Hero** — eyebrow pill, "Forward the mess. Get back a spreadsheet.", two CTAs.
- **Watch it work** — the centerpiece: one email traced through 3 stacked steps
  (macOS Mail window → concept graph → spreadsheet), connected by ↓ arrows.
- **Channels** — the "works with everything" pill strip (7 real logos).
- **How it works** — dark full-bleed section, 3 numbered cards.
- **Use cases** — 4 alternating text + animated-demo rows.
- **Ask anything** — dark card: query with blinking caret → sourced answer.
- **Trust** — 3 columns.
- **Final CTA** — gradient card.
- **Footer** — wordmark + links + © line.

## Files
- `index.html` — mounts React + the DS bundle, defines all landing keyframes
  (floaty, pulse, draw, nodein, pop, dropin, scan, caret, flash), loads the
  three JSX files in order.
- `landing-parts1.jsx` — Nav, Hero, WatchItWork (+ Graph), Channels, How
  (exposed on `window.LandingParts1`).
- `landing-parts2.jsx` — UseCases, AskAnything, Trust, FinalCTA, Footer
  (exposed on `window.LandingParts2`).
- `landing.jsx` — composes both into the full page.

All motion respects `prefers-reduced-motion: reduce`. This is a visual
recreation, not production code.
