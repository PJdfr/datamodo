# datamodo landing page — content blueprint

Derived from the **actual product** (code + living docs), not the old landing
page. The old page told a thin "forward an email → get a spreadsheet" story and
skipped most of what datamodo really is: a **knowledge vault** you capture into
by gesture and never maintain by hand.

This is the section-by-section spec to apply to the remixed Saazi template in
Framer. Voice: warm, plain-spoken, lowercase **datamodo**, sentence-case
headlines, data/amounts/addresses in mono. One coral accent on cream.

---

## The one-line reframe

**Old:** "Forward the mess. Get back a spreadsheet." → sounds like a receipt scanner.
**New:** **"Forward the mess. Get a knowledge vault back."** → what it actually builds.

Core promise to land above the fold: *your work lives in messages; datamodo turns
those messages into a structured, reviewable, queryable vault — and every fact
points back to the exact message it came from.*

---

## Section 1 — Nav
- Wordmark (live `data`modo, never an image).
- Links: How it works · What you get · Ask anything · Trust · Pricing
- Log in · **Get started** (dark pill)

## Section 2 — Hero
- **Eyebrow:** `your second brain, built from your inbox`
- **H1:** Forward the mess. Get a knowledge vault back.
- **Sub:** The invoices, contacts, deal terms and decisions that run your work
  are buried across email, WhatsApp and Slack. Forward them — or drop a bot in
  the chat — and datamodo reads each one, pulls out the data, and files it into
  a vault you can question. No data entry. No formulas. No maintenance.
- **CTAs:** `Start your vault — free` · `See how it works`
- **Micro (mono):** `no card · works with the apps you already use`
- **Visual:** the live "one message in → structured out" showcase, but the "out"
  side shows **a fact with provenance** (value + confidence + `↳ source`), not
  just a spreadsheet cell — signalling vault, not scanner.

## Section 3 — Channels strip (fixes "email only")
- **Kicker:** `capture is a gesture — never account-slurping`
- Marquee of the channels that actually work: **Gmail/Outlook (forwarding),
  WhatsApp, Slack, Teams, in-app chat, voice notes, spreadsheet upload.**
- One line: forward an email to your private datamodo address, DM a shared bot,
  drop files or dictate a voice note in the app. That's the whole input.

## Section 4 — What you get: a graph, not just rows (the core differentiator)
- **Eyebrow:** `what comes out`
- **H2:** Not a spreadsheet. A knowledge graph you can walk.
- **Body:** datamodo pulls the people, companies, invoices, amounts and dates out
  of your messages and links them into one graph. Stand on any node and walk it
  edge to edge — and every edge is a *fact*, carrying its value, when it was
  true, how confident datamodo is, and the exact message it came from.
- **Visual:** the walkable graph (nodes in natural shape; an edge expands to show
  confidence meter + quoted source snippet).
- Support line: tables, folders, timelines and answers are all just *views* of
  this one vault — delete any view and lose nothing.

## Section 5 — Ask in plain words, get answers with receipts
- **Eyebrow:** `ask anything`
- **H2:** Ask in plain words. Get answers with receipts.
- **Body:** Because everything is linked, you just ask. datamodo traverses your
  graph, answers from your own content, and every number carries a `[n]` citation
  that drills straight to the message or PDF page it came from. If it can't cite
  it, it won't claim it.
- **Visual:** query → `$2,847.00 across 6 flights` → source rows → `↳ sourced
  from 6 forwarded confirmations` + a "see in graph" affordance.

## Section 6 — Nothing changes without your say-so (Review — the trust surface)
- **Eyebrow:** `you stay in control`
- **H2:** A pull request for your data.
- **Body:** datamodo never silently rewrites your tables. Every extraction lands
  as a **proposal** — batched, stamped with the message it read, scored with a
  confidence, and shown as a clean diff (yours vs. the agent's). Accept, reject,
  or edit — from the app, or by replying "1 yes" on WhatsApp. Hand edits are
  protected and never overwritten.
- **Visual:** the review queue (new record / field-change cards with accept-reject
  + provenance tags + confidence).

## Section 7 — Total recall (versioning)
- **Eyebrow:** `nothing is ever lost`
- **H2:** Every version. Every source. Forever.
- **Body:** Originals are immutable; facts are append-only. datamodo keeps a
  git-style commit log of every change, per-field snapshots you can restore in a
  click, and bitemporal history — so "what did I believe in March?" stays
  answerable. Supersede, never delete.

## Section 8 — Many views, one vault
- **Eyebrow:** `it's a vault, not a file`
- **H2:** Tables that build themselves — and every other view for free.
- Bento of the real projections:
  - **Tables** — a category is a table; rows materialize from facts; full editing.
  - **Describe-a-table** — say what you want in plain words, datamodo designs it.
  - **Graph & Explorer** — walk the neighborhood, edge to edge.
  - **Folders as opinions** — one corpus, many trees (by client, project, month).
  - **Timeline & Insights** — what happened, what's next, live aggregates.
  - **Dossiers** — one-click cited notes across every document on an entity.

## Section 9 — Use cases (keep the concrete, product-true stories)
- Same trick, everywhere your work hides — freelancer, consultant, founder,
  dealmaker. Keep the 3–4 concrete vignettes (receipt → row, group chat →
  split, dump → sorted, year → auto-built table) as short proof, not the
  whole story.

## Section 10 — Trust, privacy & control (individual-only + local)
- **Eyebrow:** `yours alone`
- Trio (or four):
  - **Individual by design** — no teams, no sharing, no data leaving your account.
  - **Provenance on everything** — every claim points at its source; answers cite
    or they don't render.
  - **Your keys, your cap** — bring your own model key, set a monthly spend cap.
  - **Run it fully local** — an offline edition on your own machine (no login,
    your files on disk). Export to Excel or your own Postgres; delete everything
    by removing one folder.

## Section 11 — Second brain via your Claude subscription (MCP)
- **Eyebrow:** `connect your ai`
- **H2:** Plug your vault into Claude.
- **Body:** datamodo exposes your vault to your own Claude subscription over MCP —
  so Claude can read your inbox, extract, search your graph, and write back, with
  your review queue still in charge. *(Include only if we want to feature it; it's
  real and differentiating.)*

## Section 12 — How it works (3 steps)
- **01 — you:** Forward an email, or drop the bot in a chat.
- **02 — datamodo:** It reads, extracts the data, links it to what it already
  knows, and scores its confidence.
- **03 — you review; it's filed:** Accept the changes and they settle into a
  clean, versioned, queryable vault.

## Section 13 — Pricing  ⚠️ NEEDS REAL NUMBERS
- Individual-only, so no per-seat math. Likely Free + Pro. **I invented $0 / $12
  placeholders in the earlier comp — confirm real plans/prices before this ships.**
- If there's no paid tier yet, replace with a single "free while in early access"
  panel + BYOK/local note.

## Section 14 — FAQ (derived from real capabilities)
- Do I have to change how I work? *No — forward or drop the bot in.*
- What can it pull out? *People, companies, invoices, amounts, dates, to-dos —
  from text, PDFs, screenshots, receipts and voice notes, each with a confidence.*
- Where does my data live / is it private? *Individual-only, encrypted, never
  trained on; BYOK + spend cap; or run it fully local/offline.*
- Can it be wrong? *Every change is a reviewable proposal with its source; nothing
  files silently, and low-confidence extractions go to review.*
- Can I get my data out? *Excel (.xlsx), one-way sync to your own Postgres, or a
  .zip of the originals. Never a lock-in.*
- Is it just for me? *Yes — no teams, no sharing, ever.*

## Section 15 — Final CTA + Footer
- **H2:** Give your inbox a memory that organizes itself.
- CTAs: `Start your vault — free` · `Talk to us` — micro: `no card · your first
  facts in minutes`
- Footer: wordmark, links, `© 2026 datamodo`.

---

## What changed vs. the old page (the "explain it fully" fixes)
1. Reframed from *spreadsheet* → *knowledge vault* (the product's real headline).
2. Added **multi-channel capture** (was ~email-only).
3. Added the **walkable knowledge graph** as the core "what you get".
4. Added **ask-with-receipts / provenance** as its own beat.
5. Added the **review/accept-reject queue** — the trust surface and biggest
   differentiator — which the old page omitted.
6. Added **versioning / total recall**.
7. Added **many-views-one-vault** (tables that build themselves, describe-a-table,
   folders-as-opinions).
8. Strengthened **privacy/control** with the individual-only + **local/offline**
   + BYOK-cap story.
9. Optional **MCP / connect-your-Claude** beat.
