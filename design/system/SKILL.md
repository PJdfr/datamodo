---
name: datamodo-design
description: Use this skill to generate well-branded interfaces and assets for datamodo, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick orientation
- **Brand in one line:** warm, editorial, anti-"techy" — cream paper canvas (`#F6F2E9`), warm ink (`#211E18`), a single coral accent (`#E4593B`). "Forward the mess. Get back a spreadsheet."
- **Type:** Bricolage Grotesque (display, tight tracking) · Geist (body/UI) · Geist Mono (all data — amounts, emails, IDs, kickers) · Caveat (the handwritten "data" in the wordmark ONLY).
- **Wordmark:** "data" handwritten (Caveat, rotated −4°) + "modo" in Bricolage. Always live text, never an image. The brand name is always lowercase: "datamodo".
- **Voice:** speaks to "you"; short declarative sentences and fragments; rule-of-three; concrete mono numbers; essentially no emoji in UI chrome.

## Files
- `README.md` — full brand guide: content fundamentals, visual foundations, iconography.
- `styles.css` — link this (imports tokens + fonts). Use the CSS custom properties (`--dm-*`).
- `tokens/` — colors, typography, spacing/radius/shadow.
- `assets/logos/` — real full-color channel marks (Gmail, Outlook, WhatsApp, Slack, Teams, Telegram, iMessage, Discord).
- `components/` — React primitives (Logo, Button, Card, Badge, Eyebrow, ChannelPill, Input/Field, MacWindow, DataTable).
- `guidelines/` — foundation specimen cards.
- `templates/landing/` + `templates/app/` — full-screen recreations to copy from.

## Do / don't
- DO use the cream canvas, warm ink, and the single coral accent; set all data (amounts, emails, IDs) in Geist Mono.
- DO use soft, warm, ink-tinted shadows and generous rounded corners; house product mocks in the macOS `MacWindow` chrome.
- DON'T introduce a second accent color, gradients-as-decoration, pure-white pages, title case, or emoji in UI chrome. DON'T redraw the channel logos or invent a logo mark — the wordmark is the identity.
