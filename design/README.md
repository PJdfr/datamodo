# Handoff: Datamodo — Landing Page, Auth & Dashboard

## Overview
Brand + UI design for **datamodo**, a SaaS that turns messy forwarded content
(emails, group chats, receipts, screenshots) into clean, tabular data — a
"second brain" that auto-sorts what you feed it and answers questions with
sources. This package covers three areas:

1. **Landing page** — marketing site (`Datamodo Landing.dc.html`)
2. **Auth** — login + register screens (`Datamodo App.dc.html`)
3. **Dashboard** — the logged-in app shell with sheets + query bar (`Datamodo App.dc.html`)

## About the Design Files
The `.dc.html` files in this bundle are **design references** — HTML/CSS
prototypes showing the intended look, layout, copy, and motion. They are **not
production code to copy directly**.

Your existing codebase is **Next.js (App Router) + React + TypeScript** with the
**Geist** font already installed. The task is to **recreate these designs in
that environment** using your existing patterns (components, Tailwind/CSS
modules, etc.). Replace the current placeholder `app/page.tsx` landing page with
this design, add `/login` and `/register` routes, and build the dashboard at
`/dashboard`.

> Note on the `.dc.html` format: these are self-contained HTML files with inline
> styles. Ignore the `support.js` runtime and `<x-dc>`/helmet wrappers — they're
> just the preview harness. What matters is the markup, inline styles, copy, and
> the animations described below.

## Fidelity
**High-fidelity.** Exact colors, typography, spacing, radii, and copy are final.
Recreate pixel-accurately with your component library. The one thing you have
latitude on is wiring real data/auth — the mocks use static placeholder rows.

---

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| Canvas / cream | `#F6F2E9` | Page background |
| Canvas alt (darker cream) | `#EFE9DC` | App outer bg, section alt |
| Surface | `#FFFDF8` | Cards on cream |
| Surface pure | `#FFFFFF` | Inputs, email/table windows |
| Ink | `#211E18` | Primary text, dark sections, sidebar |
| Ink surface | `#2B2720` | Cards inside dark sections |
| Ink border | `#3A352C` | Borders inside dark sections |
| Body text | `#514C43` / `#57534A` | Paragraphs |
| Muted text | `#8A8477` / `#A39B8B` | Captions, mono labels |
| Accent (coral) | `#E4593B` | Primary buttons, highlights, links |
| Accent pressed | `#CF4A2F` | Button hover/active |
| Accent tint bg | `#FBEAE3` / `#FDF1EC` | Eyebrow pills, highlighted rows |
| Accent tint border | `#F3D6CB` | Highlighted row/card borders |
| Border on cream | `#E7E0D2` / `#E1D9C8` | Card & input borders |
| Success green | `#3F8F5B` (bg `#E4F0E8`) | "Paid", positive status |
| Warning gold | `#B08A2E` (bg `#F6ECD4`) | "Sent", pending status |

### Typography
- **Display / headings:** `Bricolage Grotesque` (Google Fonts), weights 600/700/800, letter-spacing `-0.02em` to `-0.035em`.
- **Body / UI:** `Geist` (already in codebase), weights 400/500/600.
- **Mono / "data" accents:** `Geist Mono` — used for email addresses, amounts, table headers, badges, timestamps.
- **Logo script:** `Caveat` (Google Fonts), weight 700 — used ONLY for the handwritten "data" in the wordmark.

Heading scale (landing): h1 `clamp(38px,5.6vw,64px)`, h2 `clamp(30px,4vw,44px)`, feature h3 ~29px. Body 15–18.5px. Never below 11px except mono micro-labels.

### Radii
Buttons/inputs `11–14px`; cards `14–22px`; pills `999px`; window chrome `14–20px`.

### Shadows
- Card: `0 18px 44px -30px rgba(33,30,24,.35)`
- Elevated window (email/table): `0 30px 60px -28px rgba(33,30,24,.5), 0 6px 16px -8px rgba(33,30,24,.22)`
- Accent button: `0 6px 18px rgba(228,89,59,.28)`

---

## The Wordmark (important brand element)
The logo is a **pure text wordmark, no icon**: the word "data" is set in
**Caveat** (handwritten, rotated `-4deg`, ~1.4× the size of the rest) flowing
directly into "modo" set in **Bricolage Grotesque** (clean, `letter-spacing:-0.03em`).
The idea: *messy handwriting → clean type = messy data becomes clean data.*
Both parts are ink `#211E18`. On dark backgrounds both parts are cream `#F1ECE1`.
Build this as a small reusable `<Logo>` component; do not use an image.

---

## Screens / Views

### 1. Landing page (`Datamodo Landing.dc.html`)
Max content width `1160px`, centered, cream background.

- **Nav** — wordmark left; right: How it works · Use cases · Ask anything · Log in · a dark "Get started" pill button (`#211E18` bg, cream text).
- **Hero** — centered. Eyebrow pill ("messy in, organized out — with zero effort") in accent on `#FBEAE3`. H1 "Forward the mess. Get back a spreadsheet." Sub-paragraph. Two CTAs: solid coral "Get your inbox — free" + outline "See it in action". Mono microcopy "no card · works with the apps you already use".
- **"Watch it work" flow** — THE centerpiece. A single email traced through 3 full-width stacked steps (max 900px), connected by downward `↓` arrows. Each step = a card (`#FFFDF8`, radius 20) with a numbered chip + title + description on the left and a visual on the right:
  1. **Received & forwarded** — a **hyper-realistic macOS Mail window**: title bar with real traffic-light dots (`#FF5F57` / `#FEBC2E` / `#28C840`, each `12px` with inset hairline shadow), centered "Inbox — Sarah Chen" title, a toolbar row (Archive · Reply · **Forward ▸** in accent · timestamp), subject "Re: Q3 retainer — invoice attached", gold star, sender avatar (coral circle "S") + name + `sarah@acme.com`, body text mentioning invoice **#A-204**, **$12,000**, `accounts@acme.com`, and a footer strip "forwarded to finance@u8x2.datamodo.in" with a pulsing accent dot. Whole window floats (subtle `floaty` animation).
  2. **Linked & structured** — a **concept graph** (~280px tall white panel). Nodes as pill chips: "Sarah Chen" (green dot), "Acme Inc" (center, accent, emphasized), "accounts@acme.com" (grey), "#A-204" (green), "$12,000" (accent). SVG edges connect them with mono labels: *works at, billing, billed to, amount*. Edges draw in (dash-offset animation), nodes scale/fade in staggered.
  3. **Added where it belongs** — a **macOS spreadsheet/DB window** titled "datamodo — Invoices". Toolbar shows sheet name + "+ 1 row added" badge. Table columns: # / Client / Invoice / Amount / Due / Status. Existing rows (Northwind/Paid, Globex/Sent) plus a NEW highlighted row **Acme Inc · #A-204 · $12,000 · Aug 1 · Approved** with a 3px accent left-border, a flash-in animation, and accent text. Footer = sheet tabs (Contacts · Companies · **Invoices** active) + a "Companies · new sheet" green chip to show tables being created on the fly.
- **Channels strip** — "works with everything you already use" + 7 pills, each a real full-color logo + label: Gmail, Outlook, WhatsApp, Slack, Telegram, iMessage, Discord. (SVGs in `assets/logos/`.)
- **How it works** — dark (`#211E18`) full-bleed section, 3 numbered cards (Forward it / We make sense of it / Use the tables). Card 1's number badge is accent-filled; others are `#3A352C`.
- **Use cases** — 4 alternating rows (text + animated demo), heading "The same trick, everywhere your data hides.": (01) forward an email → 4 extracted fields; (02) group-chat bot → chat bubbles + a structured payments reply; (03) messy dump → 3 auto-sorted category buckets; (04) second brain → an auto-built "Trips 2026" table with a scan-line animation. Rows 2 & 4 use `flex-direction:row-reverse`.
- **Ask anything** — dark rounded card: a query input with blinking caret ("How much did I spend on flights this year?") answering with a big number "$2,847.00 across 6 flights" and sourced line items ("↳ sourced from 6 forwarded confirmations").
- **Trust row** — 3 columns (Yours and private / Zero setup / Export anywhere); first has a 2px ink top border, others a tan top border.
- **Final CTA** — centered gradient card (`#FDF1EC → #F9E7DE`, accent border): "Give your inbox a memory that organizes itself." + solid & outline CTAs.
- **Footer** — wordmark + Privacy/Security/Docs/Contact + "© 2026 datamodo".

### 2. Login (`Datamodo App.dc.html` → `#login`)
Card on cream (radius 22, max ~420px). Wordmark, h2 "Welcome back.", sub "Sign in to your second brain." A white "Continue with Google" button (Gmail logo). "or" divider. Email field (mail glyph) + Password field (lock glyph, forgot link in accent). Solid coral "Sign in" button. Footer strip "New here? Create an account". Inputs: white bg, `#DDD5C5` border, radius 11, glyph + input in a flex row.

### 3. Register (`Datamodo App.dc.html` → `#register`)
Same shell. h2 "Start your second brain.", sub "Free to try. No card needed." Google button, then Full name / Email / Password fields, solid "Create account" button, terms microcopy, footer "Already have an account? Sign in". A dark marketing aside (`#211E18`) can sit beside auth on wide screens: wordmark, "Forward the mess. Get back a spreadsheet.", 3 checkmark bullets.

### 4. Dashboard (`Datamodo App.dc.html` → `#dashboard`)
Two-pane app shell (radius 22, min-height ~640, subtle shadow).
- **Sidebar** (248px, dark `#211E18`): wordmark; a "New capture" item with accent "+"; a "Sheets" mono label; nav list of sheets each with a ▦ glyph + row count (Invoices 28 active, Contacts 64, Companies 19, Receipts 112, Trips 7); bottom user chip (coral avatar "A", "Alex Rivera", "Free plan").
- **Main** (bg `#FBF8F1`):
  - **Topbar**: a large "ask anything" input with a ✦ accent glyph and an "Ask" key hint ("How much did I invoice Acme this quarter?"), plus a mono pill showing the user's inbox address `u8x2@datamodo.in` with a green status dot.
  - **Stat cards** (4): "Captured this week" 231 · "Open invoices" $41.2k (accent) · "Sheets" 5 · "Auto-linked" 1,904 (this one is a dark ink card).
  - **Table card**: header "Invoices · 28 rows" with Filter + dark "Export CSV" buttons; the same 6-column table as the landing step 3, with the Acme row highlighted (accent border + flash). Status cells are colored pills (green Paid, gold Sent, coral Approved).

---

## Interactions & Behavior
- **Buttons:** hover darkens accent to `#CF4A2F`; white buttons hover to `#FBF8F1`.
- **Landing animations** (all CSS, and must respect `prefers-reduced-motion: reduce` → disable):
  - `floaty` — gentle vertical bob on the email window (6s).
  - `pulse` — expanding ring on the "forwarded" dot (2.4s).
  - `draw` — SVG stroke-dashoffset 320→0 to draw graph edges (staggered).
  - `nodein` — graph node scale/opacity in (staggered).
  - `dropin` / `pop` — rows & chips fade/slide in on a long loop.
  - `flash` — highlighted new row flashes accent-tint then settles.
  - `scan` — a gradient line sweeps down the "second brain" table.
  - `caret` — blinking cursor in the query input.
- **Auth:** standard form validation (email format, password length), inline error states in accent/red, Google OAuth via your provider. On success → `/dashboard`.
- **Dashboard:** sidebar sheet selection switches the visible table; "New capture" opens a forward-address/upload modal; the query bar submits to the Q&A endpoint and renders a sourced answer (see landing "Ask anything" for the answer format); "Export CSV" downloads the current sheet.

## State Management
- Auth/session (user, plan, inbox address like `u8x2@datamodo.in`).
- Sheets list (name, row count) + currently selected sheet.
- Rows per sheet (Invoices: client, invoiceNo, amount, due, status).
- Query state for the Ask bar (question, loading, answer, sources).
- Data fetching for sheets/rows/stats and the Q&A endpoint.

## Assets
Real full-color brand logos are in **`assets/logos/`** (copied from open logo
libraries — gilbarbara/logos and svgl):
`google-gmail.svg`, `microsoft-outlook.svg`, `whatsapp-icon.svg`,
`slack-icon.svg`, `telegram.svg`, `discord-icon.svg`, `imessage.svg`
(the iMessage bubble was drawn simply as none of the libraries carry it).
Load Google Fonts: **Bricolage Grotesque**, **Caveat**, **Geist Mono**
(Geist is already in the project). Glyphs like ✉ 🔒 ▦ ✦ ✓ are placeholders —
swap for your icon set (e.g. lucide: Mail, Lock, Table, Sparkles, Check).

## Files
- `Datamodo Landing.dc.html` — full landing page (design reference)
- `Datamodo App.dc.html` — login, register, and dashboard (design reference)
- `assets/logos/*.svg` — channel logos used in the "works with" strip and Google buttons

---

## Suggested implementation order for Claude Code
1. Add fonts (Bricolage Grotesque, Caveat, Geist Mono) and the color tokens to your theme (Tailwind config or CSS variables). Keep Geist.
2. Build shared primitives: `<Logo>`, `<Button>` (solid/outline/ghost), `<Input>`, `<Pill/Badge>`, `<Card>`, `<MacWindow>` (traffic-light chrome).
3. Replace `app/page.tsx` with the landing page, section by section (hero → flow → channels → how → use cases → ask → trust → CTA → footer).
4. Build `/login` and `/register` with your auth provider.
5. Build `/dashboard` (sidebar + topbar + stat cards + data table).
6. Wire real data + the Q&A endpoint last; the mocks show the exact intended output shapes.
